import { afterEach, describe, expect, it, vi } from "vitest";
import { createXamanAdapter } from "./xaman";
import { WalletError } from "./errors";
import type { WalletPrompt } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const created = (expiresInMs = 60_000) => ({
  uuid: "u-1",
  qrPng: "https://example.test/qr.png",
  deeplink: "xumm://payload/u-1",
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
});

// Routes mocked responses by "METHOD path"; each entry is consumed in order, the last repeats.
function mockFetch(routes: Record<string, Array<() => Response | Promise<Response>>>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    calls.push(key);
    const queue = routes[key];
    if (!queue) throw new Error(`unmocked ${key}`);
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return next();
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const adapter = () => createXamanAdapter({ baseUrl: "/api", pollMs: 1, maxPollFailures: 2 });

afterEach(() => vi.unstubAllGlobals());

describe("xaman adapter", () => {
  it("connects once the sign-in payload is signed, and shows then clears the QR prompt", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [
        () => json({ uuid: "u-1", status: "pending" }),
        () => json({ uuid: "u-1", status: "opened" }),
        () => json({ uuid: "u-1", status: "signed", account: "rTest", network: "TESTNET" }),
      ],
    });
    const a = adapter();
    const prompts: Array<WalletPrompt | null> = [];
    a.setPromptHandler?.((p) => prompts.push(p));

    const session = await a.connect({ network: "testnet" });

    expect(session).toEqual({ address: "rTest", networkHint: "TESTNET" });
    expect(prompts[0]?.qrPng).toBe("https://example.test/qr.png");
    expect(prompts[0]?.deeplink).toBe("xumm://payload/u-1");
    expect(prompts.at(-1)).toBeNull();
  });

  it("returns the signed blob for sign-only and the hash for submit", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [
        () => json({ uuid: "u-1", status: "signed", hex: "AABB", txid: "HASH1" }),
      ],
    });
    const a = adapter();
    expect(await a.signTransaction({ TransactionType: "AccountSet" })).toBe("AABB");
    expect(await a.submitTransaction!({ TransactionType: "AccountSet" })).toBe("HASH1");
  });

  it("sends submit:false for signTransaction and the selected network", async () => {
    const calls = mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "signed", hex: "AA" })],
    });
    await adapter().signTransaction({ TransactionType: "AccountSet" }, { network: "devnet" });
    const post = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[1]?.method === "POST",
    )!;
    expect(JSON.parse(post[1].body)).toMatchObject({ submit: false, network: "devnet" });
    expect(calls[0]).toBe("POST /api/xaman/payload");
  });

  it("maps a rejected payload to REJECTED", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "rejected" })],
    });
    await expect(adapter().connect()).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("maps an expired payload to EXPIRED", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "expired" })],
    });
    await expect(adapter().connect()).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("gives up with EXPIRED when the local deadline passes", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created(-10_000))],
      "DELETE /api/xaman/payload/u-1": [() => new Response(null, { status: 204 })],
    });
    await expect(adapter().connect()).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("cancel() stops polling, deletes the payload and clears the prompt", async () => {
    const calls = mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "pending" })],
      "DELETE /api/xaman/payload/u-1": [() => new Response(null, { status: 204 })],
    });
    const a = adapter();
    const prompts: Array<WalletPrompt | null> = [];
    a.setPromptHandler?.((p) => prompts.push(p));

    const pending = a.connect();
    pending.catch(() => {});
    await vi.waitFor(() => expect(prompts[0]).not.toBeNull());
    a.cancel!();

    await expect(pending).rejects.toBeInstanceOf(WalletError);
    expect(calls).toContain("DELETE /api/xaman/payload/u-1");
    expect(prompts.at(-1)).toBeNull();
    const getsAfter = calls.filter((c) => c.startsWith("GET")).length;
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.filter((c) => c.startsWith("GET")).length).toBe(getsAfter);
  });

  it("reports an unreachable backend clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(adapter().connect()).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining("signing backend"),
    });
  });

  it("tolerates a transient poll failure but gives up after repeated ones", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [
        () => Promise.reject(new TypeError("blip")),
        () => json({ uuid: "u-1", status: "signed", account: "rOk" }),
      ],
    });
    expect((await adapter().connect()).address).toBe("rOk");

    vi.unstubAllGlobals();
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => Promise.reject(new TypeError("down"))],
    });
    await expect(adapter().connect()).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("isAvailable reflects the backend health and sets a reason", async () => {
    const a = adapter();
    mockFetch({ "GET /api/health": [() => json({ ok: true })] });
    expect(await a.isAvailable()).toBe(true);
    expect(a.unavailableReason).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("down"))));
    expect(await a.isAvailable()).toBe(false);
    expect(a.unavailableReason).toBe("backend not running");
  });
});
