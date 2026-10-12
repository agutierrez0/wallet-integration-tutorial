import { beforeAll, describe, expect, it } from "vitest";
import { NotConnectedError, RippledError, TimeoutError, ValidationError } from "xrpl";
import { WalletError } from "../wallets/errors";
import { isCancelled, toUserError } from "./errors";
import { explainResult } from "./resultCodes";
import { loadXrpl } from "./xrplLoader";

// toUserError recognises xrpl errors through the lazily loaded library.
beforeAll(() => loadXrpl());

describe("explainResult", () => {
  it("explains known codes", () => {
    expect(explainResult("tesSUCCESS").category).toBe("success");
    expect(explainResult("tecNO_DST").title).toMatch(/destination/i);
    expect(explainResult("tefMAX_LEDGER").category).toBe("failed");
    expect(explainResult("terQUEUED").category).toBe("retry");
    expect(explainResult("telINSUF_FEE_P").category).toBe("retry");
  });

  it("falls back by prefix for unlisted codes", () => {
    const r = explainResult("tecDIR_FULL");
    expect(r.category).toBe("failed");
    expect(r.explanation).toContain("tecDIR_FULL");
    expect(explainResult("temINVALID_FLAG").category).toBe("failed");
    expect(explainResult("terNO_ACCOUNT").category).toBe("retry");
  });

  it("returns unknown for unrecognized codes", () => {
    const r = explainResult("xyzNOPE");
    expect(r.category).toBe("unknown");
    expect(r.explanation).toContain("xyzNOPE");
  });
});

describe("toUserError", () => {
  it("maps each WalletError code", () => {
    const codes = ["NOT_INSTALLED", "REJECTED", "EXPIRED", "LOCKED", "UNSUPPORTED"] as const;
    const out = codes.map((c) => toUserError(new WalletError(c, "msg")));
    expect(out.every((u) => u.kind === "wallet")).toBe(true);
    expect(out[1].retryable).toBe(true);
    expect(out[4].retryable).toBe(false);
    expect(new Set(out.map((u) => u.title)).size).toBe(5);
  });

  it("treats actNotFound as an unfunded account", () => {
    const u = toUserError(new RippledError("Account not found.", { error: "actNotFound" }));
    expect(u.kind).toBe("ledger");
    expect(u.title).toMatch(/not funded/i);
    expect(u.hint).toMatch(/faucet/i);
  });

  it("maps other rippled errors to ledger errors", () => {
    const u = toUserError(new RippledError("bad", { error: "invalidParams" }));
    expect(u.kind).toBe("ledger");
    expect(u.message).toContain("invalidParams");
  });

  it("maps connection errors to retryable network errors", () => {
    expect(toUserError(new NotConnectedError()).retryable).toBe(true);
    expect(toUserError(new TimeoutError("slow")).kind).toBe("network");
    expect(toUserError(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("maps JSON syntax errors and validation errors to input", () => {
    let parseErr: unknown;
    try {
      JSON.parse("{nope");
    } catch (e) {
      parseErr = e;
    }
    expect(toUserError(parseErr).kind).toBe("input");
    expect(toUserError(new ValidationError("bad field")).kind).toBe("input");
  });

  it("falls back to the message", () => {
    expect(toUserError(new Error("boom")).message).toBe("boom");
    expect(toUserError("plain string").message).toBe("plain string");
    expect(toUserError(42).kind).toBe("unknown");
  });
});

describe("CANCELLED", () => {
  it("is friendly, retryable and detectable", () => {
    const e = new WalletError("CANCELLED", "stopped");
    const u = toUserError(e);
    expect(u.title).toBe("Cancelled");
    expect(u.retryable).toBe(true);
    expect(isCancelled(e)).toBe(true);
    expect(isCancelled(new WalletError("REJECTED", "no"))).toBe(false);
    expect(isCancelled(new Error("CANCELLED"))).toBe(false);
  });
});
