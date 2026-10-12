import { Flex, Switch, Typography } from "antd";
import { type FieldProps, FieldShell } from "./FieldShell";

export function ToggleField({
  def,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: FieldProps<boolean>) {
  const on = value === true;
  return (
    <FieldShell def={def} error={error} inlineLabel>
      {({ id, describedBy, invalid }) => (
        <Flex align="center" gap={12} onBlur={onBlur}>
          <Switch
            id={id}
            checked={on}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(next) => onChange(next)}
          />
          <Typography.Text>
            <label htmlFor={id}>{def.label}</label>
          </Typography.Text>
        </Flex>
      )}
    </FieldShell>
  );
}
