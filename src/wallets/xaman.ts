import type { TxJson } from "../lib/tx";
import { WalletError } from "./errors";
import { cancelledError } from "./prompt";
import type {
  CancelResult,
  PromptHandler,
  WalletAdapter,
  WalletContext,
  WalletSession,
} from "./types";

const NAME = "Xaman";

type PayloadStatus = "pending" | "opened" | "signed" | "rejected" | "expired" | "cancelled";

interface PayloadCreated {
  uuid: string;
  qrPng: string;
  deeplink: string;
  expiresAt: string;
}

interface PayloadResult {
  uuid: string;
  status: PayloadStatus;
  account?: string;
  hex?: string;
  txid?: string;
  network?: string;
}

export interface XamanOptions {
  // Where the signing backend is reachable. Same-origin by default (Vite/nginx proxy /api).
  baseUrl?: string;
  pollMs?: number;
  // Consecutive failed polls tolerated before giving up.
  maxPollFailures?: number;
}

const BACKEND_DOWN =
  "Can't reach the signing backend. Start it (docker compose up, or npm run dev in server/) and try again.";

// Xaman fills these itself when it shows the request, so a slow QR scan can't leave us with a
// LastLedgerSequence that has already passed.
const AUTOFILLED_FIELDS = ["Sequence", "Fee", "LastLedgerSequence"] as const;

function stripAutofilled(tx: TxJson): TxJson {
  const copy: TxJson = { ...tx };
  for (const key of AUTOFILLED_FIELDS) delete copy[key];
  return copy;
}

interface ApiError {
  code?: string;
  message?: string;
  reason?: string;
}

async function readApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: ApiError };
    if (body?.error) return body.error;
  } catch {
    // not JSON; fall through
  }
  return {};
}

// Turns a non-2xx backend response into a WalletError with a message a person can act on.
async function toWalletError(res: Response, network?: string): Promise<WalletError> {
  const err = await readApiError(res);
  if (err.code === "NETWORK_NOT_ALLOWED" || err.code === "NETWORK_REQUIRED") {
    return new WalletError(
      "UNSUPPORTED",
      `The signing backend doesn't allow ${network ?? "this network"}. Use testnet or devnet (mainnet needs ALLOW_MAINNET on the server).`,
    );
  }
  if (res.status === 429 || err.code === "RATE_LIMITED") {
    return new WalletError(
      "UNKNOWN",
      "Too many requests to the signing backend. Wait a moment and try again.",
    );
  }
  if (res.status === 403 || err.code === "ORIGIN_NOT_ALLOWED") {
    return new WalletError(
      "UNKNOWN",
      "The signing backend rejected this site's origin. Add it to ALLOWED_ORIGIN on the server.",
    );
  }
  return new WalletError("UNKNOWN", err.message ?? `Backend returned ${res.status}`);
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

function requireNetwork(ctx?: WalletContext): string {
  if (!ctx?.network) {
    throw new WalletError("UNKNOWN", "Select a network before using Xaman.");
  }
  return ctx.network;
}

export function createXamanAdapter(options: XamanOptions = {}): WalletAdapter {
  const base = options.baseUrl ?? "/api";
  const pollMs = options.pollMs ?? 1500;
  const maxFailures = options.maxPollFailures ?? 3;

  interface Active {
    uuid: string | null;
    // Aborting stops the poll loop; it says nothing about whether Xaman still shows the request.
    controller: AbortController;
  }

  let handler: PromptHandler | null = null;
  let active: Active | null = null;

  const showPrompt: PromptHandler = (p) => handler?.(p);

  // Asks the backend to withdraw a request so the phone stops showing it.
  async function withdraw(uuid: string): Promise<CancelResult> {
    let res: Response;
    try {
      res = await fetch(`${base}/xaman/payload/${uuid}`, { method: "DELETE" });
    } catch {
      return { cancelled: false, reason: BACKEND_DOWN };
    }
    if (res.ok || res.status === 404) return { cancelled: true }; // 404: already gone
    const err = await readApiError(res);
    if (res.status === 409) {
      return {
        cancelled: false,
        reason:
          err.reason ?? err.message ?? "It is already open in Xaman and may still be approved.",
      };
    }
    return { cancelled: false, reason: err.message ?? `Backend returned ${res.status}` };
  }

  // Cancels one request. Polling only stops once Xaman confirms it was withdrawn; otherwise the
  // request may still be signed, so we keep watching for the real outcome.
  async function cancelRequest(mine: Active): Promise<CancelResult> {
    if (mine.controller.signal.aborted) return { cancelled: true };
    if (!mine.uuid) {
      // Still creating: aborting cancels the create call, and request() withdraws it if it lands.
      mine.controller.abort();
      return { cancelled: true };
    }
    const outcome = await withdraw(mine.uuid);
    if (outcome.cancelled) {
      mine.controller.abort();
      if (active === mine) showPrompt(null);
    }
    return outcome;
  }

  async function createPayload(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PayloadCreated> {
    let res: Response;
    try {
      res = await fetch(`${base}/xaman/payload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw cancelledError(NAME);
      throw new WalletError("UNKNOWN", BACKEND_DOWN, { cause: e });
    }
    if (!res.ok) throw await toWalletError(res, String(body.network));
    return (await res.json()) as PayloadCreated;
  }

  // Creates a payload, shows the QR, and polls until the user resolves it.
  async function request(
    title: string,
    body: Record<string, unknown>,
    external?: AbortSignal,
  ): Promise<PayloadResult> {
    if (external?.aborted) throw cancelledError(NAME);

    // A newer request replaces the old one: stop it and take its request off the phone.
    if (active) {
      const old = active;
      old.controller.abort();
      if (old.uuid) void withdraw(old.uuid);
    }

    const controller = new AbortController();
    const mine: Active = { uuid: null, controller };
    active = mine;
    const { signal } = controller;

    const onExternalAbort = () => {
      void cancelRequest(mine);
    };
    external?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const created = await createPayload(body, signal);
      mine.uuid = created.uuid;
      if (signal.aborted) {
        void withdraw(created.uuid);
        throw cancelledError(NAME);
      }
      showPrompt({
        title,
        qrPng: created.qrPng,
        deeplink: created.deeplink,
        expiresAt: created.expiresAt,
      });

      const deadline = Date.parse(created.expiresAt);
      let failures = 0;
      for (;;) {
        await sleep(pollMs, signal);
        if (signal.aborted) throw cancelledError(NAME);
        if (Number.isFinite(deadline) && Date.now() > deadline + 5000) {
          void withdraw(created.uuid);
          throw new WalletError("EXPIRED", "The request expired before it was approved.");
        }

        let res: Response;
        try {
          res = await fetch(`${base}/xaman/payload/${created.uuid}`, { signal });
        } catch (e) {
          if (signal.aborted) throw cancelledError(NAME);
          if (++failures >= maxFailures) {
            throw new WalletError("UNKNOWN", BACKEND_DOWN, { cause: e });
          }
          continue;
        }
        if (res.status === 404) {
          throw new WalletError("EXPIRED", "The request expired or no longer exists.");
        }
        if (!res.ok) {
          if (++failures >= maxFailures) throw await toWalletError(res);
          continue;
        }
        failures = 0;

        const result = (await res.json()) as PayloadResult;
        switch (result.status) {
          case "signed":
            return result;
          case "rejected":
            throw new WalletError("REJECTED", "You declined the request in Xaman.");
          case "cancelled":
            throw new WalletError("CANCELLED", "The request was cancelled.");
          case "expired":
            throw new WalletError("EXPIRED", "The request expired before it was approved.");
          default:
            break; // pending | opened: keep polling
        }
      }
    } finally {
      external?.removeEventListener("abort", onExternalAbort);
      if (active === mine) {
        active = null;
        showPrompt(null);
      }
    }
  }

  const adapter: WalletAdapter = {
    id: "xaman",
    name: NAME,
    capabilities: { signOnly: true, submit: true, walletAutofills: true },
    installUrl: "https://xaman.app",

    async isAvailable() {
      try {
        const res = await fetch(`${base}/health`);
        if (res.ok) {
          adapter.unavailableReason = undefined;
          return true;
        }
      } catch {
        // fall through
      }
      adapter.unavailableReason = "backend not running";
      return false;
    },

    async connect(ctx?: WalletContext): Promise<WalletSession> {
      const network = requireNetwork(ctx);
      const result = await request("Sign in with Xaman", { signIn: true, network }, ctx?.signal);
      if (!result.account) {
        throw new WalletError("UNKNOWN", "Xaman signed in but returned no account.");
      }
      return { address: result.account, networkHint: result.network ?? network };
    },

    async signTransaction(tx: TxJson, ctx?: WalletContext): Promise<string> {
      const network = requireNetwork(ctx);
      const result = await request(
        "Sign the transaction in Xaman",
        { txjson: stripAutofilled(tx), submit: false, network },
        ctx?.signal,
      );
      if (!result.hex) {
        throw new WalletError("UNKNOWN", "Xaman signed the request but returned no signed blob.");
      }
      return result.hex;
    },

    async submitTransaction(tx: TxJson, ctx?: WalletContext): Promise<string> {
      const network = requireNetwork(ctx);
      const result = await request(
        "Sign and submit in Xaman",
        { txjson: stripAutofilled(tx), submit: true, network },
        ctx?.signal,
      );
      if (!result.txid) {
        throw new WalletError(
          "UNKNOWN",
          "Xaman signed the request but returned no transaction hash.",
        );
      }
      return result.txid;
    },

    async disconnect() {
      await adapter.cancel?.();
    },

    setPromptHandler(h) {
      handler = h;
    },

    async cancel(): Promise<CancelResult> {
      if (!active) return { cancelled: true };
      return cancelRequest(active);
    },
  };

  return adapter;
}

export const xaman = createXamanAdapter();
