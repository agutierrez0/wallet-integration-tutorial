import { Hono } from "hono";
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
    network: z.enum(["testnet", "devnet", "mainnet"]).optional(),
  })
  .refine((b) => b.signIn || typeof b.txjson?.TransactionType === "string", {
    message: "txjson with a string TransactionType is required unless signIn is true",
    path: ["txjson"],
  });

const errorBody = (code: string, message: string) => ({ error: { code, message } });

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
  app.use(
    "/api/*",
    rateLimit({
      limit: 60,
      windowMs: 60_000,
      getKey: (c) => {
        if (config.trustProxy) {
          const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
          if (forwarded) return forwarded;
        }
        try {
          return getConnInfo(c).remote.address ?? "unknown";
        } catch {
          return "unknown"; // no socket (e.g. app.request in tests)
        }
      },
    }),
  );

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
      const body: XummTypes.XummPostPayloadBodyJson = {
        txjson: signIn ? { TransactionType: "SignIn" } : (txjson as XummTypes.XummJsonTransaction),
        options: {
          submit: signIn ? false : (submit ?? false),
          expire: EXPIRE_MINUTES,
          ...(network ? { force_network: FORCE_NETWORK[network] } : {}),
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
