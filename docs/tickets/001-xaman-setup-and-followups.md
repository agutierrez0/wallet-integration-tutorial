# 001: Xaman setup and follow-ups

Status: open · Owner: Angel · Created: 2026-10-11

Xaman support is merged (`server/` backend + frontend adapter) but has never run against real
Xaman credentials. Everything below is what's left to do before it can be trusted.

## 1. Get Xaman working (needs Angel)
- [ ] Create a Xaman developer app at the Xaman developer console and note the API key + secret.
- [ ] `cp server/.env.example server/.env` and fill `XAMAN_API_KEY` / `XAMAN_API_SECRET`.
- [ ] Run `cd server && npm run dev` and `npm run dev` (or `docker compose up --build`).
- [ ] First live test: Connect with Xaman (scan QR) -> sign an `AccountSet` on testnet -> submit.
- [ ] Confirm against real responses (these were written from SDK types, not live data):
  - [ ] `hex` on a `submit: false` payload is the full signed blob
  - [ ] a declined payload comes back as `resolved: true, signed: false` (status `rejected`)
  - [ ] `force_network` accepts `TESTNET` / `DEVNET` / `MAINNET`
  - [ ] Xaman keeps our autofilled `Fee` / `Sequence` / `LastLedgerSequence`
- [ ] Mobile: QR modal layout, and the "Open in Xaman" deeplink on a phone.

## 2. Verify Docker (never built; Docker wasn't installed when this was written)
- [ ] `docker compose -f docker-compose.yml config -q` and `-f docker-compose.prod.yml config -q`
- [ ] `docker compose up --build`: web on :3000, API on :3001, `/api/health` works through nginx/vite
- [ ] Coolify: deploy `docker-compose.prod.yml`; set `XAMAN_API_KEY`, `XAMAN_API_SECRET`,
      `ALLOWED_ORIGIN` as runtime env only (never build args); server must not be published.

## 3. Housekeeping
- [ ] Rotate the old Xumm API key if the deleted `.env` held one (still in git history of this public repo).
- [ ] Delete the old `agutierrez0/xrpl-sandbox` repo (contents already imported to `scripts/`).
- [ ] Rename this repo to `xrpl-wallet-integration`, then update `git remote`, `package.json` name, README.

## 4. Next features
- [ ] Ledger (WebUSB) adapter. Needs a secure context (HTTPS or localhost).
- [ ] "Check result" lookup by hash for wallet-side submits (no final result code today).
- [ ] WalletConnect adapter (see the `xrpl-walletconnect` fork) and an optional local-seed dev wallet.
- [ ] Persistent rate limiting if the server ever runs more than one instance.
