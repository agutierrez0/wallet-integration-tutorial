import { WalletError } from "./errors";
import { unwrapDefault } from "./interop";
import { probeWithTimeout, runPrompt, throwIfAborted } from "./prompt";
import type { WalletAdapter, WalletContext } from "./types";

const NAME = "Crossmark";

type Sdk = typeof import("@crossmarkio/sdk").default;

// The SDK is only fetched when the wallet is first probed or used, keeping it out of the main chunk.
let sdkPromise: Promise<Sdk> | undefined;
function loadSdk(): Promise<Sdk> {
  sdkPromise ??= import("@crossmarkio/sdk").then(
    (m) =>
      unwrapDefault<Sdk>(
        m,
        (v) => typeof v === "object" && v !== null && "sync" in v && "methods" in v,
      ),
    (err) => {
      sdkPromise = undefined; // allow a retry after a failed chunk load
      throw err;
    },
  );
  return sdkPromise;
}

// The SDK types its responses as `any`, so describe only what we read.
interface CrossmarkStatus {
  isError?: boolean;
  isRejected?: boolean;
  isExpired?: boolean;
}
interface SignInResult {
  response: {
    data: {
      address: string;
      publicKey?: string;
      network?: { label?: string; rpc?: string };
      meta?: CrossmarkStatus;
    };
  };
}
interface SignResult {
  response: { data: { txBlob?: string; meta?: CrossmarkStatus } };
}

// The SDK only learns the extension is there after a background handshake that polls for
// `window.xrpl.isCrossmark`, so the first reading right after the import is often a false
// negative. Keep checking briefly; this must stay below PROBE_TIMEOUT_MS.
const DETECT_MS = 2_500;
const DETECT_STEP_MS = 100;

function extensionFlag(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { xrpl?: { isCrossmark?: boolean } }).xrpl?.isCrossmark)
  );
}

async function installed(): Promise<boolean> {
  try {
    const sdk = await loadSdk();
    const deadline = Date.now() + DETECT_MS;
    for (;;) {
      if (sdk.sync.isInstalled?.() || extensionFlag()) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, DETECT_STEP_MS));
    }
  } catch {
    return false;
  }
}

async function requireSdk(): Promise<Sdk> {
  if (!(await probeWithTimeout(installed))) {
    throw new WalletError(
      "NOT_INSTALLED",
      "Crossmark was not found. Install the extension and reload.",
    );
  }
  return loadSdk();
}

function assertOk(meta: CrossmarkStatus | undefined, action: string) {
  if (meta?.isRejected) throw new WalletError("REJECTED", `Crossmark: ${action} was rejected`);
  if (meta?.isExpired) throw new WalletError("EXPIRED", `Crossmark: ${action} request expired`);
  if (meta?.isError) throw new WalletError("UNKNOWN", `Crossmark: ${action} failed`);
}

export const crossmark: WalletAdapter = {
  id: "crossmark",
  name: NAME,
  capabilities: { signOnly: true, submit: false },

  isAvailable() {
    return probeWithTimeout(installed);
  },

  async connect(ctx?: WalletContext) {
    throwIfAborted(NAME, ctx?.signal);
    const sdk = await requireSdk();
    return runPrompt({
      wallet: NAME,
      action: "sign-in",
      signal: ctx?.signal,
      run: async () => {
        const res = (await sdk.methods.signInAndWait()) as unknown as SignInResult;
        const data = res?.response?.data;
        assertOk(data?.meta, "sign-in");
        if (!data?.address) {
          throw new WalletError(
            "LOCKED",
            "Crossmark returned no account. Unlock it and select an account.",
          );
        }
        return {
          address: data.address,
          publicKey: data.publicKey,
          networkHint: data.network?.label ?? data.network?.rpc,
        };
      },
    });
  },

  async signTransaction(tx, ctx?: WalletContext) {
    throwIfAborted(NAME, ctx?.signal);
    const sdk = await requireSdk();
    return runPrompt({
      wallet: NAME,
      action: "signing",
      signal: ctx?.signal,
      run: async () => {
        const res = (await sdk.methods.signAndWait(tx as never)) as unknown as SignResult;
        const data = res?.response?.data;
        assertOk(data?.meta, "signing");
        if (!data?.txBlob) throw new WalletError("UNKNOWN", "Crossmark: no signed blob returned");
        return data.txBlob;
      },
    });
  },

  async submitTransaction() {
    throw new WalletError(
      "UNSUPPORTED",
      "Crossmark cannot submit transactions from this app. Use xrpl.js or the JSON-RPC body instead.",
    );
  },

  async disconnect() {
    // Crossmark has no programmatic disconnect; the session is just dropped here.
  },
};
