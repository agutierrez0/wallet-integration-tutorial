import type { NetworkId } from "./networks";

export type HintNetwork = NetworkId | "unknown";

// Wallets describe their network differently: Crossmark a label or rpc url, GemWallet a
// name or websocket, Xaman an environment name. Returns undefined when there is no hint.
export function normalizeNetworkHint(hint?: string): HintNetwork | undefined {
  if (!hint || !hint.trim()) return undefined;
  const h = hint.toLowerCase();
  if (h.includes("devnet")) return "devnet";
  if (h.includes("testnet") || h.includes("altnet")) return "testnet";
  if (
    h.includes("mainnet") ||
    h.includes("livenet") ||
    h.includes("xrplcluster") ||
    /\bs[12]\.ripple\.com\b/.test(h) ||
    h.includes("xrpl.ws")
  ) {
    return "mainnet";
  }
  return "unknown";
}

const SHORT: Record<NetworkId, string> = {
  testnet: "Testnet",
  devnet: "Devnet",
  mainnet: "Mainnet",
};
export const shortNetworkName = (id: NetworkId) => SHORT[id];

// Message when the wallet's reported network is known and differs from the app's, else null.
export function networkMismatchMessage(
  hint: string | undefined,
  selected: NetworkId,
): string | null {
  const wallet = normalizeNetworkHint(hint);
  if (!wallet || wallet === "unknown" || wallet === selected) return null;
  return `Your wallet is on ${SHORT[wallet]} but the app is on ${SHORT[selected]}. Switch one of them to match.`;
}
