import type { MiddlewareHandler } from "hono";

interface Options {
  limit: number;
  windowMs: number;
  getKey: (c: Parameters<MiddlewareHandler>[0]) => string;
}

// Fixed-window per-key counter, in memory. Fine for a single-instance sandbox.
export function rateLimit({ limit, windowMs, getKey }: Options): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const now = Date.now();
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const key = getKey(c);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests, slow down." } },
        429,
      );
    }
    await next();
  };
}
