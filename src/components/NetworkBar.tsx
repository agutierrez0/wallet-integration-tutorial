import { NETWORKS } from "../lib/networks";
import type { NetworkId } from "../lib/networks";
import { Alert } from "./ui";

interface Props {
  networkId: NetworkId;
  mainnetOk: boolean;
  networkHint?: string;
  // Where the hint came from, e.g. "at sign-in" (Xaman) or "at connect".
  hintNote?: string;
  // Set when the wallet's network is known and differs from the selected one.
  mismatch?: string | null;
  disabled?: boolean;
  onNetwork: (id: NetworkId) => void;
  onMainnetOk: (ok: boolean) => void;
}

export function NetworkBar({
  networkId,
  mainnetOk,
  networkHint,
  hintNote,
  mismatch,
  disabled = false,
  onNetwork,
  onMainnetOk,
}: Props) {
  return (
    <section className="card">
      <h2>Network</h2>
      <div className="row">
        <select
          aria-label="Network"
          disabled={disabled}
          value={networkId}
          onChange={(e) => onNetwork(e.target.value as NetworkId)}
        >
          {Object.values(NETWORKS).map((n) => (
            <option key={n.id} value={n.id} disabled={n.id === "mainnet" && !mainnetOk}>
              {n.label}
            </option>
          ))}
        </select>
        {networkHint && (
          <span className="muted">
            Wallet reports: {networkHint}
            {hintNote ? ` (${hintNote})` : ""}
          </span>
        )}
      </div>
      {mismatch && <Alert variant="warning" title="Network mismatch" message={mismatch} />}
      <label className="check">
        <input
          type="checkbox"
          checked={mainnetOk}
          disabled={disabled}
          onChange={(e) => onMainnetOk(e.target.checked)}
        />
        I understand mainnet is real XRP
      </label>
      <p className="muted">
        Make sure your wallet is on the same network as the one selected here.
      </p>
    </section>
  );
}
