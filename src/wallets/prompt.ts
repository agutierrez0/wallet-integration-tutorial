import { WalletError } from "./errors";

export const PROMPT_TIMEOUT_MS = 120_000;
export const PROBE_TIMEOUT_MS = 3_000;

export function cancelledError(wallet: string): WalletError {
  return new WalletError("CANCELLED", `Stopped waiting for ${wallet}.`);
}

export function throwIfAborted(wallet: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError(wallet);
}

// Resolves to false if the probe hangs or throws; never rejects.
export function probeWithTimeout(probe: () => Promise<boolean>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
    probe().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

// Extension prompts wait on a human and cannot be withdrawn, so all we can do is stop waiting:
// on timeout (EXPIRED) or abort (CANCELLED). Anything unexpected becomes UNKNOWN.
export async function runPrompt<T>(opts: {
  wallet: string;
  action: string;
  run: () => Promise<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<T> {
  const { wallet, action, run, signal, timeoutMs = PROMPT_TIMEOUT_MS } = opts;
  throwIfAborted(wallet, signal);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new WalletError(
            "EXPIRED",
            `Stopped waiting for ${wallet}. If you approve it later it may still be submitted — check history or the explorer.`,
          ),
        ),
      timeoutMs,
    );
    if (signal) {
      onAbort = () => reject(cancelledError(wallet));
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });

  const running = run();
  running.catch(() => {}); // a late failure after we stopped waiting must not go unhandled
  try {
    return await Promise.race([running, stop]);
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new WalletError("UNKNOWN", `${wallet}: ${action} failed`, { cause: err });
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
