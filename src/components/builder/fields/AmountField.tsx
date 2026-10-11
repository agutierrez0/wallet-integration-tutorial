import type { AmountValue } from "../../../lib/txSchemaTypes";
import { FieldShell, type FieldProps } from "./FieldShell";
import { DropsHint, sanitizeXrp } from "./XrpField";

function normalize(value: unknown): AmountValue {
  if (value && typeof value === "object" && "mode" in value) return value as AmountValue;
  return { mode: "xrp", value: "" };
}

export function AmountField({ def, value, onChange, onBlur, error, disabled }: FieldProps<AmountValue>) {
  const amt = normalize(value);
  const set = (patch: Partial<AmountValue>) => onChange({ ...amt, ...patch });

  return (
    <FieldShell def={def} error={error} group>
      {({ id, describedBy, invalid, required }) => (
        <div className="txf-amount">
          <div className="txf-seg" role="radiogroup" aria-label={`${def.label} type`}>
            {(["xrp", "issued"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={amt.mode === mode}
                className={`txf-seg-btn${amt.mode === mode ? " is-on" : ""}`}
                disabled={disabled}
                onClick={() => set({ mode })}
              >
                {mode === "xrp" ? "XRP" : "Issued currency"}
              </button>
            ))}
          </div>

          {amt.mode === "xrp" ? (
            <>
              <div className="txf-input-wrap">
                <input
                  id={id}
                  className="txf-input txf-num"
                  type="text"
                  inputMode="decimal"
                  aria-label={`${def.label} in XRP`}
                  value={amt.value}
                  placeholder="0.0"
                  disabled={disabled}
                  autoComplete="off"
                  aria-invalid={invalid || undefined}
                  aria-required={required || undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => set({ value: sanitizeXrp(e.target.value) })}
                  onBlur={onBlur}
                />
                <span className="txf-suffix" aria-hidden="true">
                  XRP
                </span>
              </div>
              <DropsHint xrp={amt.value} />
            </>
          ) : (
            <div className="txf-issued">
              <input
                id={id}
                className="txf-input"
                type="text"
                aria-label={`${def.label} currency code`}
                placeholder="Currency (USD)"
                maxLength={40}
                value={amt.currency ?? ""}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="characters"
                aria-invalid={invalid || undefined}
                aria-required={required || undefined}
                aria-describedby={describedBy}
                onChange={(e) => set({ currency: e.target.value.trim() })}
                onBlur={onBlur}
              />
              <input
                className="txf-input txf-mono"
                type="text"
                aria-label={`${def.label} issuer address`}
                placeholder="Issuer (r…)"
                value={amt.issuer ?? ""}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(e) => set({ issuer: e.target.value.replace(/\s+/g, "") })}
                onBlur={onBlur}
              />
              <input
                className="txf-input txf-num"
                type="text"
                inputMode="decimal"
                aria-label={`${def.label} value`}
                placeholder="Value"
                value={amt.value}
                disabled={disabled}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(e) => set({ value: e.target.value.replace(/[^0-9.eE+-]/g, "") })}
                onBlur={onBlur}
              />
            </div>
          )}
        </div>
      )}
    </FieldShell>
  );
}
