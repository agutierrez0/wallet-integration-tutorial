import { DeleteOutlined, DownOutlined, RightOutlined, WalletOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Flex, Popconfirm, Tag, Tooltip, Typography, theme } from "antd";
import { useEffect, useId, useState } from "react";
import { useAction } from "../hooks/useAction";
import { toUserError } from "../lib/errors";
import {
  explorerUrl,
  formatRelativeTime,
  lookupTx,
  shortAddress,
  shortHash,
  summarizeTx,
  walletLabel,
} from "../lib/history";
import { canCheckOnChain } from "../lib/historyEntries";
import type { HistoryEntry } from "../lib/historyTypes";
import { NETWORKS } from "../lib/networks";
import { ActionButton, Alert, StatusPill } from "./ui";
import type { PillTone } from "./ui";

export interface HistoryPanelProps {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  // Re-checks the entry on-chain and updates it in the parent's store.
  // If omitted, the row does a one-off lookup and shows the result inline only.
  onCheckStatus?: (entry: HistoryEntry) => Promise<void>;
  disabled?: boolean;
  // false when browser storage is blocked, so nothing can be saved.
  available?: boolean;
}

const OPEN_KEY = "xrpl-wallet-sandbox:history-open:v1";
const PAGE = 25;

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // storage blocked: the toggle still works for this page view
  }
}

export function describeStatus(e: HistoryEntry): { tone: PillTone; label: string } {
  const code = e.engineResult;
  if (e.status === "failed") return { tone: "error", label: code ? `Failed ${code}` : "Failed" };
  if (e.status === "signed") return { tone: "neutral", label: "Signed" };
  if (!code) return { tone: e.validated ? "success" : "pending", label: "Submitted" };
  if (code.startsWith("tes")) return { tone: "success", label: `Submitted ${code}` };
  if (code.startsWith("tec")) return { tone: "warning", label: `Submitted ${code}` };
  if (code.startsWith("ter")) return { tone: "pending", label: `Queued ${code}` };
  return { tone: "error", label: `Rejected ${code}` };
}

function isOnChain(e: HistoryEntry): boolean {
  return e.status === "submitted" || e.validated === true;
}

type CheckResult =
  | { source: "parent" }
  | { source: "lookup"; found: boolean; validated?: boolean; engineResult?: string };

// "Found" and "not found" are different from "never checked": a missing transaction may simply
// not have been sent yet, or not have reached the ledger.
function foundText(engineResult: string | undefined, validated: boolean | undefined): string {
  const code = engineResult ?? "result unknown";
  return validated === false ? `Found, not yet validated: ${code}` : `Found: ${code}`;
}

const NET_COLOR = { testnet: "cyan", devnet: "purple", mainnet: "red" } as const;

function Row({
  entry,
  disabled,
  onRestore,
  onRemove,
  onCheckStatus,
  now,
}: {
  entry: HistoryEntry;
  disabled?: boolean;
  onRestore: (e: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onCheckStatus?: (e: HistoryEntry) => Promise<void>;
  now: number;
}) {
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);

  const check = useAction(async (): Promise<CheckResult> => {
    if (onCheckStatus) {
      await onCheckStatus(entry);
      return { source: "parent" };
    }
    const r = await lookupTx(entry.network, entry.hash);
    return {
      source: "lookup",
      found: r.found,
      validated: r.validated,
      engineResult: r.engineResult,
    };
  });

  const status = describeStatus(entry);
  const net = NETWORKS[entry.network];
  const summary = summarizeTx(entry.tx);
  const onChain = isOnChain(entry);
  const full = new Date(entry.createdAt).toLocaleString();
  void now; // re-renders the relative time when the panel ticks

  const checkable = canCheckOnChain(entry);
  const notFoundText = `Not found on ${net.label}. If you haven't submitted it yet, that's expected.`;

  let resultText: string | null = null;
  if (check.status === "success" && check.data) {
    if (check.data.source === "parent") {
      // The parent stores the lookup result on the entry, so read it back from there.
      resultText = onChain ? foundText(entry.engineResult, entry.validated) : notFoundText;
    } else {
      resultText = check.data.found
        ? foundText(check.data.engineResult, check.data.validated)
        : notFoundText;
    }
  } else if (check.status === "loading") {
    resultText = "Checking the ledger…";
  }

  return (
    <li
      style={{
        padding: `${token.paddingSM}px 0`,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Flex justify="space-between" align="flex-start" gap="middle" wrap>
        <Flex vertical gap={4} style={{ minWidth: 0, flex: "1 1 260px" }}>
          <Flex align="center" gap="small" wrap>
            <Typography.Text strong>{entry.txType}</Typography.Text>
            <Tag color={NET_COLOR[entry.network]} style={{ marginInlineEnd: 0 }}>
              {entry.network}
            </Tag>
            <Tag
              icon={<WalletOutlined />}
              style={{ marginInlineEnd: 0 }}
              title="Wallet used to sign"
            >
              {walletLabel(entry.walletId)}
            </Tag>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </Flex>
          {summary && <Typography.Text type="secondary">{summary}</Typography.Text>}
          <Flex align="center" gap="small" wrap>
            <Typography.Text
              code
              copyable={{
                text: entry.hash,
                tooltips: false,
                onCopy: () => setCopied(true),
              }}
              title={entry.hash}
            >
              {shortHash(entry.hash)}
            </Typography.Text>
            <Typography.Text
              type="secondary"
              copyable={{ text: entry.account, tooltips: false }}
              title={`Signed by ${entry.account}`}
            >
              {shortAddress(entry.account)}
            </Typography.Text>
            <Tooltip title={full}>
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                <Typography.Text type="secondary">
                  {formatRelativeTime(entry.createdAt)}
                </Typography.Text>
              </time>
            </Tooltip>
          </Flex>
        </Flex>

        <Flex align="center" gap="small" wrap>
          {onChain ? (
            <Typography.Link
              href={explorerUrl(entry.network, entry.hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on explorer
            </Typography.Link>
          ) : checkable ? (
            <>
              <Typography.Text type="secondary">
                {entry.status === "failed"
                  ? "Submit failed, outcome unknown"
                  : check.status === "success"
                    ? "Checked just now"
                    : "Not checked on-chain"}
              </Typography.Text>
              <ActionButton
                variant="secondary"
                loading={check.status === "loading"}
                loadingLabel="Checking…"
                onClick={() => void check.run()}
              >
                Check on-chain
              </ActionButton>
            </>
          ) : null}
          <Button
            type="primary"
            ghost
            disabled={disabled}
            onClick={() => onRestore(entry)}
            aria-label={`Load ${entry.txType}${summary ? `: ${summary}` : ""} into the editor`}
          >
            Load
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined aria-hidden="true" />}
            onClick={() => onRemove(entry.id)}
            aria-label={`Remove ${entry.txType} from history`}
          />
        </Flex>
      </Flex>

      <span className="ui-sr-only" aria-live="polite">
        {copied ? "Hash copied" : ""}
      </span>

      {/* Always rendered so screen readers announce changes to it. */}
      <div role="status" aria-live="polite" style={{ marginTop: resultText ? token.marginXS : 0 }}>
        {resultText && (
          <Typography.Text type={resultText.startsWith("Found") ? "success" : "secondary"}>
            {resultText}
          </Typography.Text>
        )}
      </div>
      {check.status === "error" && (
        <div style={{ marginTop: token.marginXS }}>
          <Alert
            error={toUserError(check.error)}
            onRetry={() => void check.run()}
            onDismiss={check.reset}
          />
        </div>
      )}
    </li>
  );
}

export function HistoryPanel({
  entries,
  onRestore,
  onRemove,
  onClear,
  onCheckStatus,
  disabled,
  available = true,
}: HistoryPanelProps) {
  const [open, setOpen] = useState(readOpen);
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(() => Date.now());
  const bodyId = useId();

  // Keep "5 min ago" fresh while the list is visible.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeOpen(next);
  };

  const visible = entries.slice(0, shown);
  const hidden = entries.length - visible.length;

  return (
    <Card
      aria-label="Transaction history"
      title={
        <Button
          type="text"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          icon={open ? <DownOutlined aria-hidden="true" /> : <RightOutlined aria-hidden="true" />}
        >
          History ({entries.length})
        </Button>
      }
      extra={<Typography.Text type="secondary">Stored in this browser only</Typography.Text>}
    >
      <div id={bodyId} hidden={!open}>
        {!available ? (
          <Typography.Paragraph type="secondary" role="status" style={{ margin: 0 }}>
            History unavailable (browser storage blocked)
          </Typography.Paragraph>
        ) : entries.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nothing here yet. Transactions you sign will show up here, so you can copy the hash, open it on the explorer, or load it back into the editor."
          />
        ) : (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visible.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  disabled={disabled}
                  onRestore={onRestore}
                  onRemove={onRemove}
                  onCheckStatus={onCheckStatus}
                  now={now}
                />
              ))}
            </ul>

            <Flex justify="space-between" align="center" wrap gap="small" style={{ marginTop: 12 }}>
              {hidden > 0 ? (
                <Button onClick={() => setShown((n) => n + PAGE)}>Show more ({hidden})</Button>
              ) : (
                <span />
              )}
              <Popconfirm
                title={`Clear all ${entries.length}?`}
                okText="Yes, clear"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                onConfirm={onClear}
              >
                <Button type="text" danger>
                  Clear all
                </Button>
              </Popconfirm>
            </Flex>
          </>
        )}
      </div>
    </Card>
  );
}
