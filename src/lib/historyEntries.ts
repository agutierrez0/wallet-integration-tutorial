import type { LookupResult } from "./history";
import type { HistoryEntry } from "./historyTypes";
import type { NetworkId } from "./networks";
import type { TxJson } from "./tx";

// A transaction hash is 64 hex characters. Anything else is rejected before it is used in
// a URL or a ledger lookup. Returns the uppercase form, or null.
const HASH_RE = /^[0-9A-F]{64}$/i;
export function normalizeHash(hash: unknown): string | null {
  return typeof hash === "string" && HASH_RE.test(hash) ? hash.toUpperCase() : null;
}

export const MAX_PREVIOUS_HASHES = 10;

export interface EntryRef {
  id?: string;
  hash?: string;
  prevHash?: string;
}

// Index of the row a reference points to, or -1. Matches by id first, then by hash against
// both the current hash and the row's previous hashes (so a re-keyed row is still found by
// the hash it had before).
export function findEntryIndex(
  entries: readonly Pick<HistoryEntry, "id" | "hash" | "previousHashes">[],
  ref: EntryRef,
): number {
  if (ref.id !== undefined) {
    const byId = entries.findIndex((e) => e.id === ref.id);
    if (byId !== -1) return byId;
  }
  const wanted = [ref.hash, ref.prevHash]
    .map((h) => (h === undefined ? null : (normalizeHash(h) ?? h)))
    .filter((h): h is string => h !== null);
  if (wanted.length === 0) return -1;
  return entries.findIndex(
    (e) => wanted.includes(e.hash) || (e.previousHashes ?? []).some((p) => wanted.includes(p)),
  );
}

// Gives a row a new hash, remembering the old one. No-op if the new hash is invalid or the same.
export function rekeyEntry<T extends Pick<HistoryEntry, "hash" | "previousHashes">>(
  entry: T,
  newHash: string,
): T {
  const next = normalizeHash(newHash);
  if (!next || next === entry.hash) return entry;
  const previousHashes = [entry.hash, ...(entry.previousHashes ?? [])]
    .filter((h, i, all) => h !== next && all.indexOf(h) === i)
    .slice(0, MAX_PREVIOUS_HASHES);
  return { ...entry, hash: next, previousHashes };
}

// Pulls a transaction result code (tec/tef/tem/ter/tel) out of an error thrown by xrpl.js or
// rippled: structured fields first, then the message text. Returns undefined if none.
const CODE_RE = /\b(?:tec|tef|tem|ter|tel)[A-Z][A-Za-z0-9_]*\b/;
export function engineCodeFromError(e: unknown): string | undefined {
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): string | undefined => {
    if (v === null || v === undefined || depth > 3 || seen.has(v)) return undefined;
    if (typeof v === "string") return CODE_RE.exec(v)?.[0];
    if (typeof v !== "object") return undefined;
    seen.add(v);
    const o = v as Record<string, unknown>;
    for (const key of ["engine_result", "TransactionResult"]) {
      const val = o[key];
      if (typeof val === "string" && CODE_RE.test(val)) return CODE_RE.exec(val)?.[0];
    }
    return (
      visit(o.data, depth + 1) ??
      visit(o.result, depth + 1) ??
      visit(o.meta, depth + 1) ??
      visit(o.message, depth + 1) ??
      visit(o.cause, depth + 1)
    );
  };
  return visit(e, 0);
}

// "Check on-chain" is offered for rows we can't be sure about: signed but not known to be
// submitted, or failed with no result (a thrown timeout can still have reached the ledger).
export function canCheckOnChain(entry: Pick<HistoryEntry, "status" | "engineResult">): boolean {
  return entry.status === "signed" || (entry.status === "failed" && !entry.engineResult);
}

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
  // Locally computed hash of `blob` (hashOfBlob from lib/txCodec).
  hash: string;
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
    hash: s.hash,
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
// Pass engineResult when the error carried one (see engineCodeFromError).
export function patchFromSubmitFailure(
  via: "xrpljs" | "wallet",
  now: number,
  engineResult?: string,
): Patch {
  const patch: Patch = { status: "failed", submitVia: via, submittedAt: now };
  if (engineResult) patch.engineResult = engineResult;
  return patch;
}

// After the wallet submitted for us and returned a hash. If it differs from the
// local hash (the wallet re-signed), the entry is re-keyed to the returned hash.
export function patchFromWalletSubmit(
  entry: Pick<HistoryEntry, "hash">,
  returnedHash: string | undefined,
  now: number,
): Patch {
  const patch: Patch = { status: "submitted", submitVia: "wallet", submittedAt: now };
  // A wallet that returns something that isn't a hash must not re-key the row.
  const next = normalizeHash(returnedHash);
  if (next && next !== entry.hash) patch.hash = next;
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
