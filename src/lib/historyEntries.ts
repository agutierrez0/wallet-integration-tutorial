import type { LookupResult } from "./history";
import type { HistoryEntry } from "./historyTypes";
import type { NetworkId } from "./networks";
import { hashOfBlob } from "./tx";
import type { TxJson } from "./tx";

// Pure helpers that turn app events (sign, submit, lookup, restore) into history
// entries and patches. Kept free of React and storage so they are easy to test.

// Fields the app or the wallet fills in. They are dropped when a history entry is
// loaded back into the editor, so the connected account and fresh network values apply.
export const AUTOFILLED_FIELDS = [
  "Account",
  "Fee",
  "Sequence",
  "LastLedgerSequence",
  "SigningPubKey",
  "TxnSignature",
] as const;

// crypto.randomUUID only exists in secure contexts (https or localhost).
export function newEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function stripForRestore(tx: TxJson): TxJson {
  const out: TxJson = { ...tx };
  for (const key of AUTOFILLED_FIELDS) delete out[key];
  return out;
}

export function restoreText(tx: TxJson): string {
  return JSON.stringify(stripForRestore(tx), null, 2);
}

// Pulls the transaction result code out of an xrpl.js submitAndWait response.
export function resultCode(res: unknown): string | undefined {
  const r = (res as { result?: { engine_result?: unknown; meta?: unknown } } | null)?.result;
  if (typeof r?.engine_result === "string") return r.engine_result;
  const meta = r?.meta;
  if (meta && typeof meta === "object" && "TransactionResult" in meta) {
    return String((meta as { TransactionResult: unknown }).TransactionResult);
  }
  return undefined;
}

export interface SignedInfo {
  id: string;
  now: number;
  network: NetworkId;
  walletId: string;
  account: string;
  // The transaction as the user built it, before autofill.
  builtTx: TxJson;
  blob: string;
}

export function entryFromSigned(s: SignedInfo): HistoryEntry {
  return {
    id: s.id,
    createdAt: s.now,
    network: s.network,
    walletId: s.walletId,
    account: s.account,
    txType: String(s.builtTx.TransactionType ?? "Unknown"),
    tx: s.builtTx,
    hash: hashOfBlob(s.blob),
    signedBlob: s.blob,
    status: "signed",
  };
}

type Patch = Partial<Omit<HistoryEntry, "id">>;

// After "Submit with xrpl.js" resolved with a response.
export function patchFromXrplJsSubmit(res: unknown, now: number): Patch {
  const validated = (res as { result?: { validated?: unknown } } | null)?.result?.validated;
  const patch: Patch = {
    status: "submitted",
    submitVia: "xrpljs",
    submittedAt: now,
    engineResult: resultCode(res),
  };
  if (typeof validated === "boolean") patch.validated = validated;
  return patch;
}

// After "Submit with xrpl.js" threw although a signature existed.
export function patchFromSubmitFailure(via: "xrpljs" | "wallet", now: number): Patch {
  return { status: "failed", submitVia: via, submittedAt: now };
}

// After the wallet submitted for us and returned a hash. If it differs from the
// local hash (the wallet re-signed), the entry is re-keyed to the returned hash.
export function patchFromWalletSubmit(
  entry: Pick<HistoryEntry, "hash">,
  returnedHash: string | undefined,
  now: number,
): Patch {
  const patch: Patch = { status: "submitted", submitVia: "wallet", submittedAt: now };
  if (returnedHash && returnedHash !== entry.hash) patch.hash = returnedHash;
  return patch;
}

// After "Check on-chain". Returns null when the transaction wasn't found, so the
// entry stays as it was.
export function patchFromLookup(
  entry: Pick<HistoryEntry, "submitVia" | "submittedAt">,
  res: LookupResult,
  now: number,
): Patch | null {
  if (!res.found) return null;
  const patch: Patch = {
    status: "submitted",
    submitVia: entry.submitVia ?? "external",
    submittedAt: entry.submittedAt ?? now,
  };
  if (res.engineResult !== undefined) patch.engineResult = res.engineResult;
  if (res.validated !== undefined) patch.validated = res.validated;
  return patch;
}

export interface RestoreContext {
  networkId: NetworkId;
  mainnetOk: boolean;
  // Connected wallet address, if any.
  address?: string;
}

export interface RestoreNotice {
  tone: "success" | "info";
  message: string;
}

export interface RestorePlan {
  text: string;
  // Set when the editor's network should change to match the entry.
  switchTo?: NetworkId;
  notices: RestoreNotice[];
}

export function prepareRestore(
  entry: Pick<HistoryEntry, "tx" | "txType" | "network" | "account">,
  ctx: RestoreContext,
): RestorePlan {
  const notices: RestoreNotice[] = [
    { tone: "success", message: `Loaded ${entry.txType} from history.` },
  ];
  let switchTo: NetworkId | undefined;

  if (entry.network !== ctx.networkId) {
    if (entry.network === "mainnet" && !ctx.mainnetOk) {
      notices.push({
        tone: "info",
        message:
          "This transaction was signed on mainnet. The network was not switched. To use mainnet, tick “I understand mainnet is real XRP” in the network bar and select Mainnet.",
      });
    } else {
      switchTo = entry.network;
    }
  }

  if (ctx.address && entry.account && ctx.address !== entry.account) {
    notices.push({
      tone: "info",
      message: `This transaction was originally signed by ${entry.account}. It will be signed by the connected account (${ctx.address}) instead.`,
    });
  }

  return { text: restoreText(entry.tx), switchTo, notices };
}
