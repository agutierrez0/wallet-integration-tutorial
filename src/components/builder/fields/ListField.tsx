import { Input, theme } from "antd";
import { type FieldProps, FieldShell, Hint } from "./FieldShell";

// Multi-line entries (offer IDs, signer lines). The schema decides what each line means.
export function ListField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const { token } = theme.useToken();
  const v = typeof value === "string" ? value : "";
  const lines = v.split(/\r?\n/).filter((l) => l.trim() !== "").length;

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <Input.TextArea
            id={id}
            autoSize={{ minRows: 3, maxRows: 8 }}
            value={v}
            placeholder={def.placeholder}
            disabled={disabled}
            status={invalid ? "error" : undefined}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            style={{ fontFamily: token.fontFamilyCode }}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
          {lines > 0 && (
            <Hint>
              {lines} entr{lines === 1 ? "y" : "ies"}
            </Hint>
          )}
        </>
      )}
    </FieldShell>
  );
}
