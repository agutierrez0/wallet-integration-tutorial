import type { TxJson } from "../lib/tx";
import { WalletError } from "./errors";
import type {
  PromptHandler,
  WalletAdapter,
  WalletContext,
  WalletSession,
} from "./types";

type PayloadStatus =
  | "pending"
  | "opened"
  | "signed"
  | "rejected"
  | "expired"
  | "cancelled";

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

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body?.error?.message) return body.error.message;
  } catch {
    // not JSON; fall through
  }
  return `Backend returned ${res.status}`;
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

export function createXamanAdapter(options: XamanOptions = {}): WalletAdapter {
  const base = options.baseUrl ?? "/api";
  const pollMs = options.pollMs ?? 1500;
  const maxFailures = options.maxPollFailures ?? 3;

  let handler: PromptHandler | null = null;
  let active: { uuid: string | null; controller: AbortController } | null = null;

  const showPrompt: PromptHandler = (p) => handler?.(p);

  const deletePayload = (uuid: string) => {
    // Best effort: withdraw the request so the phone stops showing it.
    fetch(`${base}/xaman/payload/${uuid}`, { method: "DELETE" }).catch(() => {});
  };

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
      if (signal.aborted) throw new WalletError("REJECTED", "Cancelled.", { cause: e });
      throw new WalletError("UNKNOWN", BACKEND_DOWN, { cause: e });
    }
    if (!res.ok) throw new WalletError("UNKNOWN", await readError(res));
    return (await res.json()) as PayloadCreated;
  }

  // Creates a payload, shows the QR, and polls until the user resolves it.
  async function request(
    title: string,
    body: Record<string, unknown>,
  ): Promise<PayloadResult> {
    active?.controller.abort();
    const controller = new AbortController();
    const mine = { uuid: null as string | null, controller };
    active = mine;
    const { signal } = controller;

    try {
      const created = await createPayload(body, signal);
      mine.uuid = created.uuid;
      if (signal.aborted) {
        deletePayload(created.uuid);
        throw new WalletError("REJECTED", "Cancelled.");
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
        if (signal.aborted) throw new WalletError("REJECTED", "Cancelled.");
        if (Number.isFinite(deadline) && Date.now() > deadline + 5000) {
          deletePayload(created.uuid);
          throw new WalletError("EXPIRED", "The request expired before it was approved.");
        }

        let res: Response;
        try {
          res = await fetch(`${base}/xaman/payload/${created.uuid}`, { signal });
        } catch (e) {
          if (signal.aborted) throw new WalletError("REJECTED", "Cancelled.", { cause: e });
          if (++failures >= maxFailures) {
            throw new WalletError("UNKNOWN", BACKEND_DOWN, { cause: e });
          }
          continue;
        }
        if (res.status === 404) {
          throw new WalletError("EXPIRED", "The request expired or no longer exists.");
        }
        if (!res.ok) {
          if (++failures >= maxFailures) {
            throw new WalletError("UNKNOWN", await readError(res));
          }
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
            throw new WalletError("REJECTED", "The request was cancelled.");
          case "expired":
            throw new WalletError("EXPIRED", "The request expired before it was approved.");
          default:
            break; // pending | opened: keep polling
        }
      }
    } finally {
      if (active === mine) {
        active = null;
        showPrompt(null);
      }
    }
  }

  const adapter: WalletAdapter = {
    id: "xaman",
    name: "Xaman",
    capabilities: { signOnly: true, submit: true },
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
      const result = await request("Sign in with Xaman", {
        signIn: true,
        network: ctx?.network,
      });
      if (!result.account) {
        throw new WalletError("UNKNOWN", "Xaman signed in but returned no account.");
      }
      return { address: result.account, networkHint: result.network ?? ctx?.network };
    },

    async signTransaction(tx: TxJson, ctx?: WalletContext): Promise<string> {
      const result = await request("Sign the transaction in Xaman", {
        txjson: tx,
        submit: false,
        network: ctx?.network,
      });
      if (!result.hex) {
        throw new WalletError("UNKNOWN", "Xaman signed the request but returned no signed blob.");
      }
      return result.hex;
    },

    async submitTransaction(tx: TxJson, ctx?: WalletContext): Promise<string> {
      const result = await request("Sign and submit in Xaman", {
        txjson: tx,
        submit: true,
        network: ctx?.network,
      });
      if (!result.txid) {
        throw new WalletError("UNKNOWN", "Xaman signed the request but returned no transaction hash.");
      }
      return result.txid;
    },

    async disconnect() {
      adapter.cancel?.();
    },

    setPromptHandler(h) {
      handler = h;
    },

    cancel() {
      if (!active) return;
      const { uuid, controller } = active;
      controller.abort();
      if (uuid) deletePayload(uuid);
      showPrompt(null);
    },
  };

  return adapter;
}

export const xaman = createXamanAdapter();
