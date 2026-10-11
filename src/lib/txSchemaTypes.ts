import type { TxJson } from "./tx";

// One schema per XRPL transaction type. The form UI is generated from `fields`;
// `build` turns form values into the tx JSON that gets autofilled and signed.

export type CategoryId = "payments" | "account" | "trust-dex" | "nft" | "escrow-checks";

export interface Category {
  id: CategoryId;
  label: string;
}

export type FieldKind =
  | "address" // classic r-address
  | "xrp" // human XRP amount (e.g. "1.5"); build() converts to drops
  | "amount" // XRP or issued currency (AmountValue)
  | "text" // free text
  | "hex" // raw hex string
  | "integer" // non-negative integer
  | "select"
  | "toggle"
  | "currency" // 3-char code or 40-hex code
  | "datetime" // UTC date+time, "YYYY-MM-DDTHH:mm:ss"; build() converts to Ripple epoch seconds
  | "list"; // one entry per line (or comma separated); schema decides what an entry means

export interface FieldOption {
  value: string;
  label: string;
  help?: string;
}

export interface AmountValue {
  mode: "xrp" | "issued";
  value: string; // XRP (not drops) when mode is "xrp"
  currency?: string; // issued only
  issuer?: string; // issued only
}

export type FieldValue = string | boolean | AmountValue | undefined;
export type FormValues = Record<string, FieldValue>;

export interface FieldDef {
  name: string; // key in FormValues
  label: string;
  kind: FieldKind;
  required?: boolean;
  advanced?: boolean; // collapsed under "Advanced"
  placeholder?: string;
  help?: string;
  options?: FieldOption[]; // for kind "select"
  default?: FieldValue;
  min?: number;
  max?: number;
  // kind "amount" only: allow an XRP amount of 0 (e.g. a free NFT sell offer).
  allowZero?: boolean;
  // Only show/require this field while another field has the given value.
  showWhen?: { field: string; equals: string | boolean };
}

export interface TxSchema {
  type: string; // TransactionType, e.g. "Payment"
  label: string;
  description: string; // one line, plain language
  category: CategoryId;
  icon: string; // a short glyph or 1-2 characters, no image assets
  fields: FieldDef[];
  // Pure. Omits empty optional fields. Converts XRP -> drops, text -> hex, toggles -> flags.
  build(values: FormValues, account: string): TxJson;
  // Reverse of build, for round-tripping edited raw JSON back into the form.
  // Return null if the tx can't be represented (UI then shows "custom JSON").
  parse?(tx: TxJson): FormValues | null;
  // Cross-field checks beyond required/kind validation. Returns { fieldName: message }.
  // `ctx` is optional: callers that don't know the signer simply skip the self-reference checks.
  validate?(values: FormValues, ctx?: ValidateContext): Record<string, string>;
}

export interface ValidateContext {
  // The signing account, when known (connected wallet).
  account?: string;
}

export type FieldErrors = Record<string, string>;

/*
 * Runtime API of src/lib/txSchemas.ts (implemented separately):
 *   SCHEMAS: TxSchema[]
 *   CATEGORIES: Category[]
 *   getSchema(type: string): TxSchema | undefined
 *   defaultValues(schema: TxSchema): FormValues
 *   validateValues(schema: TxSchema, values: FormValues, ctx?: ValidateContext): FieldErrors   // required + per-kind + schema.validate
 *   isFieldActive(def: FieldDef, values: FormValues): boolean   // the ONE showWhen implementation
 *   buildTx(schema: TxSchema, values: FormValues, account: string): TxJson
 *   valuesFromTx(tx: TxJson): { schema: TxSchema; values: FormValues; dropped: string[] } | null
 *     `dropped` lists tx keys the form ignores (Account, Fee, Sequence, LastLedgerSequence,
 *     SigningPubKey, TxnSignature, NetworkID) so the editor can warn before they are lost.
 */
