import {
  AccountSetAsfFlags,
  convertHexToString,
  convertStringToHex,
  dropsToXrp,
  isValidClassicAddress,
  NFTokenMintFlags,
  OfferCreateFlags,
  TrustSetFlags,
  xrpToDrops,
} from "xrpl";
import type { TxJson } from "./tx";
import type {
  AmountValue,
  Category,
  FieldDef,
  FieldErrors,
  FieldValue,
  FormValues,
  TxSchema,
} from "./txSchemaTypes";

const MAX_UINT32 = 4294967295;
const MAX_XRP = 100_000_000_000;
const RIPPLE_EPOCH = 946684800; // seconds between 1970-01-01 and 2000-01-01
const FULLY_CANONICAL_SIG = 0x80000000;
const CURRENCY_RE = /^([A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/;

// Tx fields that appear after autofill/signing and never map to form fields.
const AUTOFILL_KEYS = [
  "Account",
  "TransactionType",
  "Flags",
  "Fee",
  "Sequence",
  "LastLedgerSequence",
  "SigningPubKey",
  "TxnSignature",
  "NetworkID",
];

export const CATEGORIES: Category[] = [
  { id: "payments", label: "Payments" },
  { id: "account", label: "Account" },
  { id: "trust-dex", label: "Trust lines & DEX" },
  { id: "nft", label: "NFTs" },
  { id: "escrow-checks", label: "Escrow & checks" },
];

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function isAmount(v: FieldValue): v is AmountValue {
  return typeof v === "object" && v !== null;
}

function str(v: FieldValue): string {
  return typeof v === "string" ? v.trim() : "";
}

/** True when a value should be omitted from the built tx. Unchecked toggles are empty. */
export function isEmptyValue(v: FieldValue): boolean {
  if (v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "boolean") return !v;
  return v.value.trim() === "";
}

/** A field with `showWhen` is only active while the controlling field has that value. */
export function isFieldActive(field: FieldDef, values: FormValues): boolean {
  if (!field.showWhen) return true;
  const v = values[field.showWhen.field];
  return v === field.showWhen.equals;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function hexToText(h: string): string | null {
  if (!/^([0-9a-fA-F]{2})*$/.test(h)) return null;
  try {
    const t = convertHexToString(h);
    return convertStringToHex(t) === h.toUpperCase() ? t : null;
  } catch {
    return null;
  }
}

// Accepts "2030-01-01", "2030-01-01T12:00", "2030-01-01T12:00:00Z". Strings with no
// timezone are read as UTC so the result never depends on the browser's locale.
function parseRippleTime(s: string): number | null {
  let t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(t)) t += "Z";
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  const sec = Math.floor(ms / 1000) - RIPPLE_EPOCH;
  return sec > 0 ? sec : null;
}

function rippleTimeToIso(sec: number): string {
  return new Date((sec + RIPPLE_EPOCH) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function xrpError(s: string): string | undefined {
  if (!/^\d+(\.\d+)?$/.test(s)) return "Enter a number like 1.5";
  if ((s.split(".")[1] ?? "").length > 6) return "XRP has at most 6 decimal places";
  const n = Number(s);
  if (n <= 0) return "Must be greater than 0";
  if (n > MAX_XRP) return "Exceeds the maximum XRP supply";
  return undefined;
}

function issuedValueError(s: string): string | undefined {
  if (!/^\d+(\.\d+)?$/.test(s)) return "Enter a number like 100 or 0.5";
  if (Number(s) <= 0) return "Must be greater than 0";
  if (s.replace(".", "").replace(/^0+/, "").length > 16) return "At most 16 significant digits";
  return undefined;
}

function currencyError(s: string): string | undefined {
  if (s.toUpperCase() === "XRP") return "XRP is not an issued currency";
  if (!CURRENCY_RE.test(s)) return "Use a 3-character code (e.g. USD) or 40 hex characters";
  return undefined;
}

const ADDRESS_ERROR = "Not a valid XRPL address (starts with r)";

// ---------------------------------------------------------------------------
// Per-field validation by kind
// ---------------------------------------------------------------------------

function validateField(f: FieldDef, v: FieldValue): string | undefined {
  switch (f.kind) {
    case "address":
      return isValidClassicAddress(str(v)) ? undefined : ADDRESS_ERROR;
    case "xrp":
      return xrpError(str(v));
    case "amount": {
      if (!isAmount(v)) return "Enter an amount";
      if (v.mode === "xrp") return xrpError(v.value.trim());
      const cur = (v.currency ?? "").trim();
      const issuer = (v.issuer ?? "").trim();
      if (!cur) return "Currency is required";
      const ce = currencyError(cur);
      if (ce) return ce;
      if (!issuer) return "Issuer is required";
      if (!isValidClassicAddress(issuer)) return `Issuer: ${ADDRESS_ERROR.toLowerCase()}`;
      return issuedValueError(v.value.trim());
    }
    case "hex": {
      const s = str(v);
      if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0) return "Enter an even number of hex characters (0-9, A-F)";
      if (f.min !== undefined && s.length < f.min) {
        return f.min === f.max ? `Must be exactly ${f.min} hex characters` : `At least ${f.min} hex characters`;
      }
      if (f.max !== undefined && s.length > f.max) return `At most ${f.max} hex characters`;
      return undefined;
    }
    case "integer": {
      const s = str(v);
      if (!/^\d+$/.test(s)) return "Enter a whole number";
      const n = Number(s);
      const min = f.min ?? 0;
      const max = f.max ?? MAX_UINT32;
      if (n < min || n > max) return `Must be between ${min} and ${max}`;
      return undefined;
    }
    case "select":
      return f.options?.some((o) => o.value === str(v)) ? undefined : "Choose one of the options";
    case "currency":
      return currencyError(str(v));
    case "text":
    case "toggle":
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Codecs: form value <-> tx field
// ---------------------------------------------------------------------------

interface Codec {
  tx: string;
  enc(v: FieldValue): unknown;
  // Returns null when the raw tx value can't be shown in the form.
  dec(raw: unknown): FieldValue | null;
  check?(v: FieldValue): string | undefined;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

const codec = {
  string: (tx: string): Codec => ({
    tx,
    enc: (v) => str(v),
    dec: (raw) => (typeof raw === "string" ? raw : null),
  }),
  hex: (tx: string): Codec => ({
    tx,
    enc: (v) => str(v).toUpperCase(),
    dec: (raw) => (typeof raw === "string" ? raw.toUpperCase() : null),
  }),
  int: (tx: string): Codec => ({
    tx,
    enc: (v) => Number(str(v)),
    dec: (raw) => (typeof raw === "number" && Number.isInteger(raw) ? String(raw) : null),
  }),
  xrp: (tx: string): Codec => ({
    tx,
    enc: (v) => xrpToDrops(str(v)),
    dec: (raw) => (typeof raw === "string" && /^\d+$/.test(raw) ? dropsToXrp(raw).toString() : null),
  }),
  amount: (tx: string): Codec => ({
    tx,
    enc: (v) => {
      if (!isAmount(v)) return undefined;
      if (v.mode === "xrp") return xrpToDrops(v.value.trim());
      return { currency: (v.currency ?? "").trim(), issuer: (v.issuer ?? "").trim(), value: v.value.trim() };
    },
    dec: (raw) => {
      if (typeof raw === "string" && /^\d+$/.test(raw)) return { mode: "xrp", value: dropsToXrp(raw).toString() };
      const r = asRecord(raw);
      if (r && typeof r.currency === "string" && typeof r.issuer === "string" && typeof r.value === "string") {
        return { mode: "issued", value: r.value, currency: r.currency, issuer: r.issuer };
      }
      return null; // e.g. MPT amounts
    },
  }),
  // Text shown in the form, stored on ledger as hex (Domain, URI).
  hexText: (tx: string, opts: { lower?: boolean; maxBytes: number; ascii?: boolean }): Codec => ({
    tx,
    enc: (v) => convertStringToHex(opts.lower ? str(v).toLowerCase() : str(v)),
    dec: (raw) => (typeof raw === "string" ? hexToText(raw) : null),
    check: (v) => {
      const s = str(v);
      if (opts.ascii && !/^[\x20-\x7e]*$/.test(s)) return "Use plain ASCII characters";
      if (byteLength(s) > opts.maxBytes) return `At most ${opts.maxBytes} bytes`;
      return undefined;
    },
  }),
  time: (tx: string): Codec => ({
    tx,
    enc: (v) => parseRippleTime(str(v)),
    dec: (raw) => (typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? rippleTimeToIso(raw) : null),
    check: (v) =>
      parseRippleTime(str(v)) === null ? "Enter a date like 2030-01-01T12:00:00Z (UTC)" : undefined,
  }),
  select: (tx: string): Codec => ({
    tx,
    enc: (v) => Number(str(v)),
    dec: (raw) => (typeof raw === "number" && Number.isInteger(raw) ? String(raw) : null),
  }),
};

const MEMO_TYPE_HEX = convertStringToHex("text/plain");

const memoCodec: Codec = {
  tx: "Memos",
  enc: (v) => [{ Memo: { MemoType: MEMO_TYPE_HEX, MemoData: convertStringToHex(str(v)) } }],
  dec: (raw) => {
    if (!Array.isArray(raw) || raw.length !== 1) return null;
    const memo = asRecord(asRecord(raw[0])?.Memo);
    if (!memo || typeof memo.MemoData !== "string") return null;
    if (Object.keys(memo).some((k) => k !== "MemoType" && k !== "MemoData")) return null;
    if (memo.MemoType !== undefined && (typeof memo.MemoType !== "string" || memo.MemoType.toUpperCase() !== MEMO_TYPE_HEX)) {
      return null;
    }
    return hexToText(memo.MemoData);
  },
  check: (v) => (byteLength(str(v)) > 900 ? "Memo is too long (max 900 bytes)" : undefined),
};

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

interface Spec {
  type: string;
  label: string;
  description: string;
  category: TxSchema["category"];
  icon: string;
  fields: FieldDef[];
  codecs: Record<string, Codec>;
  flags?: Record<string, number>; // toggle field name -> flag bit
  // Fields that don't map 1:1 (e.g. TrustSet's LimitAmount built from three inputs).
  extraKeys?: string[];
  buildExtra?(values: FormValues, tx: TxJson): void;
  parseExtra?(tx: TxJson, values: FormValues): boolean;
  validate?(values: FormValues): FieldErrors;
}

const COMMON_ADVANCED_FIELDS: FieldDef[] = [
  {
    name: "SourceTag",
    label: "Source tag",
    kind: "integer",
    advanced: true,
    placeholder: "e.g. 1234",
    help: "Optional number that identifies the sender or the reason for this transaction.",
  },
  {
    name: "Memo",
    label: "Memo",
    kind: "text",
    advanced: true,
    placeholder: "Short note stored on-ledger",
    help: "Public and permanent. Do not put anything sensitive here.",
  },
];

function makeSchema(spec: Spec): TxSchema {
  const fields = [...spec.fields, ...COMMON_ADVANCED_FIELDS];
  const codecs: Record<string, Codec> = {
    ...spec.codecs,
    SourceTag: codec.int("SourceTag"),
    Memo: memoCodec,
  };
  const flags = spec.flags ?? {};
  const knownKeys = new Set([
    ...AUTOFILL_KEYS,
    ...Object.values(codecs).map((c) => c.tx),
    ...(spec.extraKeys ?? []),
  ]);

  return {
    type: spec.type,
    label: spec.label,
    description: spec.description,
    category: spec.category,
    icon: spec.icon,
    fields,

    build(values, account) {
      const tx: TxJson = { TransactionType: spec.type };
      if (account) tx.Account = account;
      for (const f of fields) {
        const c = codecs[f.name];
        if (!c || !isFieldActive(f, values)) continue;
        const v = values[f.name];
        if (isEmptyValue(v)) continue;
        tx[c.tx] = c.enc(v);
      }
      spec.buildExtra?.(values, tx);
      let bits = 0;
      for (const [name, bit] of Object.entries(flags)) {
        if (values[name] === true) bits |= bit;
      }
      if (bits) tx.Flags = bits;
      return tx;
    },

    parse(tx) {
      if (tx.TransactionType !== spec.type) return null;
      for (const k of Object.keys(tx)) if (!knownKeys.has(k)) return null;
      const values: FormValues = {};
      for (const [name, c] of Object.entries(codecs)) {
        const raw = tx[c.tx];
        if (raw === undefined) continue;
        const decoded = c.dec(raw);
        if (decoded === null) return null;
        values[name] = decoded;
      }
      if (tx.Flags !== undefined && typeof tx.Flags !== "number") return null;
      let rest = ((tx.Flags as number | undefined) ?? 0) & ~FULLY_CANONICAL_SIG;
      for (const [name, bit] of Object.entries(flags)) {
        if (rest & bit) {
          values[name] = true;
          rest &= ~bit;
        }
      }
      if (rest !== 0) return null;
      if (spec.parseExtra && !spec.parseExtra(tx, values)) return null;
      return values;
    },

    validate(values) {
      const errors: FieldErrors = {};
      for (const f of fields) {
        const c = codecs[f.name];
        if (!c?.check || !isFieldActive(f, values)) continue;
        const v = values[f.name];
        if (isEmptyValue(v)) continue;
        const msg = c.check(v);
        if (msg) errors[f.name] = msg;
      }
      return { ...(spec.validate?.(values) ?? {}), ...errors };
    },
  };
}

// ---------------------------------------------------------------------------
// Field shorthands
// ---------------------------------------------------------------------------

const address = (name: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({
  name,
  label,
  kind: "address",
  placeholder: "r…",
  ...o,
});
const integer = (name: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({
  name,
  label,
  kind: "integer",
  ...o,
});
const hex = (name: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({
  name,
  label,
  kind: "hex",
  placeholder: "Hex string",
  ...o,
});
const toggle = (name: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({
  name,
  label,
  kind: "toggle",
  ...o,
});
const dateField = (name: string, label: string, help: string, o: Partial<FieldDef> = {}): FieldDef => ({
  name,
  label,
  kind: "text",
  placeholder: "2030-01-01T12:00:00Z",
  help,
  ...o,
});

const DESTINATION_TAG = integer("DestinationTag", "Destination tag", {
  advanced: true,
  placeholder: "e.g. 1234",
  help: "Required by some exchanges to credit the right customer.",
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ASF_OPTIONS = [
  { value: String(AccountSetAsfFlags.asfRequireDest), label: "Require destination tag", help: "Payments to this account must include a destination tag (asfRequireDest)." },
  { value: String(AccountSetAsfFlags.asfRequireAuth), label: "Require authorization", help: "Issuer must approve each trust line before it can hold tokens (asfRequireAuth)." },
  { value: String(AccountSetAsfFlags.asfDisallowXRP), label: "Disallow XRP", help: "Signals that this account should not receive XRP (asfDisallowXRP)." },
  { value: String(AccountSetAsfFlags.asfDisableMaster), label: "Disable master key", help: "Needs a regular key or signer list. Hard to undo (asfDisableMaster)." },
  { value: String(AccountSetAsfFlags.asfNoFreeze), label: "No freeze (permanent)", help: "Permanently gives up the ability to freeze trust lines. Cannot be undone (asfNoFreeze)." },
  { value: String(AccountSetAsfFlags.asfGlobalFreeze), label: "Global freeze", help: "Freezes all tokens this account has issued (asfGlobalFreeze)." },
  { value: String(AccountSetAsfFlags.asfDefaultRipple), label: "Default ripple", help: "Enable on token issuers so holders can trade tokens with each other (asfDefaultRipple)." },
  { value: String(AccountSetAsfFlags.asfDepositAuth), label: "Deposit authorization", help: "Blocks incoming payments except from preauthorized accounts (asfDepositAuth)." },
  { value: String(AccountSetAsfFlags.asfDisallowIncomingNFTokenOffer), label: "Block incoming NFT offers", help: "asfDisallowIncomingNFTokenOffer" },
  { value: String(AccountSetAsfFlags.asfDisallowIncomingCheck), label: "Block incoming checks", help: "asfDisallowIncomingCheck" },
  { value: String(AccountSetAsfFlags.asfDisallowIncomingPayChan), label: "Block incoming payment channels", help: "asfDisallowIncomingPayChan" },
  { value: String(AccountSetAsfFlags.asfDisallowIncomingTrustline), label: "Block incoming trust lines", help: "asfDisallowIncomingTrustline" },
];

const payment = makeSchema({
  type: "Payment",
  label: "Payment",
  description: "Send XRP or an issued token to another account.",
  category: "payments",
  icon: "↗",
  fields: [
    address("Destination", "Destination", { required: true, help: "The account that receives the payment." }),
    { name: "Amount", label: "Amount", kind: "amount", required: true, help: "What the destination receives. Issued tokens need a trust line." },
    DESTINATION_TAG,
    hex("InvoiceID", "Invoice ID", { advanced: true, min: 64, max: 64, help: "256-bit (64 hex characters) identifier for your records." }),
    { name: "SendMax", label: "Send max", kind: "amount", advanced: true, help: "Cap on what you spend; used for cross-currency payments." },
  ],
  codecs: {
    Destination: codec.string("Destination"),
    Amount: codec.amount("Amount"),
    DestinationTag: codec.int("DestinationTag"),
    InvoiceID: codec.hex("InvoiceID"),
    SendMax: codec.amount("SendMax"),
  },
});

const accountSet = makeSchema({
  type: "AccountSet",
  label: "Account settings",
  description: "Change account flags, domain, transfer fee and other settings.",
  category: "account",
  icon: "⚙",
  fields: [
    { name: "Domain", label: "Domain", kind: "text", placeholder: "example.com", help: "Lowercase domain that owns this account. Stored as hex." },
    { name: "SetFlag", label: "Turn on setting", kind: "select", options: ASF_OPTIONS, placeholder: "None" },
    { name: "ClearFlag", label: "Turn off setting", kind: "select", options: ASF_OPTIONS, placeholder: "None" },
    integer("TransferRate", "Transfer rate", {
      advanced: true,
      min: 0,
      max: 2000000000,
      placeholder: "1000000000",
      help: "Fee on tokens you issue, in billionths. 1000000000 = no fee, 1005000000 = 0.5%, 0 resets.",
    }),
    integer("TickSize", "Tick size", { advanced: true, min: 0, max: 15, help: "Significant digits for offer prices (3-15). 0 resets." }),
    hex("MessageKey", "Message key", { advanced: true, min: 66, max: 66, help: "33-byte public key for encrypted messages (66 hex characters)." }),
  ],
  codecs: {
    Domain: codec.hexText("Domain", { lower: true, maxBytes: 256, ascii: true }),
    SetFlag: codec.select("SetFlag"),
    ClearFlag: codec.select("ClearFlag"),
    TransferRate: codec.int("TransferRate"),
    TickSize: codec.int("TickSize"),
    MessageKey: codec.hex("MessageKey"),
  },
  validate(values) {
    const errors: FieldErrors = {};
    const set = str(values.SetFlag);
    if (set && set === str(values.ClearFlag)) errors.ClearFlag = "Cannot turn a setting on and off in the same transaction";
    const rate = str(values.TransferRate);
    if (/^\d+$/.test(rate)) {
      const n = Number(rate);
      if (n !== 0 && (n < 1000000000 || n > 2000000000)) {
        errors.TransferRate = "Use 0 to reset, or 1000000000 to 2000000000";
      }
    }
    const tick = str(values.TickSize);
    if (/^\d+$/.test(tick)) {
      const n = Number(tick);
      if (n !== 0 && n < 3) errors.TickSize = "Use 0 to reset, or 3 to 15";
    }
    return errors;
  },
});

const setRegularKey = makeSchema({
  type: "SetRegularKey",
  label: "Set regular key",
  description: "Assign or remove a backup signing key for this account.",
  category: "account",
  icon: "⚿",
  fields: [
    address("RegularKey", "Regular key address", { help: "Leave empty to remove the current regular key." }),
  ],
  codecs: { RegularKey: codec.string("RegularKey") },
});

const ticketCreate = makeSchema({
  type: "TicketCreate",
  label: "Create tickets",
  description: "Set aside sequence numbers so transactions can be sent out of order.",
  category: "account",
  icon: "▤",
  fields: [
    integer("TicketCount", "Number of tickets", { required: true, min: 1, max: 250, placeholder: "1", help: "1 to 250. Each ticket adds to the account reserve." }),
  ],
  codecs: { TicketCount: codec.int("TicketCount") },
});

const trustSet = makeSchema({
  type: "TrustSet",
  label: "Trust line",
  description: "Allow your account to hold a token from an issuer, up to a limit.",
  category: "trust-dex",
  icon: "⇄",
  fields: [
    { name: "currency", label: "Currency", kind: "currency", required: true, placeholder: "USD", help: "3-character code or 40 hex characters." },
    address("issuer", "Issuer", { required: true, help: "The account that issues this token." }),
    { name: "limit", label: "Limit", kind: "text", required: true, placeholder: "1000", help: "Most you are willing to hold. 0 removes the trust line." },
    toggle("NoRipple", "Disable rippling", { advanced: true, help: "Sets the NoRipple flag on this line." }),
    toggle("Freeze", "Freeze line", { advanced: true, help: "Issuer only. Freezes this trust line." }),
    toggle("SetAuth", "Authorize holder", { advanced: true, help: "Issuer only, with Require authorization on." }),
    integer("QualityIn", "Quality in", { advanced: true, help: "Rate for incoming balance, in billionths." }),
    integer("QualityOut", "Quality out", { advanced: true, help: "Rate for outgoing balance, in billionths." }),
  ],
  codecs: { QualityIn: codec.int("QualityIn"), QualityOut: codec.int("QualityOut") },
  flags: {
    NoRipple: TrustSetFlags.tfSetNoRipple,
    Freeze: TrustSetFlags.tfSetFreeze,
    SetAuth: TrustSetFlags.tfSetfAuth,
  },
  extraKeys: ["LimitAmount"],
  buildExtra(values, tx) {
    tx.LimitAmount = {
      currency: str(values.currency),
      issuer: str(values.issuer),
      value: str(values.limit),
    };
  },
  parseExtra(tx, values) {
    const la = asRecord(tx.LimitAmount);
    if (!la || typeof la.currency !== "string" || typeof la.issuer !== "string" || typeof la.value !== "string") {
      return false;
    }
    values.currency = la.currency;
    values.issuer = la.issuer;
    values.limit = la.value;
    return true;
  },
  validate(values) {
    const errors: FieldErrors = {};
    const limit = str(values.limit);
    if (limit && !/^\d+(\.\d+)?$/.test(limit)) errors.limit = "Enter a number like 1000 (0 removes the line)";
    else if (limit && limit.replace(".", "").replace(/^0+/, "").length > 16) errors.limit = "At most 16 significant digits";
    return errors;
  },
});

const offerCreate = makeSchema({
  type: "OfferCreate",
  label: "DEX offer",
  description: "Place an order on the decentralized exchange.",
  category: "trust-dex",
  icon: "⇅",
  fields: [
    { name: "TakerGets", label: "You sell", kind: "amount", required: true, help: "What you give up when the offer is taken." },
    { name: "TakerPays", label: "You receive", kind: "amount", required: true, help: "What you get when the offer is taken." },
    dateField("Expiration", "Expires", "UTC date/time after which the offer is void.", { advanced: true }),
    integer("OfferSequence", "Replace offer", { advanced: true, min: 1, help: "Sequence number of an earlier offer to cancel and replace." }),
    toggle("Passive", "Passive", { advanced: true, help: "Do not take offers that cross at the same rate." }),
    toggle("ImmediateOrCancel", "Immediate or cancel", { advanced: true, help: "Fill what you can now, cancel the rest." }),
    toggle("FillOrKill", "Fill or kill", { advanced: true, help: "Fill completely or not at all." }),
    toggle("Sell", "Sell", { advanced: true, help: "Sell the full amount even if it gets more than TakerPays." }),
  ],
  codecs: {
    TakerGets: codec.amount("TakerGets"),
    TakerPays: codec.amount("TakerPays"),
    Expiration: codec.time("Expiration"),
    OfferSequence: codec.int("OfferSequence"),
  },
  flags: {
    Passive: OfferCreateFlags.tfPassive,
    ImmediateOrCancel: OfferCreateFlags.tfImmediateOrCancel,
    FillOrKill: OfferCreateFlags.tfFillOrKill,
    Sell: OfferCreateFlags.tfSell,
  },
  validate(values) {
    const errors: FieldErrors = {};
    if (values.ImmediateOrCancel === true && values.FillOrKill === true) {
      errors.FillOrKill = "Choose either immediate or cancel, or fill or kill";
    }
    return errors;
  },
});

const offerCancel = makeSchema({
  type: "OfferCancel",
  label: "Cancel offer",
  description: "Remove one of your open DEX offers.",
  category: "trust-dex",
  icon: "✕",
  fields: [
    integer("OfferSequence", "Offer sequence", { required: true, min: 1, help: "The Sequence number of the transaction that created the offer." }),
  ],
  codecs: { OfferSequence: codec.int("OfferSequence") },
});

const nftMint = makeSchema({
  type: "NFTokenMint",
  label: "Mint NFT",
  description: "Create a new NFT with a taxon, metadata URI and options.",
  category: "nft",
  icon: "✦",
  fields: [
    integer("NFTokenTaxon", "Taxon", { required: true, placeholder: "0", help: "Number you choose to group related NFTs (any value, 0 is fine)." }),
    { name: "URI", label: "URI", kind: "text", placeholder: "ipfs://…", help: "Points to the NFT's metadata. Stored as hex, max 256 bytes." },
    integer("TransferFee", "Transfer fee", { min: 0, max: 50000, placeholder: "0", help: "Royalty in 1/100,000 units (5000 = 5%). Needs Transferable." }),
    toggle("Transferable", "Transferable", { help: "Allow the NFT to be traded between accounts." }),
    toggle("Burnable", "Burnable", { help: "Allow the issuer to burn the NFT." }),
    toggle("OnlyXRP", "Only XRP", { help: "Only allow XRP for sales of this NFT." }),
    address("Issuer", "Issuer", { advanced: true, help: "Mint on behalf of this account (requires it to authorize you)." }),
  ],
  codecs: {
    NFTokenTaxon: codec.int("NFTokenTaxon"),
    URI: codec.hexText("URI", { maxBytes: 256 }),
    TransferFee: codec.int("TransferFee"),
    Issuer: codec.string("Issuer"),
  },
  flags: {
    Burnable: NFTokenMintFlags.tfBurnable,
    OnlyXRP: NFTokenMintFlags.tfOnlyXRP,
    Transferable: NFTokenMintFlags.tfTransferable,
  },
  validate(values) {
    const errors: FieldErrors = {};
    const fee = str(values.TransferFee);
    if (/^\d+$/.test(fee) && Number(fee) > 0 && values.Transferable !== true) {
      errors.TransferFee = "A transfer fee needs the NFT to be Transferable";
    }
    return errors;
  },
});

const nftBurn = makeSchema({
  type: "NFTokenBurn",
  label: "Burn NFT",
  description: "Permanently destroy an NFT you hold or issued.",
  category: "nft",
  icon: "✺",
  fields: [
    hex("NFTokenID", "NFT ID", { required: true, min: 64, max: 64, help: "64 hex characters." }),
    address("Owner", "Owner", { advanced: true, help: "Current holder, if you are burning an NFT you issued but do not hold." }),
  ],
  codecs: { NFTokenID: codec.hex("NFTokenID"), Owner: codec.string("Owner") },
});

const escrowCreate = makeSchema({
  type: "EscrowCreate",
  label: "Create escrow",
  description: "Lock up XRP until a time passes or a condition is fulfilled.",
  category: "escrow-checks",
  icon: "◷",
  fields: [
    address("Destination", "Destination", { required: true, help: "Receives the XRP when the escrow is finished." }),
    { name: "Amount", label: "Amount", kind: "xrp", required: true, placeholder: "10", help: "XRP to lock up." },
    dateField("FinishAfter", "Release after", "UTC date/time after which the escrow can be finished."),
    dateField("CancelAfter", "Cancel after", "UTC date/time after which anyone can return the XRP to you."),
    hex("Condition", "Condition", { advanced: true, help: "Crypto-condition (PREIMAGE-SHA-256) that must be fulfilled to finish." }),
    DESTINATION_TAG,
  ],
  codecs: {
    Destination: codec.string("Destination"),
    Amount: codec.xrp("Amount"),
    FinishAfter: codec.time("FinishAfter"),
    CancelAfter: codec.time("CancelAfter"),
    Condition: codec.hex("Condition"),
    DestinationTag: codec.int("DestinationTag"),
  },
  validate(values) {
    const errors: FieldErrors = {};
    const finish = str(values.FinishAfter);
    const cancel = str(values.CancelAfter);
    const condition = str(values.Condition);
    if (!finish && !condition) {
      errors.FinishAfter = "Set a release time or a condition";
    } else if (!finish && condition && !cancel) {
      errors.CancelAfter = "A conditional escrow with no release time needs a cancel time";
    }
    const f = finish ? parseRippleTime(finish) : null;
    const c = cancel ? parseRippleTime(cancel) : null;
    if (f !== null && c !== null && c <= f) errors.CancelAfter = "Must be after the release time";
    return errors;
  },
});

const escrowFinish = makeSchema({
  type: "EscrowFinish",
  label: "Finish escrow",
  description: "Release an escrow once its time or condition is met.",
  category: "escrow-checks",
  icon: "✓",
  fields: [
    address("Owner", "Escrow owner", { required: true, help: "The account that created the escrow." }),
    integer("OfferSequence", "Escrow sequence", { required: true, min: 1, help: "Sequence number of the EscrowCreate transaction." }),
    hex("Condition", "Condition", { advanced: true, help: "Must match the escrow's condition. Use with the fulfillment." }),
    hex("Fulfillment", "Fulfillment", { advanced: true, help: "Proof that satisfies the condition." }),
  ],
  codecs: {
    Owner: codec.string("Owner"),
    OfferSequence: codec.int("OfferSequence"),
    Condition: codec.hex("Condition"),
    Fulfillment: codec.hex("Fulfillment"),
  },
  validate(values) {
    const errors: FieldErrors = {};
    const hasCondition = !!str(values.Condition);
    const hasFulfillment = !!str(values.Fulfillment);
    if (hasCondition && !hasFulfillment) errors.Fulfillment = "Provide the fulfillment for this condition";
    if (hasFulfillment && !hasCondition) errors.Condition = "Provide the condition for this fulfillment";
    return errors;
  },
});

const checkCreate = makeSchema({
  type: "CheckCreate",
  label: "Create check",
  description: "Write a check the destination can cash later, up to a maximum.",
  category: "escrow-checks",
  icon: "✎",
  fields: [
    address("Destination", "Destination", { required: true, help: "The account that can cash the check." }),
    { name: "SendMax", label: "Maximum amount", kind: "amount", required: true, help: "Most the destination can cash." },
    dateField("Expiration", "Expires", "UTC date/time after which the check can no longer be cashed.", { advanced: true }),
    hex("InvoiceID", "Invoice ID", { advanced: true, min: 64, max: 64, help: "256-bit (64 hex characters) identifier for your records." }),
    DESTINATION_TAG,
  ],
  codecs: {
    Destination: codec.string("Destination"),
    SendMax: codec.amount("SendMax"),
    Expiration: codec.time("Expiration"),
    InvoiceID: codec.hex("InvoiceID"),
    DestinationTag: codec.int("DestinationTag"),
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const SCHEMAS: TxSchema[] = [
  payment,
  accountSet,
  setRegularKey,
  ticketCreate,
  trustSet,
  offerCreate,
  offerCancel,
  nftMint,
  nftBurn,
  escrowCreate,
  escrowFinish,
  checkCreate,
];

export function getSchema(type: string): TxSchema | undefined {
  return SCHEMAS.find((s) => s.type === type);
}

export function defaultValues(schema: TxSchema): FormValues {
  const values: FormValues = {};
  for (const f of schema.fields) {
    if (f.default !== undefined) {
      values[f.name] = isAmount(f.default) ? { ...f.default } : f.default;
    } else if (f.kind === "toggle") {
      values[f.name] = false;
    } else if (f.kind === "amount") {
      values[f.name] = { mode: "xrp", value: "" };
    } else {
      values[f.name] = "";
    }
  }
  return values;
}

export function validateValues(schema: TxSchema, values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of schema.fields) {
    if (!isFieldActive(f, values)) continue;
    const v = values[f.name];
    if (isEmptyValue(v)) {
      if (f.required) errors[f.name] = `${f.label} is required`;
      else if (f.kind === "amount" && isAmount(v) && v.mode === "issued" && ((v.currency ?? "").trim() || (v.issuer ?? "").trim())) {
        errors[f.name] = "Enter an amount";
      }
      continue;
    }
    const msg = validateField(f, v);
    if (msg) errors[f.name] = msg;
  }
  const extra = schema.validate?.(values) ?? {};
  for (const [name, msg] of Object.entries(extra)) {
    if (!errors[name]) errors[name] = msg;
  }
  return errors;
}

export function buildTx(schema: TxSchema, values: FormValues, account: string): TxJson {
  return schema.build(values, account);
}

export function valuesFromTx(tx: TxJson): { schema: TxSchema; values: FormValues } | null {
  if (typeof tx.TransactionType !== "string") return null;
  const schema = getSchema(tx.TransactionType);
  if (!schema?.parse) return null;
  const parsed = schema.parse(tx);
  if (!parsed) return null;
  return { schema, values: { ...defaultValues(schema), ...parsed } };
}
