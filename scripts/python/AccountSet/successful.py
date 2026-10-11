"""AccountSet: set a Domain on a freshly funded testnet account.

Creates a faucet wallet, builds an AccountSet that sets the account's Domain,
signs it, submits it and waits for validation.

Run: python AccountSet/successful.py   (needs xrpl-py, Python 3.10+)
"""
from xrpl.clients import JsonRpcClient
from xrpl.models import AccountInfo, AccountSet
from xrpl.transaction import autofill_and_sign, submit_and_wait
from xrpl.utils import str_to_hex
from xrpl.wallet import generate_faucet_wallet

# Connect to the testnet
client = JsonRpcClient("https://s.altnet.rippletest.net:51234")

# Faucet-funded wallet; the faucet gives it a starting XRP balance
wallet = generate_faucet_wallet(client)
print("wallet address:", wallet.address)

DOMAIN = "example.com"

# Domain is stored on the ledger as hex
account_set_tx = AccountSet(
    account=wallet.address,
    domain=str_to_hex(DOMAIN),
)
print("account_set_tx:", account_set_tx)

# Fill in Fee, Sequence and LastLedgerSequence, then sign
signed_tx = autofill_and_sign(account_set_tx, client=client, wallet=wallet)
print("tx hash:", signed_tx.get_hash())

# Submit and wait until the transaction is in a validated ledger
response = submit_and_wait(signed_tx, client=client)
print("engine result:", response.result["meta"]["TransactionResult"])

# Read the Domain back from the ledger (hex)
info = client.request(AccountInfo(account=wallet.address, ledger_index="validated"))
account_data = info.result["account_data"]
print("Domain on ledger (hex):", account_data.get("Domain"))
