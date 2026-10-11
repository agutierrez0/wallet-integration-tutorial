import { isValidClassicAddress } from "xrpl";
import { FieldShell, type FieldProps } from "./FieldShell";

export function AddressField({
  def,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  account,
}: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  const valid = v !== "" && isValidClassicAddress(v);
  const canUseMine = !!account && v !== account;

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <div className="txf-control-row">
          <div className="txf-input-wrap">
            <input
              id={id}
              className="txf-input txf-mono"
              type="text"
              value={v}
              placeholder={def.placeholder ?? "r…"}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={invalid || undefined}
              aria-required={required || undefined}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
              onBlur={onBlur}
            />
            {valid && !invalid && (
              <span className="txf-tick" role="img" aria-label="Valid address">
                ✓
              </span>
            )}
          </div>
          {canUseMine && (
            <button
              type="button"
              className="txf-btn"
              disabled={disabled}
              onClick={() => onChange(account!)}
            >
              Use my address
            </button>
          )}
        </div>
      )}
    </FieldShell>
  );
}
