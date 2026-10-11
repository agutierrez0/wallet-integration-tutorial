// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAction } from "./useAction";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAction", () => {
  it("goes idle -> loading -> success", async () => {
    const d = deferred<number>();
    const { result } = renderHook(() => useAction(() => d.promise));
    expect(result.current.status).toBe("idle");
    let p!: Promise<number | undefined>;
    act(() => {
      p = result.current.run();
    });
    expect(result.current.status).toBe("loading");
    await act(async () => {
      d.resolve(7);
      await p;
    });
    expect(result.current.status).toBe("success");
    expect(result.current.data).toBe(7);
  });

  it("stores errors and never throws", async () => {
    const { result } = renderHook(() =>
      useAction(async () => {
        throw new Error("boom");
      }),
    );
    await act(async () => {
      await expect(result.current.run()).resolves.toBeUndefined();
    });
    expect(result.current.status).toBe("error");
    expect((result.current.error as Error).message).toBe("boom");
  });

  it("aborts the signal on reset and ignores the late result", async () => {
    const d = deferred<string>();
    let seen: AbortSignal | undefined;
    const { result } = renderHook(() =>
      useAction(({ signal }) => {
        seen = signal;
        return d.promise;
      }),
    );
    let p!: Promise<string | undefined>;
    act(() => {
      p = result.current.run();
    });
    expect(seen?.aborted).toBe(false);
    act(() => result.current.reset());
    expect(seen?.aborted).toBe(true);
    expect(result.current.status).toBe("idle");
    await act(async () => {
      d.resolve("late");
      await p;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("aborts the older run when a newer one starts", async () => {
    const signals: AbortSignal[] = [];
    const ds = [deferred<string>(), deferred<string>()];
    let i = 0;
    const { result } = renderHook(() =>
      useAction(({ signal }) => {
        signals.push(signal);
        return ds[i++].promise;
      }),
    );
    let p1!: Promise<string | undefined>;
    let p2!: Promise<string | undefined>;
    act(() => {
      p1 = result.current.run();
    });
    act(() => {
      p2 = result.current.run();
    });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await act(async () => {
      ds[0].resolve("old");
      ds[1].resolve("new");
      await Promise.all([p1, p2]);
    });
    expect(result.current.data).toBe("new");
  });

  it("aborts on unmount", () => {
    let seen: AbortSignal | undefined;
    const { result, unmount } = renderHook(() =>
      useAction(({ signal }) => {
        seen = signal;
        return new Promise<void>(() => {});
      }),
    );
    act(() => {
      void result.current.run();
    });
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it("passes extra args after the context", async () => {
    const { result } = renderHook(() =>
      useAction(async (_ctx, a: number, b: string) => `${a}${b}`),
    );
    await act(async () => {
      await result.current.run(1, "x");
    });
    expect(result.current.data).toBe("1x");
  });
});
