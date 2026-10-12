import { NETWORKS } from "./networks";
import type { NetworkId } from "./networks";

// The selected network is global app state, remembered in this browser only.
export const NETWORK_KEY = "xrpl-wallet-sandbox:network:v1";
export const DEFAULT_NETWORK: NetworkId = "testnet";

export const NETWORK_NAMES: Record<NetworkId, string> = {
  testnet: "Testnet",
  devnet: "Devnet",
  mainnet: "Mainnet",
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage can throw on access
  }
}

// Own-property check: `"constructor" in NETWORKS` is true, `Object.hasOwn` is not.
export function isNetworkId(v: unknown): v is NetworkId {
  return typeof v === "string" && Object.hasOwn(NETWORKS, v);
}

export function readStoredNetwork(storage: StorageLike | null = defaultStorage()): NetworkId {
  try {
    const v = storage?.getItem(NETWORK_KEY);
    return isNetworkId(v) ? v : DEFAULT_NETWORK;
  } catch {
    return DEFAULT_NETWORK;
  }
}

export function storeNetwork(id: NetworkId, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(NETWORK_KEY, id);
  } catch {
    // quota or blocked storage: the choice just won't survive a reload
  }
}
