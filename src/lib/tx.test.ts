import { describe, expect, it } from "vitest";
import { Wallet } from "xrpl";
import {
  curlFor,
  hashOfBlob,
  isSignatureValid,
  parseTx,
  rpcSubmitBody,
  rpcTxBody,
} from "./tx";
import { NETWORKS } from "./networks";

// Fully specified tx, so signing needs no network.
const wallet = Wallet.fromSeed("sEdTM1uX8pu2do5XvTnutH6HsouMaM2");
const signed = wallet.sign({
  TransactionType: "AccountSet",
  Account: wallet.address,
  Domain: "6578616D706C652E636F6D",
  Sequence: 1,
  Fee: "12",
  LastLedgerSequence: 100,
});

describe("parseTx", () => {
  it("injects Account when missing", () => {
    const tx = parseTx('{"TransactionType":"AccountSet"}', "rABC");
    expect(tx.Account).toBe("rABC");
  });

  it("keeps an explicit Account", () => {
    const tx = parseTx('{"TransactionType":"AccountSet","Account":"rXYZ"}', "rABC");
    expect(tx.Account).toBe("rXYZ");
  });

  it("requires TransactionType", () => {
    expect(() => parseTx("{}", "rABC")).toThrow(/TransactionType/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseTx("not json", "rABC")).toThrow();
  });
});

describe("hashOfBlob", () => {
  it("is deterministic and matches the hash from signing", () => {
    expect(hashOfBlob(signed.tx_blob)).toBe(signed.hash);
    expect(hashOfBlob(signed.tx_blob)).toBe(hashOfBlob(signed.tx_blob));
  });
});

describe("isSignatureValid", () => {
  it("accepts a good blob", () => {
    expect(isSignatureValid(signed.tx_blob)).toBe(true);
  });

  it("rejects a tampered blob", () => {
    // Flip a nibble in the middle of the blob (Domain/Fee area, not the signature).
    const i = 20;
    const flipped = signed.tx_blob[i] === "0" ? "1" : "0";
    const tampered = signed.tx_blob.slice(0, i) + flipped + signed.tx_blob.slice(i + 1);
    expect(isSignatureValid(tampered)).toBe(false);
  });

  it("returns false for garbage", () => {
    expect(isSignatureValid("ZZZZ")).toBe(false);
  });
});

describe("rpc request bodies", () => {
  it("builds the submit body", () => {
    expect(rpcSubmitBody("ABCD")).toEqual({
      method: "submit",
      params: [{ tx_blob: "ABCD" }],
    });
  });

  it("builds the tx lookup body", () => {
    expect(rpcTxBody("HASH")).toEqual({
      method: "tx",
      params: [{ transaction: "HASH" }],
    });
  });
});

describe("curlFor", () => {
  it("targets the network's rpc URL and includes the body", () => {
    const body = rpcSubmitBody("ABCD");
    const cmd = curlFor(NETWORKS.testnet, body);
    expect(cmd).toContain(NETWORKS.testnet.rpc);
    expect(cmd).toContain(JSON.stringify(body));
  });
});
