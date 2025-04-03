import base64
import logging
from pathlib import Path

import algokit_utils
import nacl

logger = logging.getLogger(__name__)


# NOTE: DUMMY deploy script used for e2e poc
def deploy() -> None:
    from smart_contracts.artifacts.ai_registry.ai_registry_client import (
        AiRegistryFactory,
        IssuePaymentArgs,
    )

    algorand = algokit_utils.AlgorandClient.from_environment()
    algorand.set_suggested_params_cache_timeout(0)
    deployer_ = algorand.account.from_environment("DEPLOYER")

    factory = algorand.client.get_typed_app_factory(
        AiRegistryFactory, default_sender=deployer_.address
    )

    app_client, _ = factory.deploy(
        on_update=algokit_utils.OnUpdate.AppendApp,
        on_schema_break=algokit_utils.OnSchemaBreak.AppendApp,
    )

    teal_template_code = Path(__file__).parent.parent / "artifacts/ai_lsig/ai_lsig.teal"
    compiled_lsig = algorand.app.compile_teal_template(
        teal_template_code.read_text(),
        template_params={"AI_REGISTRY_APP_ID": app_client.app_id},
    ).compiled_base64_to_bytes


    lsig_account = algorand.account.logicsig(compiled_lsig)
    algorand.set_default_signer(lsig_account)
    algorand.account.ensure_funded_from_environment(
        app_client.app_address,
        min_spending_balance=algokit_utils.AlgoAmount(algo=10),
    )
    algorand.account.ensure_funded_from_environment(
        lsig_account.address, min_spending_balance=algokit_utils.AlgoAmount(algo=10)
    )

    # Print the AI agent environment variables
    agent_name = "mcpagent"
    signing_key = nacl.signing.SigningKey.generate()
    public_key = signing_key.verify_key.encode()
    
    base64_compiled_lsig = base64.b64encode(compiled_lsig).decode("utf-8")
    logger.info(f"AGENT_LSIG={base64_compiled_lsig}")
    logger.info(f"AGENT_AI_REGISTRY_APP_ID={app_client.app_id}")
    logger.info(f"AGENT_PRIVATE_KEY={base64.b64encode(signing_key.encode()).decode("utf-8")}")
    logger.info(f"AGENT_NAME={agent_name}")

    for i in range(10):
        test_amount = 1
        test_receiver = deployer_.public_key
        test_agent_name = "test_agent" + str(i)
        sp = algorand.get_suggested_params()
        first = int(sp.first)  # type: ignore
        signing_key = nacl.signing.SigningKey.generate()
        public_key = signing_key.verify_key.encode()
        message = (
            test_amount.to_bytes(8)
            + test_receiver
            + test_agent_name.encode()
            + first.to_bytes(8)
        )
        signature = signing_key.sign(message).signature

        response = app_client.send.issue_payment(
            args=IssuePaymentArgs(
                amount=test_amount,
                receiver=test_receiver,
                agent_name=test_agent_name,
                agent_p_key=public_key,
                signature=signature,
                first_valid_round=first,
            ),
            params=algokit_utils.CommonAppCallParams(
                static_fee=algokit_utils.AlgoAmount(micro_algo=3000),
                sender=lsig_account.address,
            ),
        )

        try:
            app_client.send.issue_payment(
                args=IssuePaymentArgs(
                    amount=test_amount,
                    receiver=test_receiver,
                    agent_name=test_agent_name,
                    agent_p_key=public_key,
                    signature=signature,
                    first_valid_round=first,
                ),
                params=algokit_utils.CommonAppCallParams(
                    static_fee=algokit_utils.AlgoAmount(micro_algo=3000),
                    sender=lsig_account.address,
                    note=f"test_agent_{i}".encode(),
                ),
            )
        except Exception as e:
            logger.info(f"Expected Error: {e}")

        logger.info(
            f"Called validate_and_submit_pay on {app_client.app_name} ({app_client.app_id}) "
            f"with amount={test_amount}, received: {response.abi_return}"
        )
