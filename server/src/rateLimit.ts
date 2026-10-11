import type { MiddlewareHandler } from "hono";

interface Options {
  limit: number;
  windowMs: number;
  getKey: (c: Parameters<MiddlewareHandler>[0]) => string;
  // Hard cap on tracked keys. At the cap the oldest key is evicted, so memory stays bounded
  // even if an attacker can mint many distinct keys.
  maxKeys?: number;
  // Return true to skip limiting for this request.
  skip?: (c: Parameters<MiddlewareHandler>[0]) => boolean;
}

export const DEFAULT_MAX_KEYS = 10_000;

// Fixed-window per-key counter, in memory. Fine for a single-instance sandbox.
//
// A Map iterates in insertion order. Entries are always (re)inserted with
// resetAt = now + windowMs and `now` never goes backwards, so the Map is also sorted by
// resetAt. Expired entries therefore sit at the front and sweeping stops at the first live
// one: O(1) amortized per request, never a full scan.
export function rateLimit({
  limit,
  windowMs,
  getKey,
  maxKeys = DEFAULT_MAX_KEYS,
  skip,
}: Options): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    if (skip?.(c)) return next();

    const now = Date.now();
    for (const [k, v] of hits) {
      if (v.resetAt > now) break;
      hits.delete(k);
    }

    const key = getKey(c);
    let entry = hits.get(key);
    if (!entry) {
      if (hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests, slow down." } },
        429,
      );
    }
    await next();
  };
}
