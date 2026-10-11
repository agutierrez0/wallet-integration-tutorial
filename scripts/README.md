# Scripts

Headless XRPL experiments, imported from the old `xrpl-sandbox` repo. They use faucet-funded
testnet/devnet wallets and never need a real seed.

## Python (`scripts/python`)
```bash
cd scripts/python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python AccountSet/successful.py
```
`AccountSet/`, `AccountDelete/` and `EscrowCreate/` each have a `successful.py` example. `main.py` is a scratchpad that creates several faucet wallets and builds a mix of transactions.

## JavaScript (`scripts/js`)
```bash
node scripts/js/amm-clawback.cjs   # devnet: walks through the AMMClawback lifecycle
```
