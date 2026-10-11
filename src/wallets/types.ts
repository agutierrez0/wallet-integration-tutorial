import type { TxJson } from "../lib/tx";
import type { NetworkId } from "../lib/networks";

export interface WalletSession {
  address: string;
  publicKey?: string;
  // What the wallet says it is connected to, shown as a hint only.
  networkHint?: string;
}

// Passed to adapters that need to know which network the app is on.
// Adapters that read the network from the wallet itself can ignore it.
export interface WalletContext {
  network: NetworkId;
}

// Out-of-band approval (e.g. scan a QR code) that the UI should display.
export interface WalletPrompt {
  title: string;
  qrPng?: string;
  deeplink?: string;
  expiresAt?: string;
}

export type PromptHandler = (prompt: WalletPrompt | null) => void;

export interface WalletAdapter {
  id: string;
  name: string;
  // signOnly: can return a signed blob without submitting it.
  // submit: can sign and submit through the wallet itself.
  capabilities: { signOnly: boolean; submit: boolean };
  // Set by isAvailable() when it returns false, e.g. "backend not running".
  // The picker falls back to "not installed" when it is empty.
  unavailableReason?: string;
  // Where to get the wallet (or fix the setup) when it is unavailable.
  installUrl?: string;
  isAvailable(): Promise<boolean>;
  connect(ctx?: WalletContext): Promise<WalletSession>;
  // Returns the signed tx_blob (hex).
  signTransaction(tx: TxJson, ctx?: WalletContext): Promise<string>;
  // Signs and submits through the wallet. Returns the tx hash.
  submitTransaction?(tx: TxJson, ctx?: WalletContext): Promise<string>;
  disconnect(): Promise<void>;
  // Adapters that need an out-of-band approval report it here. Optional.
  setPromptHandler?(handler: PromptHandler | null): void;
  // Abandons whatever approval is in flight (stops polling, withdraws the request).
  cancel?(): void;
}
