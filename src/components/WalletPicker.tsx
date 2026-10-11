import type { WalletAdapter, WalletSession } from "../wallets/types";

interface Props {
  adapters: WalletAdapter[];
  available: Record<string, boolean>;
  selectedId: string;
  session: WalletSession | null;
  canFund: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onFund: () => void;
}

export function WalletPicker({
  adapters,
  available,
  selectedId,
  session,
  canFund,
  busy,
  onSelect,
  onConnect,
  onDisconnect,
  onFund,
}: Props) {
  return (
    <section className="card">
      <h2>2. Wallet</h2>
      <div className="wallets">
        {adapters.map((a) => {
          const ok = available[a.id];
          return (
            <button
              key={a.id}
              type="button"
              className={`wallet ${a.id === selectedId ? "selected" : ""}`}
              disabled={!ok}
              onClick={() => onSelect(a.id)}
              title={ok ? "" : "Not detected"}
            >
              <strong>{a.name}</strong>
              <span className="badges">
                {a.capabilities.signOnly && <em>sign-only</em>}
                {a.capabilities.submit && <em>submit</em>}
                {!ok && <em className="off">not detected</em>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="row">
        {session ? (
          <>
            <code className="addr">{session.address}</code>
            <button type="button" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onConnect}
            disabled={busy || !selectedId}
          >
            Connect
          </button>
        )}
        {session && canFund && (
          <button type="button" onClick={onFund} disabled={busy}>
            Fund from faucet
          </button>
        )}
      </div>
    </section>
  );
}
