import { useEffect, useState } from "react";
import { isFieldActive } from "../../lib/txSchemas";
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
import { DateTimeField } from "./fields/DateTimeField";
import { AlertFieldContext, type FieldProps } from "./fields/FieldShell";
import { ListField } from "./fields/ListField";
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
  // Change this to forget which fields were touched, e.g. when the same type is
  // restored from history (schema.type alone would not change).
  resetKey?: string | number;
}

// Same rule validation and build use, so what is shown is what is validated and built.
export function isFieldVisible(def: FieldDef, values: FormValues): boolean {
  return isFieldActive(def, values);
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
    case "datetime":
      return <DateTimeField {...(props as FieldProps<string>)} />;
    case "list":
      return <ListField {...(props as FieldProps<string>)} />;
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
  resetKey,
}: TxFormProps) {
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // A different transaction type (or an explicit reset) is a fresh form: forget what was touched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: schema.type and resetKey are reset triggers, not values read inside
  useEffect(() => {
    setTouched(new Set());
    setAdvancedOpen(false);
  }, [schema.type, resetKey]);

  const visible = schema.fields.filter((f) => isFieldVisible(f, values));
  const main = visible.filter((f) => !f.advanced);
  const advanced = visible.filter((f) => f.advanced);
  const advancedFilled = advanced.filter((f) => isFieldFilled(values[f.name])).length;

  const shownError = (name: string): string | undefined =>
    showAllErrors || touched.has(name) ? errors[name] : undefined;

  // One error is announced assertively (the first in reading order); the rest are counted
  // politely in a single live region so several errors don't all fire at once.
  const shownErrorNames = [...main, ...advanced]
    .filter((f) => !!shownError(f.name))
    .map((f) => f.name);
  const alertName = shownErrorNames[0] ?? null;
  const others = Math.max(shownErrorNames.length - 1, 0);

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
    <AlertFieldContext.Provider value={alertName}>
      <fieldset className="txf" disabled={disabled}>
        <legend className="txf-sr">{schema.label} fields</legend>
        <div className="txf-sr" role="status" aria-live="polite">
          {others > 0 ? `${others} more field${others === 1 ? " needs" : "s need"} attention` : ""}
        </div>
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
                <span className="txf-count">
                  {advancedFilled}
                  <span className="txf-sr"> filled</span>
                </span>
              )}
            </summary>
            <div className="txf-advanced-body">{advanced.map(renderField)}</div>
          </details>
        )}
      </fieldset>
    </AlertFieldContext.Provider>
  );
}
