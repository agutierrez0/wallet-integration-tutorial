import { Input, InputNumber, theme } from "antd";
import { type FieldProps, FieldShell, Hint } from "./FieldShell";

type TextKind = "text" | "hex" | "integer" | "currency";

// One component for the plain single-line kinds; they differ only in input filtering.
export function TextField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const { token } = theme.useToken();
  const kind = def.kind as TextKind;
  const v = typeof value === "string" ? value : "";

  const transform = (raw: string): string => {
    switch (kind) {
      case "hex":
        return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
      case "currency":
        return raw.trim();
      default:
        return raw;
    }
  };

  const hexBytes = kind === "hex" && v ? Math.ceil(v.length / 2) : 0;

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) =>
        kind === "integer" ? (
          // Digits only, kept as a string so large values never lose precision.
          <InputNumber<string>
            id={id}
            stringMode
            controls={false}
            min="0"
            precision={0}
            value={v === "" ? null : v}
            placeholder={def.placeholder}
            disabled={disabled}
            status={invalid ? "error" : undefined}
            inputMode="numeric"
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            style={{ width: "100%" }}
            parser={(s) => (s ?? "").replace(/\D/g, "")}
            onChange={(n) => onChange(n === null || n === undefined ? "" : String(n))}
            onBlur={onBlur}
          />
        ) : (
          <>
            <Input
              id={id}
              value={v}
              placeholder={def.placeholder}
              maxLength={kind === "currency" ? 40 : undefined}
              disabled={disabled}
              status={invalid ? "error" : undefined}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize={kind === "currency" ? "characters" : "none"}
              aria-invalid={invalid || undefined}
              aria-required={required || undefined}
              aria-describedby={describedBy}
              style={
                kind === "hex" || kind === "currency"
                  ? { fontFamily: token.fontFamilyCode }
                  : undefined
              }
              onChange={(e) => onChange(transform(e.target.value))}
              onBlur={onBlur}
            />
            {hexBytes > 0 && (
              <Hint>
                {hexBytes} byte{hexBytes === 1 ? "" : "s"}
                {v.length % 2 === 1 ? " (odd number of digits)" : ""}
              </Hint>
            )}
          </>
        )
      }
    </FieldShell>
  );
}
