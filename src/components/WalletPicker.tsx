import type { UseAction } from "../hooks/useAction";
import { isCancelled, toUserError } from "../lib/errors";
import type { WalletAdapter, WalletSession } from "../wallets/types";
import { ActionButton, Alert, Skeleton, StatusPill } from "./ui";

const INSTALL_URLS: Record<string, string> = {
  crossmark: "https://crossmark.io",
  gemwallet: "https://gemwallet.app",
  xaman: "https://xaman.app",
};

interface Props {
  adapters: WalletAdapter[];
  // null while the first extension check is still running.
  available: Record<string, boolean> | null;
  selectedId: string;
  session: WalletSession | null;
  connect: UseAction<[], WalletSession>;
  fund: UseAction<[], unknown>;
  canFund: boolean;
  // Another operation (sign, submit, ...) is running; don't allow switching.
  locked: boolean;
  disconnecting: boolean;
  onSelect: (id: string) => void;
  onConnect: () => void;
  onCancelConnect: () => void;
  onDisconnect: () => void;
  onFund: () => void;
  onRecheck: () => void;
}

// The faucet response shape isn't guaranteed, so only mention amounts we can read.
function fundMessage(data: unknown): string {
  const d = (data ?? {}) as { amount?: unknown; balance?: unknown };
  const num = (v: unknown) =>
    typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))
      ? Number(v)
      : null;
  const amount = num(d.amount);
  const balance = num(d.balance);
  if (amount !== null && balance !== null) {
    return `The faucet sent ${amount} XRP. Balance: ${balance} XRP.`;
  }
  if (amount !== null) return `The faucet sent ${amount} XRP.`;
  if (balance !== null) return `Balance: ${balance} XRP.`;
  return "Faucet request accepted. The balance can take a few seconds to appear.";
}

export function WalletPicker({
  adapters,
  available,
  selectedId,
  session,
  connect,
  fund,
  canFund,
  locked,
  disconnecting,
  onSelect,
  onConnect,
  onCancelConnect,
  onDisconnect,
  onFund,
  onRecheck,
}: Props) {
  const selected = adapters.find((a) => a.id === selectedId);
  const connecting = connect.status === "loading";
  const funding = fund.status === "loading";
  const anyMissing = available !== null && adapters.some((a) => !available[a.id]);
  const approving = connecting && !!selected?.setPromptHandler;

  const pill = session ? (
    <StatusPill tone="success">Connected</StatusPill>
  ) : connecting ? (
    <StatusPill tone="pending">Connecting…</StatusPill>
  ) : connect.status === "error" && !isCancelled(connect.error) ? (
    <StatusPill tone="error">Connection failed</StatusPill>
  ) : (
    <StatusPill>Not connected</StatusPill>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>Connect a wallet</h2>
        {pill}
      </div>

      {available === null ? (
        <div className="wallets" role="status" aria-live="polite" aria-busy="true">
          <span className="ui-sr-only">Checking for extension…</span>
          {adapters.map((a) => (
            <div key={a.id} className="wallet-card">
              <Skeleton height={56} />
            </div>
          ))}
          <p className="muted wide">Checking for extension…</p>
        </div>
      ) : (
        <div className="wallets">
          {adapters.map((a) => {
            const ok = available[a.id];
            return (
              <div key={a.id} className="wallet-card">
                <button
                  type="button"
                  className={`wallet ${a.id === selectedId ? "selected" : ""}`}
                  disabled={!ok || locked || connecting}
                  aria-pressed={a.id === selectedId}
                  onClick={() => onSelect(a.id)}
                >
                  <strong>{a.name}</strong>
                  <span className="badges">
                    {a.capabilities.signOnly && <em>sign-only</em>}
                    {a.capabilities.submit && <em>submit</em>}
                    {!ok && <em className="off">{a.unavailableReason ?? "not installed"}</em>}
                  </span>
                </button>
                {!ok && a.unavailableReason && (
                  <p className="muted wallet-hint">
                    {a.name} needs the signing backend. Run <code>docker compose up</code> or{" "}
                    <code>npm run dev</code> in <code>server/</code>, then{" "}
                    <button type="button" className="linklike" onClick={onRecheck}>
                      check again
                    </button>
                    .
                  </p>
                )}
                {!ok && INSTALL_URLS[a.id] && (
                  <a
                    className="install-link"
                    href={INSTALL_URLS[a.id]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.unavailableReason ? `Get the ${a.name} app` : `Install ${a.name}`}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {anyMissing && (
        <p className="muted">
          Just installed one?{" "}
          <button type="button" className="linklike" onClick={onRecheck}>
            Check again
          </button>
        </p>
      )}

      <div className="row wrap">
        {session ? (
          <>
            <code className="addr">{session.address}</code>
            <ActionButton
              variant="secondary"
              loading={disconnecting}
              loadingLabel="Disconnecting…"
              disabled={locked}
              onClick={onDisconnect}
            >
              Disconnect
            </ActionButton>
            {canFund && (
              <ActionButton
                variant="secondary"
                loading={funding}
                loadingLabel="Requesting funds…"
                disabled={locked}
                onClick={onFund}
              >
                Fund from faucet
              </ActionButton>
            )}
          </>
        ) : (
          <>
            <ActionButton
              loading={connecting}
              loadingLabel={`Waiting for approval in ${selected?.name ?? "wallet"}…`}
              disabled={!selected || locked}
              onClick={onConnect}
            >
              {selected ? `Connect ${selected.name}` : "Pick a wallet to connect"}
            </ActionButton>
            {connecting && (
              <ActionButton variant="ghost" onClick={onCancelConnect}>
                Cancel
              </ActionButton>
            )}
          </>
        )}
      </div>

      {connecting && (
        <p className="muted" role="status">
          {approving
            ? `Scan the QR code with ${selected?.name} to approve.`
            : `Approve the request in the ${selected?.name} popup.`}{" "}
          Cancel stops waiting and ignores the result.
        </p>
      )}

      {connect.status === "error" && isCancelled(connect.error) && (
        <p className="muted" role="status">
          Cancelled. Nothing was connected.
        </p>
      )}
      {connect.status === "error" && !isCancelled(connect.error) && (
        <Alert error={toUserError(connect.error)} onRetry={onConnect} onDismiss={connect.reset} />
      )}
      {fund.status === "success" && (
        <Alert
          variant="success"
          title="Account funded"
          message={fundMessage(fund.data)}
          onDismiss={fund.reset}
        />
      )}
      {fund.status === "error" && (
        <Alert error={toUserError(fund.error)} onRetry={onFund} onDismiss={fund.reset} />
      )}
    </section>
  );
}
