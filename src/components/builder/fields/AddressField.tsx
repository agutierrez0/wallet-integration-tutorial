import { CheckCircleFilled } from "@ant-design/icons";
import { Button, Input, Space, theme } from "antd";
import { isValidClassicAddress } from "xrpl";
import { type FieldProps, FieldShell } from "./FieldShell";

export function AddressField({
  def,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  account,
}: FieldProps<string>) {
  const { token } = theme.useToken();
  const v = typeof value === "string" ? value : "";
  const valid = v !== "" && isValidClassicAddress(v);
  const canUseMine = !!account && v !== account;

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <Space.Compact block>
          <Input
            id={id}
            value={v}
            placeholder={def.placeholder ?? "r…"}
            disabled={disabled}
            status={invalid ? "error" : undefined}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            style={{ fontFamily: token.fontFamilyCode }}
            // Always render a suffix: toggling it would swap the input's wrapper and drop focus.
            suffix={
              <span role="img" aria-label={valid && !invalid ? "Valid address" : undefined}>
                {valid && !invalid ? (
                  <CheckCircleFilled aria-hidden="true" style={{ color: token.colorSuccess }} />
                ) : null}
              </span>
            }
            onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
            onBlur={onBlur}
          />
          {canUseMine && (
            <Button disabled={disabled} onClick={() => account && onChange(account)}>
              Use my address
            </Button>
          )}
        </Space.Compact>
      )}
    </FieldShell>
  );
}
