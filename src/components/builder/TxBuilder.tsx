import { CATEGORIES, SCHEMAS, buildTx, isFieldActive } from "../../lib/txSchemas";
import type { FieldErrors, FormValues, TxSchema } from "../../lib/txSchemaTypes";
import { CopyBlock } from "../CopyBlock";
import { TxForm } from "./TxForm";
import { TypeSelector } from "./TypeSelector";

// Values of fields hidden by `showWhen` stay in form state but must never reach the tx.
export function activeValues(schema: TxSchema, values: FormValues): FormValues {
  const out: FormValues = {};
  for (const [name, v] of Object.entries(values)) {
    const def = schema.fields.find((f) => f.name === name);
    if (!def || isFieldActive(def, values)) out[name] = v;
  }
  return out;
}

export function buildText(schema: TxSchema, values: FormValues, account: string): string {
  return JSON.stringify(buildTx(schema, activeValues(schema, values), account), null, 2);
}

interface Props {
  schema?: TxSchema;
  values: FormValues;
  errors: FieldErrors;
  account: string;
  signing: boolean;
  showAllErrors: boolean;
  // Bump to forget which fields were touched (e.g. restoring the same type from history).
  resetKey?: string | number;
  preview: string;
  onSelectType: (type: string) => void;
  onChange: (values: FormValues) => void;
}

export function TxBuilder({
  schema,
  values,
  errors,
  account,
  signing,
  showAllErrors,
  resetKey,
  preview,
  onSelectType,
  onChange,
}: Props) {
  return (
    <div className="tx-builder">
      <TypeSelector
        schemas={SCHEMAS}
        categories={CATEGORIES}
        value={schema?.type}
        onSelect={onSelectType}
        disabled={signing}
      />
      {schema && (
        <>
          <TxForm
            schema={schema}
            values={values}
            onChange={onChange}
            errors={errors}
            account={account}
            disabled={signing}
            showAllErrors={showAllErrors}
            resetKey={resetKey}
          />
          <CopyBlock label="Transaction JSON (preview)" value={preview} />
          <p className="muted">
            Fee, Sequence and LastLedgerSequence are filled in automatically when you sign.
            {!account && " Account is added from your connected wallet."}
          </p>
        </>
      )}
    </div>
  );
}
