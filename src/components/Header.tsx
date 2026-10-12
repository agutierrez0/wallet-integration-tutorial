import { Alert, Layout, Typography, theme } from "antd";
import type { NetworkId } from "../lib/networks";
import { NetworkSwitch } from "./NetworkSwitch";

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

// Sticky chrome: app name and the global network switch, then the mainnet banner and the
// wallet/network mismatch strip, so both stay visible while scrolling.
export function Header({
  networkId,
  onNetwork,
  busy = false,
  networkHint,
  hintNote,
  mismatch,
}: Props) {
  const { token } = theme.useToken();
  return (
    <div className="chrome">
      <Layout.Header
        className="topbar"
        style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Typography.Title level={1} className="brand">
          <span className="brand-full">XRPL Wallet Integration</span>
          <span className="brand-short" aria-hidden="true">
            XRPL
          </span>
        </Typography.Title>
        <div className="topbar-right">
          {networkHint && (
            <Typography.Text type="secondary" className="wallet-net">
              Wallet: {networkHint}
              {hintNote ? ` (${hintNote})` : ""}
            </Typography.Text>
          )}
          <NetworkSwitch
            value={networkId}
            onChange={onNetwork}
            disabled={busy}
            disabledReason="Finish or cancel the current action to switch networks."
          />
        </div>
      </Layout.Header>
      {networkId === "mainnet" && (
        <Alert banner type="error" role="status" title="Mainnet — real XRP" />
      )}
      {mismatch && (
        <Alert
          banner
          type="warning"
          role="alert"
          title={
            <>
              <strong>Network mismatch:</strong> {mismatch}
            </>
          }
        />
      )}
    </div>
  );
}
