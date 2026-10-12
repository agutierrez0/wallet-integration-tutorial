import { Select } from "antd";
import { type FieldProps, FieldShell, Hint } from "./FieldShell";

export function SelectField({ def, value, onChange, onBlur, error, disabled }: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  const defOptions = def.options ?? [];
  const selected = defOptions.find((o) => o.value === v);
  const required = !!def.required;
  const emptyLabel = def.placeholder ?? "None";

  // Optional selects get an explicit empty choice so keyboard users can clear them.
  const options = [
    ...(required ? [] : [{ value: "", label: emptyLabel }]),
    ...defOptions.map((o) => ({ value: o.value, label: o.label })),
  ];

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid }) => (
        <>
          <Select
            id={id}
            style={{ width: "100%" }}
            value={v === "" && required ? undefined : v}
            placeholder="Select…"
            options={options}
            virtual={false}
            disabled={disabled}
            status={invalid ? "error" : undefined}
            aria-describedby={describedBy}
            onChange={(next) => onChange(String(next ?? ""))}
            onBlur={onBlur}
          />
          {selected?.help && <Hint>{selected.help}</Hint>}
        </>
      )}
    </FieldShell>
  );
}
