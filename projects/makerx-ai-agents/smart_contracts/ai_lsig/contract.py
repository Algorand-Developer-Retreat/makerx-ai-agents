import algopy
from algopy import logicsig


@logicsig
def ai_lsig() -> bool:
    assert algopy.Txn.type_enum == algopy.TransactionType.ApplicationCall
    assert algopy.Txn.application_id.id == algopy.TemplateVar[algopy.UInt64](
        "AI_REGISTRY_APP_ID"
    )
    assert algopy.Txn.rekey_to == algopy.Global.zero_address
    assert algopy.Txn.close_remainder_to == algopy.Global.zero_address
    assert algopy.Txn.on_completion == algopy.OnCompleteAction.NoOp
    return True
