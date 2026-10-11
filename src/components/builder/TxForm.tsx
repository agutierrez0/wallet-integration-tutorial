import { useEffect, useState } from "react";
import type {
  AmountValue,
  FieldDef,
  FieldErrors,
  FieldValue,
  FormValues,
  TxSchema,
} from "../../lib/txSchemaTypes";
import { AddressField } from "./fields/AddressField";
import { AmountField } from "./fields/AmountField";
import type { FieldProps } from "./fields/FieldShell";
import { SelectField } from "./fields/SelectField";
import { TextField } from "./fields/TextField";
import { ToggleField } from "./fields/ToggleField";
import { XrpField } from "./fields/XrpField";
import "./form.css";

export interface TxFormProps {
  schema: TxSchema;
  values: FormValues;
  onChange: (values: FormValues) => void;
  // Computed by the parent (validateValues). Only shown once a field is touched.
  errors: FieldErrors;
  account?: string;
  disabled?: boolean;
  // Show every error now, e.g. after the user pressed Sign with an invalid form.
  showAllErrors?: boolean;
}

export function isFieldVisible(def: FieldDef, values: FormValues): boolean {
  const cond = def.showWhen;
  if (!cond) return true;
  const actual = values[cond.field];
  return typeof cond.equals === "boolean" ? Boolean(actual) === cond.equals : actual === cond.equals;
}

export function isFieldFilled(value: FieldValue): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "boolean") return value;
  return (value as AmountValue).value.trim() !== "";
}

function renderControl(def: FieldDef, props: FieldProps) {
  switch (def.kind) {
    case "address":
      return <AddressField {...(props as FieldProps<string>)} />;
    case "xrp":
      return <XrpField {...(props as FieldProps<string>)} />;
    case "amount":
      return <AmountField {...(props as FieldProps<AmountValue>)} />;
    case "select":
      return <SelectField {...(props as FieldProps<string>)} />;
    case "toggle":
      return <ToggleField {...(props as FieldProps<boolean>)} />;
    default:
      // text | hex | integer | currency
      return <TextField {...(props as FieldProps<string>)} />;
  }
}

export function TxForm({
  schema,
  values,
  onChange,
  errors,
  account,
  disabled,
  showAllErrors,
}: TxFormProps) {
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // A different transaction type is a different form: forget what was touched.
  useEffect(() => {
    setTouched(new Set());
    setAdvancedOpen(false);
  }, [schema.type]);

  const visible = schema.fields.filter((f) => isFieldVisible(f, values));
  const main = visible.filter((f) => !f.advanced);
  const advanced = visible.filter((f) => f.advanced);
  const advancedFilled = advanced.filter((f) => isFieldFilled(values[f.name])).length;

  const shownError = (name: string): string | undefined =>
    showAllErrors || touched.has(name) ? errors[name] : undefined;

  const advancedHasError = advanced.some((f) => !!shownError(f.name));
  useEffect(() => {
    if (advancedHasError) setAdvancedOpen(true);
  }, [advancedHasError]);

  const touch = (name: string) =>
    setTouched((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));

  const renderField = (def: FieldDef) => (
    <div className="txf-item" key={`${schema.type}:${def.name}`}>
      {renderControl(def, {
        def,
        value: values[def.name],
        onChange: (v: FieldValue) => onChange({ ...values, [def.name]: v }),
        onBlur: () => touch(def.name),
        error: shownError(def.name),
        disabled,
        account,
      })}
    </div>
  );

  return (
    <fieldset className="txf" disabled={disabled}>
      <legend className="txf-sr">{schema.label} fields</legend>
      {main.map(renderField)}

      {advanced.length > 0 && (
        <details
          className="txf-advanced"
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>
            Advanced options
            {advancedFilled > 0 && (
              <span className="txf-count" aria-label={`${advancedFilled} filled`}>
                {advancedFilled}
              </span>
            )}
          </summary>
          <div className="txf-advanced-body">{advanced.map(renderField)}</div>
        </details>
      )}
    </fieldset>
  );
}
