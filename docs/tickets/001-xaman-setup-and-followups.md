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

## 3. Verify Docker, nginx and CSP (never built or run)
- [ ] `docker compose -f docker-compose.yml config -q` and `-f docker-compose.prod.yml config -q`
- [ ] `docker compose up --build`: web on :3000, API on :3001 (both bound to 127.0.0.1),
      `/api/health` works through nginx and through vite.
- [ ] `nginx -t` on `nginx.conf`; confirm `nginx-unprivileged` loads `conf.d/*.conf` and runs
      on port 3000 as configured.
- [ ] Load the app from the container and watch the **browser console for CSP blocks**: the Xaman
      QR image, the faucet, XRPL websocket/RPC hosts, wallet extensions, the wasm chunk.
- [ ] Coolify: deploy `docker-compose.prod.yml`; set `XAMAN_API_KEY`, `XAMAN_API_SECRET`,
      `ALLOWED_ORIGIN` (exactly the public origin) as runtime env only (never build args);
      the server must not be published. See `deploy.env.example`.
- [ ] Confirm the rate limiter sees real client IPs behind Traefik (nginx `set_real_ip_from`
      ranges match Coolify's network).
- [ ] CI: first run of `.github/workflows/ci.yml` on GitHub (including the docker job).

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
- [ ] Delete the old `agutierrez0/xrpl-sandbox` repo (contents already imported to `scripts/`).
- [ ] Branches: `origin/wip-may-1` has nothing `main` lacks, safe to delete. `ledger-integration`,
      `signing-test` and `xrpl-integration` hold old CRA-era work (and the leaked key in history);
      review `ledger-integration` for ideas, then delete.
- [ ] Rename the repo to `xrpl-wallet-integration`:
  - [ ] Rename on GitHub, then `git remote set-url origin git@github.com:agutierrez0/xrpl-wallet-integration.git`
  - [ ] `package.json` names `xrpl-wallet-sandbox` / `xrpl-wallet-sandbox-server`
  - [ ] Compose project names `xrpl-wallet-sandbox-{dev,prod}` (renaming makes Coolify recreate
        containers and networks)
  - [ ] `<title>` in `index.html` and the README H1 and rename sentence
  - [ ] Keep `HISTORY_KEY` (`xrpl-wallet-sandbox:history:v1`) unchanged so stored history survives
