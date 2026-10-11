import { dropsToXrp } from "xrpl";
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  type HistoryEntry,
  type HistoryStatus,
  type SubmitVia,
} from "./historyTypes";
import { findEntryIndex, MAX_PREVIOUS_HASHES, normalizeHash, rekeyEntry } from "./historyEntries";
import { NETWORKS, type NetworkId } from "./networks";
import { withClient, type TxJson } from "./tx";

// ---------------------------------------------------------------------------
// Storage access. Every localStorage touch is wrapped: it can throw (private
// mode, blocked site data, quota) or be missing (SSR, tests).
// ---------------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function probe(storage: StorageLike | null): boolean {
  if (!storage) return false;
  const key = `${HISTORY_KEY}:probe`;
  try {
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

// ---------------------------------------------------------------------------
// Validation. Anything read back from storage is untrusted: rebuild each entry
// from known, type-checked fields and drop the ones that don't hold up.
// ---------------------------------------------------------------------------

const STATUSES: readonly HistoryStatus[] = ["signed", "submitted", "failed"];
const SUBMIT_VIA: readonly SubmitVia[] = ["xrpljs", "wallet", "external"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// `in` would accept "constructor" and "__proto__"; only own keys are real networks.
const isNetworkId = (v: unknown): v is NetworkId => isStr(v) && Object.hasOwn(NETWORKS, v);

function sanitizeEntry(raw: unknown): HistoryEntry | null {
  if (!isObject(raw)) return null;
  const { id, createdAt, network, walletId, account, txType, tx, status } = raw;
  const hash = normalizeHash(raw.hash);
  if (
    !isStr(id) ||
    !id ||
    !isNum(createdAt) ||
    !isNetworkId(network) ||
    !isStr(walletId) ||
    !isStr(account) ||
    !isStr(txType) ||
    !isObject(tx) ||
    !hash ||
    !isStr(status) ||
    !STATUSES.includes(status as HistoryStatus)
  ) {
    return null;
  }
  const entry: HistoryEntry = {
    id,
    createdAt,
    network,
    walletId,
    account,
    txType,
    tx,
    hash,
    status: status as HistoryStatus,
  };
  if (Array.isArray(raw.previousHashes)) {
    const previous = raw.previousHashes
      .map(normalizeHash)
      .filter((h, i, all): h is string => h !== null && h !== hash && all.indexOf(h) === i)
      .slice(0, MAX_PREVIOUS_HASHES);
    if (previous.length > 0) entry.previousHashes = previous;
  }
  if (isStr(raw.signedBlob)) entry.signedBlob = raw.signedBlob;
  if (isNum(raw.submittedAt)) entry.submittedAt = raw.submittedAt;
  if (isStr(raw.submitVia) && SUBMIT_VIA.includes(raw.submitVia as SubmitVia)) {
    entry.submitVia = raw.submitVia as SubmitVia;
  }
  if (isStr(raw.engineResult)) entry.engineResult = raw.engineResult;
  if (typeof raw.validated === "boolean") entry.validated = raw.validated;
  return entry;
}

// ---------------------------------------------------------------------------
// Pure store functions. Each takes a storage (default: localStorage) and
// returns the resulting list, newest first. None of them throw.
// ---------------------------------------------------------------------------

export function loadHistory(storage: StorageLike | null = defaultStorage()): HistoryEntry[] {
  if (!storage) return [];
  let parsed: unknown;
  try {
    const text = storage.getItem(HISTORY_KEY);
    if (!text) return [];
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  return parsed
    .map(sanitizeEntry)
    .filter((e): e is HistoryEntry => e !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((e) => (seen.has(e.hash) ? false : (seen.add(e.hash), true)))
    .slice(0, HISTORY_LIMIT);
}

// Writes the list. On a storage error (usually quota) it keeps the newest half
// and retries once. If that fails too, the list is returned unsaved so the UI
// still works for this session.
function persist(storage: StorageLike | null, entries: HistoryEntry[]): HistoryEntry[] {
  if (!storage) return entries;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return entries;
  } catch {
    const trimmed = entries.slice(0, Math.max(1, Math.floor(entries.length / 2)));
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return entries;
    }
  }
}

export function addEntry(
  entry: HistoryEntry,
  storage: StorageLike | null = defaultStorage(),
): HistoryEntry[] {
  const hash = normalizeHash(entry.hash);
  if (!hash || !isNetworkId(entry.network)) return loadHistory(storage);
  const incoming: HistoryEntry = { ...entry, hash };
  const current = loadHistory(storage);
  // Match by current or previous hash, so re-signing the blob a wallet re-keyed away from
  // updates the same row instead of adding a duplicate.
  const at = findEntryIndex(current, { hash });
  const existing = at === -1 ? undefined : current[at];
  let next = incoming;
  if (existing) {
    next = {
      ...existing,
      ...incoming,
      id: existing.id,
      hash: existing.hash,
      previousHashes: existing.previousHashes,
    };
    // Signing the same blob again must not undo a recorded submission.
    if (existing.status === "submitted" && incoming.status === "signed") {
      next.status = existing.status;
      next.submittedAt = existing.submittedAt;
      next.submitVia = existing.submitVia;
      next.engineResult = existing.engineResult;
      next.validated = existing.validated;
    }
  }
  const rest = current.filter((_, i) => i !== at);
  return persist(storage, [next, ...rest].slice(0, HISTORY_LIMIT));
}

export function updateEntry(
  id: string,
  patch: Partial<Omit<HistoryEntry, "id">>,
  storage: StorageLike | null = defaultStorage(),
): HistoryEntry[] {
  const current = loadHistory(storage);
  const at = current.findIndex((e) => e.id === id);
  if (at === -1) return current;

  const { hash: patchHash, previousHashes: _ignored, ...rest } = patch;
  let updated: HistoryEntry = { ...current[at], ...rest, id };
  // A patch can re-key the row (the wallet signed again). Keep the old hash so lookups by it
  // still work, and drop any other row that already uses the new hash.
  if (patchHash !== undefined) updated = rekeyEntry(updated, patchHash);

  const next = current
    .map((e, i) => (i === at ? updated : e))
    .filter((e, i) => i === at || e.hash !== updated.hash);
  return persist(storage, next);
}

export function removeEntry(
  id: string,
  storage: StorageLike | null = defaultStorage(),
): HistoryEntry[] {
  const current = loadHistory(storage);
  if (!current.some((e) => e.id === id)) return current;
  return persist(
    storage,
    current.filter((e) => e.id !== id),
  );
}

export function clearHistory(storage: StorageLike | null = defaultStorage()): HistoryEntry[] {
  try {
    storage?.removeItem(HISTORY_KEY);
  } catch {
    // Nothing useful to do; the in-memory list is cleared by the caller.
  }
  return [];
}

// ---------------------------------------------------------------------------
// Reactive store for useSyncExternalStore. Framework-free so it can be tested
// without React: pass a fake storage and a fake event target.
// ---------------------------------------------------------------------------

export interface StorageEventTarget {
  addEventListener(type: "storage", listener: (e: { key: string | null }) => void): void;
  removeEventListener(type: "storage", listener: (e: { key: string | null }) => void): void;
}

export interface HistoryStore {
  getSnapshot(): HistoryEntry[];
  subscribe(listener: () => void): () => void;
  add(entry: HistoryEntry): void;
  update(id: string, patch: Partial<Omit<HistoryEntry, "id">>): void;
  remove(id: string): void;
  clear(): void;
  // False when localStorage is unusable; history then lasts only for this page load.
  available: boolean;
}

export function createHistoryStore(options?: {
  storage?: StorageLike | null;
  events?: StorageEventTarget | null;
}): HistoryStore {
  const requested = options && "storage" in options ? (options.storage ?? null) : defaultStorage();
  const available = probe(requested);
  const storage: StorageLike = available && requested ? requested : createMemoryStorage();
  const events: StorageEventTarget | null =
    options && "events" in options
      ? (options.events ?? null)
      : typeof window !== "undefined"
        ? window
        : null;

  const listeners = new Set<() => void>();
  // null means "stale, reload on next read". Reads keep the same array until a change.
  let snapshot: HistoryEntry[] | null = null;

  const emit = () => {
    for (const l of listeners) l();
  };
  const commit = (next: HistoryEntry[]) => {
    snapshot = next;
    emit();
  };

  const onStorage = (e: { key: string | null }) => {
    if (e.key !== null && e.key !== HISTORY_KEY) return;
    snapshot = loadHistory(storage);
    emit();
  };

  return {
    available,
    getSnapshot() {
      if (snapshot === null) snapshot = loadHistory(storage);
      return snapshot;
    },
    subscribe(listener) {
      if (listeners.size === 0 && available) events?.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          if (available) events?.removeEventListener("storage", onStorage);
          snapshot = null; // another tab may change it while nobody is listening
        }
      };
    },
    add: (entry) => commit(addEntry(entry, storage)),
    update: (id, patch) => commit(updateEntry(id, patch, storage)),
    remove: (id) => commit(removeEntry(id, storage)),
    clear: () => commit(clearHistory(storage)),
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

// Never throws: a bad network or hash (e.g. tampered storage) gives an inert "#" link.
export function explorerUrl(network: NetworkId, hash: string): string {
  const h = normalizeHash(hash);
  if (!isNetworkId(network) || !h) return "#";
  return `${NETWORKS[network].explorer}/transactions/${h}`;
}

export function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const seconds = Math.floor((now - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

export function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 5)}…${address.slice(-4)}`;
}

// 40-hex currency codes are usually padded ASCII; show the text when it is.
function currencyLabel(code: string): string {
  if (!/^[0-9A-Fa-f]{40}$/.test(code)) return code;
  const text = (code.match(/../g) ?? [])
    .map((h) => parseInt(h, 16))
    .filter((n) => n !== 0)
    .map((n) => String.fromCharCode(n))
    .join("");
  return /^[\x20-\x7e]+$/.test(text) ? text : `${code.slice(0, 6)}…`;
}

function amountText(amount: unknown): string | null {
  if (typeof amount === "string") {
    try {
      return `${dropsToXrp(amount)} XRP`;
    } catch {
      return amount;
    }
  }
  if (isObject(amount) && isStr(amount.currency)) {
    const value = isStr(amount.value) ? `${amount.value} ` : "";
    return `${value}${currencyLabel(amount.currency)}`;
  }
  return null;
}

export function summarizeTx(tx: TxJson): string {
  const type = isStr(tx.TransactionType) ? tx.TransactionType : "Transaction";
  const dest = isStr(tx.Destination) ? shortAddress(tx.Destination) : null;
  const join = (parts: Array<string | null>) => parts.filter(Boolean).join(" ");

  switch (type) {
    case "Payment": {
      const amount = amountText(tx.Amount);
      return join([type, amount, dest && `→ ${dest}`]);
    }
    case "EscrowCreate": {
      const amount = amountText(tx.Amount);
      return join([type, amount, dest && `→ ${dest}`]);
    }
    case "CheckCreate": {
      const amount = amountText(tx.SendMax);
      return join([type, amount, dest && `→ ${dest}`]);
    }
    case "TrustSet": {
      const limit = isObject(tx.LimitAmount) ? tx.LimitAmount : null;
      return join([type, limit && isStr(limit.currency) ? currencyLabel(limit.currency) : null]);
    }
    case "OfferCreate": {
      const gets = amountText(tx.TakerGets);
      const pays = amountText(tx.TakerPays);
      return join([type, gets, gets && pays ? `→ ${pays}` : null]);
    }
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// On-ledger lookup
// ---------------------------------------------------------------------------

export interface LookupResult {
  found: boolean;
  validated?: boolean;
  engineResult?: string;
}

function isNotFound(e: unknown): boolean {
  if (!isObject(e)) return false;
  const data = isObject(e.data) ? e.data : null;
  return data?.error === "txnNotFound" || (isStr(e.message) && e.message.includes("txnNotFound"));
}

export async function lookupTx(network: NetworkId, hash: string): Promise<LookupResult> {
  const h = normalizeHash(hash);
  if (!isNetworkId(network)) throw new Error(`Unknown network: ${String(network)}`);
  if (!h)
    throw new Error("That doesn't look like a transaction hash (expected 64 hex characters).");
  return withClient(NETWORKS[network], async (client) => {
    try {
      const response = await client.request({ command: "tx", transaction: h });
      const result = response.result as unknown as Record<string, unknown>;
      const meta = isObject(result.meta) ? result.meta : null;
      return {
        found: true,
        validated: result.validated === true,
        engineResult: meta && isStr(meta.TransactionResult) ? meta.TransactionResult : undefined,
      };
    } catch (e) {
      if (isNotFound(e)) return { found: false };
      throw e;
    }
  });
}
