import { FieldShell, type FieldProps } from "./FieldShell";

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
    <FieldShell def={def} error={error} className="txf-field--toggle">
      {({ id, describedBy, invalid }) => (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`txf-switch${on ? " is-on" : ""}`}
          disabled={disabled}
          onClick={() => onChange(!on)}
          onBlur={onBlur}
        >
          <span className="txf-switch-knob" aria-hidden="true" />
          <span className="txf-sr">{on ? "On" : "Off"}</span>
        </button>
      )}
    </FieldShell>
  );
}
