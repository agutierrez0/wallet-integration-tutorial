import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addEntry,
  clearHistory,
  createHistoryStore,
  createMemoryStorage,
  explorerUrl,
  formatRelativeTime,
  loadHistory,
  lookupTx,
  removeEntry,
  shortHash,
  summarizeTx,
  updateEntry,
  type StorageEventTarget,
  type StorageLike,
} from "./history";
import { HISTORY_KEY, HISTORY_LIMIT, type HistoryEntry } from "./historyTypes";
import { withClient } from "./tx";

vi.mock("./tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tx")>()),
  withClient: vi.fn(),
}));

function entry(n: number, patch: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `id-${n}`,
    createdAt: 1_000 + n,
    network: "testnet",
    walletId: "crossmark",
    account: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    txType: "AccountSet",
    tx: { TransactionType: "AccountSet" },
    hash: String(n).padStart(64, "0"),
    status: "signed",
    ...patch,
  };
}

function seed(storage: StorageLike, value: unknown) {
  storage.setItem(HISTORY_KEY, typeof value === "string" ? value : JSON.stringify(value));
}

let storage: StorageLike;
beforeEach(() => {
  storage = createMemoryStorage();
});

describe("loadHistory", () => {
  it("returns [] for no storage, empty storage, bad JSON and non-arrays", () => {
    expect(loadHistory(null)).toEqual([]);
    expect(loadHistory(storage)).toEqual([]);
    seed(storage, "{not json");
    expect(loadHistory(storage)).toEqual([]);
    seed(storage, { not: "an array" });
    expect(loadHistory(storage)).toEqual([]);
  });

  it("never throws when storage access throws", () => {
    const angry: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadHistory(angry)).toEqual([]);
    expect(() => addEntry(entry(1), angry)).not.toThrow();
    expect(() => clearHistory(angry)).not.toThrow();
  });

  it("drops malformed entries and keeps good ones", () => {
    seed(storage, [
      entry(1),
      null,
      "string",
      { ...entry(2), network: "moonnet" },
      { ...entry(3), status: "weird" },
      { ...entry(4), tx: "not an object" },
      { ...entry(5), createdAt: "yesterday" },
      { ...entry(6), hash: "" },
      { id: "x" },
      entry(7),
    ]);
    expect(loadHistory(storage).map((e) => e.id)).toEqual(["id-7", "id-1"]);
  });

  it("strips invalid optional fields instead of dropping the entry", () => {
    seed(storage, [
      {
        ...entry(1),
        submitVia: "carrier-pigeon",
        engineResult: 42,
        validated: "yes",
        submittedAt: "soon",
        signedBlob: 7,
        extra: "ignored",
      },
    ]);
    const [loaded] = loadHistory(storage);
    expect(loaded).toEqual(entry(1));
    expect(loaded).not.toHaveProperty("extra");
  });

  it("keeps valid optional fields", () => {
    const full = entry(1, {
      status: "submitted",
      submitVia: "xrpljs",
      engineResult: "tesSUCCESS",
      validated: true,
      submittedAt: 5_000,
      signedBlob: "AB12",
    });
    seed(storage, [full]);
    expect(loadHistory(storage)).toEqual([full]);
  });

  it("sorts newest first and de-dupes by hash, keeping the newest", () => {
    seed(storage, [
      entry(1),
      entry(3, { hash: entry(1).hash, id: "newer-same-hash" }),
      entry(2),
    ]);
    expect(loadHistory(storage).map((e) => e.id)).toEqual(["newer-same-hash", "id-2"]);
  });
});

describe("addEntry", () => {
  it("puts new entries first and persists them", () => {
    addEntry(entry(1), storage);
    const list = addEntry(entry(2), storage);
    expect(list.map((e) => e.id)).toEqual(["id-2", "id-1"]);
    expect(loadHistory(storage).map((e) => e.id)).toEqual(["id-2", "id-1"]);
  });

  it(`caps at ${HISTORY_LIMIT} and drops the oldest`, () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = addEntry(entry(i), storage);
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0].id).toBe(`id-${HISTORY_LIMIT + 4}`);
    expect(list.some((e) => e.id === "id-0")).toBe(false);
    expect(loadHistory(storage)).toHaveLength(HISTORY_LIMIT);
  });

  it("updates instead of duplicating when the hash repeats", () => {
    addEntry(entry(1), storage);
    addEntry(entry(2), storage);
    const list = addEntry(
      entry(3, { hash: entry(1).hash, id: "fresh-id", walletId: "gemwallet" }),
      storage,
    );
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("id-1"); // original id kept
    expect(list[0].walletId).toBe("gemwallet"); // new data applied
    expect(list[0].createdAt).toBe(entry(3).createdAt);
  });

  it("does not downgrade a submitted entry when the same blob is signed again", () => {
    addEntry(
      entry(1, {
        status: "submitted",
        submitVia: "xrpljs",
        engineResult: "tesSUCCESS",
        validated: true,
        submittedAt: 9_000,
      }),
      storage,
    );
    const [merged] = addEntry(entry(2, { hash: entry(1).hash }), storage);
    expect(merged.status).toBe("submitted");
    expect(merged.engineResult).toBe("tesSUCCESS");
    expect(merged.submitVia).toBe("xrpljs");
    expect(merged.validated).toBe(true);
    expect(merged.submittedAt).toBe(9_000);
  });
});

describe("quota errors", () => {
  it("persists a trimmed list after one failed write", () => {
    const inner = createMemoryStorage();
    for (let i = 0; i < 8; i++) addEntry(entry(i), inner);
    let fail = true;
    const s: StorageLike = {
      getItem: (k) => inner.getItem(k),
      removeItem: (k) => inner.removeItem(k),
      setItem: (k, v) => {
        if (fail) {
          fail = false;
          throw new DOMException("full", "QuotaExceededError");
        }
        inner.setItem(k, v);
      },
    };
    const list = addEntry(entry(100), s);
    // 9 entries -> newest half (4) retried and saved
    expect(list).toHaveLength(4);
    expect(list[0].id).toBe("id-100");
    expect(loadHistory(inner)).toHaveLength(4);
  });

  it("returns the list unsaved, without throwing, when the retry fails too", () => {
    const s: StorageLike = {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    let list: HistoryEntry[] = [];
    expect(() => {
      list = addEntry(entry(1), s);
    }).not.toThrow();
    expect(list.map((e) => e.id)).toEqual(["id-1"]);
  });
});

describe("updateEntry / removeEntry / clearHistory", () => {
  it("patches an entry but never changes its id", () => {
    addEntry(entry(1), storage);
    const list = updateEntry(
      "id-1",
      { status: "submitted", engineResult: "tesSUCCESS", id: "hacked" } as never,
      storage,
    );
    expect(list[0].id).toBe("id-1");
    expect(list[0].status).toBe("submitted");
    expect(loadHistory(storage)[0].engineResult).toBe("tesSUCCESS");
  });

  it("is a no-op for an unknown id", () => {
    addEntry(entry(1), storage);
    expect(updateEntry("nope", { status: "failed" }, storage)).toHaveLength(1);
    expect(removeEntry("nope", storage)).toHaveLength(1);
  });

  it("removes one entry and clears all", () => {
    addEntry(entry(1), storage);
    addEntry(entry(2), storage);
    expect(removeEntry("id-1", storage).map((e) => e.id)).toEqual(["id-2"]);
    expect(clearHistory(storage)).toEqual([]);
    expect(storage.getItem(HISTORY_KEY)).toBeNull();
    expect(loadHistory(storage)).toEqual([]);
  });
});

describe("createHistoryStore", () => {
  function fakeEvents() {
    let handler: ((e: { key: string | null }) => void) | null = null;
    const target: StorageEventTarget = {
      addEventListener: (_t, fn) => {
        handler = fn;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    return {
      target,
      fire: (key: string | null) => handler?.({ key }),
      attached: () => handler !== null,
    };
  }

  it("notifies every subscriber (cross-instance, same tab) on changes", () => {
    const store = createHistoryStore({ storage, events: null });
    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe(a);
    const offB = store.subscribe(b);
    store.add(entry(1));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    store.add(entry(2));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
  });

  it("returns a referentially stable snapshot until something changes", () => {
    const store = createHistoryStore({ storage, events: null });
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.add(entry(1));
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(store.getSnapshot()).toBe(second);
    expect(second.map((e) => e.id)).toEqual(["id-1"]);
  });

  it("two stores over the same storage see each other after a storage event", () => {
    const events = fakeEvents();
    const tabA = createHistoryStore({ storage, events: events.target });
    const tabB = createHistoryStore({ storage, events: null });
    const listener = vi.fn();
    const off = tabA.subscribe(listener);
    expect(events.attached()).toBe(true);

    expect(tabA.getSnapshot()).toHaveLength(0); // primes tabA's cached snapshot
    tabB.add(entry(1)); // "another tab" writes
    expect(tabA.getSnapshot()).toHaveLength(0); // not yet told
    events.fire(HISTORY_KEY);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(tabA.getSnapshot().map((e) => e.id)).toEqual(["id-1"]);

    events.fire("some-other-key"); // unrelated keys are ignored
    expect(listener).toHaveBeenCalledTimes(1);
    events.fire(null); // storage.clear() reloads
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    expect(events.attached()).toBe(false);
  });

  it("reloads from storage after the last subscriber leaves", () => {
    const store = createHistoryStore({ storage, events: null });
    const off = store.subscribe(() => {});
    store.add(entry(1));
    off();
    addEntry(entry(2), storage); // written while nobody listens
    expect(store.getSnapshot().map((e) => e.id)).toEqual(["id-2", "id-1"]);
  });

  it("falls back to in-memory history when storage is unusable", () => {
    const store = createHistoryStore({ storage: null, events: null });
    expect(store.available).toBe(false);
    store.add(entry(1));
    expect(store.getSnapshot().map((e) => e.id)).toEqual(["id-1"]);
    store.clear();
    expect(store.getSnapshot()).toEqual([]);
  });

  it("reports available for working storage and update/remove flow through", () => {
    const store = createHistoryStore({ storage, events: null });
    expect(store.available).toBe(true);
    store.add(entry(1));
    store.update("id-1", { status: "failed" });
    expect(store.getSnapshot()[0].status).toBe("failed");
    store.remove("id-1");
    expect(store.getSnapshot()).toEqual([]);
  });
});

describe("explorerUrl", () => {
  it("builds the explorer link per network", () => {
    expect(explorerUrl("testnet", "ABC")).toBe("https://testnet.xrpl.org/transactions/ABC");
    expect(explorerUrl("devnet", "ABC")).toBe("https://devnet.xrpl.org/transactions/ABC");
    expect(explorerUrl("mainnet", "ABC")).toBe("https://livenet.xrpl.org/transactions/ABC");
  });
});

describe("formatRelativeTime", () => {
  const now = 1_000_000_000_000;
  it("formats each range", () => {
    expect(formatRelativeTime(now - 1_000, now)).toBe("just now");
    expect(formatRelativeTime(now + 60_000, now)).toBe("just now"); // clock skew
    expect(formatRelativeTime(now - 30_000, now)).toBe("30s ago");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(formatRelativeTime(now - 40 * 86_400_000, now)).toBe(
      new Date(now - 40 * 86_400_000).toISOString().slice(0, 10),
    );
  });
});

describe("shortHash", () => {
  it("shortens long hashes and leaves short ones", () => {
    const hash = "A".repeat(8) + "B".repeat(50) + "C".repeat(6);
    expect(shortHash(hash)).toBe("AAAAAAAA…CCCCCC");
    expect(shortHash("SHORT")).toBe("SHORT");
  });
});

describe("summarizeTx", () => {
  it("summarizes common types", () => {
    expect(
      summarizeTx({
        TransactionType: "Payment",
        Amount: "5000000",
        Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      }),
    ).toBe("Payment 5 XRP → rPT1S…pAYe");
    expect(
      summarizeTx({
        TransactionType: "Payment",
        Amount: { currency: "USD", issuer: "rX", value: "12.5" },
        Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      }),
    ).toBe("Payment 12.5 USD → rPT1S…pAYe");
    expect(summarizeTx({ TransactionType: "AccountSet", Domain: "AB" })).toBe("AccountSet");
    expect(
      summarizeTx({
        TransactionType: "TrustSet",
        LimitAmount: { currency: "USD", issuer: "rX", value: "100" },
      }),
    ).toBe("TrustSet USD");
    expect(
      summarizeTx({
        TransactionType: "OfferCreate",
        TakerGets: "1000000",
        TakerPays: { currency: "USD", issuer: "rX", value: "2" },
      }),
    ).toBe("OfferCreate 1 XRP → 2 USD");
  });

  it("decodes 40-hex currency codes", () => {
    const hex = Buffer.from("MYCOIN").toString("hex").toUpperCase().padEnd(40, "0");
    expect(
      summarizeTx({
        TransactionType: "TrustSet",
        LimitAmount: { currency: hex, issuer: "rX", value: "1" },
      }),
    ).toBe("TrustSet MYCOIN");
  });

  it("degrades gracefully on odd input", () => {
    expect(summarizeTx({})).toBe("Transaction");
    expect(summarizeTx({ TransactionType: "Payment" })).toBe("Payment");
    expect(summarizeTx({ TransactionType: "Payment", Amount: "not-drops" })).toBe(
      "Payment not-drops",
    );
    expect(summarizeTx({ TransactionType: "NFTokenMint" })).toBe("NFTokenMint");
  });
});

describe("lookupTx", () => {
  const mockClient = (request: (req: unknown) => Promise<unknown>) =>
    vi.mocked(withClient).mockImplementation(((_net: unknown, fn: (c: unknown) => unknown) =>
      fn({ request })) as never);

  it("returns found, validated and the engine result", async () => {
    const request = vi.fn().mockResolvedValue({
      result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } },
    });
    mockClient(request);
    await expect(lookupTx("testnet", "ABC")).resolves.toEqual({
      found: true,
      validated: true,
      engineResult: "tesSUCCESS",
    });
    expect(request).toHaveBeenCalledWith({ command: "tx", transaction: "ABC" });
  });

  it("reports not validated when the ledger hasn't closed yet", async () => {
    mockClient(vi.fn().mockResolvedValue({ result: { meta: { TransactionResult: "tesSUCCESS" } } }));
    await expect(lookupTx("devnet", "ABC")).resolves.toMatchObject({
      found: true,
      validated: false,
    });
  });

  it("treats txnNotFound as found:false (via data.error or message)", async () => {
    mockClient(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { data: { error: "txnNotFound" } })));
    await expect(lookupTx("testnet", "ABC")).resolves.toEqual({ found: false });
    mockClient(vi.fn().mockRejectedValue(new Error("RippledError: txnNotFound")));
    await expect(lookupTx("testnet", "ABC")).resolves.toEqual({ found: false });
  });

  it("rethrows other errors", async () => {
    mockClient(vi.fn().mockRejectedValue(new Error("connection lost")));
    await expect(lookupTx("testnet", "ABC")).rejects.toThrow("connection lost");
  });
});
