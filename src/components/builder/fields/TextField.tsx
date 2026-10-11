import { FieldShell, type FieldProps } from "./FieldShell";

type TextKind = "text" | "hex" | "integer" | "currency";

// One component for the plain single-line kinds; they differ only in input filtering.
export function TextField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const kind = def.kind as TextKind;
  const v = typeof value === "string" ? value : "";

  const transform = (raw: string): string => {
    switch (kind) {
      case "hex":
        return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
      case "integer":
        return raw.replace(/\D/g, "");
      case "currency":
        return raw.trim();
      default:
        return raw;
    }
  };

  const mono = kind === "hex" || kind === "currency";
  const hexBytes = kind === "hex" && v ? Math.ceil(v.length / 2) : 0;

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <input
            id={id}
            className={`txf-input${mono ? " txf-mono" : ""}${kind === "integer" ? " txf-num" : ""}`}
            type="text"
            inputMode={kind === "integer" ? "numeric" : undefined}
            value={v}
            placeholder={def.placeholder}
            maxLength={kind === "currency" ? 40 : undefined}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize={kind === "currency" ? "characters" : "none"}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(transform(e.target.value))}
            onBlur={onBlur}
          />
          {hexBytes > 0 && (
            <p className="txf-hint" aria-live="polite">
              {hexBytes} byte{hexBytes === 1 ? "" : "s"}
              {v.length % 2 === 1 ? " (odd number of digits)" : ""}
            </p>
          )}
        </>
      )}
    </FieldShell>
  );
}
