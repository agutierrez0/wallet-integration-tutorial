import type { NetworkId } from "./networks";
import type { TxJson } from "./tx";

// One row per signed transaction, kept in this browser's localStorage only.
// Contains addresses, tx fields and the signed blob (public data once submitted).
// Never store seeds, API keys or secrets here.

export type HistoryStatus =
  | "signed" // signed, not known to be submitted (may have been sent elsewhere, e.g. Postman)
  | "submitted" // submitted and accepted; see engineResult
  | "failed"; // signing or submission failed after a signature existed

export type SubmitVia = "xrpljs" | "wallet" | "external";

export interface HistoryEntry {
  id: string; // unique, e.g. crypto.randomUUID()
  createdAt: number; // ms epoch (when signed)
  network: NetworkId;
  walletId: string; // adapter id, e.g. "crossmark"
  account: string; // signer's classic address
  txType: string; // TransactionType
  tx: TxJson; // the transaction as the user built it (before autofill) so it can repopulate the form
  hash: string; // computed locally from the signed blob
  signedBlob?: string;
  status: HistoryStatus;
  submittedAt?: number;
  submitVia?: SubmitVia;
  engineResult?: string; // e.g. tesSUCCESS, tecUNFUNDED_PAYMENT
  validated?: boolean; // true once seen in a validated ledger
}

export const HISTORY_KEY = "xrpl-wallet-sandbox:history:v1";
export const HISTORY_LIMIT = 50;
