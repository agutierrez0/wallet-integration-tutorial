import { WalletError } from "./errors";
import { probeWithTimeout, runPrompt, throwIfAborted } from "./prompt";
import type { WalletAdapter, WalletContext } from "./types";

const NAME = "GemWallet";

type Gem = typeof import("@gemwallet/api");

// The SDK is only fetched when the wallet is first probed or used, keeping it out of the main chunk.
let gemPromise: Promise<Gem> | undefined;
function loadGem(): Promise<Gem> {
  gemPromise ??= import("@gemwallet/api").catch((err) => {
    gemPromise = undefined; // allow a retry after a failed chunk load
    throw err;
  });
  return gemPromise;
}

// GemWallet resolves with { type: "reject" } (no result) when the user declines.
function result<T>(res: { type?: unknown; result?: T } | undefined, action: string): T {
  if (res?.type === "reject") {
    throw new WalletError("REJECTED", `GemWallet: ${action} was rejected`);
  }
  if (!res?.result) {
    throw new WalletError("LOCKED", `GemWallet: ${action} returned nothing. Unlock it and select an account.`);
  }
  return res.result;
}

// isInstalled() talks to the extension and can hang if it is missing, so it is bounded.
async function installed(): Promise<boolean> {
  try {
    return (await (await loadGem()).isInstalled()).result.isInstalled;
  } catch {
    return false;
  }
}

async function requireGem(): Promise<Gem> {
  if (!(await probeWithTimeout(installed))) {
    throw new WalletError("NOT_INSTALLED", "GemWallet was not found. Install the extension and reload.");
  }
  return loadGem();
}

export const gemwallet: WalletAdapter = {
  id: "gemwallet",
  name: NAME,
  capabilities: { signOnly: true, submit: true },

  isAvailable() {
    return probeWithTimeout(installed);
  },

  async connect(ctx?: WalletContext) {
    throwIfAborted(NAME, ctx?.signal);
    const gem = await requireGem();
    return runPrompt({
      wallet: NAME,
      action: "connect",
      signal: ctx?.signal,
      run: async () => {
        const { address } = result(await gem.getAddress(), "address request");
        let publicKey: string | undefined;
        let networkHint: string | undefined;
        try {
          publicKey = result(await gem.getPublicKey(), "public key request").publicKey;
        } catch {
          // optional; the user can decline without breaking the connection
        }
        try {
          const net = result(await gem.getNetwork(), "network request");
          networkHint = net.network ?? net.chain;
        } catch {
          // optional
        }
        return { address, publicKey, networkHint };
      },
    });
  },

  async signTransaction(tx, ctx?: WalletContext) {
    throwIfAborted(NAME, ctx?.signal);
    const gem = await requireGem();
    return runPrompt({
      wallet: NAME,
      action: "signing",
      signal: ctx?.signal,
      run: async () => {
        const { signature } = result(
          await gem.signTransaction({ transaction: tx as never }),
          "signing",
        );
        if (!signature) throw new WalletError("UNKNOWN", "GemWallet: no signed blob returned");
        return signature;
      },
    });
  },

  async submitTransaction(tx, ctx?: WalletContext) {
    throwIfAborted(NAME, ctx?.signal);
    const gem = await requireGem();
    return runPrompt({
      wallet: NAME,
      action: "submit",
      signal: ctx?.signal,
      run: async () => {
        const { hash } = result(
          await gem.submitTransaction({ transaction: tx as never }),
          "submit",
        );
        if (!hash) throw new WalletError("UNKNOWN", "GemWallet: submit returned no transaction hash");
        return hash;
      },
    });
  },

  async disconnect() {
    // GemWallet has no programmatic disconnect.
  },
};
