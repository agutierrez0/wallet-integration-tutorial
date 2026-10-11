import {
  AccountSetAsfFlags,
  convertHexToString,
  convertStringToHex,
  dropsToXrp,
  isValidClassicAddress,
  NFTokenCreateOfferFlags,
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
  FieldOption,
  FieldValue,
  FormValues,
  TxSchema,
  ValidateContext,
} from "./txSchemaTypes";

const MAX_UINT32 = 4294967295;
const MAX_XRP = 100_000_000_000;
const RIPPLE_EPOCH = 946684800; // seconds between 1970-01-01 and 2000-01-01
const FULLY_CANONICAL_SIG = 0x80000000;
const CURRENCY_RE = /^([A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/;

// Tx fields that appear after autofill/signing and never map to form fields.
// parse() accepts them so a signed/autofilled tx still opens in the form, but valuesFromTx
// reports the ones it ignores in `dropped` so the editor can warn.
export const DROPPED_KEYS = [
  "Account",
  "Fee",
  "Sequence",
  "LastLedgerSequence",
  "SigningPubKey",
  "TxnSignature",
  "NetworkID",
];
const AUTOFILL_KEYS = ["TransactionType", "Flags", ...DROPPED_KEYS];

const MAX_CANCEL_OFFERS = 500;
const MAX_SIGNERS = 32;

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

/**
 * A field with `showWhen` is only active while the controlling field has that value.
 * The one implementation used by the form, validation and build. For a boolean `equals`,
 * a missing value counts as false, so `equals: false` is active until the toggle is ticked.
 */
export function isFieldActive(field: FieldDef, values: FormValues): boolean {
  if (!field.showWhen) return true;
  const v = values[field.showWhen.field];
  const want = field.showWhen.equals;
  return typeof want === "boolean" ? Boolean(v) === want : v === want;
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

// Strict ISO only: "2030-01-01", "2030-01-01T12:00[:00]" with an optional trailing Z. Always UTC,
// so the result never depends on the browser's locale or timezone. Anything else (including
// "March 3 2030") is rejected rather than guessed at, as are overflowing days (02-31) and
// values outside the ledger's uint32 range of seconds since 2000-01-01.
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?Z?$/;

function parseRippleTime(s: string): number | null {
  const m = DATETIME_RE.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(
    Number,
  );
  const ms = Date.UTC(y, mo - 1, d, h, mi, sec);
  const dt = new Date(ms);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d ||
    dt.getUTCHours() !== h ||
    dt.getUTCMinutes() !== mi ||
    dt.getUTCSeconds() !== sec
  ) {
    return null;
  }
  const rippleSec = Math.floor(ms / 1000) - RIPPLE_EPOCH;
  return rippleSec >= 1 && rippleSec <= MAX_UINT32 ? rippleSec : null;
}

// "YYYY-MM-DDTHH:mm:ss" (UTC), the value format of the datetime field.
function rippleTimeToValue(sec: number): string {
  return new Date((sec + RIPPLE_EPOCH) * 1000).toISOString().slice(0, 19);
}

const DATETIME_ERROR = "Enter a valid UTC date and time (2000-01-01 to 2136-02-07)";

// Ledger values can come back in exponent notation ("1e3", "1.5e-5"). Expands to a plain
// decimal string; returns null if the exponent is unreasonably large. Plain input is unchanged.
function expandExponent(s: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(s);
  if (!m) return s;
  const int = m[1];
  const digits = int + (m[2] ?? "");
  const exp = Number(m[3]);
  if (Math.abs(exp) > 96) return null;
  const point = int.length + exp;
  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + "0".repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  out = out.replace(/^0+(?=\d)/, "");
  if (out.includes(".")) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return out;
}

function xrpError(s: string, allowZero = false): string | undefined {
  if (!/^\d+(\.\d+)?$/.test(s)) return "Enter a number like 1.5";
  if ((s.split(".")[1] ?? "").length > 6) return "XRP has at most 6 decimal places";
  const n = Number(s);
  if (n < 0 || (n === 0 && !allowZero)) return "Must be greater than 0";
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
  if (/^0{40}$/.test(s)) return "A currency code can't be all zeros";
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
      if (v.mode === "xrp") return xrpError(v.value.trim(), f.allowZero);
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
      if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0)
        return "Enter an even number of hex characters (0-9, A-F)";
      if (f.min !== undefined && s.length < f.min) {
        return f.min === f.max
          ? `Must be exactly ${f.min} hex characters`
          : `At least ${f.min} hex characters`;
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
    case "datetime":
      return parseRippleTime(str(v)) === null ? DATETIME_ERROR : undefined;
    case "text":
    case "toggle":
    case "list": // entries are checked by the schema (see codec.check / validate)
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
  return typeof x === "object" && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
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
    dec: (raw) =>
      typeof raw === "string" && /^\d+$/.test(raw) ? dropsToXrp(raw).toString() : null,
  }),
  amount: (tx: string): Codec => ({
    tx,
    enc: (v) => {
      if (!isAmount(v)) return undefined;
      if (v.mode === "xrp") return xrpToDrops(v.value.trim());
      return {
        currency: (v.currency ?? "").trim(),
        issuer: (v.issuer ?? "").trim(),
        value: v.value.trim(),
      };
    },
    dec: (raw) => {
      if (typeof raw === "string" && /^\d+$/.test(raw))
        return { mode: "xrp", value: dropsToXrp(raw).toString() };
      const r = asRecord(raw);
      if (
        r &&
        typeof r.currency === "string" &&
        typeof r.issuer === "string" &&
        typeof r.value === "string"
      ) {
        const value = expandExponent(r.value);
        return value === null
          ? null
          : { mode: "issued", value, currency: r.currency, issuer: r.issuer };
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
    dec: (raw) =>
      typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= MAX_UINT32
        ? rippleTimeToValue(raw)
        : null,
  }),
  // Numeric flag choice. Values outside `options` return null so the tx opens as raw JSON
  // instead of loading an option the form can't display.
  select: (tx: string, options: FieldOption[]): Codec => ({
    tx,
    enc: (v) => Number(str(v)),
    dec: (raw) =>
      typeof raw === "number" &&
      Number.isInteger(raw) &&
      options.some((o) => o.value === String(raw))
        ? String(raw)
        : null,
  }),
};

// ---- list kinds (one entry per line, commas also accepted) ----

function splitList(v: FieldValue): string[] {
  return str(v)
    .split(/[\s,]+/)
    .filter(Boolean);
}

const HASH_RE = /^[0-9A-Fa-f]{64}$/;

// NFTokenCancelOffer: array of 64-hex offer IDs.
const offerIdsCodec: Codec = {
  tx: "NFTokenOffers",
  enc: (v) => splitList(v).map((x) => x.toUpperCase()),
  dec: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === "string")
      ? (raw as string[]).map((x) => x.toUpperCase()).join("\n")
      : null,
  check: (v) => {
    const ids = splitList(v);
    if (ids.length === 0) return "Enter at least one offer ID";
    if (ids.length > MAX_CANCEL_OFFERS)
      return `At most ${MAX_CANCEL_OFFERS} offers per transaction`;
    const bad = ids.find((x) => !HASH_RE.test(x));
    if (bad) return `"${bad.slice(0, 12)}…" is not a 64-character hex offer ID`;
    if (new Set(ids.map((x) => x.toUpperCase())).size !== ids.length)
      return "Each offer ID may appear only once";
    return undefined;
  },
};

// SignerListSet: one "rAddress:weight" per line.
interface SignerLine {
  account: string;
  weight: string;
}

function parseSignerLines(v: FieldValue): SignerLine[] {
  return str(v)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [account = "", weight = ""] = l.split(/[\s:,]+/);
      return { account, weight };
    });
}

const signerEntriesCodec: Codec = {
  tx: "SignerEntries",
  enc: (v) =>
    parseSignerLines(v).map((e) => ({
      SignerEntry: { Account: e.account, SignerWeight: Number(e.weight) },
    })),
  dec: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const lines: string[] = [];
    for (const item of raw) {
      const entry = asRecord(asRecord(item)?.SignerEntry);
      if (!entry || Object.keys(asRecord(item) ?? {}).length !== 1) return null;
      if (Object.keys(entry).some((k) => k !== "Account" && k !== "SignerWeight")) return null;
      if (typeof entry.Account !== "string" || typeof entry.SignerWeight !== "number") return null;
      if (!Number.isInteger(entry.SignerWeight)) return null;
      lines.push(`${entry.Account}:${entry.SignerWeight}`);
    }
    return lines.join("\n");
  },
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
    if (
      memo.MemoType !== undefined &&
      (typeof memo.MemoType !== "string" || memo.MemoType.toUpperCase() !== MEMO_TYPE_HEX)
    ) {
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
  // Select fields with values "set" | "clear" (or empty = leave alone) -> flag bits.
  flagSelects?: Record<string, { set: number; clear?: number }>;
  // Address fields that may not equal the signing account (checked when the account is known).
  noSelf?: string[];
  // Fields that don't map 1:1 (e.g. TrustSet's LimitAmount built from three inputs).
  extraKeys?: string[];
  buildExtra?(values: FormValues, tx: TxJson): void;
  parseExtra?(tx: TxJson, values: FormValues): boolean;
  validate?(values: FormValues, ctx?: ValidateContext): FieldErrors;
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
  const flagSelects = spec.flagSelects ?? {};
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
      let bits = typeof tx.Flags === "number" ? tx.Flags : 0;
      for (const [name, bit] of Object.entries(flags)) {
        if (values[name] === true) bits |= bit;
      }
      for (const [name, f] of Object.entries(flagSelects)) {
        const choice = str(values[name]);
        if (choice === "set") bits |= f.set;
        else if (choice === "clear" && f.clear) bits |= f.clear;
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
      for (const [name, f] of Object.entries(flagSelects)) {
        const isSet = (rest & f.set) !== 0;
        const isClear = f.clear !== undefined && (rest & f.clear) !== 0;
        if (isSet && isClear) return null; // contradictory, leave as raw JSON
        if (isSet) {
          values[name] = "set";
          rest &= ~f.set;
        } else if (isClear) {
          values[name] = "clear";
          rest &= ~(f.clear as number);
        }
      }
      if (rest !== 0) return null;
      if (spec.parseExtra && !spec.parseExtra(tx, values)) return null;
      return values;
    },

    validate(values, ctx) {
      const errors: FieldErrors = {};
      for (const f of fields) {
        const c = codecs[f.name];
        if (!c?.check || !isFieldActive(f, values)) continue;
        const v = values[f.name];
        if (isEmptyValue(v)) continue;
        const msg = c.check(v);
        if (msg) errors[f.name] = msg;
      }
      const self: FieldErrors = {};
      if (ctx?.account) {
        for (const name of spec.noSelf ?? []) {
          const def = fields.find((f) => f.name === name);
          if (def && isFieldActive(def, values) && str(values[name]) === ctx.account) {
            self[name] = "This can't be your own account";
          }
        }
      }
      return { ...(spec.validate?.(values, ctx) ?? {}), ...self, ...errors };
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
const dateField = (
  name: string,
  label: string,
  help: string,
  o: Partial<FieldDef> = {},
): FieldDef => ({
  name,
  label,
  kind: "datetime",
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

const asf = (flag: number, label: string, help: string): FieldOption => ({
  value: String(flag),
  label,
  help,
});

const ASF_OPTIONS: FieldOption[] = [
  asf(
    AccountSetAsfFlags.asfRequireDest,
    "Require destination tag",
    "Payments to this account must include a destination tag (asfRequireDest).",
  ),
  asf(
    AccountSetAsfFlags.asfRequireAuth,
    "Require authorization",
    "Issuer must approve each trust line before it can hold tokens (asfRequireAuth).",
  ),
  asf(
    AccountSetAsfFlags.asfDisallowXRP,
    "Disallow XRP",
    "Signals that this account should not receive XRP (asfDisallowXRP).",
  ),
  asf(
    AccountSetAsfFlags.asfDisableMaster,
    "Disable master key",
    "Needs a regular key or signer list. Hard to undo (asfDisableMaster).",
  ),
  asf(
    AccountSetAsfFlags.asfAccountTxnID,
    "Track account transaction ID",
    "Required before later transactions can use the AccountTxnID field (asfAccountTxnID).",
  ),
  asf(
    AccountSetAsfFlags.asfNoFreeze,
    "No freeze (permanent)",
    "Permanently gives up the ability to freeze trust lines. Cannot be undone (asfNoFreeze).",
  ),
  asf(
    AccountSetAsfFlags.asfGlobalFreeze,
    "Global freeze",
    "Freezes all tokens this account has issued (asfGlobalFreeze).",
  ),
  asf(
    AccountSetAsfFlags.asfDefaultRipple,
    "Default ripple",
    "Enable on token issuers so holders can trade tokens with each other (asfDefaultRipple).",
  ),
  asf(
    AccountSetAsfFlags.asfDepositAuth,
    "Deposit authorization",
    "Blocks incoming payments except from preauthorized accounts (asfDepositAuth).",
  ),
  asf(
    AccountSetAsfFlags.asfAuthorizedNFTokenMinter,
    "Authorize an NFT minter",
    "Lets another account mint NFTs on your behalf; enter it below. To remove it, choose this under 'Turn off setting' (asfAuthorizedNFTokenMinter).",
  ),
  asf(
    AccountSetAsfFlags.asfDisallowIncomingNFTokenOffer,
    "Block incoming NFT offers",
    "asfDisallowIncomingNFTokenOffer",
  ),
  asf(
    AccountSetAsfFlags.asfDisallowIncomingCheck,
    "Block incoming checks",
    "asfDisallowIncomingCheck",
  ),
  asf(
    AccountSetAsfFlags.asfDisallowIncomingPayChan,
    "Block incoming payment channels",
    "asfDisallowIncomingPayChan",
  ),
  asf(
    AccountSetAsfFlags.asfDisallowIncomingTrustline,
    "Block incoming trust lines",
    "asfDisallowIncomingTrustline",
  ),
  asf(
    AccountSetAsfFlags.asfAllowTrustLineClawback,
    "Allow token clawback (permanent)",
    "Lets you claw back tokens you issue. Only works on an account with no trust lines, offers, escrows, checks or signer lists, and can never be turned off (asfAllowTrustLineClawback).",
  ),
];

// Clawback, once enabled, can't be cleared.
const ASF_CLEAR_OPTIONS = ASF_OPTIONS.filter(
  (o) => o.value !== String(AccountSetAsfFlags.asfAllowTrustLineClawback),
);

const payment = makeSchema({
  type: "Payment",
  label: "Payment",
  description: "Send XRP or an issued token to another account.",
  category: "payments",
  icon: "↗",
  fields: [
    address("Destination", "Destination", {
      required: true,
      help: "The account that receives the payment.",
    }),
    {
      name: "Amount",
      label: "Amount",
      kind: "amount",
      required: true,
      help: "What the destination receives. Issued tokens need a trust line.",
    },
    DESTINATION_TAG,
    hex("InvoiceID", "Invoice ID", {
      advanced: true,
      min: 64,
      max: 64,
      help: "256-bit (64 hex characters) identifier for your records.",
    }),
    {
      name: "SendMax",
      label: "Send max",
      kind: "amount",
      advanced: true,
      help: "Cap on what you spend; used for cross-currency payments.",
    },
  ],
  codecs: {
    Destination: codec.string("Destination"),
    Amount: codec.amount("Amount"),
    DestinationTag: codec.int("DestinationTag"),
    InvoiceID: codec.hex("InvoiceID"),
    SendMax: codec.amount("SendMax"),
  },
  validate(values, ctx) {
    const errors: FieldErrors = {};
    const amount = values.Amount;
    const sendMax = values.SendMax;
    // XRP delivered with an XRP SendMax is rejected by the ledger (temBAD_SEND_XRP_MAX).
    if (
      isAmount(amount) &&
      isAmount(sendMax) &&
      amount.mode === "xrp" &&
      sendMax.mode === "xrp" &&
      !isEmptyValue(amount) &&
      !isEmptyValue(sendMax)
    ) {
      errors.SendMax =
        "Send max can't be XRP when you are sending XRP. Leave it empty, or use an issued currency";
    }
    // Paying yourself only makes sense as a cross-currency conversion (needs a Send max).
    if (ctx?.account && str(values.Destination) === ctx.account && isEmptyValue(sendMax)) {
      errors.Destination =
        "You can't send a payment to yourself unless you also set a Send max (currency conversion)";
    }
    return errors;
  },
});

const accountSet = makeSchema({
  type: "AccountSet",
  label: "Account settings",
  description: "Change account flags, domain, transfer fee and other settings.",
  category: "account",
  icon: "⚙",
  fields: [
    {
      name: "Domain",
      label: "Domain",
      kind: "text",
      placeholder: "example.com",
      help: "Lowercase domain that owns this account. Stored as hex.",
      showWhen: { field: "ClearDomain", equals: false },
    },
    toggle("ClearDomain", "Remove domain", {
      help: "Clears the domain currently set on this account (sends an empty Domain).",
    }),
    {
      name: "SetFlag",
      label: "Turn on setting",
      kind: "select",
      options: ASF_OPTIONS,
      placeholder: "None",
    },
    address("NFTokenMinter", "NFT minter", {
      required: true,
      showWhen: { field: "SetFlag", equals: String(AccountSetAsfFlags.asfAuthorizedNFTokenMinter) },
      help: "The account that is allowed to mint NFTs on your behalf.",
    }),
    {
      name: "ClearFlag",
      label: "Turn off setting",
      kind: "select",
      options: ASF_CLEAR_OPTIONS,
      placeholder: "None",
    },
    integer("TransferRate", "Transfer rate", {
      advanced: true,
      min: 0,
      max: 2000000000,
      placeholder: "1000000000",
      help: "Fee on tokens you issue, in billionths. 1000000000 = no fee, 1005000000 = 0.5%, 0 resets.",
    }),
    integer("TickSize", "Tick size", {
      advanced: true,
      min: 0,
      max: 15,
      help: "Significant digits for offer prices (3-15). 0 resets.",
    }),
    hex("MessageKey", "Message key", {
      advanced: true,
      min: 66,
      max: 66,
      help: "33-byte public key for encrypted messages (66 hex characters).",
    }),
  ],
  codecs: {
    Domain: codec.hexText("Domain", { lower: true, maxBytes: 256, ascii: true }),
    SetFlag: codec.select("SetFlag", ASF_OPTIONS),
    ClearFlag: codec.select("ClearFlag", ASF_CLEAR_OPTIONS),
    NFTokenMinter: codec.string("NFTokenMinter"),
    TransferRate: codec.int("TransferRate"),
    TickSize: codec.int("TickSize"),
    MessageKey: codec.hex("MessageKey"),
  },
  buildExtra(values, tx) {
    // An empty Domain is how the ledger removes it.
    if (values.ClearDomain === true) tx.Domain = "";
  },
  parseExtra(tx, values) {
    if (tx.Domain === "") values.ClearDomain = true;
    // The minter only makes sense together with asfAuthorizedNFTokenMinter; otherwise keep it as raw JSON.
    if (
      values.NFTokenMinter &&
      values.SetFlag !== String(AccountSetAsfFlags.asfAuthorizedNFTokenMinter)
    )
      return false;
    return true;
  },
  validate(values) {
    const errors: FieldErrors = {};
    const set = str(values.SetFlag);
    if (set && set === str(values.ClearFlag))
      errors.ClearFlag = "Cannot turn a setting on and off in the same transaction";
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
    address("RegularKey", "Regular key address", {
      help: "Leave empty to remove the current regular key.",
    }),
  ],
  codecs: { RegularKey: codec.string("RegularKey") },
  noSelf: ["RegularKey"],
});

const ticketCreate = makeSchema({
  type: "TicketCreate",
  label: "Create tickets",
  description: "Set aside sequence numbers so transactions can be sent out of order.",
  category: "account",
  icon: "▤",
  fields: [
    integer("TicketCount", "Number of tickets", {
      required: true,
      min: 1,
      max: 250,
      placeholder: "1",
      help: "1 to 250. Each ticket adds to the account reserve.",
    }),
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
    {
      name: "currency",
      label: "Currency",
      kind: "currency",
      required: true,
      placeholder: "USD",
      help: "3-character code or 40 hex characters.",
    },
    address("issuer", "Issuer", { required: true, help: "The account that issues this token." }),
    {
      name: "limit",
      label: "Limit",
      kind: "text",
      required: true,
      placeholder: "1000",
      help: "Most you are willing to hold. 0 removes the trust line.",
    },
    {
      name: "NoRipple",
      label: "Rippling",
      kind: "select",
      advanced: true,
      placeholder: "Leave unchanged",
      options: [
        {
          value: "set",
          label: "Disable rippling (set NoRipple)",
          help: "Stops balances on this line from rippling through your account.",
        },
        {
          value: "clear",
          label: "Allow rippling (clear NoRipple)",
          help: "Lets balances on this line ripple through your account.",
        },
      ],
    },
    {
      name: "Freeze",
      label: "Freeze",
      kind: "select",
      advanced: true,
      placeholder: "Leave unchanged",
      options: [
        { value: "set", label: "Freeze line", help: "Issuer only. Freezes this trust line." },
        {
          value: "clear",
          label: "Unfreeze line",
          help: "Issuer only. Removes a freeze from this trust line.",
        },
      ],
    },
    toggle("SetAuth", "Authorize holder", {
      advanced: true,
      help: "Issuer only, with Require authorization on. Authorization can't be undone.",
    }),
    integer("QualityIn", "Quality in", {
      advanced: true,
      help: "Rate for incoming balance, in billionths.",
    }),
    integer("QualityOut", "Quality out", {
      advanced: true,
      help: "Rate for outgoing balance, in billionths.",
    }),
  ],
  codecs: { QualityIn: codec.int("QualityIn"), QualityOut: codec.int("QualityOut") },
  flags: { SetAuth: TrustSetFlags.tfSetfAuth },
  flagSelects: {
    NoRipple: { set: TrustSetFlags.tfSetNoRipple, clear: TrustSetFlags.tfClearNoRipple },
    Freeze: { set: TrustSetFlags.tfSetFreeze, clear: TrustSetFlags.tfClearFreeze },
  },
  noSelf: ["issuer"],
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
    if (
      !la ||
      typeof la.currency !== "string" ||
      typeof la.issuer !== "string" ||
      typeof la.value !== "string"
    ) {
      return false;
    }
    const limit = expandExponent(la.value);
    if (limit === null) return false;
    values.currency = la.currency;
    values.issuer = la.issuer;
    values.limit = limit;
    return true;
  },
  validate(values) {
    const errors: FieldErrors = {};
    const limit = str(values.limit);
    if (limit && !/^\d+(\.\d+)?$/.test(limit))
      errors.limit = "Enter a number like 1000 (0 removes the line)";
    else if (limit && limit.replace(".", "").replace(/^0+/, "").length > 16)
      errors.limit = "At most 16 significant digits";
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
    {
      name: "TakerGets",
      label: "You sell",
      kind: "amount",
      required: true,
      help: "What you give up when the offer is taken.",
    },
    {
      name: "TakerPays",
      label: "You receive",
      kind: "amount",
      required: true,
      help: "What you get when the offer is taken.",
    },
    dateField("Expiration", "Expires", "UTC date/time after which the offer is void.", {
      advanced: true,
    }),
    integer("OfferSequence", "Replace offer", {
      advanced: true,
      min: 1,
      help: "Sequence number of an earlier offer to cancel and replace.",
    }),
    toggle("Passive", "Passive", {
      advanced: true,
      help: "Do not take offers that cross at the same rate.",
    }),
    toggle("ImmediateOrCancel", "Immediate or cancel", {
      advanced: true,
      help: "Fill what you can now, cancel the rest.",
    }),
    toggle("FillOrKill", "Fill or kill", {
      advanced: true,
      help: "Fill completely or not at all.",
    }),
    toggle("Sell", "Sell", {
      advanced: true,
      help: "Sell the full amount even if it gets more than TakerPays.",
    }),
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
    const gets = values.TakerGets;
    const pays = values.TakerPays;
    if (
      isAmount(gets) &&
      isAmount(pays) &&
      gets.mode === "xrp" &&
      pays.mode === "xrp" &&
      !isEmptyValue(gets) &&
      !isEmptyValue(pays)
    ) {
      errors.TakerPays = "An offer can't trade XRP for XRP. Make one side an issued currency";
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
    integer("OfferSequence", "Offer sequence", {
      required: true,
      min: 1,
      help: "The Sequence number of the transaction that created the offer.",
    }),
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
    integer("NFTokenTaxon", "Taxon", {
      required: true,
      placeholder: "0",
      help: "Number you choose to group related NFTs (any value, 0 is fine).",
    }),
    {
      name: "URI",
      label: "URI",
      kind: "text",
      placeholder: "ipfs://…",
      help: "Points to the NFT's metadata. Stored as hex, max 256 bytes.",
    },
    integer("TransferFee", "Transfer fee", {
      min: 0,
      max: 50000,
      placeholder: "0",
      help: "Royalty in 1/100,000 units (5000 = 5%). Needs Transferable.",
    }),
    toggle("Transferable", "Transferable", {
      help: "Allow the NFT to be traded between accounts.",
    }),
    toggle("Burnable", "Burnable", { help: "Allow the issuer to burn the NFT." }),
    toggle("OnlyXRP", "Only XRP", { help: "Only allow XRP for sales of this NFT." }),
    address("Issuer", "Issuer", {
      advanced: true,
      help: "Mint on behalf of this account (requires it to authorize you).",
    }),
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
    address("Owner", "Owner", {
      advanced: true,
      help: "Current holder, if you are burning an NFT you issued but do not hold.",
    }),
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
    address("Destination", "Destination", {
      required: true,
      help: "Receives the XRP when the escrow is finished.",
    }),
    {
      name: "Amount",
      label: "Amount",
      kind: "xrp",
      required: true,
      placeholder: "10",
      help: "XRP to lock up.",
    },
    dateField(
      "FinishAfter",
      "Release after",
      "UTC date/time after which the escrow can be finished.",
    ),
    dateField(
      "CancelAfter",
      "Cancel after",
      "UTC date/time after which anyone can return the XRP to you.",
    ),
    hex("Condition", "Condition", {
      advanced: true,
      help: "Crypto-condition (PREIMAGE-SHA-256) that must be fulfilled to finish.",
    }),
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
    address("Owner", "Escrow owner", {
      required: true,
      help: "The account that created the escrow.",
    }),
    integer("OfferSequence", "Escrow sequence", {
      required: true,
      min: 1,
      help: "Sequence number of the EscrowCreate transaction.",
    }),
    hex("Condition", "Condition", {
      advanced: true,
      help: "Must match the escrow's condition. Use with the fulfillment.",
    }),
    hex("Fulfillment", "Fulfillment", {
      advanced: true,
      help: "Proof that satisfies the condition.",
    }),
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
    if (hasCondition && !hasFulfillment)
      errors.Fulfillment = "Provide the fulfillment for this condition";
    if (hasFulfillment && !hasCondition)
      errors.Condition = "Provide the condition for this fulfillment";
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
    address("Destination", "Destination", {
      required: true,
      help: "The account that can cash the check.",
    }),
    {
      name: "SendMax",
      label: "Maximum amount",
      kind: "amount",
      required: true,
      help: "Most the destination can cash.",
    },
    dateField(
      "Expiration",
      "Expires",
      "UTC date/time after which the check can no longer be cashed.",
      { advanced: true },
    ),
    hex("InvoiceID", "Invoice ID", {
      advanced: true,
      min: 64,
      max: 64,
      help: "256-bit (64 hex characters) identifier for your records.",
    }),
    DESTINATION_TAG,
  ],
  codecs: {
    Destination: codec.string("Destination"),
    SendMax: codec.amount("SendMax"),
    Expiration: codec.time("Expiration"),
    InvoiceID: codec.hex("InvoiceID"),
    DestinationTag: codec.int("DestinationTag"),
  },
  noSelf: ["Destination"],
});

// ---------------------------------------------------------------------------
// More transaction types
// ---------------------------------------------------------------------------

const accountDelete = makeSchema({
  type: "AccountDelete",
  label: "Delete account",
  description: "Permanently delete this account and send its remaining XRP elsewhere.",
  category: "account",
  icon: "☒",
  fields: [
    address("Destination", "Send remaining XRP to", {
      required: true,
      help: "Must be a funded account other than this one. The account can only be deleted if it owns few objects and its sequence is at least 256 ledgers behind the current one. The fee is one owner reserve, far more than usual (filled in automatically), and is charged even if the deletion fails.",
    }),
    DESTINATION_TAG,
  ],
  codecs: { Destination: codec.string("Destination"), DestinationTag: codec.int("DestinationTag") },
  noSelf: ["Destination"],
});

const escrowCancel = makeSchema({
  type: "EscrowCancel",
  label: "Cancel escrow",
  description: "Return an expired escrow's XRP to the account that created it.",
  category: "escrow-checks",
  icon: "↺",
  fields: [
    address("Owner", "Escrow owner", {
      required: true,
      help: "The account that created the escrow.",
    }),
    integer("OfferSequence", "Escrow sequence", {
      required: true,
      min: 1,
      help: "Sequence number (or ticket) of the EscrowCreate transaction. Only works after the escrow's cancel time.",
    }),
  ],
  codecs: { Owner: codec.string("Owner"), OfferSequence: codec.int("OfferSequence") },
});

const checkCash = makeSchema({
  type: "CheckCash",
  label: "Cash check",
  description: "Redeem a check that was written to you.",
  category: "escrow-checks",
  icon: "✔",
  fields: [
    hex("CheckID", "Check ID", {
      required: true,
      min: 64,
      max: 64,
      help: "64 hex characters: the ID of the Check object.",
    }),
    {
      name: "Amount",
      label: "Exact amount",
      kind: "amount",
      help: "Cash the check for exactly this much. Use this or a minimum, not both.",
    },
    {
      name: "DeliverMin",
      label: "Minimum amount",
      kind: "amount",
      help: "Cash for as much as possible, but at least this much. Use this or an exact amount, not both.",
    },
  ],
  codecs: {
    CheckID: codec.hex("CheckID"),
    Amount: codec.amount("Amount"),
    DeliverMin: codec.amount("DeliverMin"),
  },
  validate(values) {
    const errors: FieldErrors = {};
    const hasAmount = !isEmptyValue(values.Amount);
    const hasMin = !isEmptyValue(values.DeliverMin);
    if (!hasAmount && !hasMin) errors.Amount = "Enter an exact amount or a minimum amount";
    else if (hasAmount && hasMin)
      errors.DeliverMin = "Use either an exact amount or a minimum, not both";
    return errors;
  },
});

const checkCancel = makeSchema({
  type: "CheckCancel",
  label: "Cancel check",
  description: "Cancel a check you wrote or received.",
  category: "escrow-checks",
  icon: "⊘",
  fields: [
    hex("CheckID", "Check ID", {
      required: true,
      min: 64,
      max: 64,
      help: "64 hex characters: the ID of the Check object.",
    }),
  ],
  codecs: { CheckID: codec.hex("CheckID") },
});

const nftCreateOffer = makeSchema({
  type: "NFTokenCreateOffer",
  label: "NFT offer",
  description: "Offer to sell an NFT you hold, or to buy one someone else holds.",
  category: "nft",
  icon: "⇆",
  fields: [
    hex("NFTokenID", "NFT ID", { required: true, min: 64, max: 64, help: "64 hex characters." }),
    toggle("Sell", "This is a sell offer", {
      help: "On: you hold the NFT and are selling it. Off: you are offering to buy it from its owner.",
    }),
    address("Owner", "NFT owner", {
      required: true,
      showWhen: { field: "Sell", equals: false },
      help: "The account that currently holds the NFT (buy offers only).",
    }),
    {
      name: "Amount",
      label: "Price",
      kind: "amount",
      required: true,
      allowZero: true,
      help: "What is offered or asked. 0 XRP is only allowed on a sell offer (giving the NFT away).",
    },
    address("Destination", "Only this account can accept", {
      advanced: true,
      help: "Restrict who may accept the offer.",
    }),
    dateField("Expiration", "Expires", "UTC date and time after which the offer is void.", {
      advanced: true,
    }),
  ],
  codecs: {
    NFTokenID: codec.hex("NFTokenID"),
    Owner: codec.string("Owner"),
    Amount: codec.amount("Amount"),
    Destination: codec.string("Destination"),
    Expiration: codec.time("Expiration"),
  },
  flags: { Sell: NFTokenCreateOfferFlags.tfSellNFToken },
  noSelf: ["Owner"],
  parseExtra(_tx, values) {
    // A sell offer can't name an owner; keep that contradiction as raw JSON.
    return !(values.Sell === true && values.Owner);
  },
  validate(values) {
    const errors: FieldErrors = {};
    const amount = values.Amount;
    if (
      values.Sell !== true &&
      isAmount(amount) &&
      amount.mode === "xrp" &&
      Number(amount.value) === 0 &&
      amount.value.trim() !== ""
    ) {
      errors.Amount = "A buy offer needs a price above 0";
    }
    return errors;
  },
});

const nftAcceptOffer = makeSchema({
  type: "NFTokenAcceptOffer",
  label: "Accept NFT offer",
  description: "Accept an NFT sell or buy offer, or broker a matching pair.",
  category: "nft",
  icon: "✓",
  fields: [
    hex("NFTokenSellOffer", "Sell offer ID", {
      min: 64,
      max: 64,
      help: "64 hex characters. Accept a sell offer by itself (you buy the NFT).",
    }),
    hex("NFTokenBuyOffer", "Buy offer ID", {
      min: 64,
      max: 64,
      help: "64 hex characters. Accept a buy offer by itself (you sell your NFT).",
    }),
    {
      name: "NFTokenBrokerFee",
      label: "Broker fee",
      kind: "amount",
      advanced: true,
      help: "Brokered mode only (both offer IDs set): the amount you keep for matching the two offers.",
    },
  ],
  codecs: {
    NFTokenSellOffer: codec.hex("NFTokenSellOffer"),
    NFTokenBuyOffer: codec.hex("NFTokenBuyOffer"),
    NFTokenBrokerFee: codec.amount("NFTokenBrokerFee"),
  },
  validate(values) {
    const errors: FieldErrors = {};
    const sell = !isEmptyValue(values.NFTokenSellOffer);
    const buy = !isEmptyValue(values.NFTokenBuyOffer);
    if (!sell && !buy)
      errors.NFTokenSellOffer = "Enter a sell offer ID, a buy offer ID, or both (brokered)";
    if (!isEmptyValue(values.NFTokenBrokerFee) && !(sell && buy)) {
      errors.NFTokenBrokerFee = "A broker fee needs both a sell and a buy offer ID";
    }
    return errors;
  },
});

const nftCancelOffer = makeSchema({
  type: "NFTokenCancelOffer",
  label: "Cancel NFT offers",
  description: "Cancel one or more NFT buy or sell offers.",
  category: "nft",
  icon: "✕",
  fields: [
    {
      name: "NFTokenOffers",
      label: "Offer IDs",
      kind: "list",
      required: true,
      placeholder: "One 64-character offer ID per line",
      help: "IDs of the offers (not the NFTs), one per line or comma separated.",
    },
  ],
  codecs: { NFTokenOffers: offerIdsCodec },
});

const depositPreauth = makeSchema({
  type: "DepositPreauth",
  label: "Deposit preauthorization",
  description: "Allow or stop allowing an account to send you payments when Deposit Auth is on.",
  category: "account",
  icon: "⛨",
  fields: [
    address("Authorize", "Authorize account", {
      help: "Allow this account to pay you. Use this or 'Revoke', not both.",
    }),
    address("Unauthorize", "Revoke account", { help: "Remove an earlier preauthorization." }),
  ],
  codecs: { Authorize: codec.string("Authorize"), Unauthorize: codec.string("Unauthorize") },
  noSelf: ["Authorize"],
  validate(values) {
    const errors: FieldErrors = {};
    const a = !isEmptyValue(values.Authorize);
    const u = !isEmptyValue(values.Unauthorize);
    if (!a && !u) errors.Authorize = "Enter an account to authorize or to revoke";
    else if (a && u) errors.Unauthorize = "Authorize or revoke one account at a time";
    return errors;
  },
});

const signerListSet = makeSchema({
  type: "SignerListSet",
  label: "Signer list",
  description: "Set up multi-signing: who can sign for this account, and how much weight each has.",
  category: "account",
  icon: "☷",
  fields: [
    integer("SignerQuorum", "Quorum", {
      required: true,
      min: 0,
      max: MAX_UINT32,
      help: "Total weight that must sign a transaction. 0 deletes the signer list.",
    }),
    {
      name: "SignerEntries",
      label: "Signers",
      kind: "list",
      placeholder: "rAddress:weight (one per line)",
      help: `One signer per line as rAddress:weight (weight 1-65535). Up to ${MAX_SIGNERS}, no duplicates, and not your own account. Leave empty to delete the list.`,
    },
  ],
  codecs: { SignerQuorum: codec.int("SignerQuorum"), SignerEntries: signerEntriesCodec },
  validate(values, ctx) {
    const errors: FieldErrors = {};
    const quorumText = str(values.SignerQuorum);
    const quorum = /^\d+$/.test(quorumText) ? Number(quorumText) : null;
    const lines = parseSignerLines(values.SignerEntries);
    if (quorum === 0) {
      if (lines.length > 0)
        errors.SignerEntries = "Remove the signers to delete the list (quorum 0)";
      return errors;
    }
    if (quorum === null) return errors; // the quorum field reports its own error
    if (lines.length === 0) {
      errors.SignerEntries = "Add at least one signer, or set the quorum to 0 to delete the list";
      return errors;
    }
    if (lines.length > MAX_SIGNERS) {
      errors.SignerEntries = `At most ${MAX_SIGNERS} signers`;
      return errors;
    }
    const seen = new Set<string>();
    let total = 0;
    for (const [i, line] of lines.entries()) {
      const n = i + 1;
      if (!isValidClassicAddress(line.account)) {
        errors.SignerEntries = `Line ${n}: not a valid XRPL address`;
        return errors;
      }
      if (!/^\d+$/.test(line.weight) || Number(line.weight) < 1 || Number(line.weight) > 65535) {
        errors.SignerEntries = `Line ${n}: weight must be a whole number from 1 to 65535`;
        return errors;
      }
      if (seen.has(line.account)) {
        errors.SignerEntries = `Line ${n}: each signer may appear only once`;
        return errors;
      }
      if (ctx?.account && line.account === ctx.account) {
        errors.SignerEntries = `Line ${n}: your own account can't be on the list`;
        return errors;
      }
      seen.add(line.account);
      total += Number(line.weight);
    }
    if (quorum > total)
      errors.SignerQuorum = `Quorum can't exceed the total signer weight (${total})`;
    return errors;
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
  accountDelete,
  depositPreauth,
  signerListSet,
  escrowCancel,
  checkCash,
  checkCancel,
  nftCreateOffer,
  nftAcceptOffer,
  nftCancelOffer,
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

export function validateValues(
  schema: TxSchema,
  values: FormValues,
  ctx?: ValidateContext,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of schema.fields) {
    if (!isFieldActive(f, values)) continue;
    const v = values[f.name];
    if (isEmptyValue(v)) {
      if (f.required) errors[f.name] = `${f.label} is required`;
      else if (
        f.kind === "amount" &&
        isAmount(v) &&
        v.mode === "issued" &&
        ((v.currency ?? "").trim() || (v.issuer ?? "").trim())
      ) {
        errors[f.name] = "Enter an amount";
      }
      continue;
    }
    const msg = validateField(f, v);
    if (msg) errors[f.name] = msg;
  }
  const extra = schema.validate?.(values, ctx) ?? {};
  for (const [name, msg] of Object.entries(extra)) {
    if (!errors[name]) errors[name] = msg;
  }
  return errors;
}

export function buildTx(schema: TxSchema, values: FormValues, account: string): TxJson {
  return schema.build(values, account);
}

export function valuesFromTx(
  tx: TxJson,
): { schema: TxSchema; values: FormValues; dropped: string[] } | null {
  if (typeof tx.TransactionType !== "string") return null;
  const schema = getSchema(tx.TransactionType);
  if (!schema?.parse) return null;
  const parsed = schema.parse(tx);
  if (!parsed) return null;
  // Keys the form can't show (autofill/signing fields): reported, never silently lost.
  const dropped = DROPPED_KEYS.filter((k) => tx[k] !== undefined);
  return { schema, values: { ...defaultValues(schema), ...parsed }, dropped };
}
