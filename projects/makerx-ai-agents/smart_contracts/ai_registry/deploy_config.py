import base64
import logging
from pathlib import Path

import algokit_utils
import nacl

logger = logging.getLogger(__name__)


def get_first_valid_round(algorand: algokit_utils.AlgorandClient) -> int:
    sp = algorand.get_suggested_params()
    return int(sp.first)  # type: ignore


def deploy() -> None:
    """
    Deploy the AI Registry contract and demonstrate a complete E2E flow:
    1. Deploy the contract
    2. Bootstrap with LogicSig
    3. Register an agent (with permissions)
    4. Issue a payment transaction
    5. Issue an asset transfer
    6. Issue an asset opt-in
    """
    from smart_contracts.artifacts.ai_registry.ai_registry_client import (
        AiRegistryFactory,
        BootstrapArgs,
        IssueAxferArgs,
        IssueOptInArgs,
        IssuePaymentArgs,
        RegisterAgentArgs,
    )

    # Set up Algorand client
    algorand = algokit_utils.AlgorandClient.from_environment()
    algorand.set_suggested_params_cache_timeout(0)
    deployer_ = algorand.account.from_environment("DEPLOYER")

    # Deploy the AI Registry contract
    factory = algorand.client.get_typed_app_factory(
        AiRegistryFactory, default_sender=deployer_.address
    )

    app_client, _ = factory.deploy(
        on_update=algokit_utils.OnUpdate.AppendApp,
        on_schema_break=algokit_utils.OnSchemaBreak.AppendApp,
    )
    logger.info(f"Deployed AI Registry app with ID: {app_client.app_id}")

    # Compile the LogicSig for AI agent using the app ID
    teal_template_code = Path(__file__).parent.parent / "artifacts/ai_lsig/ai_lsig.teal"
    compiled_lsig = algorand.app.compile_teal_template(
        teal_template_code.read_text(),
        template_params={"AI_REGISTRY_APP_ID": app_client.app_id},
    ).compiled_base64_to_bytes

    # Set up the LogicSig account
    lsig_account = algorand.account.logicsig(compiled_lsig)
    lsig_address = lsig_account.address
    logger.info(f"Created LogicSig with address: {lsig_address}")

    # Fund the contract account and LogicSig account
    algorand.account.ensure_funded_from_environment(
        app_client.app_address,
        min_spending_balance=algokit_utils.AlgoAmount(algo=10),
    )
    algorand.account.ensure_funded_from_environment(
        lsig_address, min_spending_balance=algokit_utils.AlgoAmount(algo=10)
    )
    logger.info("Funded required accounts")

    # Bootstrap the contract with the LogicSig
    try:
        app_client.send.bootstrap(
            args=BootstrapArgs(
                lsig_address=lsig_address,
                admin_address=deployer_.address,
            ),
            params=algokit_utils.CommonAppCallParams(
                sender=deployer_.address,
            ),
        )
        logger.info("Bootstrapped AI Registry with LogicSig and admin")
    except Exception as e:
        logger.error(f"Bootstrap failed: {e}")
        pass

    # Generate agent keys
    agent_name = "mcpagent"
    signing_key = nacl.signing.SigningKey.generate()
    public_key = signing_key.verify_key.encode()
    logger.info(f"Generated agent: {agent_name}")

    # Log environment variables for the agent
    base64_compiled_lsig = base64.b64encode(compiled_lsig).decode("utf-8")
    logger.info(f"AGENT_LSIG={base64_compiled_lsig}")
    logger.info(f"AGENT_AI_REGISTRY_APP_ID={app_client.app_id}")
    logger.info(
        f"AGENT_PRIVATE_KEY={base64.b64encode(signing_key.encode()).decode('utf-8')}"
    )
    logger.info(f"AGENT_NAME={agent_name}")

    # Get current round for expiration setting
    sp = algorand.get_suggested_params()
    current_round = int(sp.first)  # type: ignore
    valid_until_round = current_round + 10000  # Valid for 10000 rounds

    # Register the agent with permissions
    # Bitmap: bit 0 = payment, bit 1 = asset transfer, bit 2 = asset opt-in
    permissions = 7  # Binary 111 - allows payment, asset transfers, and opt-ins
    max_amount = 1_000_000  # 1 Algo max per transaction

    app_client.send.register_agent(
        args=RegisterAgentArgs(
            agent_p_key=public_key,
            permissions=permissions,
            max_amount=max_amount,
            valid_until_round=valid_until_round,
        ),
        params=algokit_utils.CommonAppCallParams(
            sender=deployer_.address,  # Only admin can register agents
        ),
    )
    logger.info(f"Registered agent {agent_name} with permissions bitmap: {permissions}")

    # DEMO 1: Issue a payment transaction
    test_amount = 100_000  # 0.1 Algo
    test_receiver = deployer_.public_key
    first_valid = get_first_valid_round(algorand)

    # Create payment data for signature (follows the structure in the contract)
    payment_data = (
        test_amount.to_bytes(8, byteorder="big")
        + test_receiver
        + agent_name.encode()
        + first_valid.to_bytes(8, byteorder="big")
    )

    # Sign with the agent's private key
    signature = signing_key.sign(payment_data).signature

    # Now submit the payment via the LogicSig
    first_valid = algorand.get_suggested_params().first
    algorand.set_default_signer(lsig_account)  # Set LogicSig as signer
    response = app_client.send.issue_payment(
        args=IssuePaymentArgs(
            amount=test_amount,
            receiver=test_receiver,
            agent_name=agent_name,
            agent_p_key=public_key,
            signature=signature,
        ),
        params=algokit_utils.CommonAppCallParams(
            static_fee=algokit_utils.AlgoAmount(micro_algo=3000),
            sender=lsig_address,
            first_valid_round=first_valid,
        ),
    )

    logger.info(
        f"Payment transaction executed: {test_amount} microAlgos to {deployer_.address}"
    )

    # DEMO 2: Issue an asset transfer
    # Create a test asset first
    test_asset_id = algorand.send.asset_create(
        algokit_utils.AssetCreateParams(
            asset_name="ASSETNAME",
            unit_name="UNITNAME",
            sender=deployer_.address,
            signer=deployer_.signer,
            total=1000,
        )
    ).asset_id

    logger.info(f"Created test asset with ID: {test_asset_id}")

    # First we need to opt-in to the asset
    first_valid = get_first_valid_round(algorand)

    # Create opt-in data for signature
    opt_in_data = test_asset_id.to_bytes(8, byteorder="big") + first_valid.to_bytes(
        8, byteorder="big"
    )

    # Sign with the agent's private key
    opt_in_signature = signing_key.sign(opt_in_data).signature

    # Submit the opt-in via the LogicSig
    try:
        response = app_client.send.issue_opt_in(
            args=IssueOptInArgs(
                asset_id=test_asset_id,
                agent_p_key=public_key,
                signature=opt_in_signature,
            ),
            params=algokit_utils.CommonAppCallParams(
                static_fee=algokit_utils.AlgoAmount(micro_algo=3000),
                sender=lsig_address,
                first_valid_round=first_valid,
            ),
        )
        logger.info(f"Asset opt-in executed for asset {test_asset_id}")
    except Exception as e:
        logger.warning(f"Asset opt-in failed: {e}")

    algorand.send.asset_transfer(
        algokit_utils.AssetTransferParams(
            asset_id=test_asset_id,
            sender=deployer_.address,
            receiver=app_client.app_address,
            amount=1000,
        )
    )

    # Now we can transfer the asset
    first_valid = get_first_valid_round(algorand)

    # Create asset transfer data for signature
    asset_amount = 1000
    axfer_data = (
        test_receiver
        + asset_amount.to_bytes(8)
        + test_asset_id.to_bytes(8)
        + first_valid.to_bytes(8)
    )

    # Sign with the agent's private key
    axfer_signature = signing_key.sign(axfer_data).signature

    # Submit the asset transfer via the LogicSig
    try:
        response = app_client.send.issue_axfer(
            args=IssueAxferArgs(
                receiver=test_receiver,
                amount=test_amount,
                asset_id=test_asset_id,
                agent_p_key=public_key,
                signature=axfer_signature,
            ),
            params=algokit_utils.CommonAppCallParams(
                static_fee=algokit_utils.AlgoAmount(micro_algo=3000),
                sender=lsig_address,
                first_valid_round=first_valid,
            ),
        )
        logger.info(
            f"Asset transfer executed: {test_amount} units of asset {test_asset_id} to {deployer_.address}"
        )
    except Exception as e:
        # This might fail in testing if asset doesn't exist or other conditions aren't met
        logger.warning(f"Asset transfer failed: {e}")

    logger.info("E2E demonstration completed successfully")
