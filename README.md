# XRPL Wallet Integration Sandbox

A browser sandbox for XRPL tooling. Connect a wallet, sign a transaction, and get the signed `tx_blob` plus its hash. Then submit it however you like.

Stack: Vite + React 19 + TypeScript + `xrpl` v5, with a small Hono backend (`server/`) for Xaman. Originally `wallet-integration-tutorial` (CRA, `xrpl` v3); the repo is planned to be renamed `xrpl-wallet-integration`.

## Layout

| Path | What it is |
|---|---|
| `src/` | The web app (wallet adapters in `src/wallets/`, helpers in `src/lib/`) |
| `server/` | Hono API that holds the Xaman API key and secret (port 3001) |
| `scripts/` | Headless Python and JS XRPL examples, see [`scripts/README.md`](scripts/README.md) |
| `Dockerfile`, `nginx.conf`, `docker-compose*.yml` | Container setup |

## Quick start (local)

Web app only (Crossmark and GemWallet work without the backend):

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test
npm run build
```

With Xaman, also run the backend in a second terminal:

```bash
cd server
cp .env.example .env     # then fill in XAMAN_API_KEY and XAMAN_API_SECRET
npm install
npm run dev              # http://localhost:3001
```

Create the Xaman keys in the Xaman developer console (https://apps.xumm.dev). Vite proxies `/api` to `http://localhost:3001` (override with `API_PROXY_TARGET`).

Defaults to **testnet**. Devnet is available too. Mainnet is gated behind an explicit opt-in because it uses real XRP.

## Wallets

| Wallet | Status | Sign only (blob) | Sign + submit via wallet |
|---|---|---|---|
| Crossmark | available | yes | not wired |
| GemWallet | available | yes | yes |
| Xaman | available (needs `server/`) | yes | yes |
| Ledger | planned next | yes (hardware signs only) | no (submit yourself) |

Each wallet sits behind a `WalletAdapter` (`src/wallets/types.ts`) with capability flags, so the UI can disable combinations a wallet does not support. Xaman signs through a QR code (or the "Open in Xaman" button on mobile); the backend creates the request and the app polls for the result.

## Flow: sign -> hash -> submit

1. Pick a network and connect a wallet.
2. Edit the transaction JSON (templates: `AccountSet`, `Payment`, `TrustSet`). `Account` is filled from the connected wallet. Invalid JSON is flagged inline and Sign stays disabled.
3. **Sign.** The app autofills `Sequence`, `Fee` and `LastLedgerSequence` from the selected network, then asks the wallet to sign.
4. The UI shows the signed `tx_blob`, its **hash** (computed locally, known before submit), the decoded transaction, and a signature check.
5. Submit.

The UI shows loading and failure states along the way: extension checks, "waiting for approval in your wallet" with Cancel, not-installed (with install links), rejected, expired and wrong-network messages with Retry, and a result card that explains the XRPL result code (`tes`, `tec`, `tef`, `tem`, `ter`).

## Three ways to submit

1. **In the UI with xrpl.js:** `client.submitAndWait(blob)` from the browser.
2. **Copy out:** paste the ready-made JSON-RPC body or `curl` command into Postman or a terminal. The app never calls rippled for you in this mode. Submit the **blob**, not the hash; use the hash afterwards for a `tx` lookup.
   ```json
   { "method": "submit", "params": [{ "tx_blob": "<signed blob>" }] }
   ```
3. **Via the wallet:** only for wallets that support it (see the table).

## Docker

> The Docker files have not been verified: Docker was not available when they were written. Expect to fix small things on first run.

Dev (hot reload for both services):

```bash
cp server/.env.example server/.env   # fill in XAMAN_API_KEY and XAMAN_API_SECRET
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:3001 (`/health`)

Production (`docker-compose.prod.yml`, e.g. a Docker Compose resource on Coolify):

- `web` is the nginx image serving the built app on port 3000, with `/health`. nginx proxies `/api` to the `server` service, so the app and API share one origin and no CORS is needed.
- `server` is not published to the host.
- Set these as **runtime** environment variables only: `XAMAN_API_KEY`, `XAMAN_API_SECRET`, `ALLOWED_ORIGIN` (the public URL of the web app). The compose file sets `TRUST_PROXY=true` so the rate limiter reads the real client IP from nginx.

## Security notes

- **Secrets never go in the browser or in build args.** Anything in a Vite bundle (including `VITE_*` vars) is public. The old version sent a Xumm/Xaman `X-API-Secret` from client code. Now the Xaman key and secret live only in the server's runtime environment and are never returned or logged.
- **Rotate the old Xumm key.** A `.env` was committed to this repo's git history. Treat that key as exposed and rotate it in the Xaman developer console. Removing the file does not remove it from history.
- **Mainnet is gated.** Use testnet or devnet unless you mean it. Wallets must be on the same network as the app, or signed transactions will not validate.
- Only use throwaway keys on test networks.
- The server rate limit is in memory (resets on restart, not shared across instances).
