import { FieldShell, type FieldProps } from "./FieldShell";

export function SelectField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  const options = def.options ?? [];
  const selected = options.find((o) => o.value === v);

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <select
            id={id}
            className="txf-input txf-select"
            value={v}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          >
            {v === "" && (
              <option value="" disabled={required}>
                {required ? "Select…" : "None"}
              </option>
            )}
            {!required && v !== "" && <option value="">None</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {selected?.help && (
            <p className="txf-hint" aria-live="polite">
              {selected.help}
            </p>
          )}
        </>
      )}
    </FieldShell>
  );
}
