from algopy import (
    Account,
    ARC4Contract,
    Box,
    Bytes,
    OpUpFeeSource,
    String,
    UInt64,
    ensure_budget,
    itxn,
    op,
)
from algopy.arc4 import abimethod


class AiRegistry(ARC4Contract):
    def __init__(self) -> None:
        self.last_valid = Box(UInt64, key=b"lv")

    @abimethod()
    def issue_payment(
        self,
        amount: UInt64,
        receiver: Account,
        agent_name: String,
        agent_p_key: Bytes,
        signature: Bytes,
        first_valid_round: UInt64,
    ) -> None:
        ensure_budget(1900, OpUpFeeSource.GroupCredit)

        if self.last_valid:
            assert self.last_valid.value < first_valid_round

        # create payment data
        payment_data = (
            op.itob(amount)
            + receiver.bytes
            + agent_name.bytes
            + op.itob(first_valid_round)
        )

        # assert signature is valid
        assert op.ed25519verify_bare(
            payment_data, signature, agent_p_key
        ), "Invalid signature"

        # send payment
        itxn.Payment(receiver=receiver, amount=amount, fee=100_000).submit()

        # update last valid round
        self.last_valid.value = first_valid_round
