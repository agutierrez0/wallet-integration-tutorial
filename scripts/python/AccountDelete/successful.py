"""AccountDelete: DRY RUN. Builds and autofills the transaction but does not sign or submit it.

A real AccountDelete will fail on a freshly funded account:
- The account's Sequence number plus 256 must be lower than the current ledger index,
  otherwise the ledger returns tecTOO_SOON. In practice the account has to be at least
  256 ledgers old (a few minutes), and it must not own objects that block deletion.
- The transaction cost is not the usual tiny fee. AccountDelete must destroy at least the
  owner reserve (0.2 XRP when this was written; see
  https://xrpl.org/docs/references/protocol/transactions/types/accountdelete).

To run it for real, wait for the account to age past 256 ledgers, then sign the autofilled
transaction with `sign(...)` and send it with `submit_and_wait(...)`.
"""
# imports from xrpl
from xrpl.wallet import generate_faucet_wallet
from xrpl.clients import JsonRpcClient
from xrpl.transaction import autofill_and_sign, sign, autofill, submit_and_wait
from xrpl.models import AccountDelete
from xrpl.ledger import get_latest_validated_ledger_sequence
from xrpl.account import get_next_valid_seq_number

# Create a client to connect to the test network
client = JsonRpcClient("https://s.altnet.rippletest.net:51234")

# create originator and recipient, originator will send to recipient
originator = generate_faucet_wallet(client)
recipient = generate_faucet_wallet(client)

# get info for the tx
ledger_sequence = get_latest_validated_ledger_sequence(client)

# create account delete transaction
account_delete_tx = AccountDelete(
    account=originator.address, 
    destination=recipient.address,
    last_ledger_sequence=ledger_sequence + 1000 # didn't work with autofill
)

print("account_delete_tx: ", account_delete_tx)

autofilled_account_delete_tx = autofill(account_delete_tx, client=client)
print("autofilled_account_delete_tx: ", autofilled_account_delete_tx)

#tx_blob = sign(autofilled_account_delete_tx, wallet=originator)
# tx_blob = autofill_and_sign(account_delete_tx, client=client, wallet=originator)

#print("tx_blob: ", tx_blob)
#print("tx_blob.blob(): ", tx_blob.blob())
# print("tx_blob: ", tx_blob)
# print("Whole wallet:", test_wallet.private_key)
# print("Classic address:", test_account)
# Classic address: rEQB2hhp3rg7sHj6L8YyR4GG47Cb7pfcuw