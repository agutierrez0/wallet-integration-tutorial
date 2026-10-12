# 001: Xaman setup, verification and follow-ups

Status: open · Owner: Angel · Updated: 2026-10-11

Done and merged: Xaman backend + adapter, Ledger adapter, 21-type builder with date picker, history
with check-on-chain, automatic result lookup after wallet submits, server rate limiting and
hardening, CI/Dependabot/licence, docs. Nothing below has run against real Xaman credentials,
a real Ledger, or Docker.

## 1. Leaked Xaman credentials (history cleaned; revocation still open)
Three Xumm/Xaman credential values were hardcoded in source in this public repo's early history:
two in `src/utils/xamanwallet.js` (commit `89f85c1` and earlier) and one in `src/App.js` (confirmed).
- [x] History rewritten and force-pushed: every commit on `main`, `ledger-integration`, `signing-test`,
      `xrpl-integration`, `wip-may-1` and both tags no longer contains them. The five Dependabot branches
      (which carried the old history) were deleted; Dependabot will recreate its own.
- [x] Local clone reset to the new history. Any other clone must be re-cloned.
- [ ] **Still compromised.** Anyone who cloned before has them, and GitHub keeps the old commits reachable
      through read-only `refs/pull/*` references. Ask GitHub support to remove cached views and the old
      commits ("remove sensitive data"). The repo owner can no longer revoke the keys in the Xaman console,
      so contact Xaman support to revoke that app's credentials.
- [x] The new server credentials are from a new Xaman app, not the leaked one. Keep it that way.
- The deleted `.env` only held an empty `REACT_APP_XUMM_API_KEY=`; it was not the leak.

## 2. First live Xaman test (needs Angel)
- [ ] Create a Xaman developer app; `cp server/.env.example server/.env` and fill
      `XAMAN_API_KEY` / `XAMAN_API_SECRET`.
- [ ] `cd server && npm run dev`, then `npm run dev` at the root (or `docker compose up --build`).
- [ ] Connect with Xaman (scan QR) -> build an `AccountSet` on testnet -> sign -> submit.
- [ ] Confirm against real responses (written from SDK types, not live data):
  - [ ] `hex` on a `submit: false` payload is the full signed blob
  - [ ] a declined payload comes back as `resolved: true, signed: false` (status `rejected`)
  - [ ] `force_network` accepts `TESTNET` / `DEVNET` / `MAINNET`
  - [ ] Xaman fills `Sequence` / `Fee` / `LastLedgerSequence` itself when they are omitted
  - [ ] cancelling a request already opened on the phone returns 409 `CANNOT_CANCEL`
- [ ] Mobile: QR modal layout, and the "Open in Xaman" deeplink on a phone.

## 3. Docker, nginx and CSP (verified locally; Coolify deploy still open)
Verified on Docker Desktop (Apple Silicon): both compose files validate; the production images build and
run healthy as non-root users; nginx serves the SPA and proxies `/api`; security headers present; CSP
allows the XRPL testnet WebSocket and blocks other origins; the server refuses mainnet and foreign
origins; the rate limit holds through nginx; CI's docker job passes on GitHub.
Fixed along the way: `npm ci` in the server image tried to compile the optional `bufferutil` on
arm64 Alpine and failed; both stages now use `--ignore-scripts` (CI on x64 had never caught it).
- Note: public rippled JSON-RPC endpoints send no CORS headers, so the browser cannot call them
  directly. The app uses WebSockets; the JSON-RPC body is only for copy-paste into Postman/curl.
- [ ] Coolify: deploy `docker-compose.prod.yml`; set `XAMAN_API_KEY`, `XAMAN_API_SECRET`,
      `ALLOWED_ORIGIN` (exactly the public origin) as runtime env only (never build args);
      the server must not be published. See `deploy.env.example`.
- [ ] Confirm the rate limiter sees real client IPs behind Traefik (nginx `set_real_ip_from`
      ranges match Coolify's network).
- [ ] Watch the browser console for CSP blocks on the deployed site (Xaman QR image, faucet,
      wallet extensions).

## 4. Test Ledger on a real device
- [ ] Chrome/Edge/Opera on HTTPS or localhost, Ledger unlocked, XRP app open.
- [ ] Connect, sign a `Payment`, verify the blob, submit.
- [ ] Find out which transaction types the Ledger XRP app will actually sign; list refusals in the README.
- [ ] Wrong app / locked device / user-rejected messages read well.

## 5. Next features
- [ ] WalletConnect adapter. Needs a WalletConnect Cloud project id (yours to create); see the
      `agutierrez0/xrpl-walletconnect` fork.
- [ ] Optional local dev-seed wallet (testnet/devnet only, in memory, never persisted).
- [ ] Persistent rate limiting if the server ever runs more than one instance.

## 6. Known gaps
- NFT offer cap on `NFTokenCancelOffer` (500) came from memory, not the docs; check rippled.
- `AccountDelete` help text gives no fee amount (the docs page did not render it).
- Wallets cannot re-report their network after connect, so the mismatch warning uses the hint
  from connect time.
- jsdom cannot run the signing library, so App tests use pre-generated blobs and a fake adapter.
- Not tried in a browser: selector keyboard navigation, native `<dialog>` modal and focus
  return, the datetime picker, mobile layout.
- Credential-based `DepositPreauth`, `asfAllowTrustLineLocking` and deep freeze are not in the
  form (they open as raw JSON).

## 7. Housekeeping
- [x] Deleted the old `agutierrez0/xrpl-sandbox` repo (contents were imported to `scripts/`).
- [ ] Branches: `origin/wip-may-1` has nothing `main` lacks, safe to delete. `ledger-integration`,
      `signing-test` and `xrpl-integration` hold old CRA-era work (and the leaked key in history);
      review `ledger-integration` for ideas, then delete.
- [x] Renamed the repo to `xrpl-wallet-integration` (GitHub, git remote, package names, compose
      project names, `<title>`, header and README). The Coolify prod compose project is now
      `xrpl-wallet-integration-prod`, so Coolify recreates its containers and network on next deploy.
      The `localStorage` keys (`xrpl-wallet-sandbox:*`) are deliberately unchanged so saved history
      and the chosen network survive.
