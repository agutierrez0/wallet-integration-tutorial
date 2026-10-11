import { TEMPLATES } from "../lib/tx";
import { ActionButton } from "./ui";

interface Props {
  value: string;
  signing: boolean;
  signLabel: string;
  signingLabel: string;
  // Why signing is unavailable right now (e.g. no wallet). Shown as a hint.
  disabledReason?: string;
  onChange: (v: string) => void;
  onSign: () => void;
  onCancel: () => void;
}

// Returns a message if the text can't be signed as-is, else null.
export function validateTxText(text: string): string | null {
  if (!text.trim()) return "Enter a transaction as JSON.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return `Invalid JSON: ${e instanceof Error ? e.message : "could not parse"}`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "The transaction must be a JSON object.";
  }
  if (typeof (parsed as Record<string, unknown>).TransactionType !== "string") {
    return 'Missing "TransactionType".';
  }
  return null;
}

export function TxEditor({
  value,
  signing,
  signLabel,
  signingLabel,
  disabledReason,
  onChange,
  onSign,
  onCancel,
}: Props) {
  const jsonError = validateTxText(value);

  return (
    <section className="card">
      <h2>3. Transaction</h2>
      <div className="row wrap">
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            type="button"
            className="small"
            disabled={signing}
            onClick={() => onChange(JSON.stringify(TEMPLATES[name], null, 2))}
          >
            {name}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Transaction JSON"
        aria-invalid={jsonError ? true : undefined}
        aria-describedby="tx-hint"
        spellCheck={false}
        rows={10}
        value={value}
        readOnly={signing}
        onChange={(e) => onChange(e.target.value)}
      />
      <div id="tx-hint" role="status" aria-live="polite">
        {jsonError ? (
          <p className="bad inline-msg">{jsonError}</p>
        ) : disabledReason ? (
          <p className="muted">{disabledReason}</p>
        ) : (
          <p className="muted">
            Account is filled in from the connected wallet. Sequence, Fee and
            LastLedgerSequence are autofilled from the selected network.
          </p>
        )}
      </div>
      <div className="row wrap">
        <ActionButton
          loading={signing}
          loadingLabel={signingLabel}
          disabled={!!jsonError || !!disabledReason}
          onClick={onSign}
        >
          {signLabel}
        </ActionButton>
        {signing && (
          <ActionButton variant="ghost" onClick={onCancel}>
            Cancel
          </ActionButton>
        )}
      </div>
      {signing && (
        <p className="muted">
          Cancel stops waiting and ignores the result. Close any wallet popup
          that is still open.
        </p>
      )}
    </section>
  );
}
