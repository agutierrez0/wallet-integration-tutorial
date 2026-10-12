import { afterEach, describe, expect, it, vi } from "vitest";
import { createXamanAdapter } from "./xaman";
import type { WalletPrompt } from "./types";

const postBody = (n = 0) =>
  JSON.parse(
    (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[1]?.method === "POST",
    )[n][1].body,
  );

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

const ctx = { network: "testnet" } as const;
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

    const session = await a.connect(ctx);

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
    expect(await a.signTransaction({ TransactionType: "AccountSet" }, ctx)).toBe("AABB");
    expect(await a.submitTransaction!({ TransactionType: "AccountSet" }, ctx)).toBe("HASH1");
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
    await expect(adapter().connect(ctx)).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("maps an expired payload to EXPIRED", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "expired" })],
    });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("gives up with EXPIRED when the local deadline passes", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created(-10_000))],
      "DELETE /api/xaman/payload/u-1": [() => new Response(null, { status: 204 })],
    });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({ code: "EXPIRED" });
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

    const pending = a.connect(ctx);
    pending.catch(() => {});
    await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(0));
    expect(await a.cancel!()).toEqual({ cancelled: true });

    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(calls).toContain("DELETE /api/xaman/payload/u-1");
    expect(prompts.at(-1)).toBeNull();
    const getsAfter = calls.filter((c) => c.startsWith("GET")).length;
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.filter((c) => c.startsWith("GET")).length).toBe(getsAfter);
  });

  it("reports an unreachable backend clearly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    await expect(adapter().connect(ctx)).rejects.toMatchObject({
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
    expect((await adapter().connect(ctx)).address).toBe("rOk");

    vi.unstubAllGlobals();
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => Promise.reject(new TypeError("down"))],
    });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("isAvailable reflects the backend health and sets a reason", async () => {
    const a = adapter();
    mockFetch({ "GET /api/health": [() => json({ ok: true })] });
    expect(await a.isAvailable()).toBe(true);
    expect(a.unavailableReason).toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("down"))),
    );
    expect(await a.isAvailable()).toBe(false);
    expect(a.unavailableReason).toBe("backend not running");
  });

  it("requires a network and never creates a payload without one", async () => {
    const calls = mockFetch({});
    await expect(adapter().connect()).rejects.toMatchObject({ code: "UNKNOWN" });
    await expect(
      adapter().signTransaction({ TransactionType: "AccountSet" }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
    });
    expect(calls).toEqual([]);
  });

  it("always sends the network, including for sign-in", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "signed", account: "rA" })],
    });
    await adapter().connect({ network: "devnet" });
    expect(postBody()).toMatchObject({ signIn: true, network: "devnet" });
  });

  it("strips Sequence, Fee and LastLedgerSequence so Xaman fills them when the user approves", async () => {
    mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [
        () => json({ uuid: "u-1", status: "signed", hex: "AA", txid: "H" }),
      ],
    });
    const tx = {
      TransactionType: "Payment",
      Account: "rA",
      Destination: "rB",
      Amount: "1",
      DestinationTag: 7,
      Sequence: 5,
      Fee: "12",
      LastLedgerSequence: 99,
    };
    const a = adapter();
    expect(a.capabilities.walletAutofills).toBe(true);
    await a.signTransaction(tx, ctx);
    await a.submitTransaction!(tx, ctx);
    for (const n of [0, 1]) {
      expect(postBody(n).txjson).toEqual({
        TransactionType: "Payment",
        Account: "rA",
        Destination: "rB",
        Amount: "1",
        DestinationTag: 7,
      });
    }
    expect(tx.Sequence).toBe(5); // the caller's object is not mutated
  });

  it("throws CANCELLED before opening a prompt when the signal is already aborted", async () => {
    const calls = mockFetch({});
    const ac = new AbortController();
    ac.abort();
    await expect(
      adapter().signTransaction(
        { TransactionType: "AccountSet" },
        { network: "testnet", signal: ac.signal },
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(calls).toEqual([]);
  });

  it("aborting the signal mid-prompt withdraws the request and throws CANCELLED", async () => {
    const calls = mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "pending" })],
      "DELETE /api/xaman/payload/u-1": [() => new Response(null, { status: 204 })],
    });
    const a = adapter();
    const prompts: Array<WalletPrompt | null> = [];
    a.setPromptHandler?.((p) => prompts.push(p));
    const ac = new AbortController();

    const pending = a.connect({ network: "testnet", signal: ac.signal });
    pending.catch(() => {});
    await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(0));
    ac.abort();

    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(calls).toContain("DELETE /api/xaman/payload/u-1");
    expect(prompts.at(-1)).toBeNull();
  });

  it("cancel() that Xaman refuses (409) reports it and keeps polling for the real outcome", async () => {
    let approved = false; // the phone user approves only after we tried to cancel
    const calls = mockFetch({
      "POST /api/xaman/payload": [() => json(created())],
      "GET /api/xaman/payload/u-1": [
        () =>
          json(
            approved
              ? { uuid: "u-1", status: "signed", hex: "BEEF" }
              : { uuid: "u-1", status: "opened" },
          ),
      ],
      "DELETE /api/xaman/payload/u-1": [
        () =>
          json(
            { error: { code: "CANNOT_CANCEL", message: "nope", reason: "ALREADY_OPENED" } },
            409,
          ),
      ],
    });
    const a = adapter();
    const prompts: Array<WalletPrompt | null> = [];
    a.setPromptHandler?.((p) => prompts.push(p));

    const pending = a.signTransaction({ TransactionType: "AccountSet" }, ctx);
    await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(0));

    expect(await a.cancel!()).toEqual({ cancelled: false, reason: "ALREADY_OPENED" });
    expect(prompts.at(-1)).not.toBeNull(); // the QR stays up: it is still live on the phone

    approved = true;
    // The original promise still settles with what actually happened on the phone.
    await expect(pending).resolves.toBe("BEEF");
    expect(calls.filter((c) => c.startsWith("DELETE"))).toHaveLength(1);
  });

  it("cancel() with nothing in flight is a no-op success", async () => {
    mockFetch({});
    expect(await adapter().cancel!()).toEqual({ cancelled: true });
  });

  it("a newer request withdraws the older one from the phone", async () => {
    const calls = mockFetch({
      "POST /api/xaman/payload": [() => json(created()), () => json({ ...created(), uuid: "u-2" })],
      "GET /api/xaman/payload/u-1": [() => json({ uuid: "u-1", status: "pending" })],
      "GET /api/xaman/payload/u-2": [
        () => json({ uuid: "u-2", status: "signed", account: "rNew" }),
      ],
      "DELETE /api/xaman/payload/u-1": [() => new Response(null, { status: 204 })],
    });
    const a = adapter();
    const prompts: Array<WalletPrompt | null> = [];
    a.setPromptHandler?.((p) => prompts.push(p));

    const first = a.connect(ctx);
    first.catch(() => {});
    await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(0));

    const second = await a.connect(ctx);

    await expect(first).rejects.toMatchObject({ code: "CANCELLED" });
    expect(second.address).toBe("rNew");
    expect(calls).toContain("DELETE /api/xaman/payload/u-1");
    expect(calls).not.toContain("DELETE /api/xaman/payload/u-2");
    // The old request finishing must not hide the new request's QR.
    expect(prompts.at(-1)).toBeNull(); // cleared once the new one is done, not before
    expect(prompts.filter((p) => p === null)).toHaveLength(1);
  });

  it("explains a server-side mainnet refusal and a forbidden origin separately", async () => {
    mockFetch({
      "POST /api/xaman/payload": [
        () => json({ error: { code: "MAINNET_DISABLED", message: "x" } }, 403),
      ],
    });
    await expect(adapter().connect({ network: "mainnet" })).rejects.toMatchObject({
      code: "UNSUPPORTED",
      message: expect.stringContaining("ALLOW_MAINNET=true"),
    });

    vi.unstubAllGlobals();
    mockFetch({
      "POST /api/xaman/payload": [
        () => json({ error: { code: "FORBIDDEN_ORIGIN", message: "x" } }, 403),
      ],
    });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining("ALLOWED_ORIGIN"),
    });
  });

  it("maps backend errors to readable messages", async () => {
    mockFetch({
      "POST /api/xaman/payload": [
        () => json({ error: { code: "NETWORK_NOT_ALLOWED", message: "x" } }, 400),
      ],
    });
    await expect(adapter().connect({ network: "mainnet" })).rejects.toMatchObject({
      code: "UNSUPPORTED",
      message: expect.stringContaining("ALLOW_MAINNET"),
    });

    vi.unstubAllGlobals();
    mockFetch({
      "POST /api/xaman/payload": [() => json({ error: { code: "RATE_LIMITED" } }, 429)],
    });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({
      message: expect.stringContaining("Too many requests"),
    });

    vi.unstubAllGlobals();
    mockFetch({ "POST /api/xaman/payload": [() => json({ error: { code: "FORBIDDEN" } }, 403)] });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({
      message: expect.stringContaining("ALLOWED_ORIGIN"),
    });

    vi.unstubAllGlobals();
    mockFetch({
      "POST /api/xaman/payload": [() => json({ error: { message: "Bad txjson." } }, 400)],
    });
    await expect(adapter().connect(ctx)).rejects.toMatchObject({ message: "Bad txjson." });
  });
});
