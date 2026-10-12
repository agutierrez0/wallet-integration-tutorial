import type { TxJson } from "../lib/tx";

// Some wallets (Xaman, Crossmark) fill these fields themselves when they show the request.
// Sending our own copy makes them warn that the value was replaced, and a value filled before a
// slow approval can already be expired by the time the wallet signs it.
const AUTOFILLED_FIELDS = ["Sequence", "Fee", "LastLedgerSequence"] as const;

export function stripAutofilled(tx: TxJson): TxJson {
  const copy: TxJson = { ...tx };
  for (const key of AUTOFILLED_FIELDS) {
    // Sequence 0 (with a TicketSequence) is deliberate, not an autofilled value.
    if (key === "Sequence" && (copy.Sequence === 0 || "TicketSequence" in copy)) continue;
    delete copy[key];
  }
  return copy;
}
