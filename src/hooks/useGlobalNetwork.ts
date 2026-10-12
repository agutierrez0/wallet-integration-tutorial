import { useEffect, useState } from "react";
import { readStoredNetwork, storeNetwork } from "../lib/networkStore";
import type { NetworkId } from "../lib/networks";

// The one app-wide network choice: restored from storage, saved on change, and mirrored to
// <html data-network> so CSS can mark mainnet (red top border) without prop drilling.
export function useGlobalNetwork(): [NetworkId, (id: NetworkId) => void] {
  const [networkId, setNetworkId] = useState<NetworkId>(() => readStoredNetwork());

  useEffect(() => {
    storeNetwork(networkId);
    document.documentElement.dataset.network = networkId;
    return () => {
      delete document.documentElement.dataset.network;
    };
  }, [networkId]);

  return [networkId, setNetworkId];
}
