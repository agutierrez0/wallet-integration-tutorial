import { FieldShell, type FieldProps } from "./FieldShell";

// Multi-line entries (offer IDs, signer lines). The schema decides what each line means.
export function ListField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  const lines = v.split(/\r?\n/).filter((l) => l.trim() !== "").length;

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <textarea
            id={id}
            className="txf-input txf-mono txf-textarea"
            rows={4}
            value={v}
            placeholder={def.placeholder}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
          {lines > 0 && (
            <p className="txf-hint">
              {lines} entr{lines === 1 ? "y" : "ies"}
            </p>
          )}
        </>
      )}
    </FieldShell>
  );
}
