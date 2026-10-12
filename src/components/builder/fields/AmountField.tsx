import { Flex, Input, Segmented, Space, theme } from "antd";
import type { AmountValue } from "../../../lib/txSchemaTypes";
import { type FieldProps, FieldShell } from "./FieldShell";
import { DropsHint, sanitizeXrp } from "./XrpField";

function normalize(value: unknown): AmountValue {
  if (value && typeof value === "object" && "mode" in value) return value as AmountValue;
  return { mode: "xrp", value: "" };
}

export function AmountField({
  def,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: FieldProps<AmountValue>) {
  const { token } = theme.useToken();
  const amt = normalize(value);
  const set = (patch: Partial<AmountValue>) => onChange({ ...amt, ...patch });

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <Flex vertical gap={token.marginXS} role="group" aria-label={def.label}>
          {/* antd's Segmented is a native radio group: arrows move and select. */}
          <Segmented<AmountValue["mode"]>
            aria-label={`${def.label} type`}
            value={amt.mode}
            disabled={disabled}
            options={[
              { value: "xrp", label: "XRP" },
              { value: "issued", label: "Issued currency" },
            ]}
            onChange={(mode) => set({ mode })}
          />

          {amt.mode === "xrp" ? (
            <>
              <Space.Compact block>
                <Input
                  id={id}
                  inputMode="decimal"
                  aria-label={`${def.label} in XRP`}
                  value={amt.value}
                  placeholder="0.0"
                  disabled={disabled}
                  status={invalid ? "error" : undefined}
                  autoComplete="off"
                  aria-invalid={invalid || undefined}
                  aria-required={required || undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => set({ value: sanitizeXrp(e.target.value) })}
                  onBlur={onBlur}
                />
                <Space.Addon>XRP</Space.Addon>
              </Space.Compact>
              <DropsHint xrp={amt.value} />
            </>
          ) : (
            <Flex gap={token.marginXS} wrap>
              <Input
                id={id}
                aria-label={`${def.label} currency code`}
                placeholder="Currency (USD)"
                maxLength={40}
                value={amt.currency ?? ""}
                disabled={disabled}
                status={invalid ? "error" : undefined}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="characters"
                aria-invalid={invalid || undefined}
                aria-required={required || undefined}
                aria-describedby={describedBy}
                style={{ flex: "1 1 130px", fontFamily: token.fontFamilyCode }}
                onChange={(e) => set({ currency: e.target.value.trim() })}
                onBlur={onBlur}
              />
              <Input
                aria-label={`${def.label} issuer address`}
                placeholder="Issuer (r…)"
                value={amt.issuer ?? ""}
                disabled={disabled}
                status={invalid ? "error" : undefined}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                style={{ flex: "3 1 220px", fontFamily: token.fontFamilyCode }}
                onChange={(e) => set({ issuer: e.target.value.replace(/\s+/g, "") })}
                onBlur={onBlur}
              />
              <Input
                inputMode="decimal"
                aria-label={`${def.label} value`}
                placeholder="Value"
                value={amt.value}
                disabled={disabled}
                status={invalid ? "error" : undefined}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                style={{ flex: "1 1 130px" }}
                onChange={(e) => set({ value: e.target.value.replace(/[^0-9.eE+-]/g, "") })}
                onBlur={onBlur}
              />
            </Flex>
          )}
        </Flex>
      )}
    </FieldShell>
  );
}
