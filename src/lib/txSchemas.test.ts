import { describe, expect, it } from "vitest";
import { validate } from "xrpl";
import type { TxJson } from "./tx";
import type { AmountValue, FormValues, TxSchema } from "./txSchemaTypes";
import {
  buildTx,
  CATEGORIES,
  defaultValues,
  DROPPED_KEYS,
  getSchema,
  isEmptyValue,
  isFieldActive,
  SCHEMAS,
  validateValues,
  valuesFromTx,
} from "./txSchemas";

const ACCOUNT = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const DEST = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const ISSUER = "rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn";
const NFT_ID = "000B013A95F14B0044F78A264E41713C64B5F89242540EE208C3098E00000D65";
const CONDITION = "A0258020E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855810100";
const INVOICE = "6F1DFD1D0FE8A32E40E1F2C05CF1C15545BAB56B617F9C6C2D63A6B704BEF59B";
const OFFER_A = "68CD1F6F906494EA08C9CB5CAFA64DFA90D4E834B7151899B73231DE5A0C3B77";
const OFFER_B = "5D6AA8E1F8E93E5B5FDF3E4B7D2B8CC3D2F0E3E1A2B3C4D5E6F708192A3B4C5D";
const OTHER = "rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpf";

function schema(type: string): TxSchema {
  const s = getSchema(type);
  if (!s) throw new Error(`no schema for ${type}`);
  return s;
}

function filled(type: string, overrides: FormValues): FormValues {
  const s = schema(type);
  return { ...defaultValues(s), ...overrides };
}

// A fully valid fixture per type, using required fields plus a few optional ones.
const FIXTURES: Record<string, FormValues> = {
  Payment: {
    Destination: DEST,
    Amount: { mode: "xrp", value: "1.5" },
    DestinationTag: "42",
    Memo: "thanks",
  },
  AccountSet: { Domain: "Example.COM", SetFlag: "8", TransferRate: "1005000000", TickSize: "5" },
  SetRegularKey: { RegularKey: DEST },
  TicketCreate: { TicketCount: "5" },
  TrustSet: {
    currency: "USD",
    issuer: ISSUER,
    limit: "1000",
    NoRipple: "set",
    QualityIn: "1000000000",
  },
  OfferCreate: {
    TakerGets: { mode: "xrp", value: "10" },
    TakerPays: { mode: "issued", value: "25.5", currency: "USD", issuer: ISSUER },
    Expiration: "2030-01-01T00:00:00Z",
    Passive: true,
    Sell: true,
  },
  OfferCancel: { OfferSequence: "7" },
  NFTokenMint: {
    NFTokenTaxon: "0",
    URI: "ipfs://bafy/metadata.json",
    TransferFee: "5000",
    Transferable: true,
    Burnable: true,
  },
  NFTokenBurn: { NFTokenID: NFT_ID, Owner: DEST },
  EscrowCreate: {
    Destination: DEST,
    Amount: "10",
    FinishAfter: "2030-01-01T00:00:00Z",
    CancelAfter: "2030-06-01T00:00:00Z",
  },
  EscrowFinish: { Owner: DEST, OfferSequence: "12", Condition: CONDITION, Fulfillment: "A0028000" },
  CheckCreate: {
    Destination: DEST,
    SendMax: { mode: "issued", value: "100", currency: "USD", issuer: ISSUER },
    Expiration: "2030-01-01T00:00:00Z",
    InvoiceID: INVOICE,
  },
  AccountDelete: { Destination: DEST, DestinationTag: "7" },
  DepositPreauth: { Authorize: DEST },
  SignerListSet: { SignerQuorum: "3", SignerEntries: `${DEST}:2\n${OTHER}:1` },
  EscrowCancel: { Owner: DEST, OfferSequence: "12" },
  CheckCash: { CheckID: INVOICE, Amount: { mode: "xrp", value: "5" } },
  CheckCancel: { CheckID: INVOICE },
  NFTokenCreateOffer: {
    NFTokenID: NFT_ID,
    Sell: true,
    Amount: { mode: "xrp", value: "10" },
    Destination: DEST,
    Expiration: "2030-01-01T00:00:00",
  },
  NFTokenAcceptOffer: {
    NFTokenSellOffer: OFFER_A,
    NFTokenBuyOffer: OFFER_B,
    NFTokenBrokerFee: { mode: "xrp", value: "1" },
  },
  NFTokenCancelOffer: { NFTokenOffers: `${OFFER_A}\n${OFFER_B}` },
};

describe("schema registry", () => {
  it("has one schema per supported type with unique ids", () => {
    const types = SCHEMAS.map((s) => s.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual(
      [
        "AccountDelete",
        "AccountSet",
        "CheckCancel",
        "CheckCash",
        "CheckCreate",
        "DepositPreauth",
        "EscrowCancel",
        "EscrowCreate",
        "EscrowFinish",
        "NFTokenAcceptOffer",
        "NFTokenBurn",
        "NFTokenCancelOffer",
        "NFTokenCreateOffer",
        "NFTokenMint",
        "OfferCancel",
        "OfferCreate",
        "Payment",
        "SetRegularKey",
        "SignerListSet",
        "TicketCreate",
        "TrustSet",
      ].sort(),
    );
  });

  it("assigns every schema to a known category and every category has schemas", () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const s of SCHEMAS) expect(ids.has(s.category)).toBe(true);
    for (const c of CATEGORIES) expect(SCHEMAS.some((s) => s.category === c.id)).toBe(true);
  });

  it("gives every schema a label, description, icon and unique field names", () => {
    for (const s of SCHEMAS) {
      expect(s.label).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.icon).toBeTruthy();
      const names = s.fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("puts SourceTag and Memo under advanced on every schema", () => {
    for (const s of SCHEMAS) {
      expect(s.fields.find((f) => f.name === "SourceTag")?.advanced).toBe(true);
      expect(s.fields.find((f) => f.name === "Memo")?.advanced).toBe(true);
    }
  });

  it("looks schemas up by type", () => {
    expect(getSchema("Payment")?.type).toBe("Payment");
    expect(getSchema("Nope")).toBeUndefined();
  });

  it("builds default values for every field", () => {
    const d = defaultValues(schema("OfferCreate"));
    expect(d.TakerGets).toEqual({ mode: "xrp", value: "" });
    expect(d.Passive).toBe(false);
    expect(d.Expiration).toBe("");
  });
});

describe.each(Object.keys(FIXTURES))("%s", (type) => {
  const s = schema(type);
  const values = filled(type, FIXTURES[type]);

  it("has no validation errors for the fixture", () => {
    expect(validateValues(s, values)).toEqual({});
  });

  it("builds a tx that xrpl.js accepts", () => {
    const tx = buildTx(s, values, ACCOUNT);
    expect(tx.TransactionType).toBe(type);
    expect(tx.Account).toBe(ACCOUNT);
    expect(() => validate(tx)).not.toThrow();
  });

  it("round-trips: build -> valuesFromTx -> build is stable", () => {
    const tx = buildTx(s, values, ACCOUNT);
    const back = valuesFromTx(tx);
    expect(back).not.toBeNull();
    expect(back?.schema.type).toBe(type);
    expect(buildTx(back!.schema, back!.values, ACCOUNT)).toEqual(tx);
  });

  it("flags every required field when empty", () => {
    const errors = validateValues(s, defaultValues(s));
    const d = defaultValues(s);
    for (const f of s.fields.filter((x) => x.required && isFieldActive(x, d)))
      expect(errors[f.name]).toBeTruthy();
  });

  it("ignores autofill fields when parsing", () => {
    const tx = {
      ...buildTx(s, values, ACCOUNT),
      Fee: "12",
      Sequence: 5,
      LastLedgerSequence: 100,
      SigningPubKey: "ABCD",
    };
    expect(valuesFromTx(tx)).not.toBeNull();
  });
});

describe("required-only builds", () => {
  it("builds minimal valid txs with required fields only", () => {
    const minimal: Record<string, FormValues> = {
      Payment: { Destination: DEST, Amount: { mode: "xrp", value: "1" } },
      AccountSet: {},
      SetRegularKey: {},
      TicketCreate: { TicketCount: "1" },
      TrustSet: { currency: "USD", issuer: ISSUER, limit: "10" },
      OfferCreate: {
        TakerGets: { mode: "xrp", value: "1" },
        TakerPays: { mode: "issued", value: "1", currency: "USD", issuer: ISSUER },
      },
      OfferCancel: { OfferSequence: "1" },
      NFTokenMint: { NFTokenTaxon: "0" },
      NFTokenBurn: { NFTokenID: NFT_ID },
      EscrowCreate: { Destination: DEST, Amount: "1", FinishAfter: "2030-01-01" },
      EscrowFinish: { Owner: DEST, OfferSequence: "3" },
      CheckCreate: { Destination: DEST, SendMax: { mode: "xrp", value: "1" } },
      AccountDelete: { Destination: DEST },
      DepositPreauth: { Unauthorize: DEST },
      SignerListSet: { SignerQuorum: "0" },
      EscrowCancel: { Owner: DEST, OfferSequence: "3" },
      CheckCash: { CheckID: INVOICE, DeliverMin: { mode: "xrp", value: "1" } },
      CheckCancel: { CheckID: INVOICE },
      NFTokenCreateOffer: { NFTokenID: NFT_ID, Owner: DEST, Amount: { mode: "xrp", value: "1" } },
      NFTokenAcceptOffer: { NFTokenBuyOffer: OFFER_B },
      NFTokenCancelOffer: { NFTokenOffers: OFFER_A },
    };
    for (const s of SCHEMAS) {
      const v = filled(s.type, minimal[s.type]);
      expect(validateValues(s, v), s.type).toEqual({});
      expect(() => validate(buildTx(s, v, ACCOUNT)), s.type).not.toThrow();
    }
  });
});

describe("buildTx details", () => {
  it("converts XRP to drops and omits empty optionals", () => {
    const tx = buildTx(
      schema("Payment"),
      filled("Payment", { Destination: DEST, Amount: { mode: "xrp", value: "1.5" } }),
      ACCOUNT,
    );
    expect(tx).toEqual({
      TransactionType: "Payment",
      Account: ACCOUNT,
      Destination: DEST,
      Amount: "1500000",
    });
  });

  it("builds issued currency amounts as objects", () => {
    const tx = buildTx(
      schema("Payment"),
      filled("Payment", {
        Destination: DEST,
        Amount: { mode: "issued", value: "12.5", currency: "USD", issuer: ISSUER },
      }),
      ACCOUNT,
    );
    expect(tx.Amount).toEqual({ currency: "USD", issuer: ISSUER, value: "12.5" });
  });

  it("converts integers to numbers", () => {
    const tx = buildTx(schema("Payment"), filled("Payment", { ...FIXTURES.Payment }), ACCOUNT);
    expect(tx.DestinationTag).toBe(42);
  });

  it("encodes a memo as text/plain hex", () => {
    const tx = buildTx(schema("Payment"), filled("Payment", FIXTURES.Payment), ACCOUNT);
    expect(tx.Memos).toEqual([
      { Memo: { MemoType: "746578742F706C61696E", MemoData: "7468616E6B73" } },
    ]);
  });

  it("lowercases and hex-encodes the AccountSet domain", () => {
    const tx = buildTx(
      schema("AccountSet"),
      filled("AccountSet", { Domain: "Example.COM" }),
      ACCOUNT,
    );
    expect(tx.Domain).toBe("6578616D706C652E636F6D");
  });

  it("sends SetFlag as a number", () => {
    const tx = buildTx(schema("AccountSet"), filled("AccountSet", { SetFlag: "8" }), ACCOUNT);
    expect(tx.SetFlag).toBe(8);
  });

  it("builds TrustSet LimitAmount and ORs flags", () => {
    const tx = buildTx(
      schema("TrustSet"),
      filled("TrustSet", {
        currency: "USD",
        issuer: ISSUER,
        limit: "500",
        NoRipple: "set",
        Freeze: "set",
        SetAuth: true,
      }),
      ACCOUNT,
    );
    expect(tx.LimitAmount).toEqual({ currency: "USD", issuer: ISSUER, value: "500" });
    expect(tx.Flags).toBe(131072 | 1048576 | 65536);
  });

  it("omits Flags when no toggle is on", () => {
    const tx = buildTx(schema("OfferCreate"), filled("OfferCreate", FIXTURES.OfferCreate), ACCOUNT);
    expect(tx.Flags).toBe(65536 | 524288);
    const none = buildTx(
      schema("OfferCreate"),
      filled("OfferCreate", { ...FIXTURES.OfferCreate, Passive: false, Sell: false }),
      ACCOUNT,
    );
    expect(none).not.toHaveProperty("Flags");
  });

  it("ORs NFTokenMint flags and hex-encodes the URI", () => {
    const tx = buildTx(schema("NFTokenMint"), filled("NFTokenMint", FIXTURES.NFTokenMint), ACCOUNT);
    expect(tx.Flags).toBe(1 | 8);
    expect(tx.URI).toBe("697066733A2F2F626166792F6D657461646174612E6A736F6E");
    expect(tx.TransferFee).toBe(5000);
  });

  it("converts ISO times to Ripple epoch seconds", () => {
    const tx = buildTx(schema("CheckCreate"), filled("CheckCreate", FIXTURES.CheckCreate), ACCOUNT);
    expect(tx.Expiration).toBe(946771200); // 2030-01-01T00:00:00Z
  });

  it("reads times without a timezone as UTC", () => {
    const a = buildTx(
      schema("CheckCreate"),
      filled("CheckCreate", { ...FIXTURES.CheckCreate, Expiration: "2030-01-01T00:00" }),
      ACCOUNT,
    );
    const b = buildTx(
      schema("CheckCreate"),
      filled("CheckCreate", { ...FIXTURES.CheckCreate, Expiration: "2030-01-01" }),
      ACCOUNT,
    );
    expect(a.Expiration).toBe(946771200);
    expect(b.Expiration).toBe(946771200);
  });

  it("uppercases hex fields", () => {
    const tx = buildTx(
      schema("NFTokenBurn"),
      filled("NFTokenBurn", { NFTokenID: NFT_ID.toLowerCase() }),
      ACCOUNT,
    );
    expect(tx.NFTokenID).toBe(NFT_ID);
  });

  it("omits Account when none is given", () => {
    const tx = buildTx(schema("OfferCancel"), filled("OfferCancel", { OfferSequence: "3" }), "");
    expect(tx).toEqual({ TransactionType: "OfferCancel", OfferSequence: 3 });
  });

  it("treats blank strings and unchecked toggles as empty", () => {
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue(false)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue({ mode: "xrp", value: " " })).toBe(true);
    expect(isEmptyValue("0")).toBe(false);
    expect(isEmptyValue(true)).toBe(false);
  });
});

describe("validateValues", () => {
  const pay = (o: FormValues) => validateValues(schema("Payment"), filled("Payment", o));

  it("requires a destination and an amount", () => {
    const e = pay({});
    expect(e.Destination).toBe("Destination is required");
    expect(e.Amount).toBe("Amount is required");
  });

  it("rejects invalid addresses", () => {
    expect(
      pay({ Destination: "rNotAnAddress", Amount: { mode: "xrp", value: "1" } }).Destination,
    ).toMatch(/valid XRPL address/);
    expect(
      pay({ Destination: DEST, Amount: { mode: "xrp", value: "1" } }).Destination,
    ).toBeUndefined();
  });

  it("limits XRP to 6 decimal places and positive values", () => {
    const amt = (value: string) =>
      pay({ Destination: DEST, Amount: { mode: "xrp", value } }).Amount;
    expect(amt("1.1234567")).toMatch(/6 decimal/);
    expect(amt("0")).toMatch(/greater than 0/);
    expect(amt("-1")).toMatch(/number/);
    expect(amt("abc")).toMatch(/number/);
    expect(amt("1e3")).toMatch(/number/);
    expect(amt("100000000001")).toMatch(/maximum/);
    expect(amt("0.000001")).toBeUndefined();
  });

  it("validates issued currency amounts", () => {
    const amt = (a: object) =>
      pay({
        Destination: DEST,
        Amount: { mode: "issued", value: "1", currency: "USD", issuer: ISSUER, ...a },
      }).Amount;
    expect(amt({})).toBeUndefined();
    expect(amt({ currency: "" })).toMatch(/Currency is required/);
    expect(amt({ currency: "XRP" })).toMatch(/not an issued currency/);
    expect(amt({ currency: "US" })).toMatch(/3-character/);
    expect(amt({ currency: "0".repeat(40) })).toMatch(/all zeros/);
    expect(amt({ currency: "0".repeat(39) + "1" })).toBeUndefined();
    expect(amt({ issuer: "" })).toMatch(/Issuer is required/);
    expect(amt({ issuer: "nope" })).toMatch(/Issuer/);
    expect(amt({ value: "0" })).toMatch(/greater than 0/);
    expect(amt({ value: "1.12345678901234567" })).toMatch(/16 significant/);
  });

  it("flags a half-filled optional amount", () => {
    const e = pay({
      Destination: DEST,
      Amount: { mode: "xrp", value: "1" },
      SendMax: { mode: "issued", value: "", currency: "USD", issuer: "" },
    });
    expect(e.SendMax).toBe("Enter an amount");
  });

  it("validates integer bounds", () => {
    const base = { Destination: DEST, Amount: { mode: "xrp", value: "1" } } as const;
    expect(pay({ ...base, DestinationTag: "4294967295" }).DestinationTag).toBeUndefined();
    expect(pay({ ...base, DestinationTag: "4294967296" }).DestinationTag).toMatch(/between/);
    expect(pay({ ...base, DestinationTag: "-1" }).DestinationTag).toMatch(/whole number/);
    expect(pay({ ...base, DestinationTag: "1.5" }).DestinationTag).toMatch(/whole number/);
    const tickets = (n: string) =>
      validateValues(schema("TicketCreate"), filled("TicketCreate", { TicketCount: n }))
        .TicketCount;
    expect(tickets("0")).toMatch(/between 1 and 250/);
    expect(tickets("250")).toBeUndefined();
    expect(tickets("251")).toMatch(/between 1 and 250/);
  });

  it("validates hex length and format", () => {
    const base = { Destination: DEST, Amount: { mode: "xrp", value: "1" } } as const;
    expect(pay({ ...base, InvoiceID: INVOICE }).InvoiceID).toBeUndefined();
    expect(pay({ ...base, InvoiceID: "ABCD" }).InvoiceID).toMatch(/exactly 64/);
    expect(pay({ ...base, InvoiceID: "ZZ" + INVOICE.slice(2) }).InvoiceID).toMatch(/hex/);
    expect(pay({ ...base, InvoiceID: INVOICE + "A" }).InvoiceID).toMatch(/hex/);
  });

  it("validates the memo length", () => {
    const base = { Destination: DEST, Amount: { mode: "xrp", value: "1" } } as const;
    expect(pay({ ...base, Memo: "x".repeat(900) }).Memo).toBeUndefined();
    expect(pay({ ...base, Memo: "x".repeat(901) }).Memo).toMatch(/too long/);
  });

  it("validates select values", () => {
    const e = validateValues(schema("AccountSet"), filled("AccountSet", { SetFlag: "99" }));
    expect(e.SetFlag).toMatch(/Choose one/);
  });

  it("rejects turning the same AccountSet flag on and off", () => {
    const e = validateValues(
      schema("AccountSet"),
      filled("AccountSet", { SetFlag: "8", ClearFlag: "8" }),
    );
    expect(e.ClearFlag).toMatch(/on and off/);
  });

  it("checks AccountSet TransferRate, TickSize and Domain", () => {
    const a = (o: FormValues) => validateValues(schema("AccountSet"), filled("AccountSet", o));
    expect(a({ TransferRate: "0" }).TransferRate).toBeUndefined();
    expect(a({ TransferRate: "1000000000" }).TransferRate).toBeUndefined();
    expect(a({ TransferRate: "500" }).TransferRate).toMatch(/1000000000/);
    expect(a({ TickSize: "2" }).TickSize).toMatch(/3 to 15/);
    expect(a({ TickSize: "5" }).TickSize).toBeUndefined();
    expect(a({ TickSize: "16" }).TickSize).toMatch(/between/);
    expect(a({ Domain: "exämple.com" }).Domain).toMatch(/ASCII/);
    expect(a({ MessageKey: "AB" }).MessageKey).toMatch(/exactly 66/);
  });

  it("checks TrustSet currency, issuer and limit", () => {
    const t = (o: FormValues) =>
      validateValues(
        schema("TrustSet"),
        filled("TrustSet", { currency: "USD", issuer: ISSUER, limit: "1", ...o }),
      );
    expect(t({})).toEqual({});
    expect(t({ currency: "XRP" }).currency).toMatch(/not an issued currency/);
    expect(t({ currency: "" }).currency).toBe("Currency is required");
    expect(t({ issuer: "x" }).issuer).toMatch(/valid XRPL address/);
    expect(t({ limit: "abc" }).limit).toMatch(/number/);
    expect(t({ limit: "0" }).limit).toBeUndefined();
  });

  it("rejects combining immediate-or-cancel with fill-or-kill", () => {
    const e = validateValues(
      schema("OfferCreate"),
      filled("OfferCreate", { ...FIXTURES.OfferCreate, ImmediateOrCancel: true, FillOrKill: true }),
    );
    expect(e.FillOrKill).toMatch(/either/);
  });

  it("requires Transferable for an NFT transfer fee", () => {
    const e = validateValues(
      schema("NFTokenMint"),
      filled("NFTokenMint", { NFTokenTaxon: "0", TransferFee: "100" }),
    );
    expect(e.TransferFee).toMatch(/Transferable/);
    const ok = validateValues(
      schema("NFTokenMint"),
      filled("NFTokenMint", { NFTokenTaxon: "0", TransferFee: "100", Transferable: true }),
    );
    expect(ok.TransferFee).toBeUndefined();
    const high = validateValues(
      schema("NFTokenMint"),
      filled("NFTokenMint", { NFTokenTaxon: "0", TransferFee: "50001", Transferable: true }),
    );
    expect(high.TransferFee).toMatch(/between/);
  });

  it("limits the NFT URI to 256 bytes", () => {
    const e = (uri: string) =>
      validateValues(schema("NFTokenMint"), filled("NFTokenMint", { NFTokenTaxon: "0", URI: uri }))
        .URI;
    expect(e("a".repeat(256))).toBeUndefined();
    expect(e("a".repeat(257))).toMatch(/256 bytes/);
  });

  it("validates escrow create timing rules", () => {
    const e = (o: FormValues) =>
      validateValues(
        schema("EscrowCreate"),
        filled("EscrowCreate", { Destination: DEST, Amount: "1", ...o }),
      );
    expect(e({}).FinishAfter).toMatch(/release time or a condition/);
    expect(e({ Condition: CONDITION }).CancelAfter).toMatch(/needs a cancel time/);
    expect(e({ Condition: CONDITION, CancelAfter: "2030-01-01" })).toEqual({});
    expect(e({ FinishAfter: "2030-06-01", CancelAfter: "2030-01-01" }).CancelAfter).toMatch(
      /after the release/,
    );
    expect(e({ FinishAfter: "not a date" }).FinishAfter).toMatch(/UTC date and time/);
    expect(e({ FinishAfter: "1999-01-01" }).FinishAfter).toMatch(/UTC date and time/);
  });

  it("requires condition and fulfillment together on EscrowFinish", () => {
    const e = (o: FormValues) =>
      validateValues(
        schema("EscrowFinish"),
        filled("EscrowFinish", { Owner: DEST, OfferSequence: "1", ...o }),
      );
    expect(e({})).toEqual({});
    expect(e({ Condition: CONDITION }).Fulfillment).toMatch(/fulfillment/);
    expect(e({ Fulfillment: "A0028000" }).Condition).toMatch(/condition/);
  });

  it("requires a valid optional RegularKey address only when provided", () => {
    const r = (v: string) =>
      validateValues(schema("SetRegularKey"), filled("SetRegularKey", { RegularKey: v }));
    expect(r("")).toEqual({});
    expect(r("bad").RegularKey).toMatch(/valid XRPL address/);
  });

  it("requires an NFT ID of exactly 64 hex characters", () => {
    const e = (id: string) =>
      validateValues(schema("NFTokenBurn"), filled("NFTokenBurn", { NFTokenID: id })).NFTokenID;
    expect(e(NFT_ID)).toBeUndefined();
    expect(e("ABCD")).toMatch(/exactly 64/);
    expect(e("")).toBe("NFT ID is required");
  });

  it("supports showWhen on custom schemas", () => {
    const custom: TxSchema = {
      type: "Custom",
      label: "Custom",
      description: "test",
      category: "payments",
      icon: "?",
      fields: [
        {
          name: "mode",
          label: "Mode",
          kind: "select",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
        {
          name: "extra",
          label: "Extra",
          kind: "text",
          required: true,
          showWhen: { field: "mode", equals: "b" },
        },
      ],
      build: () => ({ TransactionType: "Custom" }),
    };
    expect(validateValues(custom, { mode: "a", extra: "" })).toEqual({});
    expect(validateValues(custom, { mode: "b", extra: "" })).toEqual({
      extra: "Extra is required",
    });
    expect(validateValues(custom, { mode: "b", extra: "ok" })).toEqual({});
  });
});

describe("valuesFromTx", () => {
  it("returns null for unknown or missing transaction types", () => {
    expect(valuesFromTx({ TransactionType: "AMMDeposit" })).toBeNull();
    expect(valuesFromTx({} as TxJson)).toBeNull();
  });

  it("returns null when the tx has fields the form cannot show", () => {
    expect(
      valuesFromTx({ TransactionType: "Payment", Destination: DEST, Amount: "1", Paths: [] }),
    ).toBeNull();
  });

  it("returns null for unrepresentable flags", () => {
    expect(
      valuesFromTx({ TransactionType: "Payment", Destination: DEST, Amount: "1", Flags: 131072 }),
    ).toBeNull();
  });

  it("accepts tfFullyCanonicalSig", () => {
    const r = valuesFromTx({
      TransactionType: "Payment",
      Destination: DEST,
      Amount: "1",
      Flags: 2147483648,
    });
    expect(r?.values.Amount).toEqual({ mode: "xrp", value: "0.000001" });
  });

  it("returns null for non-text memos and for MPT-style amounts", () => {
    expect(
      valuesFromTx({
        TransactionType: "Payment",
        Destination: DEST,
        Amount: "1",
        Memos: [{ Memo: { MemoData: "FF" } }],
      }),
    ).toBeNull();
    expect(
      valuesFromTx({
        TransactionType: "Payment",
        Destination: DEST,
        Amount: { mpt_issuance_id: "00", value: "1" },
      }),
    ).toBeNull();
  });

  it("fills missing form values with defaults", () => {
    const r = valuesFromTx({ TransactionType: "OfferCancel", Account: ACCOUNT, OfferSequence: 9 });
    expect(r?.values.OfferSequence).toBe("9");
    expect(r?.values.Memo).toBe("");
  });

  it("parses toggles back from flags", () => {
    const r = valuesFromTx({
      TransactionType: "NFTokenMint",
      NFTokenTaxon: 0,
      Flags: 1 | 2 | 8,
    });
    expect(r?.values).toMatchObject({ Burnable: true, OnlyXRP: true, Transferable: true });
  });

  it("restores the ISO time and the domain text", () => {
    const check = valuesFromTx({
      TransactionType: "CheckCreate",
      Destination: DEST,
      SendMax: "5000000",
      Expiration: 946771200,
    });
    expect(check?.values.Expiration).toBe("2030-01-01T00:00:00");
    const set = valuesFromTx({ TransactionType: "AccountSet", Domain: "6578616D706C652E636F6D" });
    expect(set?.values.Domain).toBe("example.com");
  });

  it("returns null when AccountSet Domain is not valid UTF-8 text", () => {
    expect(valuesFromTx({ TransactionType: "AccountSet", Domain: "FF" })).toBeNull();
  });

  it("returns null for TrustSet without a usable LimitAmount", () => {
    expect(valuesFromTx({ TransactionType: "TrustSet" })).toBeNull();
    expect(valuesFromTx({ TransactionType: "TrustSet", LimitAmount: "10" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Builder improvements
// ---------------------------------------------------------------------------

describe("datetime fields", () => {
  const check = (expiration: string) =>
    filled("CheckCreate", {
      Destination: DEST,
      SendMax: { mode: "xrp", value: "1" },
      Expiration: expiration,
    });
  const err = (expiration: string) =>
    validateValues(schema("CheckCreate"), check(expiration)).Expiration;

  it("uses the datetime kind for every date field", () => {
    for (const [type, field] of [
      ["EscrowCreate", "FinishAfter"],
      ["EscrowCreate", "CancelAfter"],
      ["OfferCreate", "Expiration"],
      ["CheckCreate", "Expiration"],
      ["NFTokenCreateOffer", "Expiration"],
    ] as const) {
      expect(schema(type).fields.find((f) => f.name === field)?.kind, `${type}.${field}`).toBe(
        "datetime",
      );
    }
  });

  it("accepts the datetime-local value shape, with or without seconds or Z", () => {
    for (const v of [
      "2030-01-01T12:00",
      "2030-01-01T12:00:30",
      "2030-01-01T12:00:30Z",
      "2030-01-01",
    ]) {
      expect(err(v), v).toBeUndefined();
    }
  });

  it("rejects locale-style, overflowing and out-of-range dates", () => {
    for (const v of [
      "March 3 2030",
      "3/3/2030",
      "2030-02-31",
      "2030-13-01",
      "2030-01-01T25:00",
      "1999-12-31",
      "2000-01-01",
    ]) {
      expect(err(v), v).toMatch(/UTC date and time/);
    }
  });

  it("rejects dates past the uint32 ledger limit (year 2200 used to overflow)", () => {
    expect(err("2200-01-01")).toMatch(/UTC date and time/);
    expect(err("2136-02-07T06:28:15")).toBeUndefined(); // 4294967295 seconds after 2000-01-01
    expect(err("2136-02-07T06:28:16")).toMatch(/UTC date and time/);
  });

  it("converts to Ripple seconds and back without drift", () => {
    const tx = buildTx(schema("CheckCreate"), check("2030-01-01T12:00:30"), ACCOUNT);
    expect(tx.Expiration).toBe(946771200 + 12 * 3600 + 30);
    expect(valuesFromTx(tx)?.values.Expiration).toBe("2030-01-01T12:00:30");
  });

  it("opens a tx with an out-of-range Expiration as raw JSON", () => {
    expect(
      valuesFromTx({
        TransactionType: "CheckCreate",
        Destination: DEST,
        SendMax: "1",
        Expiration: 0,
      }),
    ).toBeNull();
    expect(
      valuesFromTx({
        TransactionType: "CheckCreate",
        Destination: DEST,
        SendMax: "1",
        Expiration: 4294967296,
      }),
    ).toBeNull();
  });
});

describe("AccountSet improvements", () => {
  const s = schema("AccountSet");

  it("clears the Domain by sending an empty string and round-trips it", () => {
    const tx = buildTx(
      s,
      filled("AccountSet", { ClearDomain: true, Domain: "ignored.example" }),
      ACCOUNT,
    );
    expect(tx.Domain).toBe("");
    const back = valuesFromTx(tx);
    expect(back?.values.ClearDomain).toBe(true);
    expect(buildTx(s, back!.values, ACCOUNT)).toEqual(tx);
  });

  it("hides the Domain input while 'remove domain' is on", () => {
    const domain = s.fields.find((f) => f.name === "Domain")!;
    expect(isFieldActive(domain, filled("AccountSet", { ClearDomain: false }))).toBe(true);
    expect(isFieldActive(domain, defaultValues(s))).toBe(true);
    expect(isFieldActive(domain, filled("AccountSet", { ClearDomain: true }))).toBe(false);
  });

  it("supports the previously missing asf flags", () => {
    const options = (name: string) =>
      s.fields.find((f) => f.name === name)!.options!.map((o) => o.value);
    for (const v of ["5", "10", "16"]) expect(options("SetFlag")).toContain(v);
    expect(options("ClearFlag")).toContain("5");
    expect(options("ClearFlag")).toContain("10");
    expect(options("ClearFlag")).not.toContain("16"); // clawback can never be turned off
  });

  it("asks for an NFT minter only when asfAuthorizedNFTokenMinter is chosen", () => {
    const minter = s.fields.find((f) => f.name === "NFTokenMinter")!;
    expect(isFieldActive(minter, filled("AccountSet", { SetFlag: "8" }))).toBe(false);
    const on = filled("AccountSet", { SetFlag: "10" });
    expect(isFieldActive(minter, on)).toBe(true);
    expect(validateValues(s, on).NFTokenMinter).toMatch(/required/);
    const ok = filled("AccountSet", { SetFlag: "10", NFTokenMinter: DEST });
    expect(validateValues(s, ok)).toEqual({});
    const tx = buildTx(s, ok, ACCOUNT);
    expect(tx).toMatchObject({ SetFlag: 10, NFTokenMinter: DEST });
    expect(() => validate(tx)).not.toThrow();
    expect(buildTx(s, valuesFromTx(tx)!.values, ACCOUNT)).toEqual(tx);
  });

  it("never leaks a stale minter when another flag is chosen", () => {
    const tx = buildTx(s, filled("AccountSet", { SetFlag: "8", NFTokenMinter: DEST }), ACCOUNT);
    expect(tx).not.toHaveProperty("NFTokenMinter");
  });

  it("opens txs the form can't represent as raw JSON instead of loading an invalid option", () => {
    expect(valuesFromTx({ TransactionType: "AccountSet", SetFlag: 11 })).toBeNull(); // no such flag
    expect(valuesFromTx({ TransactionType: "AccountSet", SetFlag: 17 })).toBeNull(); // not supported yet
    expect(valuesFromTx({ TransactionType: "AccountSet", ClearFlag: 16 })).toBeNull();
    expect(
      valuesFromTx({ TransactionType: "AccountSet", SetFlag: 8, NFTokenMinter: DEST }),
    ).toBeNull();
  });
});

describe("TrustSet tri-state flags", () => {
  const s = schema("TrustSet");
  const base = { currency: "USD", issuer: ISSUER, limit: "10" };
  const flags = (o: FormValues) => buildTx(s, filled("TrustSet", { ...base, ...o }), ACCOUNT).Flags;

  it("maps set and clear to the right tf flags", () => {
    expect(flags({})).toBeUndefined();
    expect(flags({ NoRipple: "set" })).toBe(0x20000);
    expect(flags({ NoRipple: "clear" })).toBe(0x40000);
    expect(flags({ Freeze: "set" })).toBe(0x100000);
    expect(flags({ Freeze: "clear" })).toBe(0x200000);
    expect(flags({ NoRipple: "clear", Freeze: "clear", SetAuth: true })).toBe(
      0x40000 | 0x200000 | 0x10000,
    );
  });

  it("round-trips clear flags, including the fully-canonical bit", () => {
    for (const o of [
      { NoRipple: "clear" },
      { Freeze: "clear" },
      { NoRipple: "set", Freeze: "clear" },
    ]) {
      const tx = buildTx(s, filled("TrustSet", { ...base, ...o }), ACCOUNT);
      const back = valuesFromTx({ ...tx, Flags: (tx.Flags as number) | 0x80000000 });
      expect(back?.values).toMatchObject(o);
      expect(buildTx(s, back!.values, ACCOUNT)).toEqual(tx);
    }
  });

  it("falls back to raw JSON for contradictory or unknown flags", () => {
    const tx = {
      TransactionType: "TrustSet",
      LimitAmount: { currency: "USD", issuer: ISSUER, value: "1" },
    };
    expect(valuesFromTx({ ...tx, Flags: 0x20000 | 0x40000 })).toBeNull();
    expect(valuesFromTx({ ...tx, Flags: 0x400000 })).toBeNull(); // deep freeze: not supported
  });

  it("rejects a trust line to your own account when the signer is known", () => {
    const v = filled("TrustSet", { ...base, issuer: ACCOUNT });
    expect(validateValues(s, v, { account: ACCOUNT }).issuer).toMatch(/own account/);
    expect(validateValues(s, v).issuer).toBeUndefined();
  });
});

describe("validation gaps", () => {
  it("rejects an offer that trades XRP for XRP", () => {
    const e = validateValues(
      schema("OfferCreate"),
      filled("OfferCreate", {
        TakerGets: { mode: "xrp", value: "1" },
        TakerPays: { mode: "xrp", value: "2" },
      }),
    );
    expect(e.TakerPays).toMatch(/XRP for XRP/);
  });

  it("rejects an XRP Send max on an XRP payment, but not an issued one", () => {
    const e = (sendMax: AmountValue) =>
      validateValues(
        schema("Payment"),
        filled("Payment", {
          Destination: DEST,
          Amount: { mode: "xrp", value: "1" },
          SendMax: sendMax,
        }),
      );
    expect(e({ mode: "xrp", value: "2" }).SendMax).toMatch(/can't be XRP/);
    expect(
      e({ mode: "issued", value: "2", currency: "USD", issuer: ISSUER }).SendMax,
    ).toBeUndefined();
  });

  it("rejects paying yourself unless it is a currency conversion", () => {
    const pay = (o: FormValues) =>
      validateValues(
        schema("Payment"),
        filled("Payment", { Destination: ACCOUNT, Amount: { mode: "xrp", value: "1" }, ...o }),
        { account: ACCOUNT },
      );
    expect(pay({}).Destination).toMatch(/yourself/);
    expect(
      pay({ SendMax: { mode: "issued", value: "2", currency: "USD", issuer: ISSUER } }).Destination,
    ).toBeUndefined();
    // Without a known signer the check is skipped.
    expect(
      validateValues(
        schema("Payment"),
        filled("Payment", { Destination: ACCOUNT, Amount: { mode: "xrp", value: "1" } }),
      ).Destination,
    ).toBeUndefined();
  });

  it("rejects 'self' destinations on the other schemas that forbid them", () => {
    const ctx = { account: ACCOUNT };
    expect(
      validateValues(
        schema("CheckCreate"),
        filled("CheckCreate", { Destination: ACCOUNT, SendMax: { mode: "xrp", value: "1" } }),
        ctx,
      ).Destination,
    ).toMatch(/own account/);
    expect(
      validateValues(
        schema("AccountDelete"),
        filled("AccountDelete", { Destination: ACCOUNT }),
        ctx,
      ).Destination,
    ).toMatch(/own account/);
    expect(
      validateValues(
        schema("DepositPreauth"),
        filled("DepositPreauth", { Authorize: ACCOUNT }),
        ctx,
      ).Authorize,
    ).toMatch(/own account/);
    expect(
      validateValues(schema("SetRegularKey"), filled("SetRegularKey", { RegularKey: ACCOUNT }), ctx)
        .RegularKey,
    ).toMatch(/own account/);
    // Escrowing to yourself is legal.
    expect(
      validateValues(
        schema("EscrowCreate"),
        filled("EscrowCreate", { Destination: ACCOUNT, Amount: "1", FinishAfter: "2030-01-01" }),
        ctx,
      ),
    ).toEqual({});
  });

  it("accepts exponent notation coming back from the ledger", () => {
    const amountFor = (value: string) =>
      valuesFromTx({
        TransactionType: "Payment",
        Destination: DEST,
        Amount: { currency: "USD", issuer: ISSUER, value },
      })?.values.Amount;
    expect(amountFor("1e3")).toMatchObject({ mode: "issued", value: "1000" });
    expect(amountFor("1.5e-5")).toMatchObject({ value: "0.000015" });
    expect(amountFor("5e-1")).toMatchObject({ value: "0.5" });
    expect(amountFor("1.25e2")).toMatchObject({ value: "125" });
    expect(amountFor("12.5")).toMatchObject({ value: "12.5" });
    expect(amountFor("1e500")).toBeUndefined(); // absurd exponent: raw JSON
    const trust = valuesFromTx({
      TransactionType: "TrustSet",
      LimitAmount: { currency: "USD", issuer: ISSUER, value: "1e3" },
    });
    expect(trust?.values.limit).toBe("1000");
  });
});

describe("isFieldActive (single showWhen rule)", () => {
  const field = (equals: string | boolean) => ({
    name: "x",
    label: "x",
    kind: "text" as const,
    showWhen: { field: "t", equals },
  });

  it("treats a missing or empty value as false for boolean conditions", () => {
    expect(isFieldActive(field(false), {})).toBe(true);
    expect(isFieldActive(field(false), { t: false })).toBe(true);
    expect(isFieldActive(field(false), { t: true })).toBe(false);
    expect(isFieldActive(field(true), {})).toBe(false);
    expect(isFieldActive(field(true), { t: true })).toBe(true);
  });

  it("compares strings exactly", () => {
    expect(isFieldActive(field("10"), { t: "10" })).toBe(true);
    expect(isFieldActive(field("10"), { t: "1" })).toBe(false);
    expect(isFieldActive(field("10"), {})).toBe(false);
  });

  it("is the same rule the form uses", async () => {
    const { isFieldVisible } = await import("../components/builder/TxForm");
    for (const [eq, values] of [
      [false, {}],
      [false, { t: true }],
      [true, {}],
      ["a", { t: "a" }],
      ["a", {}],
    ] as const) {
      expect(isFieldVisible(field(eq), values)).toBe(isFieldActive(field(eq), values));
    }
  });
});

describe("valuesFromTx reports what it ignores", () => {
  it("lists autofill and signing fields in `dropped`", () => {
    const r = valuesFromTx({
      TransactionType: "OfferCancel",
      Account: ACCOUNT,
      OfferSequence: 9,
      Fee: "12",
      Sequence: 5,
      LastLedgerSequence: 100,
      SigningPubKey: "AB",
      TxnSignature: "CD",
    });
    expect(r?.dropped).toEqual([
      "Account",
      "Fee",
      "Sequence",
      "LastLedgerSequence",
      "SigningPubKey",
      "TxnSignature",
    ]);
  });

  it("reports nothing when there is nothing to lose", () => {
    expect(valuesFromTx({ TransactionType: "OfferCancel", OfferSequence: 9 })?.dropped).toEqual([]);
  });

  it("only ever drops keys it lists", () => {
    expect(DROPPED_KEYS).toContain("Fee");
    expect(DROPPED_KEYS).not.toContain("Flags");
    expect(DROPPED_KEYS).not.toContain("TransactionType");
  });
});

describe("new transaction types", () => {
  const errs = (type: string, o: FormValues, ctx?: { account?: string }) =>
    validateValues(schema(type), filled(type, o), ctx);

  it("AccountDelete requires a destination and builds the minimal tx", () => {
    expect(errs("AccountDelete", {}).Destination).toMatch(/required/);
    expect(
      buildTx(schema("AccountDelete"), filled("AccountDelete", { Destination: DEST }), ACCOUNT),
    ).toEqual({
      TransactionType: "AccountDelete",
      Account: ACCOUNT,
      Destination: DEST,
    });
  });

  it("EscrowCancel needs an owner and a sequence", () => {
    const e = errs("EscrowCancel", {});
    expect(e.Owner).toMatch(/required/);
    expect(e.OfferSequence).toMatch(/required/);
  });

  it("CheckCash needs exactly one of Amount or DeliverMin", () => {
    const x = { mode: "xrp", value: "1" } as const;
    expect(errs("CheckCash", { CheckID: INVOICE }).Amount).toMatch(/exact amount or a minimum/);
    expect(errs("CheckCash", { CheckID: INVOICE, Amount: x, DeliverMin: x }).DeliverMin).toMatch(
      /not both/,
    );
    expect(errs("CheckCash", { CheckID: INVOICE, Amount: x })).toEqual({});
    expect(errs("CheckCash", { CheckID: INVOICE, DeliverMin: x })).toEqual({});
    expect(errs("CheckCash", { CheckID: "ABCD", Amount: x }).CheckID).toMatch(/exactly 64/);
  });

  it("NFTokenCreateOffer: sell offers have no owner and may be free, buy offers need an owner and a price", () => {
    const s = schema("NFTokenCreateOffer");
    const zero = { mode: "xrp", value: "0" } as const;
    const sell = errs("NFTokenCreateOffer", { NFTokenID: NFT_ID, Sell: true, Amount: zero });
    expect(sell).toEqual({});
    const sellTx = buildTx(
      s,
      filled("NFTokenCreateOffer", { NFTokenID: NFT_ID, Sell: true, Amount: zero, Owner: DEST }),
      ACCOUNT,
    );
    expect(sellTx.Flags).toBe(1);
    expect(sellTx.Amount).toBe("0");
    expect(sellTx).not.toHaveProperty("Owner"); // hidden field never leaks
    const buy = errs("NFTokenCreateOffer", { NFTokenID: NFT_ID, Amount: zero });
    expect(buy.Owner).toMatch(/required/);
    expect(buy.Amount).toMatch(/above 0/);
    expect(
      errs(
        "NFTokenCreateOffer",
        { NFTokenID: NFT_ID, Owner: ACCOUNT, Amount: { mode: "xrp", value: "1" } },
        { account: ACCOUNT },
      ).Owner,
    ).toMatch(/own account/);
    // A sell offer that names an owner is contradictory: raw JSON.
    expect(
      valuesFromTx({
        TransactionType: "NFTokenCreateOffer",
        NFTokenID: NFT_ID,
        Amount: "1",
        Owner: DEST,
        Flags: 1,
      }),
    ).toBeNull();
  });

  it("NFTokenAcceptOffer: needs an offer, and a broker fee needs both", () => {
    const fee = { mode: "xrp", value: "1" } as const;
    expect(errs("NFTokenAcceptOffer", {}).NFTokenSellOffer).toMatch(
      /sell offer ID, a buy offer ID/,
    );
    expect(errs("NFTokenAcceptOffer", { NFTokenSellOffer: OFFER_A })).toEqual({});
    expect(
      errs("NFTokenAcceptOffer", { NFTokenSellOffer: OFFER_A, NFTokenBrokerFee: fee })
        .NFTokenBrokerFee,
    ).toMatch(/both/);
    expect(
      errs("NFTokenAcceptOffer", {
        NFTokenSellOffer: OFFER_A,
        NFTokenBuyOffer: OFFER_B,
        NFTokenBrokerFee: fee,
      }),
    ).toEqual({});
  });

  it("NFTokenCancelOffer turns lines or commas into an array and validates every id", () => {
    const s = schema("NFTokenCancelOffer");
    const tx = buildTx(
      s,
      filled("NFTokenCancelOffer", { NFTokenOffers: `${OFFER_A.toLowerCase()}, ${OFFER_B}\n` }),
      ACCOUNT,
    );
    expect(tx.NFTokenOffers).toEqual([OFFER_A, OFFER_B]);
    expect(errs("NFTokenCancelOffer", {}).NFTokenOffers).toMatch(/required/);
    expect(errs("NFTokenCancelOffer", { NFTokenOffers: "nope" }).NFTokenOffers).toMatch(
      /64-character hex/,
    );
    expect(
      errs("NFTokenCancelOffer", { NFTokenOffers: `${OFFER_A}\n${OFFER_A.toLowerCase()}` })
        .NFTokenOffers,
    ).toMatch(/only once/);
    expect(valuesFromTx({ TransactionType: "NFTokenCancelOffer", NFTokenOffers: [] })).toBeNull();
  });

  it("DepositPreauth needs exactly one of Authorize or Unauthorize", () => {
    expect(errs("DepositPreauth", {}).Authorize).toMatch(/authorize or to revoke/);
    expect(errs("DepositPreauth", { Authorize: DEST, Unauthorize: OTHER }).Unauthorize).toMatch(
      /one account at a time/,
    );
    expect(errs("DepositPreauth", { Authorize: DEST })).toEqual({});
    expect(errs("DepositPreauth", { Unauthorize: DEST })).toEqual({});
    // Credential-based preauth isn't supported: keep as raw JSON.
    expect(
      valuesFromTx({ TransactionType: "DepositPreauth", AuthorizeCredentials: [] }),
    ).toBeNull();
  });

  describe("SignerListSet", () => {
    const e = (quorum: string, entries: string, ctx?: { account?: string }) =>
      errs("SignerListSet", { SignerQuorum: quorum, SignerEntries: entries }, ctx);

    it("builds SignerEntries objects and round-trips them", () => {
      const s = schema("SignerListSet");
      const tx = buildTx(s, filled("SignerListSet", FIXTURES.SignerListSet), ACCOUNT);
      expect(tx.SignerQuorum).toBe(3);
      expect(tx.SignerEntries).toEqual([
        { SignerEntry: { Account: DEST, SignerWeight: 2 } },
        { SignerEntry: { Account: OTHER, SignerWeight: 1 } },
      ]);
      expect(valuesFromTx(tx)?.values.SignerEntries).toBe(`${DEST}:2\n${OTHER}:1`);
    });

    it("deletes the list with quorum 0 and no signers", () => {
      expect(e("0", "")).toEqual({});
      expect(e("0", `${DEST}:1`).SignerEntries).toMatch(/delete the list/);
      const tx = buildTx(
        schema("SignerListSet"),
        filled("SignerListSet", { SignerQuorum: "0" }),
        ACCOUNT,
      );
      expect(tx).toEqual({ TransactionType: "SignerListSet", Account: ACCOUNT, SignerQuorum: 0 });
    });

    it("validates addresses, weights, duplicates, self, count and quorum", () => {
      expect(e("1", "").SignerEntries).toMatch(/at least one signer/);
      expect(e("1", "nope:1").SignerEntries).toMatch(/Line 1: not a valid/);
      expect(e("1", `${DEST}:0`).SignerEntries).toMatch(/Line 1: weight/);
      expect(e("1", `${DEST}:65536`).SignerEntries).toMatch(/weight/);
      expect(e("1", `${DEST}:1\n${DEST}:1`).SignerEntries).toMatch(/Line 2: .*only once/);
      expect(e("1", `${ACCOUNT}:1`, { account: ACCOUNT }).SignerEntries).toMatch(/own account/);
      expect(e("5", `${DEST}:2\n${OTHER}:2`).SignerQuorum).toMatch(/can't exceed.*4/);
      expect(e("4", `${DEST}:2\n${OTHER}:2`)).toEqual({});
      expect(
        e("1", Array.from({ length: 33 }, () => `${DEST}:1`).join("\n")).SignerEntries,
      ).toMatch(/At most 32/);
    });

    it("accepts space or comma between address and weight", () => {
      expect(e("2", `${DEST} 1\n${OTHER},1`)).toEqual({});
    });
  });
});
