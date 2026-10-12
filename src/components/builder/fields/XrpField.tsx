import { Input, Space } from "antd";
import { type FieldProps, FieldShell, Hint } from "./FieldShell";

// Keep digits and a single dot, at most 6 decimals (1 drop = 0.000001 XRP).
export function sanitizeXrp(input: string): string {
  const cleaned = input.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const int = cleaned.slice(0, dot);
  const frac = cleaned
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 6);
  return `${int}.${frac}`;
}

// "1.5" -> 1500000n; null when there is nothing numeric to convert.
export function xrpToDrops(xrp: string): bigint | null {
  if (!xrp || xrp === ".") return null;
  const [int = "", frac = ""] = xrp.split(".");
  return BigInt(int || "0") * 1_000_000n + BigInt(frac.padEnd(6, "0").slice(0, 6));
}

export function DropsHint({ xrp }: { xrp: string }) {
  const drops = xrpToDrops(xrp);
  if (drops === null) return null;
  return (
    <Hint>
      = {drops.toLocaleString("en-US")} drop{drops === 1n ? "" : "s"}
    </Hint>
  );
}

export function XrpField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <Space.Compact block>
            <Input
              id={id}
              inputMode="decimal"
              value={v}
              placeholder={def.placeholder ?? "0.0"}
              disabled={disabled}
              status={invalid ? "error" : undefined}
              autoComplete="off"
              aria-invalid={invalid || undefined}
              aria-required={required || undefined}
              aria-describedby={describedBy}
              onChange={(e) => onChange(sanitizeXrp(e.target.value))}
              onBlur={onBlur}
            />
            <Space.Addon>XRP</Space.Addon>
          </Space.Compact>
          <DropsHint xrp={v} />
        </>
      )}
    </FieldShell>
  );
}
