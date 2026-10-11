export type NetworkId = "testnet" | "devnet" | "mainnet";

export interface Network {
  id: NetworkId;
  label: string;
  ws: string;
  rpc: string;
  explorer: string;
  faucet?: string;
}

export const NETWORKS: Record<NetworkId, Network> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    ws: "wss://s.altnet.rippletest.net:51233",
    rpc: "https://s.altnet.rippletest.net:51234",
    explorer: "https://testnet.xrpl.org",
    faucet: "https://faucet.altnet.rippletest.net/accounts",
  },
  devnet: {
    id: "devnet",
    label: "Devnet",
    ws: "wss://s.devnet.rippletest.net:51233",
    rpc: "https://s.devnet.rippletest.net:51234",
    explorer: "https://devnet.xrpl.org",
    faucet: "https://faucet.devnet.rippletest.net/accounts",
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet (real XRP)",
    ws: "wss://xrplcluster.com",
    rpc: "https://xrplcluster.com",
    explorer: "https://livenet.xrpl.org",
  },
};
