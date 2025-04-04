import typing as t

from algopy import (
    Account,
    ARC4Contract,
    Box,
    BoxMap,
    Bytes,
    Global,
    OpUpFeeSource,
    String,
    Txn,
    UInt64,
    ensure_budget,
    itxn,
    op,
    subroutine,
)
from algopy.arc4 import abimethod


class AgentPermissions(t.NamedTuple):
    permissions: UInt64  # Bitmap: bit 0 = payment, bit 1 = asset_transfer, bit 2 = asset_opt_in, etc.
    max_amount: UInt64
    valid_until_round: UInt64


class AiRegistry(ARC4Contract):
    def __init__(self) -> None:
        self.last_valid = Box(UInt64, key=b"lv")
        # Global state variables for lsig_addr and admin
        self.lsig_addr = Account()
        self.admin = Account()
        # Box map storing agent permissions
        # key: agent public key
        # value: AgentPermissions struct
        self.agent_permissions = BoxMap(Bytes, Bytes, key_prefix=b"ap")

    @abimethod()
    def bootstrap(self, lsig_address: Account, admin_address: Account) -> None:
        # Can only be called once to set up initial state
        assert self.lsig_addr == Account(), "Already bootstrapped"
        self.lsig_addr = lsig_address
        self.admin = admin_address

    @abimethod()
    def register_agent(
        self,
        agent_p_key: Bytes,
        permissions: UInt64,  # Bitmap: bit 0 = payment, bit 1 = asset_transfer, bit 2 = asset_opt_in, etc.
        max_amount: UInt64,
        valid_until_round: UInt64,
    ) -> None:
        # Only admin can register agents
        assert Txn.sender == self.admin, "Only admin can register agents"

        # Create permissions struct
        agent_perms = AgentPermissions(
            permissions=permissions,
            max_amount=max_amount,
            valid_until_round=valid_until_round,
        )

        # Store agent permissions
        # Encode the struct as bytes for storage
        permission_data = (
            op.itob(agent_perms.permissions)
            + op.itob(agent_perms.max_amount)
            + op.itob(agent_perms.valid_until_round)
        )
        self.agent_permissions[agent_p_key] = permission_data

    @subroutine()
    def _verify_agent_permissions(
        self,
        agent_p_key: Bytes,
        operation_bit: UInt64,
        amount: UInt64,
        current_round: UInt64,
    ) -> None:
        # Verify caller is the registered LSIG
        assert Txn.sender == self.lsig_addr, "Only LSIG can call this method"

        # Check agent exists
        assert agent_p_key in self.agent_permissions, "Agent not registered"

        # Get agent permissions
        permissions_data = self.agent_permissions[agent_p_key]

        # Decode the struct from bytes
        permissions = op.btoi(permissions_data[:8])
        max_amount = op.btoi(permissions_data[8:16])
        valid_until = op.btoi(permissions_data[16:24])

        # Check permissions
        assert op.getbit(
            permissions, operation_bit
        ), "Operation not allowed for this agent"
        assert amount <= max_amount, "Amount exceeds agent's limit"
        assert current_round <= valid_until, "Agent authorization expired"

    @abimethod()
    def issue_payment(
        self,
        amount: UInt64,
        receiver: Account,
        agent_name: String,
        agent_p_key: Bytes,
        signature: Bytes,
    ) -> None:
        ensure_budget(1900, OpUpFeeSource.GroupCredit)

        if self.last_valid:
            assert self.last_valid.value < Txn.first_valid

        # Verify agent permissions - permission bit 0 is for payments
        self._verify_agent_permissions(agent_p_key, UInt64(0), amount, Txn.first_valid)

        # create payment data
        payment_data = (
            op.itob(amount)
            + receiver.bytes
            + agent_name.bytes
            + op.itob(Txn.first_valid)
        )

        # assert signature is valid
        assert op.ed25519verify_bare(
            payment_data, signature, agent_p_key
        ), "Invalid signature"

        # send payment
        itxn.Payment(receiver=receiver, amount=amount, fee=100_000).submit()

        # update last valid round
        self.last_valid.value = Txn.first_valid

    @abimethod()
    def issue_axfer(
        self,
        receiver: Account,
        amount: UInt64,
        asset_id: UInt64,
        agent_p_key: Bytes,
        signature: Bytes,
    ) -> None:
        ensure_budget(2000, OpUpFeeSource.GroupCredit)

        if self.last_valid:
            assert self.last_valid.value < Txn.first_valid

        # Verify agent permissions - permission bit 1 is for asset transfers
        self._verify_agent_permissions(agent_p_key, UInt64(1), amount, Txn.first_valid)

        # create payment data for signature verification
        verification_data = (
            receiver.bytes
            + op.itob(amount)
            + op.itob(asset_id)
            + op.itob(Txn.first_valid)
        )

        # verify signature
        assert op.ed25519verify_bare(
            verification_data, signature, agent_p_key
        ), "Invalid signature"

        # create and submit payment transaction directly
        itxn.AssetTransfer(
            asset_receiver=receiver,
            asset_amount=amount,
            xfer_asset=asset_id,
            fee=UInt64(0),
        ).submit()

        # update last valid round
        self.last_valid.value = Txn.first_valid

    @abimethod()
    def issue_opt_in(
        self,
        asset_id: UInt64,
        agent_p_key: Bytes,
        signature: Bytes,
    ) -> None:
        ensure_budget(2000, OpUpFeeSource.GroupCredit)

        if self.last_valid:
            assert self.last_valid.value < Txn.first_valid

        # Verify agent permissions - permission bit 2 is for asset opt-ins
        # Use 0 as amount since opt-ins don't have an amount
        self._verify_agent_permissions(
            agent_p_key, UInt64(2), UInt64(0), Txn.first_valid
        )

        # create opt-in data for signature verification
        verification_data = op.itob(asset_id) + op.itob(Txn.first_valid)

        # verify signature
        assert op.ed25519verify_bare(
            verification_data, signature, agent_p_key
        ), "Invalid signature"

        # create and submit asset opt-in transaction
        # Opt-in is an asset transfer of 0 to self
        tx = itxn.AssetTransfer(
            asset_receiver=Global.current_application_address,
            asset_amount=UInt64(0),
            xfer_asset=asset_id,
            fee=UInt64(100_000),
        ).submit()

        # update last valid round
        self.last_valid.value = Txn.first_valid
