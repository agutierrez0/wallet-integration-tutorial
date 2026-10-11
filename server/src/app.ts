import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "@hono/node-server/conninfo";
import { z } from "zod";
import type { XummTypes } from "xumm-sdk";
import type { Config } from "./config.js";
import { rateLimit } from "./rateLimit.js";
import { toView } from "./status.js";

// The slice of xumm-sdk this server uses. Injected so tests can mock it.
export interface XamanClient {
  payload: {
    create(body: XummTypes.XummPostPayloadBodyJson, returnErrors?: boolean): Promise<XummTypes.XummPostPayloadResponse | null>;
    get(uuid: string, returnErrors?: boolean): Promise<XummTypes.XummGetPayloadResponse | null>;
    cancel(uuid: string, returnErrors?: boolean): Promise<XummTypes.XummDeletePayloadResponse | null>;
  };
}

const EXPIRE_MINUTES = 5;
const MAX_BODY_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORCE_NETWORK = { testnet: "TESTNET", devnet: "DEVNET", mainnet: "MAINNET" } as const;

const createSchema = z
  .object({
    txjson: z.record(z.string(), z.unknown()).optional(),
    signIn: z.boolean().optional(),
    submit: z.boolean().optional(),
    network: z.enum(["testnet", "devnet", "mainnet"], {
      error: "network is required: testnet, devnet or mainnet",
    }),
  })
  .refine((b) => b.signIn || typeof b.txjson?.TransactionType === "string", {
    message: "txjson with a string TransactionType is required unless signIn is true",
    path: ["txjson"],
  });

const errorBody = (code: string, message: string, extra: Record<string, string> = {}) => ({
  error: { code, message, ...extra },
});

// Per-route-class limits per client per minute. Polling is chatty by design (every ~1.5s per
// open request), creates and cancels are what an abuser would hammer.
const READ_LIMIT = 240;
const CREATE_LIMIT = 20;
const CANCEL_LIMIT = 10;
const WINDOW_MS = 60_000;
const MAX_KEY_LENGTH = 64;

type Ctx = Parameters<MiddlewareHandler>[0];

// Who is calling? Only trust proxy headers when told to (TRUST_PROXY=true). nginx sets
// X-Real-IP / X-Forwarded-For to its own $remote_addr, so these are single trusted values and
// never contain client-supplied entries. If X-Forwarded-For is all we have, use the right-most
// entry (the one added by the nearest proxy), never the left-most (client-controlled).
function clientKey(c: Ctx, trustProxy: boolean): string {
  if (trustProxy) {
    const real = c.req.header("x-real-ip")?.trim();
    if (real) return real.slice(0, MAX_KEY_LENGTH);
    const parts = c.req.header("x-forwarded-for")?.split(",");
    const last = parts?.[parts.length - 1]?.trim();
    if (last) return last.slice(0, MAX_KEY_LENGTH);
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // no socket (e.g. app.request in tests)
  }
}

export function createApp(config: Config, xaman: XamanClient) {
  const app = new Hono();

  app.use(secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );
  // Defense in depth, NOT authentication: browsers always send Origin on cross-origin POST/DELETE,
  // so this stops other websites from driving the API through a visitor's browser. Non-browser
  // clients (curl) can still call it; the rate limits and the testnet-only default bound abuse.
  app.use("/api/*", async (c, next) => {
    const method = c.req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      if (!config.allowedOrigins.includes(origin)) {
        return c.json(errorBody("FORBIDDEN_ORIGIN", "This origin is not allowed."), 403);
      }
    } else if (c.req.header("sec-fetch-site") === "cross-site") {
      return c.json(errorBody("FORBIDDEN_ORIGIN", "Cross-site requests are not allowed."), 403);
    }
    return next();
  });

  const getKey = (c: Ctx) => clientKey(c, config.trustProxy);
  const readLimiter = rateLimit({ limit: READ_LIMIT, windowMs: WINDOW_MS, getKey });
  const createLimiter = rateLimit({ limit: CREATE_LIMIT, windowMs: WINDOW_MS, getKey });
  const cancelLimiter = rateLimit({ limit: CANCEL_LIMIT, windowMs: WINDOW_MS, getKey });
  app.use("/api/*", (c, next) => {
    if (c.req.method === "OPTIONS" || c.req.path === "/api/health") return next();
    if (c.req.method === "POST") return createLimiter(c, next);
    if (c.req.method === "DELETE") return cancelLimiter(c, next);
    return readLimiter(c, next);
  });

  // /api/health is the same route as seen through the nginx/vite /api proxy.
  app.get("/health", (c) => c.text("ok"));
  app.get("/api/health", (c) => c.text("ok"));

  app.post(
    "/api/xaman/payload",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody("BODY_TOO_LARGE", "Request body exceeds 16kb."), 413),
    }),
    async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json(errorBody("INVALID_JSON", "Request body must be valid JSON."), 400);
      }
      const parsed = createSchema.safeParse(raw);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("; ");
        return c.json(errorBody("INVALID_REQUEST", message), 400);
      }
      const { txjson, signIn, submit, network } = parsed.data;
      if (network === "mainnet" && !config.allowMainnet) {
        return c.json(
          errorBody("MAINNET_DISABLED", "Mainnet is disabled on this server. Use testnet or devnet."),
          403,
        );
      }
      const body: XummTypes.XummPostPayloadBodyJson = {
        txjson: signIn ? { TransactionType: "SignIn" } : (txjson as XummTypes.XummJsonTransaction),
        options: {
          submit: signIn ? false : (submit ?? false),
          expire: EXPIRE_MINUTES,
          force_network: FORCE_NETWORK[network],
        },
      };
      try {
        const created = await xaman.payload.create(body, true);
        if (!created) {
          return c.json(errorBody("UPSTREAM_ERROR", "Xaman did not create the payload."), 502);
        }
        return c.json({
          uuid: created.uuid,
          qrPng: created.refs.qr_png,
          deeplink: created.next.always,
          expiresAt: new Date(Date.now() + EXPIRE_MINUTES * 60_000).toISOString(),
        });
      } catch (err) {
        return upstreamFailure(c, "create", err);
      }
    },
  );

  app.get("/api/xaman/payload/:uuid", async (c) => {
    const uuid = c.req.param("uuid");
    if (!UUID_RE.test(uuid)) {
      return c.json(errorBody("INVALID_UUID", "Payload id is not a valid UUID."), 400);
    }
    try {
      const payload = await xaman.payload.get(uuid, true);
      if (!payload || !payload.meta.exists) {
        return c.json(errorBody("NOT_FOUND", "Payload not found."), 404);
      }
      return c.json(toView(uuid, payload));
    } catch (err) {
      return upstreamFailure(c, "get", err);
    }
  });

  app.delete("/api/xaman/payload/:uuid", async (c) => {
    const uuid = c.req.param("uuid");
    if (!UUID_RE.test(uuid)) {
      return c.json(errorBody("INVALID_UUID", "Payload id is not a valid UUID."), 400);
    }
    try {
      const res = await xaman.payload.cancel(uuid, true);
      if (!res) return c.json(errorBody("NOT_FOUND", "Payload not found."), 404);
      // The SDK resolves normally when it could NOT cancel (e.g. already opened on the phone).
      // Report that honestly: the request may still be signed.
      if (!res.result?.cancelled) {
        const reason = /^[A-Z_]{1,40}$/.test(String(res.result?.reason))
          ? String(res.result?.reason)
          : "UNKNOWN";
        return c.json(
          errorBody("CANNOT_CANCEL", "The request could not be cancelled and may still be signed.", {
            reason,
          }),
          409,
        );
      }
      return c.body(null, 204);
    } catch (err) {
      return upstreamFailure(c, "cancel", err);
    }
  });

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "No such route."), 404));
  app.onError((err, c) => {
    console.error(`[unhandled] ${err.name}`);
    return c.json(errorBody("INTERNAL", "Something went wrong."), 500);
  });

  return app;
}

// Log only the error type, never the message: SDK errors can echo request details.
function upstreamFailure(c: { json: (b: unknown, s: 502) => Response }, op: string, err: unknown) {
  console.error(`[xaman:${op}] ${err instanceof Error ? err.name : typeof err}`);
  return c.json(errorBody("UPSTREAM_ERROR", "Xaman request failed. Try again."), 502);
}
