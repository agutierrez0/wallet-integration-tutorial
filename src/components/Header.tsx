import { NetworkSwitch } from "./NetworkSwitch";
import type { NetworkId } from "../lib/networks";

interface Props {
  networkId: NetworkId;
  onNetwork: (id: NetworkId) => void;
  // True while connect, sign or submit is running.
  busy?: boolean;
  networkHint?: string;
  // Where the hint came from, e.g. "at sign-in" (Xaman) or "at connect".
  hintNote?: string;
  // Set when the wallet's network is known and differs from the selected one.
  mismatch?: string | null;
}

// Sticky chrome: app name, the global network switch, then the mainnet banner and the
// wallet/network mismatch strip, so both stay visible while scrolling.
export function Header({
  networkId,
  onNetwork,
  busy = false,
  networkHint,
  hintNote,
  mismatch,
}: Props) {
  return (
    <div className="chrome">
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="brand">XRPL Wallet Sandbox</h1>
          <div className="topbar-right">
            {networkHint && (
              <span className="wallet-net">
                Wallet: {networkHint}
                {hintNote ? ` (${hintNote})` : ""}
              </span>
            )}
            <NetworkSwitch
              value={networkId}
              onChange={onNetwork}
              disabled={busy}
              disabledReason="Finish or cancel the current action to switch networks."
            />
          </div>
        </div>
      </header>
      {networkId === "mainnet" && (
        <div className="net-banner" role="status">
          Mainnet — real XRP
        </div>
      )}
      {mismatch && (
        <div className="net-mismatch" role="alert">
          <strong>Network mismatch:</strong> {mismatch}
        </div>
      )}
    </div>
  );
}
