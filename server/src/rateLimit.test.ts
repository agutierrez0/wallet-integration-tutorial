import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "./rateLimit.js";

function appWith(opts: { limit?: number; maxKeys?: number; windowMs?: number }) {
  const app = new Hono();
  app.use(
    "*",
    rateLimit({
      limit: opts.limit ?? 2,
      windowMs: opts.windowMs ?? 1000,
      maxKeys: opts.maxKeys,
      getKey: (c) => c.req.header("x-key") ?? "none",
    }),
  );
  app.get("/", (c) => c.text("ok"));
  return app;
}
const hit = (app: Hono, key: string) => app.request("/", { headers: { "x-key": key } });

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts per key and resets after the window", async () => {
    const app = appWith({ limit: 2, windowMs: 1000 });
    expect((await hit(app, "a")).status).toBe(200);
    expect((await hit(app, "a")).status).toBe(200);
    expect((await hit(app, "a")).status).toBe(429);
    expect((await hit(app, "b")).status).toBe(200);
    vi.advanceTimersByTime(1001);
    expect((await hit(app, "a")).status).toBe(200);
  });

  it("caps tracked keys: the oldest key is evicted so memory stays bounded", async () => {
    const app = appWith({ limit: 1, maxKeys: 3, windowMs: 60_000 });
    for (const k of ["k1", "k2", "k3"]) expect((await hit(app, k)).status).toBe(200);
    expect((await hit(app, "k2")).status).toBe(429); // still tracked
    expect((await hit(app, "k4")).status).toBe(200); // pushes out the oldest (k1)
    expect((await hit(app, "k1")).status).toBe(200); // k1 was forgotten, so it is fresh again
    expect((await hit(app, "k4")).status).toBe(429); // newer keys are still tracked
  });

  it("a flood of unique keys never grows the map past the cap", async () => {
    const app = appWith({ limit: 1, maxKeys: 50, windowMs: 60_000 });
    for (let i = 0; i < 5000; i++) await hit(app, `spoof-${i}`);
    // The 50 most recent keys are tracked (blocked on a second hit); old ones were evicted
    expect((await hit(app, "spoof-4999")).status).toBe(429);
    expect((await hit(app, "spoof-0")).status).toBe(200);
  });

  it("sweeps expired keys from the front without scanning live ones", async () => {
    const app = appWith({ limit: 1, maxKeys: 10, windowMs: 1000 });
    for (let i = 0; i < 10; i++) await hit(app, `old-${i}`);
    vi.advanceTimersByTime(1001);
    // table was full of expired keys; a new key must not evict anything live and expired keys are gone
    expect((await hit(app, "new")).status).toBe(200);
    expect((await hit(app, "old-0")).status).toBe(200);
    expect((await hit(app, "new")).status).toBe(429);
  });

  it("sends Retry-After of at least one second", async () => {
    const app = appWith({ limit: 1, windowMs: 1000 });
    await hit(app, "a");
    const res = await hit(app, "a");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
});
