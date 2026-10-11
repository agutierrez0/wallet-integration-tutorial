from xrpl.wallet import generate_faucet_wallet
from xrpl.clients import JsonRpcClient
from xrpl.transaction import autofill_and_sign, sign, autofill, submit_and_wait
from xrpl.models import AccountDelete, OfferCreate, AccountSet, TrustSet, IssuedCurrencyAmount, Payment
from xrpl.ledger import get_latest_validated_ledger_sequence
from xrpl.account import get_next_valid_seq_number

from xrpl.transaction import submit_and_wait

# Create a client to connect to the test network
client = JsonRpcClient("https://s.altnet.rippletest.net:51234")

# create originator and recipient, originator will send to recipient

# set to zero
account1 = generate_faucet_wallet(client)
account2 = generate_faucet_wallet(client)

# set to 15
account3 = generate_faucet_wallet(client)

# set to 3
account4 = generate_faucet_wallet(client)

# account for making offers
offer_account = generate_faucet_wallet(client)

print(account1)
print(account2)
print(account3)
print(account4)
print("offer_account: ", offer_account)

# get info for the tx
ledger_sequence = get_latest_validated_ledger_sequence(client)

# account set transactions
account_set_tx_1 = AccountSet(
    account=account1.address, 
    set_flag=8
)
account_set_tx_2 = AccountSet(
    account=account2.address, 
    set_flag=8
)
account_set_tx_3 = AccountSet(
    account=account3.address, 
    set_flag=8,
    tick_size=15
)
account_set_tx_4 = AccountSet(
    account=account4.address, 
    set_flag=8,
    tick_size=3
)

autofilled_account_set_tx_1 = autofill_and_sign(account_set_tx_1, client=client, wallet=account1)
result1 = submit_and_wait(autofilled_account_set_tx_1, client=client)
print("account set for account 1 submitted successfully")

autofilled_account_set_tx_2 = autofill_and_sign(account_set_tx_2, client=client, wallet=account2)
result2 = submit_and_wait(autofilled_account_set_tx_2, client=client)
print("account set for account 2 submitted successfully")

autofilled_account_set_tx_3 = autofill_and_sign(account_set_tx_3, client=client, wallet=account3)
result3 = submit_and_wait(autofilled_account_set_tx_3, client=client)
print("account set for account 3 submitted successfully")

autofilled_account_set_tx_4 = autofill_and_sign(account_set_tx_4, client=client, wallet=account4)
result4 = submit_and_wait(autofilled_account_set_tx_4, client=client)
print("account set for account 4 submitted successfully")

# create trustline from offer account to account1 with zero tick size (AAA)
trust_set_tx_aaa = TrustSet(
    account=offer_account.address,
    limit_amount=IssuedCurrencyAmount(currency='AAA', issuer=account1.address, value=1000000)
)
autofilled_trust_set_tx_aaa = autofill_and_sign(trust_set_tx_aaa, client=client, wallet=offer_account)
submit_and_wait(autofilled_trust_set_tx_aaa, client=client)
print("trust set from originator account to account 1 (tick size unset) completed")

# create trustline from offer account to account1 with zero tick size (CCC)
trust_set_tx_ccc = TrustSet(
    account=offer_account.address,
    limit_amount=IssuedCurrencyAmount(currency='CCC', issuer=account2.address, value=1000000)
)
autofilled_trust_set_tx_ccc = autofill_and_sign(trust_set_tx_ccc, client=client, wallet=offer_account)
submit_and_wait(autofilled_trust_set_tx_ccc, client=client)
print("trust set from originator account to account 2 (tick size unset) completed")

# create trustline from offer account to account4 with 3 tick size
trust_set_tx_bbb = TrustSet(
    account=offer_account.address,
    limit_amount=IssuedCurrencyAmount(currency='BBB', issuer=account4.address, value=1000000)
)
autofilled_trust_set_tx_bbb = autofill_and_sign(trust_set_tx_bbb, client=client, wallet=offer_account)
submit_and_wait(autofilled_trust_set_tx_bbb, client=client)
print("trust set from originator account to account 4 (tick size 3) completed")

# create trustline from offer account to account3 with 15 tick size
trust_set_tx_ddd = TrustSet(
    account=offer_account.address,
    limit_amount=IssuedCurrencyAmount(currency='DDD', issuer=account3.address, value=1000000)
)
autofilled_trust_set_tx_ddd = autofill_and_sign(trust_set_tx_ddd, client=client, wallet=offer_account)
submit_and_wait(autofilled_trust_set_tx_ddd, client=client)
print("trust set from originator account to account 3 (tick size 15) completed")


payment_aaa = Payment(
    account=account1.address,
    destination=offer_account.address,
    amount=IssuedCurrencyAmount(currency='AAA', issuer=account1.address, value=1000)
)
autofilled_payment_aaa = autofill_and_sign(payment_aaa, client=client, wallet=account1)
submit_and_wait(autofilled_payment_aaa, client=client)
print("payment from account1 (unset tick size) to market maker completed")

payment_bbb = Payment(
    account=account4.address,
    destination=offer_account.address,
    amount=IssuedCurrencyAmount(currency='BBB', issuer=account4.address, value=1000)
)
autofilled_payment_bbb = autofill_and_sign(payment_bbb, client=client, wallet=account4)
submit_and_wait(autofilled_payment_bbb, client=client)
print("payment from account4 (tick size 3) to market maker completed")

payment_ccc = Payment(
    account=account2.address,
    destination=offer_account.address,
    amount=IssuedCurrencyAmount(currency='CCC', issuer=account2.address, value=1000)
)
autofilled_payment_ccc = autofill_and_sign(payment_ccc, client=client, wallet=account2)
submit_and_wait(autofilled_payment_ccc, client=client)
print("payment from account2 (unset tick size) to market maker completed")

payment_ddd = Payment(
    account=account3.address,
    destination=offer_account.address,
    amount=IssuedCurrencyAmount(currency='DDD', issuer=account3.address, value=1000)
)
autofilled_payment_ddd = autofill_and_sign(payment_ddd, client=client, wallet=account3)
submit_and_wait(autofilled_payment_ddd, client=client)
print("payment from account3 (15 tick size) to market maker completed")


# taker (unset tick size) gets 3, taker (unset tick size) pays 1
offer1 = OfferCreate(
    account=offer_account.address,
    taker_gets=IssuedCurrencyAmount(currency='AAA', issuer=account1.address, value=3),
    taker_pays=IssuedCurrencyAmount(currency='CCC', issuer=account2.address, value=1)
)
autofilled_offer1 = autofill_and_sign(offer1, client=client, wallet=offer_account)
submit_and_wait(autofilled_offer1, client=client)
print("OfferCreate on account 1 (unset tick size) for taker (unset tick size) gets 3, taker pays 1 completed")

# taker gets 3 (15 tick size account currency), taker pays 1 (unset tick size account currency)
offer2 = OfferCreate(
    account=offer_account.address,
    taker_gets=IssuedCurrencyAmount(currency='DDD', issuer=account3.address, value=3),
    taker_pays=IssuedCurrencyAmount(currency='CCC', issuer=account2.address, value=1)
)
autofilled_offer2 = autofill_and_sign(offer2, client=client, wallet=offer_account)
submit_and_wait(autofilled_offer2, client=client)
print("OfferCreate taker gets 3 (15 tick size account currency), taker pays 1 (unset tick size account currency) completed")
'''

GEL was the one that had tick size on 7


if you set it to 15, vs if you have it unset, any difference in behavior



Offers have:
- taker gets:
- taker pays: 



3 accounts
 - 2 with no tick size set
 - 1 with 15 as tick size
 - 1 with 3 as tick size
'''