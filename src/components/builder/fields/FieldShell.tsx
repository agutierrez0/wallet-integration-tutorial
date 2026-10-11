import { createContext, useContext, useId, type ReactNode } from "react";
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
  // Render as a fieldset+legend instead of label+input (for multi-input fields).
  group?: boolean;
  className?: string;
  children: (ids: ControlIds) => ReactNode;
}

// Shared label / required marker / help / error chrome so every kind behaves the same.
export function FieldShell({ def, error, group, className, children }: ShellProps) {
  const uid = useId();
  const id = `${uid}-control`;
  const helpId = `${uid}-help`;
  const errId = `${uid}-err`;
  const alertField = useContext(AlertFieldContext);
  const errorRole = alertField === undefined || alertField === def.name ? "alert" : undefined;
  const required = !!def.required;
  const describedBy =
    [def.help ? helpId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;

  const labelContent = (
    <>
      {def.label}
      {required ? (
        <>
          <span className="txf-req" aria-hidden="true">
            *
          </span>
          <span className="txf-sr">(required)</span>
        </>
      ) : (
        <span className="txf-opt">optional</span>
      )}
    </>
  );

  const body = (
    <>
      {children({ id, describedBy, invalid: !!error, required })}
      {def.help && (
        <p id={helpId} className="txf-help">
          {def.help}
        </p>
      )}
      {error && (
        <p id={errId} className="txf-error" role={errorRole}>
          {error}
        </p>
      )}
    </>
  );

  const cls = `txf-field${className ? ` ${className}` : ""}${error ? " is-invalid" : ""}`;

  if (group) {
    return (
      <fieldset className={cls} aria-describedby={describedBy}>
        <legend className="txf-label">{labelContent}</legend>
        {body}
      </fieldset>
    );
  }
  return (
    <div className={cls}>
      <label className="txf-label" htmlFor={id}>
        {labelContent}
      </label>
      {body}
    </div>
  );
}
