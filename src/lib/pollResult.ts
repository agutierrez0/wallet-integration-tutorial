import type { NetworkId } from "./networks";
import type { LookupResult } from "./history";

export interface PollOptions {
  lookup: (network: NetworkId, hash: string) => Promise<LookupResult>;
  signal?: AbortSignal;
  attempts?: number;
  // Delay before each retry; the last value repeats.
  delaysMs?: number[];
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DEFAULT_DELAYS = [2000, 3000, 4000];

function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Looks a transaction up until it is found in a validated ledger or attempts run out.
// Lookup errors (e.g. a dropped connection) count as "not found yet". Throws only on abort.
// Resolves to the last result: found:false if it never appeared.
export async function pollTxResult(
  network: NetworkId,
  hash: string,
  opts: PollOptions,
): Promise<LookupResult> {
  const attempts = Math.max(1, opts.attempts ?? 5);
  const delays = opts.delaysMs?.length ? opts.delaysMs : DEFAULT_DELAYS;
  const sleep = opts.sleep ?? sleepAbortable;
  let last: LookupResult = { found: false };
  for (let i = 0; i < attempts; i++) {
    if (opts.signal?.aborted) throw abortError();
    try {
      last = await opts.lookup(network, hash);
    } catch {
      last = { found: false };
    }
    if (opts.signal?.aborted) throw abortError();
    if (last.found && last.validated) return last;
    if (i < attempts - 1) await sleep(delays[Math.min(i, delays.length - 1)], opts.signal);
  }
  return last;
}
