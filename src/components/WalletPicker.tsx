import { Alert, Button, Card, Flex, Radio, Skeleton, Space, Tag, Typography } from "antd";
import type { UseAction } from "../hooks/useAction";
import { isCancelled, toUserError } from "../lib/errors";
import type { WalletAdapter, WalletSession } from "../wallets/types";
import { UserErrorAlert } from "./shell/UserErrorAlert";

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
    typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
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

  const status = session ? (
    <Tag color="success">Connected</Tag>
  ) : connecting ? (
    <Tag color="processing">Connecting…</Tag>
  ) : connect.status === "error" && !isCancelled(connect.error) ? (
    <Tag color="error">Connection failed</Tag>
  ) : (
    <Tag>Not connected</Tag>
  );

  return (
    <Card
      title={
        <Typography.Title level={2} className="card-title">
          Connect a wallet
        </Typography.Title>
      }
      extra={status}
    >
      <Flex orientation="vertical" gap={16}>
        {available === null ? (
          <div role="status" aria-live="polite" aria-busy="true">
            <Skeleton active title={false} paragraph={{ rows: adapters.length }} />
            <Typography.Text type="secondary">Checking for extension…</Typography.Text>
          </div>
        ) : (
          <Radio.Group
            value={selectedId || undefined}
            onChange={(e) => onSelect(e.target.value as string)}
            disabled={locked || connecting}
            aria-label="Wallet"
          >
            <Flex orientation="vertical" gap={12}>
              {adapters.map((a) => {
                const ok = available[a.id];
                return (
                  <div key={a.id}>
                    <Radio value={a.id} disabled={!ok || locked || connecting}>
                      <Space size={8} wrap>
                        <Typography.Text strong>{a.name}</Typography.Text>
                        {a.capabilities.signOnly && <Tag>sign-only</Tag>}
                        {a.capabilities.submit && <Tag>submit</Tag>}
                        {!ok && <Tag color="warning">{a.unavailableReason ?? "not installed"}</Tag>}
                      </Space>
                    </Radio>
                    {!ok && a.unavailableReason && (
                      <div className="wallet-hint">
                        <Typography.Text type="secondary">
                          {a.name} needs the signing backend. Run <code>docker compose up</code> or{" "}
                          <code>npm run dev</code> in <code>server/</code>, then{" "}
                        </Typography.Text>
                        <Button
                          type="link"
                          size="small"
                          className="inline-link"
                          onClick={onRecheck}
                        >
                          check again
                        </Button>
                        .
                      </div>
                    )}
                    {!ok && INSTALL_URLS[a.id] && (
                      <div className="wallet-hint">
                        <Typography.Link href={INSTALL_URLS[a.id]} target="_blank" rel="noreferrer">
                          {a.unavailableReason ? `Get the ${a.name} app` : `Install ${a.name}`}
                        </Typography.Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </Flex>
          </Radio.Group>
        )}

        {anyMissing && (
          <Typography.Text type="secondary">
            Just installed one?{" "}
            <Button type="link" size="small" className="inline-link" onClick={onRecheck}>
              Check again
            </Button>
          </Typography.Text>
        )}

        <Space wrap>
          {session ? (
            <>
              <Typography.Text code copyable>
                {session.address}
              </Typography.Text>
              <Button loading={disconnecting} disabled={locked} onClick={onDisconnect}>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
              {canFund && (
                <Button loading={funding} disabled={locked} onClick={onFund}>
                  {funding ? "Requesting funds…" : "Fund from faucet"}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                type="primary"
                loading={connecting}
                disabled={!selected || locked}
                onClick={onConnect}
              >
                {connecting
                  ? `Waiting for approval in ${selected?.name ?? "wallet"}…`
                  : selected
                    ? `Connect ${selected.name}`
                    : "Pick a wallet to connect"}
              </Button>
              {connecting && (
                <Button type="text" onClick={onCancelConnect}>
                  Cancel
                </Button>
              )}
            </>
          )}
        </Space>

        {connecting && (
          <div role="status">
            <Typography.Text type="secondary">
              {approving
                ? `Scan the QR code with ${selected?.name} to approve.`
                : `Approve the request in the ${selected?.name} popup.`}{" "}
              Cancel stops waiting and ignores the result.
            </Typography.Text>
          </div>
        )}

        {connect.status === "error" && isCancelled(connect.error) && (
          <div role="status">
            <Typography.Text type="secondary">Cancelled. Nothing was connected.</Typography.Text>
          </div>
        )}
        {connect.status === "error" && !isCancelled(connect.error) && (
          <UserErrorAlert
            error={toUserError(connect.error)}
            onRetry={onConnect}
            onDismiss={connect.reset}
          />
        )}
        {fund.status === "success" && (
          <Alert
            type="success"
            showIcon
            title="Account funded"
            description={fundMessage(fund.data)}
            closable={{ onClose: fund.reset, "aria-label": "Dismiss" }}
          />
        )}
        {fund.status === "error" && (
          <UserErrorAlert error={toUserError(fund.error)} onRetry={onFund} onDismiss={fund.reset} />
        )}
      </Flex>
    </Card>
  );
}
