import { describe, expect, it } from "vitest";
import { Wallet } from "xrpl";
import { compareSignedToBuilt } from "./txCodec";

const wallet = Wallet.fromSeed("sEdTM1uX8pu2do5XvTnutH6HsouMaM2");
const other = Wallet.fromSeed("sEdSKaCy2JT7JaM7v95H9SxkhP9wS2r");

const built = {
  TransactionType: "Payment",
  Account: wallet.address,
  Destination: other.address,
  Amount: "1000000",
  Sequence: 5,
  Fee: "12",
  LastLedgerSequence: 200,
};

const sign = (tx: Record<string, unknown>, w = wallet) => w.sign(tx as never).tx_blob;

describe("compareSignedToBuilt", () => {
  it("accepts a blob that matches what was built", () => {
    const r = compareSignedToBuilt(built, sign(built));
    expect(r.mismatches).toEqual([]);
    expect(r.signerMismatch).toBeNull();
    expect(r.ok).toBe(true);
  });

  it("ignores fields a wallet fills in itself", () => {
    const sent = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: other.address,
      Amount: "1000000",
    };
    const r = compareSignedToBuilt(sent, sign(built));
    expect(r.ok).toBe(true);
  });

  it("flags a changed Destination and Amount", () => {
    const tampered = { ...built, Destination: wallet.address, Amount: "9000000" };
    const r = compareSignedToBuilt(built, sign(tampered));
    expect(r.ok).toBe(false);
    expect(r.mismatches.map((m) => m.field).sort()).toEqual(["Amount", "Destination"]);
    expect(r.mismatches.find((m) => m.field === "Amount")).toMatchObject({
      built: "1000000",
      signed: "9000000",
    });
  });

  it("flags a field the wallet added and one it dropped", () => {
    const withMemo = { ...built, SourceTag: 7 };
    expect(compareSignedToBuilt(built, sign(withMemo)).mismatches).toEqual([
      { field: "SourceTag", built: undefined, signed: 7 },
    ]);
    const asked = { ...built, DestinationTag: 3 };
    expect(compareSignedToBuilt(asked, sign(built)).mismatches.map((m) => m.field)).toEqual([
      "DestinationTag",
    ]);
  });

  it("treats hex case and numeric formatting as equal", () => {
    const a = {
      TransactionType: "AccountSet",
      Account: wallet.address,
      Domain: "6578616d706c652e636f6d",
      TransferRate: 1000000100,
      Sequence: 1,
      Fee: "12",
    };
    const b = { ...a, Domain: "6578616D706C652E636F6D" };
    expect(compareSignedToBuilt(a, sign(b)).ok).toBe(true);
    // the builder may hold a number where the codec returns a string, and vice versa
    const c = { ...built, Amount: 1000000 };
    expect(compareSignedToBuilt(c, sign(built)).ok).toBe(true);
  });

  it("warns when the signing key does not belong to Account", () => {
    // other's key signs a tx claiming to be from wallet
    const spoofed = { ...built, SigningPubKey: other.publicKey };
    const blob = other.sign({ ...built, Account: other.address } as never).tx_blob;
    const r = compareSignedToBuilt({ ...built, Account: other.address }, blob);
    expect(r.signerMismatch).toBeNull();
    expect(spoofed.SigningPubKey).toBe(other.publicKey);

    const mixed = sign({ ...built, Account: wallet.address }, other);
    const r2 = compareSignedToBuilt(built, mixed);
    expect(r2.ok).toBe(false);
    expect(r2.signerMismatch).toEqual({ derived: other.address, account: wallet.address });
  });

  it("reports a blob it cannot decode", () => {
    const r = compareSignedToBuilt(built, "not-hex");
    expect(r.ok).toBe(false);
    expect(r.decodeError).toBeTruthy();
  });
});
