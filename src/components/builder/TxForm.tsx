import { Badge, Collapse, Form } from "antd";
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
import { VisuallyHidden, visuallyHiddenStyle } from "./VisuallyHidden";

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
    <div key={`${schema.type}:${def.name}`}>
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
      {/* component={false}: no <form> element, so Enter in a field can never submit/reload. */}
      <Form component={false} layout="vertical" requiredMark="optional" disabled={disabled}>
        <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <legend style={visuallyHiddenStyle}>{schema.label} fields</legend>
          <VisuallyHidden role="status" aria-live="polite">
            {others > 0
              ? `${others} more field${others === 1 ? " needs" : "s need"} attention`
              : ""}
          </VisuallyHidden>
          {main.map(renderField)}

          {advanced.length > 0 && (
            <Collapse
              ghost
              size="small"
              activeKey={advancedOpen ? ["advanced"] : []}
              onChange={(keys) => setAdvancedOpen(keys.length > 0)}
              items={[
                {
                  key: "advanced",
                  label: (
                    <span>
                      Advanced options{" "}
                      {advancedFilled > 0 && (
                        <Badge count={advancedFilled} color="blue" size="small" />
                      )}
                      {advancedFilled > 0 && <VisuallyHidden> filled</VisuallyHidden>}
                    </span>
                  ),
                  children: advanced.map(renderField),
                },
              ]}
            />
          )}
        </fieldset>
      </Form>
    </AlertFieldContext.Provider>
  );
}
