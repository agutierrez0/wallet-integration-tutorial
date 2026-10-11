import {
  getAddress,
  getNetwork,
  getPublicKey,
  isInstalled,
  signTransaction,
  submitTransaction,
} from "@gemwallet/api";
import { WalletError } from "./errors";
import type { WalletAdapter } from "./types";

const PROMPT_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 3_000;

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

async function installed(): Promise<boolean> {
  try {
    return (await isInstalled()).result.isInstalled;
  } catch {
    return false;
  }
}

async function assertInstalled() {
  if (!(await probe())) {
    throw new WalletError("NOT_INSTALLED", "GemWallet was not found. Install the extension and reload.");
  }
}

// isInstalled() talks to the extension and can hang if it is missing, so bound it.
function probe(): Promise<boolean> {
  return Promise.race([
    installed(),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS)),
  ]);
}

// Wallet prompts wait on a human, so bound them; anything unexpected becomes UNKNOWN.
async function prompt<T>(action: string, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new WalletError("EXPIRED", `GemWallet: ${action} timed out waiting for approval`)),
      PROMPT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new WalletError("UNKNOWN", `GemWallet: ${action} failed`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export const gemwallet: WalletAdapter = {
  id: "gemwallet",
  name: "GemWallet",
  capabilities: { signOnly: true, submit: true },

  isAvailable: probe,

  async connect() {
    await assertInstalled();
    return prompt("connect", async () => {
      const { address } = result(await getAddress(), "address request");
      let publicKey: string | undefined;
      let networkHint: string | undefined;
      try {
        publicKey = result(await getPublicKey(), "public key request").publicKey;
      } catch {
        // optional; the user can decline without breaking the connection
      }
      try {
        const net = result(await getNetwork(), "network request");
        networkHint = net.network ?? net.chain;
      } catch {
        // optional
      }
      return { address, publicKey, networkHint };
    });
  },

  async signTransaction(tx) {
    await assertInstalled();
    return prompt("signing", async () => {
      const { signature } = result(
        await signTransaction({ transaction: tx as never }),
        "signing",
      );
      if (!signature) throw new WalletError("UNKNOWN", "GemWallet: no signed blob returned");
      return signature;
    });
  },

  async submitTransaction(tx) {
    await assertInstalled();
    return prompt("submit", async () => {
      const { hash } = result(
        await submitTransaction({ transaction: tx as never }),
        "submit",
      );
      return hash;
    });
  },

  async disconnect() {
    // GemWallet has no programmatic disconnect.
  },
};
