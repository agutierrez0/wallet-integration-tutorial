import type { TxJson } from "../lib/tx";

export interface WalletSession {
  address: string;
  publicKey?: string;
  // What the wallet says it is connected to, shown as a hint only.
  networkHint?: string;
}

export interface WalletAdapter {
  id: string;
  name: string;
  // signOnly: can return a signed blob without submitting it.
  // submit: can sign and submit through the wallet itself.
  capabilities: { signOnly: boolean; submit: boolean };
  isAvailable(): Promise<boolean>;
  connect(): Promise<WalletSession>;
  // Returns the signed tx_blob (hex).
  signTransaction(tx: TxJson): Promise<string>;
  // Signs and submits through the wallet. Returns the tx hash.
  submitTransaction?(tx: TxJson): Promise<string>;
  disconnect(): Promise<void>;
}
