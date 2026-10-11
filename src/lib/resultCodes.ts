export type ResultCategory = "success" | "retry" | "failed" | "unknown";

export interface ResultExplanation {
  category: ResultCategory;
  title: string;
  explanation: string;
}

const KNOWN: Record<string, ResultExplanation> = {
  tesSUCCESS: {
    category: "success",
    title: "Success",
    explanation: "The transaction was applied to the ledger.",
  },
  tecUNFUNDED_PAYMENT: {
    category: "failed",
    title: "Not enough funds",
    explanation:
      "The sender doesn't have enough XRP or tokens to cover this payment (remember the account reserve).",
  },
  tecNO_DST: {
    category: "failed",
    title: "Destination doesn't exist",
    explanation:
      "The destination account isn't on the ledger yet. Send at least the base reserve in XRP to create it.",
  },
  tecNO_DST_INSUF_XRP: {
    category: "failed",
    title: "Amount too small to create the account",
    explanation:
      "The destination doesn't exist, and this payment is less than the base reserve needed to create it.",
  },
  tecINSUFFICIENT_RESERVE: {
    category: "failed",
    title: "Reserve too low",
    explanation:
      "Completing this would leave the account below its required XRP reserve. Fund the account or remove owned objects first.",
  },
  tecPATH_DRY: {
    category: "failed",
    title: "No payment path",
    explanation:
      "There's no route with enough liquidity to deliver this payment. Check trust lines and available offers.",
  },
  tecNO_LINE: {
    category: "failed",
    title: "Missing trust line",
    explanation:
      "The account has no trust line for this currency and issuer. Create one with a TrustSet first.",
  },
  tecNO_PERMISSION: {
    category: "failed",
    title: "Not permitted",
    explanation:
      "The account isn't allowed to do this (for example, a flag or authorization is required).",
  },
  tefPAST_SEQ: {
    category: "failed",
    title: "Sequence number already used",
    explanation:
      "This transaction's Sequence was already consumed. Sign again so the sequence is re-filled.",
  },
  tefMAX_LEDGER: {
    category: "failed",
    title: "Transaction expired",
    explanation:
      "The ledger passed this transaction's LastLedgerSequence before it was included. Sign again to get a fresh one.",
  },
  tefBAD_AUTH: {
    category: "failed",
    title: "Signature not authorized",
    explanation:
      "The signing key isn't authorized for this account. Check that the connected wallet owns the Account.",
  },
  terQUEUED: {
    category: "retry",
    title: "Queued",
    explanation:
      "The network is busy and queued the transaction. It may still be included in an upcoming ledger.",
  },
  terPRE_SEQ: {
    category: "retry",
    title: "Waiting on an earlier transaction",
    explanation:
      "The Sequence is ahead of the account's next one. It may apply once the missing transactions do.",
  },
  temMALFORMED: {
    category: "failed",
    title: "Malformed transaction",
    explanation:
      "Some fields are missing or invalid. Review the transaction JSON.",
  },
  temBAD_FEE: {
    category: "failed",
    title: "Invalid fee",
    explanation: "The Fee is invalid. Let autofill set it, or use a positive amount in drops.",
  },
  temBAD_AMOUNT: {
    category: "failed",
    title: "Invalid amount",
    explanation:
      "The amount is invalid. XRP amounts are whole drops (a string); token amounts need currency, issuer and value.",
  },
  temREDUNDANT: {
    category: "failed",
    title: "Redundant transaction",
    explanation: "This transaction would do nothing, for example sending to yourself.",
  },
  telINSUF_FEE_P: {
    category: "retry",
    title: "Fee too low for this server",
    explanation:
      "The server's current load requires a higher fee. Sign again to refresh the fee.",
  },
};

const PREFIXES: [string, ResultExplanation][] = [
  ["tes", { category: "success", title: "Success", explanation: "The transaction was applied." }],
  [
    "tec",
    {
      category: "failed",
      title: "Failed (fee charged)",
      explanation:
        "The transaction was included in a ledger and charged the fee, but its effect wasn't applied.",
    },
  ],
  [
    "tef",
    {
      category: "failed",
      title: "Rejected",
      explanation:
        "The transaction can't be applied to the current ledger and won't succeed as-is. Sign again.",
    },
  ],
  [
    "tem",
    {
      category: "failed",
      title: "Malformed",
      explanation: "The transaction is invalid and will never succeed. Fix its fields.",
    },
  ],
  [
    "ter",
    {
      category: "retry",
      title: "Retryable",
      explanation: "The transaction couldn't apply yet but might later.",
    },
  ],
  [
    "tel",
    {
      category: "retry",
      title: "Rejected by this server",
      explanation:
        "This server declined the transaction (for example load or fee). Another server or a retry may work.",
    },
  ],
];

export function explainResult(code: string): ResultExplanation {
  const known = KNOWN[code];
  if (known) return known;
  const prefix = PREFIXES.find(([p]) => code.startsWith(p));
  if (prefix) {
    return { ...prefix[1], explanation: `${prefix[1].explanation} (${code})` };
  }
  return {
    category: "unknown",
    title: "Unknown result",
    explanation: `The ledger returned "${code}", which isn't recognized.`,
  };
}
