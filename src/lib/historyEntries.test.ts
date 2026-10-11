import { Wallet } from "xrpl";
import { describe, expect, it } from "vitest";
import {
  AUTOFILLED_FIELDS,
  entryFromSigned,
  newEntryId,
  patchFromLookup,
  patchFromSubmitFailure,
  patchFromWalletSubmit,
  patchFromXrplJsSubmit,
  prepareRestore,
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
    expect(patchFromWalletSubmit(e, "ABCDEF", 9).hash).toBe("ABCDEF");
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
