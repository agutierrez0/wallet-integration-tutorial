import { Wallet } from "xrpl";
import { describe, expect, it } from "vitest";
import {
  AUTOFILLED_FIELDS,
  canCheckOnChain,
  engineCodeFromError,
  entryFromSigned,
  findEntryIndex,
  newEntryId,
  normalizeHash,
  patchFromLookup,
  patchFromSubmitFailure,
  patchFromWalletSubmit,
  patchFromXrplJsSubmit,
  prepareRestore,
  rekeyEntry,
  resultCode,
  restoreText,
  stripForRestore,
} from "./historyEntries";
import type { HistoryEntry } from "./historyTypes";
import { hashOfBlob } from "./tx";
import type { TxJson } from "./tx";
import { buildTx, getSchema, valuesFromTx } from "./txSchemas";

const wallet = Wallet.fromSeed("sEdTM1uX8pu2do5XvTnutH6HsouMaM2");

function signed(tx: TxJson) {
  const filled = { ...tx, Account: wallet.address, Fee: "12", Sequence: 1, LastLedgerSequence: 100 };
  return wallet.sign(filled as never).tx_blob;
}

const built: TxJson = {
  TransactionType: "Payment",
  Account: wallet.address,
  Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  Amount: "5000000",
};

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  const e = entryFromSigned({
    id: "id-1",
    now: 1000,
    network: "testnet",
    walletId: "crossmark",
    account: wallet.address,
    builtTx: built,
    blob: signed(built),
  });
  return { ...e, ...over };
}

describe("entryFromSigned", () => {
  it("records a signed row with the local hash and the pre-autofill tx", () => {
    const blob = signed(built);
    const e = entryFromSigned({
      id: "a",
      now: 5,
      network: "devnet",
      walletId: "gemwallet",
      account: wallet.address,
      builtTx: built,
      blob,
    });
    expect(e).toMatchObject({
      id: "a",
      createdAt: 5,
      network: "devnet",
      walletId: "gemwallet",
      account: wallet.address,
      txType: "Payment",
      status: "signed",
      signedBlob: blob,
    });
    expect(e.hash).toBe(hashOfBlob(blob));
    expect(e.tx).toEqual(built);
    expect(e.tx.Fee).toBeUndefined();
    expect(e.submitVia).toBeUndefined();
  });
});

describe("submit patches (applied in order after signing)", () => {
  it("xrpl.js success records the result and validated flag", () => {
    const res = { result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } } };
    expect(patchFromXrplJsSubmit(res, 10)).toEqual({
      status: "submitted",
      submitVia: "xrpljs",
      submittedAt: 10,
      engineResult: "tesSUCCESS",
      validated: true,
    });
  });

  it("prefers engine_result and leaves validated out when unknown", () => {
    const patch = patchFromXrplJsSubmit({ result: { engine_result: "tecUNFUNDED_PAYMENT" } }, 3);
    expect(patch.engineResult).toBe("tecUNFUNDED_PAYMENT");
    expect("validated" in patch).toBe(false);
  });

  it("a response with no result code still counts as submitted", () => {
    expect(patchFromXrplJsSubmit({}, 1).engineResult).toBeUndefined();
    expect(resultCode(null)).toBeUndefined();
  });

  it("failure marks the row failed with the route that failed", () => {
    expect(patchFromSubmitFailure("xrpljs", 7)).toEqual({
      status: "failed",
      submitVia: "xrpljs",
      submittedAt: 7,
    });
  });

  it("wallet submit keeps the hash when it matches", () => {
    const e = entry();
    const patch = patchFromWalletSubmit(e, e.hash, 9);
    expect(patch).toEqual({ status: "submitted", submitVia: "wallet", submittedAt: 9 });
  });

  it("wallet submit re-keys the row to the hash the wallet returns", () => {
    const e = entry();
    const rekeyed = "ab".repeat(32);
    expect(patchFromWalletSubmit(e, rekeyed, 9).hash).toBe(rekeyed.toUpperCase());
    expect(patchFromWalletSubmit(e, "ABCDEF", 9).hash).toBeUndefined(); // not a hash
    expect(patchFromWalletSubmit(e, undefined, 9).hash).toBeUndefined();
  });

  it("builds the row first, then the patch moves it signed -> submitted", () => {
    const e = entry();
    expect(e.status).toBe("signed");
    const after = { ...e, ...patchFromXrplJsSubmit({ result: { engine_result: "tesSUCCESS" } }, 50) };
    expect(after.status).toBe("submitted");
    expect(after.id).toBe(e.id);
    expect(after.createdAt).toBe(e.createdAt);
  });
});

describe("patchFromLookup", () => {
  it("returns null when the transaction wasn't found", () => {
    expect(patchFromLookup({}, { found: false }, 1)).toBeNull();
  });

  it("marks an unsubmitted row as submitted externally", () => {
    expect(
      patchFromLookup({}, { found: true, validated: true, engineResult: "tesSUCCESS" }, 20),
    ).toEqual({
      status: "submitted",
      submitVia: "external",
      submittedAt: 20,
      engineResult: "tesSUCCESS",
      validated: true,
    });
  });

  it("keeps the original route and time when already known", () => {
    const patch = patchFromLookup(
      { submitVia: "xrpljs", submittedAt: 5 },
      { found: true, validated: true },
      99,
    );
    expect(patch).toMatchObject({ submitVia: "xrpljs", submittedAt: 5, validated: true });
    expect("engineResult" in (patch ?? {})).toBe(false);
  });
});

describe("restore", () => {
  const autofilled: TxJson = {
    ...built,
    Fee: "12",
    Sequence: 7,
    LastLedgerSequence: 99,
    SigningPubKey: "ED00",
    TxnSignature: "AA",
  };

  it("strips every autofilled field and keeps the rest", () => {
    const out = stripForRestore(autofilled);
    for (const f of AUTOFILLED_FIELDS) expect(out).not.toHaveProperty(f);
    expect(out).toMatchObject({
      TransactionType: "Payment",
      Destination: built.Destination,
      Amount: "5000000",
    });
    expect(autofilled.Fee).toBe("12"); // input is not mutated
  });

  it("repopulates a Payment form with the right type and fields", () => {
    const e = entry({ tx: autofilled });
    const plan = prepareRestore(e, { networkId: "testnet", mainnetOk: false, address: wallet.address });
    const r = valuesFromTx(JSON.parse(plan.text));
    expect(r?.schema.type).toBe("Payment");
    expect(r?.values.Destination).toBe(built.Destination);
    // Form values rebuild to the same tx without any autofilled fields.
    const rebuilt = buildTx(getSchema("Payment")!, r!.values, "");
    expect(rebuilt).toMatchObject({ Destination: built.Destination, Amount: "5000000" });
    expect(rebuilt).not.toHaveProperty("Fee");
    expect(rebuilt).not.toHaveProperty("Sequence");
  });

  it("repopulates an AccountSet form", () => {
    const tx: TxJson = {
      TransactionType: "AccountSet",
      Account: wallet.address,
      Domain: "6578616D706C652E636F6D",
      Fee: "12",
      Sequence: 3,
      LastLedgerSequence: 50,
    };
    const e = entry({ tx, txType: "AccountSet" });
    const plan = prepareRestore(e, { networkId: "testnet", mainnetOk: false });
    expect(JSON.parse(plan.text)).toEqual({
      TransactionType: "AccountSet",
      Domain: "6578616D706C652E636F6D",
    });
    const r = valuesFromTx(JSON.parse(plan.text));
    expect(r?.schema.type).toBe("AccountSet");
    expect(buildTx(r!.schema, r!.values, "rX")).toMatchObject({
      TransactionType: "AccountSet",
      Account: "rX",
      Domain: "6578616D706C652E636F6D",
    });
  });

  it("restoreText is pretty JSON without Account", () => {
    expect(restoreText(built)).not.toContain("Account");
    expect(restoreText(built)).toContain("\n");
  });

  it("confirms the load and stays on the same network", () => {
    const plan = prepareRestore(entry(), { networkId: "testnet", mainnetOk: false, address: wallet.address });
    expect(plan.switchTo).toBeUndefined();
    expect(plan.notices).toEqual([{ tone: "success", message: "Loaded Payment from history." }]);
  });

  it("switches between test networks", () => {
    const plan = prepareRestore(entry({ network: "devnet" }), {
      networkId: "testnet",
      mainnetOk: false,
    });
    expect(plan.switchTo).toBe("devnet");
  });

  it("does not switch to mainnet unless it is enabled, and says why", () => {
    const e = entry({ network: "mainnet" });
    const blocked = prepareRestore(e, { networkId: "testnet", mainnetOk: false });
    expect(blocked.switchTo).toBeUndefined();
    expect(blocked.notices.some((n) => n.tone === "info" && /mainnet/i.test(n.message))).toBe(true);
    const allowed = prepareRestore(e, { networkId: "testnet", mainnetOk: true });
    expect(allowed.switchTo).toBe("mainnet");
  });

  it("notes when the connected account differs from the original signer", () => {
    const plan = prepareRestore(entry(), {
      networkId: "testnet",
      mainnetOk: false,
      address: "rOther",
    });
    const note = plan.notices.find((n) => n.tone === "info");
    expect(note?.message).toContain("rOther");
    expect(note?.message).toContain(wallet.address);
  });
});

describe("newEntryId", () => {
  it("returns distinct non-empty ids", () => {
    expect(newEntryId()).not.toBe(newEntryId());
    expect(newEntryId().length).toBeGreaterThan(5);
  });
});


const H1 = "A".repeat(64);
const H2 = "B".repeat(64);
const H3 = "C".repeat(64);

describe("normalizeHash", () => {
  it("accepts 64 hex chars in any case and uppercases", () => {
    expect(normalizeHash("ab".repeat(32))).toBe("AB".repeat(32));
    expect(normalizeHash(H1)).toBe(H1);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "ABCDEF", "G".repeat(64), `${H1}0`, H1.slice(1), " " + H1, 42, null, undefined, {}]) {
      expect(normalizeHash(bad)).toBeNull();
    }
  });

  it("rejects URL and path tricks", () => {
    expect(normalizeHash(`../${H1.slice(3)}`)).toBeNull();
    expect(normalizeHash(`${H1.slice(0, 60)}?x=1`)).toBeNull();
  });
});

describe("findEntryIndex / rekeyEntry", () => {
  const rows = [
    { id: "a", hash: H1, previousHashes: undefined },
    { id: "b", hash: H2, previousHashes: [H3] },
  ];

  it("finds by id, by hash, and by a previous hash", () => {
    expect(findEntryIndex(rows, { id: "b" })).toBe(1);
    expect(findEntryIndex(rows, { hash: H1 })).toBe(0);
    expect(findEntryIndex(rows, { hash: H3 })).toBe(1);
    expect(findEntryIndex(rows, { prevHash: H3 })).toBe(1);
  });

  it("matches case-insensitively and returns -1 when nothing matches", () => {
    expect(findEntryIndex(rows, { hash: H1.toLowerCase() })).toBe(0);
    expect(findEntryIndex(rows, { hash: "D".repeat(64) })).toBe(-1);
    expect(findEntryIndex(rows, {})).toBe(-1);
  });

  it("prefers the id over a hash that points elsewhere", () => {
    expect(findEntryIndex(rows, { id: "a", hash: H2 })).toBe(0);
  });

  it("rekeyEntry moves the old hash into previousHashes", () => {
    const r = rekeyEntry({ hash: H1, previousHashes: [H3] }, H2);
    expect(r.hash).toBe(H2);
    expect(r.previousHashes).toEqual([H1, H3]);
  });

  it("rekeyEntry ignores invalid or unchanged hashes", () => {
    const base = { hash: H1, previousHashes: undefined };
    expect(rekeyEntry(base, "nope")).toBe(base);
    expect(rekeyEntry(base, H1)).toBe(base);
  });

  it("rekeyEntry back to an earlier hash does not list the current hash twice", () => {
    const r = rekeyEntry({ hash: H2, previousHashes: [H1] }, H1);
    expect(r.hash).toBe(H1);
    expect(r.previousHashes).toEqual([H2]);
  });
});

describe("engineCodeFromError", () => {
  it("reads structured rippled data", () => {
    expect(engineCodeFromError({ data: { engine_result: "tefMAX_LEDGER" } })).toBe("tefMAX_LEDGER");
    expect(engineCodeFromError({ data: { result: { engine_result: "temBAD_FEE" } } })).toBe("temBAD_FEE");
    expect(engineCodeFromError({ engine_result: "tecUNFUNDED_PAYMENT" })).toBe("tecUNFUNDED_PAYMENT");
  });

  it("falls back to the message text", () => {
    expect(engineCodeFromError(new Error("Transaction failed: tecNO_DST_INSUF_XRP"))).toBe(
      "tecNO_DST_INSUF_XRP",
    );
    expect(engineCodeFromError(new Error("submit failed (terQUEUED), retry"))).toBe("terQUEUED");
  });

  it("looks through error causes", () => {
    const e = new Error("wrapper", { cause: new Error("temMALFORMED") });
    expect(engineCodeFromError(e)).toBe("temMALFORMED");
  });

  it("returns undefined for tesSUCCESS, plain words and non-errors", () => {
    expect(engineCodeFromError(new Error("terminal failure"))).toBeUndefined();
    expect(engineCodeFromError(new Error("network timeout"))).toBeUndefined();
    expect(engineCodeFromError({ engine_result: "tesSUCCESS" })).toBeUndefined();
    expect(engineCodeFromError(null)).toBeUndefined();
    expect(engineCodeFromError(undefined)).toBeUndefined();
    expect(engineCodeFromError(42)).toBeUndefined();
  });

  it("survives circular structures", () => {
    const a: Record<string, unknown> = {};
    a.data = a;
    expect(engineCodeFromError(a)).toBeUndefined();
  });
});

describe("canCheckOnChain", () => {
  it("is offered for signed rows and for failed rows with no result", () => {
    expect(canCheckOnChain({ status: "signed" })).toBe(true);
    expect(canCheckOnChain({ status: "failed" })).toBe(true);
  });

  it("is not offered once the outcome is known", () => {
    expect(canCheckOnChain({ status: "failed", engineResult: "tefMAX_LEDGER" })).toBe(false);
    expect(canCheckOnChain({ status: "submitted" })).toBe(false);
  });
});

describe("failure and lookup patches", () => {
  it("patchFromSubmitFailure records an engine code when given one", () => {
    expect(patchFromSubmitFailure("xrpljs", 5, "tefMAX_LEDGER")).toEqual({
      status: "failed",
      submitVia: "xrpljs",
      submittedAt: 5,
      engineResult: "tefMAX_LEDGER",
    });
    expect(patchFromSubmitFailure("wallet", 5)).not.toHaveProperty("engineResult");
  });

  it("a failed row that turns up on-chain becomes submitted with its result", () => {
    const failed = { submitVia: "xrpljs" as const, submittedAt: 5 };
    expect(patchFromLookup(failed, { found: true, validated: true, engineResult: "tesSUCCESS" }, 99)).toEqual({
      status: "submitted",
      submitVia: "xrpljs",
      submittedAt: 5,
      engineResult: "tesSUCCESS",
      validated: true,
    });
  });
});
