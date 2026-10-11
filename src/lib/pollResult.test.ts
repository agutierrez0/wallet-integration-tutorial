import { describe, expect, it, vi } from "vitest";
import { pollTxResult } from "./pollResult";
import type { LookupResult } from "./history";
import type { NetworkId } from "./networks";

const noSleep = () => Promise.resolve();

describe("pollTxResult", () => {
  it("stops as soon as the tx is validated", async () => {
    const lookup = vi
      .fn<(n: NetworkId, h: string) => Promise<LookupResult>>()
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, validated: true, engineResult: "tesSUCCESS" });
    const r = await pollTxResult("testnet", "AB", { lookup, sleep: noSleep });
    expect(r).toEqual({ found: true, validated: true, engineResult: "tesSUCCESS" });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempts and returns the last result", async () => {
    const lookup = vi.fn().mockResolvedValue({ found: false });
    const r = await pollTxResult("testnet", "AB", { lookup, attempts: 3, sleep: noSleep });
    expect(r.found).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it("keeps polling a found-but-unvalidated tx and returns it if it never validates", async () => {
    const lookup = vi.fn().mockResolvedValue({ found: true, validated: false, engineResult: "tesSUCCESS" });
    const r = await pollTxResult("testnet", "AB", { lookup, attempts: 2, sleep: noSleep });
    expect(r).toMatchObject({ found: true, validated: false });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("treats lookup errors as not found yet", async () => {
    const lookup = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce({ found: true, validated: true, engineResult: "tecNO_DST" });
    const r = await pollTxResult("testnet", "AB", { lookup, sleep: noSleep });
    expect(r.engineResult).toBe("tecNO_DST");
  });

  it("backs off with the given delays and repeats the last", async () => {
    const lookup = vi.fn().mockResolvedValue({ found: false });
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    await pollTxResult("testnet", "AB", { lookup, attempts: 4, delaysMs: [10, 20], sleep });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20, 20]);
  });

  it("throws when aborted, without further lookups", async () => {
    const ctl = new AbortController();
    const lookup = vi.fn().mockImplementation(async () => {
      ctl.abort();
      return { found: false };
    });
    await expect(
      pollTxResult("testnet", "AB", { lookup, signal: ctl.signal, sleep: noSleep }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
