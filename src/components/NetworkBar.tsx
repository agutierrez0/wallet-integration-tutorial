import { NETWORKS } from "../lib/networks";
import type { NetworkId } from "../lib/networks";

interface Props {
  networkId: NetworkId;
  mainnetOk: boolean;
  networkHint?: string;
  onNetwork: (id: NetworkId) => void;
  onMainnetOk: (ok: boolean) => void;
}

export function NetworkBar({
  networkId,
  mainnetOk,
  networkHint,
  onNetwork,
  onMainnetOk,
}: Props) {
  return (
    <section className="card">
      <h2>1. Network</h2>
      <div className="row">
        <select
          value={networkId}
          onChange={(e) => onNetwork(e.target.value as NetworkId)}
        >
          {Object.values(NETWORKS).map((n) => (
            <option
              key={n.id}
              value={n.id}
              disabled={n.id === "mainnet" && !mainnetOk}
            >
              {n.label}
            </option>
          ))}
        </select>
        {networkHint && (
          <span className="muted">Wallet reports: {networkHint}</span>
        )}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={mainnetOk}
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
