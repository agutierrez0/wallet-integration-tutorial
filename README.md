# XRPL Wallet Integration Sandbox

A browser sandbox for XRPL tooling. Connect a wallet (Crossmark, GemWallet, Xaman or a Ledger), build any of 21 transaction types with a form, sign it, and get the signed `tx_blob` plus its hash. Then submit it however you like.

Stack: Vite + React 19 + TypeScript + `xrpl` v5, with a small Hono backend (`server/`) for Xaman. Originally `wallet-integration-tutorial` (CRA, `xrpl` v3); the repo is planned to be renamed `xrpl-wallet-integration`.

## Layout

| Path | What it is |
|---|---|
| `src/` | The web app. Wallet adapters in `src/wallets/`, transaction schemas and helpers in `src/lib/`, UI in `src/components/` |
| `server/` | Hono API that holds the Xaman API key and secret (port 3001) |
| `scripts/` | Headless Python and JS XRPL examples, see [`scripts/README.md`](scripts/README.md) |
| `Dockerfile`, `nginx.conf`, `docker-compose*.yml`, `deploy.env.example` | Container setup |
| `.github/` | CI workflow and Dependabot |
| `docs/tickets/` | Open follow-up work, start with [001](docs/tickets/001-xaman-setup-and-followups.md) |

## Quick start (local)

Web app only (Crossmark, GemWallet and Ledger work without the backend):

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm test
npm run build
npm run lint         # Biome
```

Requires Node 22.12+ (`.nvmrc`).

With Xaman, also run the backend in a second terminal:

```bash
cd server
cp .env.example .env     # then fill in XAMAN_API_KEY and XAMAN_API_SECRET
npm install
npm run dev              # http://localhost:3001, loads server/.env
npm test
```

Create the Xaman keys in the Xaman developer console (https://apps.xumm.dev). Vite proxies `/api` to `http://localhost:3001` (override with `API_PROXY_TARGET`).

Defaults to **testnet**. Devnet is available too. Mainnet is off in the UI until you tick an explicit "this is real XRP" box, and the server refuses mainnet Xaman requests unless `ALLOW_MAINNET=true`.

## Wallets

| Wallet | Sign only (blob) | Sign + submit via wallet | Needs |
|---|---|---|---|
| Crossmark | yes | no | browser extension |
| GemWallet | yes | yes | browser extension |
| Xaman | yes | yes | `server/` running with Xaman keys |
| Ledger | yes (hardware only signs) | no, submit yourself | see below |

Each wallet sits behind a `WalletAdapter` (`src/wallets/types.ts`) with capability flags, so the UI can disable combinations a wallet does not support. Every adapter honors an `AbortSignal`, so Cancel stops waiting. Extension and hardware prompts cannot be withdrawn, so approving one after you cancel can still go through; check History or the explorer.

- **Xaman** signs through a QR code (or the "Open in Xaman" button on mobile). The backend creates the request and the app polls for the result. Xaman fills `Sequence`, `Fee` and `LastLedgerSequence` itself, so a slow scan cannot produce an expired transaction. Cancelling a request that is already open on the phone is refused by Xaman; the app says so and keeps waiting for the real outcome.
- **Ledger** uses WebUSB: **Chrome, Edge or Opera**, on **HTTPS or localhost**, with the **XRP app open** on the device. It always uses the first account (path `44'/144'/0'/0/0`); `setAccountIndex` exists in `src/wallets/ledger.ts` but the UI does not expose an account picker yet. The Ledger XRP app may refuse transaction types it cannot display or sign (likely the newer NFT and other uncommon types); a refusal shows as a rejection.

## Transaction builder

Pick a type from the searchable card grid (type to filter, arrows and Enter to select, `/` to focus search). The form shows only that type's fields; rarely used ones sit under "Advanced options". A live JSON preview sits below, and "Edit raw JSON" lets you edit directly (going back to the form tells you if some fields cannot be shown). 21 types:

| Category | Types |
|---|---|
| Payments | `Payment` |
| Account | `AccountSet`, `SetRegularKey`, `TicketCreate`, `AccountDelete`, `DepositPreauth`, `SignerListSet` |
| Trust lines & DEX | `TrustSet`, `OfferCreate`, `OfferCancel` |
| NFTs | `NFTokenMint`, `NFTokenBurn`, `NFTokenCreateOffer`, `NFTokenAcceptOffer`, `NFTokenCancelOffer` |
| Escrow & checks | `EscrowCreate`, `EscrowFinish`, `EscrowCancel`, `CheckCreate`, `CheckCash`, `CheckCancel` |

Date fields are a UTC picker (converted to Ripple epoch seconds). Anything the form cannot represent still works as raw JSON.

## Flow: sign -> hash -> submit

1. Pick a network and connect a wallet.
2. Choose a type and fill the form (or edit raw JSON). `Account` comes from the connected wallet. Errors show after you leave a field or press Sign.
3. **Sign.** The app autofills `Sequence`, `Fee` and `LastLedgerSequence` from the selected network (not for Xaman), then asks the wallet to sign.
4. The UI shows the signed `tx_blob`, its **hash** (computed locally, known before submit), the decoded transaction and a signature check. It also **compares the signed blob to what you built** and checks the signing key belongs to the account. If a field differs (for example a changed `Destination` or `Amount`), a warning card lists it and Submit stays blocked until you tick "Submit anyway".
5. Submit.

The UI shows loading and failure states along the way: extension checks, "waiting for approval in your wallet" with Cancel, not-installed (with install links), rejected, expired and wrong-network messages with Retry, a wallet/network mismatch warning, and a result card that explains the XRPL result code (`tes`, `tec`, `tef`, `tem`, `ter`). After a wallet-side submit the app looks the hash up on-chain automatically.

## Three ways to submit

1. **In the UI with xrpl.js:** `client.submitAndWait(blob)` from the browser.
2. **Copy out:** paste the ready-made JSON-RPC body or `curl` command into Postman or a terminal. The app never calls rippled for you in this mode. Submit the **blob**, not the hash; use the hash afterwards for a `tx` lookup.
   ```json
   { "method": "submit", "params": [{ "tx_blob": "<signed blob>" }] }
   ```
3. **Via the wallet:** only for wallets that support it (see the table).

## History

Every signed transaction is saved in your browser's `localStorage` (this browser only, last 50). Each row shows the type, network, status (signed, submitted with its result code, or failed), the hash with a Copy button, and a link to the explorer once it is submitted. Click a row to load it back into the form; it switches between testnet and devnet if needed but will not switch to mainnet unless mainnet is enabled, and it warns if the connected account differs from the one that signed. Rows that were signed but not submitted here (or failed with no result) have a **Check on-chain** button, which is how you confirm a blob you sent through Postman.

## Server API (`server/`)

| Route | Notes |
|---|---|
| `GET /health`, `GET /api/health` | `200 ok`, no upstream call |
| `POST /api/xaman/payload` | body `{ txjson?, signIn?, submit?, network }`. `network` is **required** (`testnet`, `devnet`, `mainnet`) |
| `GET /api/xaman/payload/:uuid` | status `pending`, `opened`, `signed`, `rejected`, `expired`, `cancelled`; `signed` includes `account`, `hex`, `txid` |
| `DELETE /api/xaman/payload/:uuid` | `204` on cancel, **`409 CANNOT_CANCEL`** if the request is already open on the phone |

Errors are `{ "error": { "code", "message" } }`. Notable codes: `403 MAINNET_DISABLED` (unless `ALLOW_MAINNET=true`), `403 FORBIDDEN_ORIGIN` (Origin not in `ALLOWED_ORIGIN`, or a cross-site request without one), `400 INVALID_REQUEST` / `INVALID_UUID`, `BODY_TOO_LARGE` (16 KiB), `502 UPSTREAM_ERROR`. Rate limits per client per minute: 240 reads, 20 creates, 10 cancels (health and preflights exempt). The limiter is in memory (resets on restart, not shared across instances). The origin check is defense in depth, not authentication: anyone can still call the API with curl, which is why mainnet is off by default.

Server environment (`server/.env.example`): `XAMAN_API_KEY`, `XAMAN_API_SECRET`, `PORT` (3001), `ALLOWED_ORIGIN` (comma-separated browser origins), `TRUST_PROXY` (default false), `ALLOW_MAINNET` (default false).

## Docker

> **Never built or run.** Docker was not available when these files were written, so the Dockerfiles, compose files and nginx config (including the CSP) are unverified. Work through the checklist in [ticket 001](docs/tickets/001-xaman-setup-and-followups.md) before trusting them.

Dev (hot reload for both services):

```bash
cp server/.env.example server/.env   # fill in XAMAN_API_KEY and XAMAN_API_SECRET
docker compose up --build
```

- Web: http://localhost:3000, API: http://localhost:3001. Both are published on `127.0.0.1` only, so they are not reachable from your LAN.

Production (`docker-compose.prod.yml`, e.g. a Docker Compose resource on Coolify):

- `web` is `nginx-unprivileged` serving the built app on port 3000, with `/health`, a CSP and other security headers. nginx proxies `/api` to the `server` service, so the app and API share one origin and no CORS is needed.
- `server` is not published to the host.
- Set these as **runtime** environment variables only, never build args (names and placeholders in `deploy.env.example`): `XAMAN_API_KEY`, `XAMAN_API_SECRET`, `ALLOWED_ORIGIN` (must **exactly equal** the public origin of the web app, e.g. `https://sandbox.example.com`), and optionally `ALLOW_MAINNET`.
- The compose file sets `TRUST_PROXY=true`. nginx works out the real client IP (trusting `X-Forwarded-For` only from private ranges, i.e. Traefik in front) and overwrites `X-Real-IP` / `X-Forwarded-For` with it before proxying, so a client cannot spoof its way past the rate limiter. The same private-range rule means that on your own machine a spoofed header would be trusted; that only matters for local testing.

## Scripts and CI

`scripts/` has headless Python and JS examples (see its README). CI (`.github/workflows/ci.yml`) runs install, lint (web), typecheck, tests and build for the web app and the server, plus a `docker compose -f docker-compose.prod.yml build` job. Dependabot covers npm, GitHub Actions, Docker and pip.

## Security notes

- **A Xumm/Xaman API secret and key were hardcoded in source in this public repo's git history.** They are in `src/utils/xamanwallet.js` in commit `89f85c1` and earlier, and that commit is reachable from `main`, `ledger-integration`, `signing-test` and `xrpl-integration`. **Rotation is required, not optional:** revoke or regenerate that key pair in the Xaman developer console, and do not reuse it for the new server. Deleting it from the working tree does not remove it from history. A third key in an earlier commit has been reported but is unconfirmed. The `.env` that was deleted from this repo only ever held an empty key.
- **Secrets never go in the browser or in build args.** Anything in a Vite bundle (including `VITE_*` vars) is public. The Xaman key and secret live only in the server's runtime environment and are never returned or logged.
- **Mainnet is gated** in the UI and on the server. Wallets must be on the same network as the app; the app warns on a mismatch it can see, but wallets cannot re-report their network after connecting.
- The Docker, nginx and CSP configuration has never been run. A too-strict CSP will show up as blocked requests in the browser console (Xaman QR image, faucet, wallet extensions).
- `npm audit` for the web app reports 3 high and 7 low findings, all through `@crossmarkio/sdk` -> `@crossmarkio/typings` (`node-forge`, `elliptic`, an old `xrpl`). None of that code is in the built bundle and no fix is available. The server audit is clean.
- Only use throwaway keys on test networks.

## License

MIT, see [`LICENSE`](LICENSE).
