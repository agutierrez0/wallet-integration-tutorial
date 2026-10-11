# Scripts

Headless XRPL experiments, imported from the old `xrpl-sandbox` repo. They use faucet-funded
testnet/devnet wallets and never need a real seed.

## Python (`scripts/python`)
Needs **Python 3.10+**.
```bash
cd scripts/python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python AccountSet/successful.py
```
- `AccountSet/successful.py`: creates a faucet wallet, sets a `Domain`, signs, submits and prints the result.
- `AccountDelete/successful.py`: a dry run (autofill and print only). A real delete needs an account at least 256 ledgers old; see the docstring.
- `EscrowCreate/successful.py`: creates an escrow between two faucet wallets and prints balances before and after.
- `main.py`: a scratchpad that creates several faucet wallets and builds a mix of transactions.

## JavaScript (`scripts/js`)
Run `npm install` at the repo root first (the script uses the root `xrpl` dependency).
```bash
node scripts/js/amm-clawback.cjs   # devnet: walks through the AMMClawback lifecycle
```
