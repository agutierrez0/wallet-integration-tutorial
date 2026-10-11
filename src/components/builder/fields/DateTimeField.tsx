import { FieldShell, type FieldProps } from "./FieldShell";

const QUICK_FILLS = [
  { label: "In 1 hour", ms: 60 * 60 * 1000 },
  { label: "In 1 day", ms: 24 * 60 * 60 * 1000 },
];

// "YYYY-MM-DDTHH:mm:ss" in UTC, the same shape <input type="datetime-local"> uses.
export function utcValueAfter(ms: number, now = Date.now()): string {
  return new Date(now + ms).toISOString().slice(0, 19);
}

function localEquivalent(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v.length === 16 ? `${v}:00` : v}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

// The browser's picker only has wall-clock values; this field always means UTC.
export function DateTimeField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  const local = localEquivalent(v);

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <div className="txf-input-wrap">
            <input
              id={id}
              className="txf-input txf-num"
              type="datetime-local"
              step={1}
              value={v}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              aria-required={required || undefined}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
            />
            <span className="txf-suffix" aria-hidden="true">
              UTC
            </span>
          </div>
          <div className="txf-quick">
            {QUICK_FILLS.map((q) => (
              <button
                key={q.label}
                type="button"
                className="txf-chip"
                disabled={disabled}
                onClick={() => onChange(utcValueAfter(q.ms))}
              >
                {q.label}
              </button>
            ))}
            {v && (
              <button type="button" className="txf-chip" disabled={disabled} onClick={() => onChange("")}>
                Clear
              </button>
            )}
          </div>
          <p className="txf-hint" aria-live="polite">
            {local ? `Time is UTC, not your local time. In your timezone: ${local}.` : "Time is UTC, not your local time."}
          </p>
        </>
      )}
    </FieldShell>
  );
}
