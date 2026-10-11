# XRPL Wallet Sandbox

A browser sandbox for XRPL tooling. Connect a wallet, sign a transaction, and get the signed `tx_blob` plus its hash. Then submit it however you like.

Originally `wallet-integration-tutorial` (CRA, `xrpl` v3). Reworked on Vite + React + TypeScript with `xrpl` v5.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test
npm run build
```

Defaults to **testnet**. Devnet is available too. Mainnet is gated behind an explicit opt-in because it uses real XRP.

## Wallets

| Wallet | Status | Sign only (blob) | Sign + submit via wallet |
|---|---|---|---|
| Crossmark | available | yes | not wired |
| GemWallet | available | yes | yes |
| Xaman | planned | needs a small backend (API secret must stay server-side) | planned |
| Ledger | planned | yes (hardware signs only) | no (submit yourself) |

Each wallet sits behind a `WalletAdapter` (`src/wallets/types.ts`) with capability flags, so the UI can disable combinations a wallet does not support.

## Flow: sign -> hash -> submit

1. Pick a network and connect a wallet.
2. Edit the transaction JSON (templates: `AccountSet`, `Payment`, `TrustSet`). `Account` is filled from the connected wallet.
3. **Sign.** The app autofills `Sequence`, `Fee` and `LastLedgerSequence` from the selected network, then asks the wallet to sign.
4. The UI shows the signed `tx_blob`, its **hash** (computed locally, known before submit), the decoded transaction, and a signature check.
5. Submit.

## Three ways to submit

1. **In the UI with xrpl.js:** `client.submitAndWait(blob)` from the browser.
2. **Copy out:** paste the ready-made JSON-RPC body or `curl` command into Postman or a terminal. The app never calls rippled for you in this mode. Submit the **blob**, not the hash; use the hash afterwards for a `tx` lookup.
   ```json
   { "method": "submit", "params": [{ "tx_blob": "<signed blob>" }] }
   ```
3. **Via the wallet:** only for wallets that support it (see the table).

## Security notes

- **Never put API secrets in the browser.** The old version sent a Xumm/Xaman `X-API-Secret` from client code; anything in a Vite bundle (including `VITE_*` vars) is public. Xaman will go through a small server when it is added.
- **Rotate the old Xumm key.** A `.env` was committed to this repo's git history. Treat that key as exposed and rotate it in the Xaman developer console. Removing the file does not remove it from history.
- **Mainnet is gated.** Use testnet or devnet unless you mean it. Wallets must be on the same network as the app, or signed transactions will not validate.
- Only use throwaway keys on test networks.
