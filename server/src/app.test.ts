import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createApp, type XamanClient } from "./app.js";
import { loadConfig, type Config } from "./config.js";

const SECRET = "TOP-SECRET-VALUE-123";
const KEY = "API-KEY-VALUE-456";
const UUID = "11111111-2222-4333-8444-555555555555";

const config: Config = {
  apiKey: KEY,
  apiSecret: SECRET,
  port: 3001,
  allowedOrigins: ["http://localhost:3000"],
  trustProxy: false,
  allowMainnet: false,
};

function makeXaman() {
  const payload = {
    create: vi.fn(),
    get: vi.fn(),
    cancel: vi.fn(),
  };
  return { client: { payload } as unknown as XamanClient, payload };
}

function post(app: ReturnType<typeof createApp>, body: unknown, raw = false) {
  return app.request("/api/xaman/payload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const created = {
  uuid: UUID,
  next: { always: "https://xumm.app/sign/abc" },
  refs: { qr_png: "https://xumm.app/sign/abc_q.png" },
};

function payloadFixture(meta: Record<string, unknown>, response: Record<string, unknown> = {}) {
  return {
    meta: {
      exists: true,
      signed: false,
      cancelled: false,
      expired: false,
      resolved: false,
      app_opened: false,
      ...meta,
    },
    payload: { request_json: { Account: "rSECRETREQUESTJSON" } },
    application: { name: "internal-app-name" },
    response: {
      hex: null,
      txid: null,
      account: null,
      environment_nodetype: null,
      ...response,
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("answers through the /api proxy path", async () => {
    const { client } = makeXaman();
    const res = await createApp(config, client).request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("GET /health", () => {
  it("returns ok without calling Xaman", async () => {
    const { client, payload } = makeXaman();
    const res = await createApp(config, client).request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.get).not.toHaveBeenCalled();
  });
});

describe("POST /api/xaman/payload", () => {
  it("creates a sign payload with safe defaults", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    const txjson = { TransactionType: "AccountSet", Account: "rX" };
    const res = await post(createApp(config, client), { txjson, network: "testnet" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      uuid: UUID,
      qrPng: created.refs.qr_png,
      deeplink: created.next.always,
    });
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    const sent = payload.create.mock.calls[0][0];
    expect(sent.txjson).toEqual(txjson);
    expect(sent.options).toEqual({ submit: false, expire: 5, force_network: "TESTNET" });
  });

  it("passes submit and maps network to force_network", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    await post(createApp(config, client), {
      txjson: { TransactionType: "Payment" },
      submit: true,
      network: "testnet",
    });
    expect(payload.create.mock.calls[0][0].options).toEqual({
      submit: true,
      expire: 5,
      force_network: "TESTNET",
    });
  });

  it("builds a SignIn payload and ignores txjson and submit when signIn is true", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    await post(createApp(config, client), {
      signIn: true,
      submit: true,
      network: "testnet",
      txjson: { TransactionType: "Payment", Destination: "rX" },
    });
    const sent = payload.create.mock.calls[0][0];
    expect(sent.txjson).toEqual({ TransactionType: "SignIn" });
    expect(sent.options.submit).toBe(false);
  });

  it.each([
    ["missing txjson", { network: "testnet" }],
    ["txjson without TransactionType", { txjson: { Account: "rX" }, network: "testnet" }],
    ["non-string TransactionType", { txjson: { TransactionType: 5 }, network: "testnet" }],
    ["unknown network", { txjson: { TransactionType: "Payment" }, network: "stagenet" }],
    ["missing network", { txjson: { TransactionType: "Payment" } }],
    ["missing network on signIn", { signIn: true }],
    ["non-boolean submit", { txjson: { TransactionType: "Payment" }, submit: "yes", network: "testnet" }],
  ])("rejects %s with 400", async (_name, body) => {
    const { client, payload } = makeXaman();
    const res = await post(createApp(config, client), body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const { client } = makeXaman();
    const res = await post(createApp(config, client), "{not json", true);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });

  it("rejects bodies over 16kb with 413", async () => {
    const { client, payload } = makeXaman();
    const big = {
      network: "testnet",
      txjson: { TransactionType: "Payment", Memo: "x".repeat(17 * 1024) },
    };
    const res = await post(createApp(config, client), big);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("BODY_TOO_LARGE");
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("returns 502 when Xaman returns nothing", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(null);
    const res = await post(createApp(config, client), { signIn: true, network: "testnet" });
    expect(res.status).toBe(502);
  });
});

describe("GET /api/xaman/payload/:uuid status mapping", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["pending", {}, "pending"],
    ["opened", { app_opened: true }, "opened"],
    ["signed", { signed: true, resolved: true }, "signed"],
    ["rejected (resolved, unsigned)", { resolved: true }, "rejected"],
    ["expired", { expired: true }, "expired"],
    ["cancelled", { cancelled: true }, "cancelled"],
  ];

  it.each(cases)("maps %s", async (_n, meta, expected) => {
    const { client, payload } = makeXaman();
    payload.get.mockResolvedValue(payloadFixture(meta));
    const res = await createApp(config, client).request(`/api/xaman/payload/${UUID}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uuid: UUID, status: expected });
  });

  it("includes account, hex, txid and network only when signed", async () => {
    const { client, payload } = makeXaman();
    payload.get.mockResolvedValue(
      payloadFixture(
        { signed: true, resolved: true },
        { account: "rABC", hex: "DEADBEEF", txid: "TXID1", environment_nodetype: "TESTNET" },
      ),
    );
    const res = await createApp(config, client).request(`/api/xaman/payload/${UUID}`);
    expect(await res.json()).toEqual({
      uuid: UUID,
      status: "signed",
      account: "rABC",
      hex: "DEADBEEF",
      txid: "TXID1",
      network: "testnet",
    });
  });

  it("does not forward request_json or application details", async () => {
    const { client, payload } = makeXaman();
    payload.get.mockResolvedValue(payloadFixture({ signed: true }, { hex: "AA" }));
    const text = await (await createApp(config, client).request(`/api/xaman/payload/${UUID}`)).text();
    expect(text).not.toContain("rSECRETREQUESTJSON");
    expect(text).not.toContain("internal-app-name");
  });

  it("rejects a malformed uuid with 400 before calling Xaman", async () => {
    const { client, payload } = makeXaman();
    const res = await createApp(config, client).request("/api/xaman/payload/not-a-uuid");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_UUID");
    expect(payload.get).not.toHaveBeenCalled();
  });

  it("returns 404 when Xaman has no such payload", async () => {
    const { client, payload } = makeXaman();
    payload.get.mockResolvedValue(null);
    expect((await createApp(config, client).request(`/api/xaman/payload/${UUID}`)).status).toBe(404);
    payload.get.mockResolvedValue(payloadFixture({ exists: false }));
    expect((await createApp(config, client).request(`/api/xaman/payload/${UUID}`)).status).toBe(404);
  });
});

describe("DELETE /api/xaman/payload/:uuid", () => {
  it("cancels and returns 204", async () => {
    const { client, payload } = makeXaman();
    payload.cancel.mockResolvedValue({ result: { cancelled: true, reason: "OK" } });
    const res = await createApp(config, client).request(`/api/xaman/payload/${UUID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(payload.cancel).toHaveBeenCalledWith(UUID, true);
  });

  it.each(["ALREADY_OPENED", "ALREADY_RESOLVED", "ALREADY_CANCELLED"])(
    "returns 409 CANNOT_CANCEL with the reason when Xaman could not cancel (%s)",
    async (reason) => {
      const { client, payload } = makeXaman();
      payload.cancel.mockResolvedValue({ result: { cancelled: false, reason } });
      const res = await createApp(config, client).request(`/api/xaman/payload/${UUID}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatchObject({ code: "CANNOT_CANCEL", reason });
    },
  );

  it("never echoes an unexpected cancel reason", async () => {
    const { client, payload } = makeXaman();
    payload.cancel.mockResolvedValue({ result: { cancelled: false, reason: `leak ${SECRET}` } });
    const res = await createApp(config, client).request(`/api/xaman/payload/${UUID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.reason).toBe("UNKNOWN");
  });

  it("validates uuid and handles missing payloads", async () => {
    const { client, payload } = makeXaman();
    const app = createApp(config, client);
    expect((await app.request("/api/xaman/payload/nope", { method: "DELETE" })).status).toBe(400);
    payload.cancel.mockResolvedValue(null);
    expect((await app.request(`/api/xaman/payload/${UUID}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("secrets and upstream errors", () => {
  it("never leaks upstream error text, keys or the secret in responses, headers or logs", async () => {
    const { client, payload } = makeXaman();
    const leaky = new Error(`upstream said key=${KEY} secret=${SECRET}`);
    payload.create.mockRejectedValue(leaky);
    payload.get.mockRejectedValue(leaky);
    payload.cancel.mockRejectedValue(leaky);
    const app = createApp(config, client);

    const responses = [
      await post(app, { signIn: true, network: "testnet" }),
      await app.request(`/api/xaman/payload/${UUID}`),
      await app.request(`/api/xaman/payload/${UUID}`, { method: "DELETE" }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(502);
      const dump = JSON.stringify([...res.headers.entries()]) + (await res.text());
      expect(dump).not.toContain(SECRET);
      expect(dump).not.toContain(KEY);
      expect(dump).toContain("UPSTREAM_ERROR");
    }
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(KEY);
  });

  it("keeps secrets out of successful responses too", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    const res = await post(createApp(config, client), { signIn: true, network: "testnet" });
    const dump = JSON.stringify([...res.headers.entries()]) + (await res.text());
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain(KEY);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const { client } = makeXaman();
    const res = await createApp(config, client).request("/api/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("CORS, headers and rate limiting", () => {
  it("allows only listed origins", async () => {
    const { client } = makeXaman();
    const app = createApp(config, client);
    const ok = await app.request("/api/xaman/payload/nope", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const bad = await app.request("/api/xaman/payload/nope", {
      headers: { Origin: "https://evil.example" },
    });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sets security headers", async () => {
    const { client } = makeXaman();
    const res = await createApp(config, client).request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBeTruthy();
  });
});

describe("loadConfig", () => {
  it("parses a valid env with defaults", () => {
    const c = loadConfig({ XAMAN_API_KEY: "k", XAMAN_API_SECRET: "s" });
    expect(c).toMatchObject({
      port: 3001,
      allowedOrigins: ["http://localhost:3000"],
      trustProxy: false,
      allowMainnet: false,
    });
  });

  it("parses ALLOW_MAINNET", () => {
    const base = { XAMAN_API_KEY: "k", XAMAN_API_SECRET: "s" };
    expect(loadConfig({ ...base, ALLOW_MAINNET: "true" }).allowMainnet).toBe(true);
    expect(loadConfig({ ...base, ALLOW_MAINNET: "false" }).allowMainnet).toBe(false);
    expect(() => loadConfig({ ...base, ALLOW_MAINNET: "yes" })).toThrow(/ALLOW_MAINNET/);
  });

  it("splits ALLOWED_ORIGIN on commas", () => {
    const c = loadConfig({
      XAMAN_API_KEY: "k",
      XAMAN_API_SECRET: "s",
      ALLOWED_ORIGIN: "https://a.example, https://b.example",
      TRUST_PROXY: "true",
    });
    expect(c.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(c.trustProxy).toBe(true);
  });

  it("fails fast naming the missing variables without echoing values", () => {
    expect(() => loadConfig({ XAMAN_API_KEY: "" })).toThrow(/XAMAN_API_KEY.*XAMAN_API_SECRET/);
    try {
      loadConfig({ XAMAN_API_KEY: "k", XAMAN_API_SECRET: "super-secret-xyz", PORT: "abc" });
    } catch (e) {
      expect(String(e)).toContain("PORT");
      expect(String(e)).not.toContain("super-secret-xyz");
    }
  });
});

describe("mainnet gate", () => {
  const mainnetBody = { txjson: { TransactionType: "Payment" }, network: "mainnet" };

  it("refuses mainnet by default and never calls Xaman", async () => {
    const { client, payload } = makeXaman();
    const res = await post(createApp(config, client), mainnetBody);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("MAINNET_DISABLED");
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses a mainnet SignIn too", async () => {
    const { client, payload } = makeXaman();
    const res = await post(createApp(config, client), { signIn: true, network: "mainnet" });
    expect(res.status).toBe(403);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("allows mainnet only when ALLOW_MAINNET is on, and forces MAINNET", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    const res = await post(createApp({ ...config, allowMainnet: true }, client), mainnetBody);
    expect(res.status).toBe(200);
    expect(payload.create.mock.calls[0][0].options.force_network).toBe("MAINNET");
  });

  it("always forces the requested test network", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    const app = createApp(config, client);
    await post(app, { signIn: true, network: "devnet" });
    expect(payload.create.mock.calls[0][0].options.force_network).toBe("DEVNET");
  });
});

describe("origin protection (defense in depth)", () => {
  const body = JSON.stringify({ signIn: true, network: "testnet" });
  const send = (app: ReturnType<typeof createApp>, headers: Record<string, string>) =>
    app.request("/api/xaman/payload", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

  it("rejects POST from a disallowed Origin before touching Xaman", async () => {
    const { client, payload } = makeXaman();
    const res = await send(createApp(config, client), { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN_ORIGIN");
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("rejects DELETE from a disallowed Origin", async () => {
    const { client, payload } = makeXaman();
    const res = await createApp(config, client).request(`/api/xaman/payload/${UUID}`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect(payload.cancel).not.toHaveBeenCalled();
  });

  it("rejects Sec-Fetch-Site: cross-site when no Origin is sent", async () => {
    const { client, payload } = makeXaman();
    const res = await send(createApp(config, client), { "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("allows listed Origins, same-origin fetches and header-less non-browser clients", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    const app = createApp(config, client);
    expect((await send(app, { Origin: "http://localhost:3000" })).status).toBe(200);
    expect((await send(app, { "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
    expect((await send(app, {})).status).toBe(200);
  });

  it("does not restrict health or GET reads", async () => {
    const { client } = makeXaman();
    const app = createApp(config, client);
    const h = { Origin: "https://evil.example" };
    expect((await app.request("/health", { headers: h })).status).toBe(200);
    expect((await app.request("/api/health", { headers: h })).status).toBe(200);
    expect((await app.request("/api/xaman/payload/nope", { headers: h })).status).toBe(400);
  });
});

describe("rate limiting tiers and client identity", () => {
  const postBody = { signIn: true, network: "testnet" };

  it("allows 240 polling GETs per minute, then 429", async () => {
    const { client } = makeXaman();
    const app = createApp(config, client);
    let status = 0;
    for (let i = 0; i < 240; i++) status = (await app.request("/api/xaman/payload/nope")).status;
    expect(status).toBe(400);
    expect((await app.request("/api/xaman/payload/nope")).status).toBe(429);
  });

  it("limits creates to 20 per minute, independent of the polling budget", async () => {
    const { client, payload } = makeXaman();
    payload.create.mockResolvedValue(created);
    const app = createApp(config, client);
    for (let i = 0; i < 20; i++) expect((await post(app, postBody)).status).toBe(200);
    const blocked = await post(app, postBody);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    // polling is a separate bucket and still works
    expect((await app.request("/api/xaman/payload/nope")).status).toBe(400);
  });

  it("limits cancels to 10 per minute", async () => {
    const { client, payload } = makeXaman();
    payload.cancel.mockResolvedValue({ result: { cancelled: true, reason: "OK" } });
    const app = createApp(config, client);
    const del = () => app.request(`/api/xaman/payload/${UUID}`, { method: "DELETE" });
    for (let i = 0; i < 10; i++) expect((await del()).status).toBe(204);
    expect((await del()).status).toBe(429);
  });

  it("never rate limits health checks or CORS preflights", async () => {
    const { client } = makeXaman();
    const app = createApp(config, client);
    for (let i = 0; i < 300; i++) {
      expect((await app.request("/health")).status).toBe(200);
      expect((await app.request("/api/health")).status).toBe(200);
    }
    for (let i = 0; i < 300; i++) {
      const res = await app.request("/api/xaman/payload", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST" },
      });
      expect(res.status).toBeLessThan(300);
    }
  });

  it("ignores X-Forwarded-For and X-Real-IP entirely unless TRUST_PROXY is on", async () => {
    const { client } = makeXaman();
    const app = createApp(config, client);
    for (let i = 0; i < 240; i++) {
      await app.request("/api/xaman/payload/nope", { headers: { "x-forwarded-for": `9.9.9.${i}` } });
    }
    const res = await app.request("/api/xaman/payload/nope", {
      headers: { "x-forwarded-for": "8.8.8.8", "x-real-ip": "7.7.7.7" },
    });
    expect(res.status).toBe(429);
  });

  it("with TRUST_PROXY, a spoofed left-most X-Forwarded-For cannot evade the limit", async () => {
    const { client } = makeXaman();
    const app = createApp({ ...config, trustProxy: true }, client);
    // nginx appended the real hop (5.5.5.5) on the right; the client rotates fake left-most values
    for (let i = 0; i < 240; i++) {
      await app.request("/api/xaman/payload/nope", {
        headers: { "x-forwarded-for": `1.2.3.${i}, 5.5.5.5` },
      });
    }
    const res = await app.request("/api/xaman/payload/nope", {
      headers: { "x-forwarded-for": "6.6.6.6, 5.5.5.5" },
    });
    expect(res.status).toBe(429);
  });

  it("with TRUST_PROXY, X-Real-IP wins and different real clients get separate budgets", async () => {
    const { client } = makeXaman();
    const app = createApp({ ...config, trustProxy: true }, client);
    for (let i = 0; i < 240; i++) {
      await app.request("/api/xaman/payload/nope", {
        headers: { "x-real-ip": "5.5.5.5", "x-forwarded-for": `1.1.1.${i}` },
      });
    }
    expect(
      (await app.request("/api/xaman/payload/nope", { headers: { "x-real-ip": "5.5.5.5" } })).status,
    ).toBe(429);
    expect(
      (await app.request("/api/xaman/payload/nope", { headers: { "x-real-ip": "6.6.6.6" } })).status,
    ).toBe(400);
  });
});
