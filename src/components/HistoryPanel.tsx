import { useEffect, useId, useRef, useState } from "react";
import type { HistoryEntry } from "../lib/historyTypes";
import { toUserError } from "../lib/errors";
import { explorerUrl, formatRelativeTime, lookupTx, shortHash, summarizeTx } from "../lib/history";
import { NETWORKS } from "../lib/networks";
import { useAction } from "../hooks/useAction";
import { ActionButton, Alert, StatusPill } from "./ui";
import type { PillTone } from "./ui";
import "./history.css";

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
  | { source: "lookup"; found: boolean; engineResult?: string };

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
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const check = useAction(async (): Promise<CheckResult> => {
    if (onCheckStatus) {
      await onCheckStatus(entry);
      return { source: "parent" };
    }
    const r = await lookupTx(entry.network, entry.hash);
    return { source: "lookup", found: r.found, engineResult: r.engineResult };
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry.hash);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied("idle"), 1800);
  };

  const status = describeStatus(entry);
  const net = NETWORKS[entry.network];
  const summary = summarizeTx(entry.tx);
  const onChain = isOnChain(entry);
  const full = new Date(entry.createdAt).toLocaleString();
  void now; // re-renders the relative time when the panel ticks

  let resultText: string | null = null;
  if (check.status === "success" && check.data) {
    if (check.data.source === "parent") {
      const found = entry.validated || entry.status === "submitted" || !!entry.engineResult;
      resultText = found
        ? `Found: ${entry.engineResult ?? "validated"}`
        : `Not found on ${net.label}`;
    } else {
      resultText = check.data.found
        ? `Found: ${check.data.engineResult ?? "validated"}`
        : `Not found on ${net.label}`;
    }
  }

  return (
    <li className={`hp-row hp-net-${entry.network}`}>
      <button
        type="button"
        className="hp-main"
        onClick={() => onRestore(entry)}
        disabled={disabled}
        aria-label={`Load ${entry.txType}${summary ? `: ${summary}` : ""} into the editor`}
      >
        <span className="hp-top">
          <span className="hp-type">{entry.txType}</span>
          <span className={`hp-net-badge hp-net-badge-${entry.network}`}>{entry.network}</span>
        </span>
        {summary && <span className="hp-summary">{summary}</span>}
        <span className="hp-meta">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <time className="hp-time" dateTime={new Date(entry.createdAt).toISOString()} title={full}>
            {formatRelativeTime(entry.createdAt)}
          </time>
          <span className="hp-load" aria-hidden="true">
            Load ›
          </span>
        </span>
      </button>

      <div className="hp-side">
        <div className="hp-hash">
          <code title={entry.hash}>{shortHash(entry.hash)}</code>
          <button
            type="button"
            className="hp-icon-btn"
            onClick={copy}
            aria-label={`Copy transaction hash ${entry.hash}`}
          >
            {copied === "ok" ? "Copied ✓" : copied === "fail" ? "Copy failed" : "Copy"}
          </button>
        </div>

        {onChain ? (
          <a
            className="hp-link"
            href={explorerUrl(entry.network, entry.hash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on explorer ↗
          </a>
        ) : entry.status === "signed" ? (
          <div className="hp-unsub">
            <span className="hp-muted">Not submitted</span>
            <ActionButton
              variant="secondary"
              className="hp-check"
              loading={check.status === "loading"}
              loadingLabel="Checking…"
              onClick={() => void check.run()}
            >
              Check on-chain
            </ActionButton>
          </div>
        ) : null}

        <button
          type="button"
          className="hp-icon-btn hp-remove"
          onClick={() => onRemove(entry.id)}
          aria-label={`Remove ${entry.txType} from history`}
        >
          Remove
        </button>
      </div>

      <span className="hp-sr" aria-live="polite">
        {copied === "ok" ? "Hash copied" : copied === "fail" ? "Could not copy hash" : ""}
      </span>

      {resultText && (
        <p
          className={`hp-result ${resultText.startsWith("Found") ? "hp-result-ok" : ""}`}
          role="status"
        >
          {resultText}
        </p>
      )}
      {check.status === "error" && (
        <div className="hp-alert">
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
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const bodyId = useId();

  // Keep "5 min ago" fresh while the list is visible.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  // Leave the clear confirmation if the list changes underneath it.
  useEffect(() => {
    if (entries.length === 0) setConfirming(false);
  }, [entries.length]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeOpen(next);
  };

  const visible = entries.slice(0, shown);
  const hidden = entries.length - visible.length;

  return (
    <section className="card hp" aria-label="Transaction history">
      <div className="hp-head">
        <h2 className="hp-title">
          <button
            type="button"
            className="hp-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <span className={`hp-chevron${open ? " hp-chevron-open" : ""}`} aria-hidden="true">
              ›
            </span>
            History ({entries.length})
          </button>
        </h2>
        <span className="hp-note">Stored in this browser only</span>
      </div>

      <div id={bodyId} className="hp-body" hidden={!open}>
        {!available ? (
          <p className="hp-empty" role="status">
            History unavailable (browser storage blocked)
          </p>
        ) : entries.length === 0 ? (
          <p className="hp-empty">
            Nothing here yet. Transactions you sign will show up here, so you can copy the hash,
            open it on the explorer, or load it back into the editor.
          </p>
        ) : (
          <>
            <ul className="hp-list">
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

            <div className="hp-foot">
              {hidden > 0 && (
                <button type="button" className="hp-more" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({hidden})
                </button>
              )}
              {confirming ? (
                <span className="hp-confirm" role="group" aria-label="Confirm clear history">
                  <span>Clear all {entries.length}?</span>
                  <button
                    type="button"
                    className="hp-danger"
                    onClick={() => {
                      setConfirming(false);
                      onClear();
                    }}
                  >
                    Yes, clear
                  </button>
                  <button type="button" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="hp-clear" onClick={() => setConfirming(true)}>
                  Clear all
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
