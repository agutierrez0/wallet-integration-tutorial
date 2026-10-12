import { Form, Typography, theme } from "antd";
import { createContext, type ReactNode, useContext, useId } from "react";
import type { FieldDef, FieldValue } from "../../../lib/txSchemaTypes";

// TxForm provides the name of the single field whose error is announced assertively
// (role="alert"). Other errors stay visible and linked via aria-describedby, and TxForm
// announces their count politely in one place. Without a provider every error is an alert.
export const AlertFieldContext = createContext<string | null | undefined>(undefined);

export interface FieldProps<V extends FieldValue = FieldValue> {
  def: FieldDef;
  value: V | undefined;
  onChange: (v: V) => void;
  onBlur: () => void;
  // Already gated by touched / showAllErrors in TxForm.
  error?: string;
  disabled?: boolean;
  account?: string;
}

export interface ControlIds {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

interface ShellProps {
  def: FieldDef;
  error?: string;
  // Hide the Form.Item label (the control renders its own, e.g. a switch).
  inlineLabel?: boolean;
  children: (ids: ControlIds) => ReactNode;
}

// Shared label / required marker / help / error chrome so every kind behaves the same.
// Help and errors are rendered here (not through Form.Item's `help`) so the assertive
// role="alert" stays on a single error and aria-describedby is wired to real ids.
export function FieldShell({ def, error, inlineLabel, children }: ShellProps) {
  const uid = useId();
  const { token } = theme.useToken();
  const id = `${uid}-control`;
  const helpId = `${uid}-help`;
  const errId = `${uid}-err`;
  const alertField = useContext(AlertFieldContext);
  const errorRole = alertField === undefined || alertField === def.name ? "alert" : undefined;
  const required = !!def.required;
  const describedBy =
    [def.help ? helpId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;

  return (
    <Form.Item
      label={inlineLabel ? undefined : def.label}
      htmlFor={id}
      required={required}
      style={{ marginBottom: token.marginLG }}
    >
      <div data-field-invalid={error ? "true" : undefined}>
        {children({ id, describedBy, invalid: !!error, required })}
        {def.help && (
          <Typography.Text
            id={helpId}
            type="secondary"
            style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
          >
            {def.help}
          </Typography.Text>
        )}
        {error && (
          <Typography.Text
            id={errId}
            role={errorRole}
            type="danger"
            style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
          >
            {error}
          </Typography.Text>
        )}
      </div>
    </Form.Item>
  );
}

// Small secondary line under a control (live hints such as byte counts).
export function Hint({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Typography.Text
      type="secondary"
      aria-live="polite"
      style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
    >
      {children}
    </Typography.Text>
  );
}
