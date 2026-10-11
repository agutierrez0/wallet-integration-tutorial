import { afterEach, describe, expect, it, vi } from "vitest";
import { PROMPT_TIMEOUT_MS, runPrompt } from "./prompt";
import { WalletError } from "./errors";

afterEach(() => vi.useRealTimers());

describe("runPrompt", () => {
  it("resolves with the wallet result", async () => {
    await expect(runPrompt({ wallet: "W", action: "a", run: async () => 42 })).resolves.toBe(42);
  });

  it("throws CANCELLED without calling run when already aborted", async () => {
    const run = vi.fn(async () => 1);
    const ac = new AbortController();
    ac.abort();
    await expect(
      runPrompt({ wallet: "W", action: "a", run, signal: ac.signal }),
    ).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("throws CANCELLED when aborted mid-prompt and ignores the late result", async () => {
    const ac = new AbortController();
    let finish!: (v: string) => void;
    const run = () => new Promise<string>((r) => (finish = r));
    const p = runPrompt({ wallet: "W", action: "a", run, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
    finish("late"); // must not throw or resurrect anything
  });

  it("does not leave an unhandled rejection when run fails after we stopped waiting", async () => {
    const ac = new AbortController();
    let fail!: (e: Error) => void;
    const run = () => new Promise<string>((_, rej) => (fail = rej));
    const p = runPrompt({ wallet: "W", action: "a", run, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
    fail(new Error("late failure"));
    await new Promise((r) => setTimeout(r, 0));
  });

  it("times out with EXPIRED and tells the user it may still be approved", async () => {
    vi.useFakeTimers();
    const p = runPrompt({
      wallet: "GemWallet",
      action: "signing",
      run: () => new Promise(() => {}),
    });
    const assertion = expect(p).rejects.toMatchObject({
      code: "EXPIRED",
      message:
        "Stopped waiting for GemWallet. If you approve it later it may still be submitted — check history or the explorer.",
    });
    await vi.advanceTimersByTimeAsync(PROMPT_TIMEOUT_MS + 1);
    await assertion;
  });

  it("wraps unexpected failures as UNKNOWN but keeps WalletErrors intact", async () => {
    await expect(
      runPrompt({
        wallet: "W",
        action: "signing",
        run: async () => Promise.reject(new Error("boom")),
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN", message: "W: signing failed" });
    await expect(
      runPrompt({
        wallet: "W",
        action: "a",
        run: async () => Promise.reject(new WalletError("REJECTED", "no")),
      }),
    ).rejects.toMatchObject({ code: "REJECTED" });
  });
});
