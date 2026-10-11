import { useCallback, useEffect, useRef, useState } from "react";

export type ActionStatus = "idle" | "loading" | "success" | "error";

export interface ActionState<T> {
  status: ActionStatus;
  data: T | undefined;
  error: unknown;
}

export interface UseAction<Args extends unknown[], T> extends ActionState<T> {
  run: (...args: Args) => Promise<T | undefined>;
  reset: () => void;
}

const IDLE = { status: "idle", data: undefined, error: undefined } as const;

// Wraps an async function with loading/success/error state.
// Only the latest run() may update state; earlier or reset runs are ignored.
// run() never throws: failures land in `error`, and it resolves to undefined.
export function useAction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
): UseAction<Args, T> {
  const [state, setState] = useState<ActionState<T>>(IDLE);
  const ticket = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => {
      ticket.current++; // invalidate in-flight runs on unmount
    };
  }, []);

  const run = useCallback(async (...args: Args) => {
    const mine = ++ticket.current;
    setState({ status: "loading", data: undefined, error: undefined });
    try {
      const data = await fnRef.current(...args);
      if (mine === ticket.current) {
        setState({ status: "success", data, error: undefined });
      }
      return data;
    } catch (error) {
      if (mine === ticket.current) {
        setState({ status: "error", data: undefined, error });
      }
      return undefined;
    }
  }, []);

  const reset = useCallback(() => {
    ticket.current++;
    setState(IDLE);
  }, []);

  return { ...state, run, reset };
}
