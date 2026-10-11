import {
  getAddress,
  getNetwork,
  getPublicKey,
  isInstalled,
  signTransaction,
  submitTransaction,
} from "@gemwallet/api";
import type { WalletAdapter } from "./types";

// GemWallet resolves with { type: "reject" } (no result) when the user declines.
function result<T>(res: { type?: unknown; result?: T } | undefined, action: string): T {
  if (!res || res.type === "reject" || !res.result) {
    throw new Error(`GemWallet: ${action} was rejected or returned nothing`);
  }
  return res.result;
}

export const gemwallet: WalletAdapter = {
  id: "gemwallet",
  name: "GemWallet",
  capabilities: { signOnly: true, submit: true },

  async isAvailable() {
    try {
      return (await isInstalled()).result.isInstalled;
    } catch {
      return false;
    }
  },

  async connect() {
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
  },

  async signTransaction(tx) {
    const { signature } = result(
      await signTransaction({ transaction: tx as never }),
      "signing",
    );
    if (!signature) throw new Error("GemWallet: no signed blob returned");
    return signature;
  },

  async submitTransaction(tx) {
    const { hash } = result(
      await submitTransaction({ transaction: tx as never }),
      "submit",
    );
    return hash;
  },

  async disconnect() {
    // GemWallet has no programmatic disconnect.
  },
};
