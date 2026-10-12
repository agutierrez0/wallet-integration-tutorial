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
  walletLabel,
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
    seed(storage, [entry(1), entry(3, { hash: entry(1).hash, id: "newer-same-hash" }), entry(2)]);
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
    const h = "A".repeat(64);
    expect(explorerUrl("testnet", h)).toBe(`https://testnet.xrpl.org/transactions/${h}`);
    expect(explorerUrl("devnet", h)).toBe(`https://devnet.xrpl.org/transactions/${h}`);
    expect(explorerUrl("mainnet", h)).toBe(`https://livenet.xrpl.org/transactions/${h}`);
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

const HASH = "A".repeat(64);

describe("lookupTx", () => {
  const mockClient = (request: (req: unknown) => Promise<unknown>) =>
    vi
      .mocked(withClient)
      .mockImplementation(((_net: unknown, fn: (c: unknown) => unknown) =>
        fn({ request })) as never);

  it("returns found, validated and the engine result", async () => {
    const request = vi.fn().mockResolvedValue({
      result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } },
    });
    mockClient(request);
    await expect(lookupTx("testnet", HASH)).resolves.toEqual({
      found: true,
      validated: true,
      engineResult: "tesSUCCESS",
    });
    expect(request).toHaveBeenCalledWith({ command: "tx", transaction: HASH });
  });

  it("reports not validated when the ledger hasn't closed yet", async () => {
    mockClient(
      vi.fn().mockResolvedValue({ result: { meta: { TransactionResult: "tesSUCCESS" } } }),
    );
    await expect(lookupTx("devnet", HASH)).resolves.toMatchObject({
      found: true,
      validated: false,
    });
  });

  it("treats txnNotFound as found:false (via data.error or message)", async () => {
    mockClient(
      vi.fn().mockRejectedValue(Object.assign(new Error("x"), { data: { error: "txnNotFound" } })),
    );
    await expect(lookupTx("testnet", HASH)).resolves.toEqual({ found: false });
    mockClient(vi.fn().mockRejectedValue(new Error("RippledError: txnNotFound")));
    await expect(lookupTx("testnet", HASH)).resolves.toEqual({ found: false });
  });

  it("rethrows other errors", async () => {
    mockClient(vi.fn().mockRejectedValue(new Error("connection lost")));
    await expect(lookupTx("testnet", HASH)).rejects.toThrow("connection lost");
  });
});

describe("tampered storage", () => {
  it("drops rows whose network is an inherited object key", () => {
    seed(storage, [
      entry(1, { network: "constructor" as never }),
      entry(2, { network: "__proto__" as never }),
      entry(3, { network: "toString" as never }),
      entry(4),
    ]);
    expect(loadHistory(storage).map((e) => e.id)).toEqual(["id-4"]);
  });

  it("drops rows whose hash is not 64 hex characters", () => {
    seed(storage, [
      entry(1, { hash: "ABC" }),
      entry(2, { hash: `../../${"A".repeat(58)}` }),
      entry(3, { hash: `${"A".repeat(64)}?evil=1` }),
      entry(4, { hash: 7 as never }),
      entry(5),
    ]);
    expect(loadHistory(storage).map((e) => e.id)).toEqual(["id-5"]);
  });

  it("normalizes a lowercase hash to uppercase", () => {
    seed(storage, [entry(1, { hash: "ab".repeat(32) })]);
    expect(loadHistory(storage)[0].hash).toBe("AB".repeat(32));
  });

  it("de-dupes rows that differ only by hash case", () => {
    seed(storage, [entry(1, { hash: "ab".repeat(32) }), entry(2, { hash: "AB".repeat(32) })]);
    expect(loadHistory(storage)).toHaveLength(1);
  });

  it("sanitizes previousHashes and ignores non-arrays", () => {
    const good = "C".repeat(64);
    seed(storage, [
      entry(1, { previousHashes: [good, "junk", good.toLowerCase(), entry(1).hash, 5 as never] }),
      entry(2, { previousHashes: "nope" as never }),
    ]);
    const rows = loadHistory(storage);
    expect(rows.find((r) => r.id === "id-1")?.previousHashes).toEqual([good]);
    expect(rows.find((r) => r.id === "id-2")?.previousHashes).toBeUndefined();
  });

  it("does not let a stored __proto__ key pollute anything", () => {
    storage.setItem(
      HISTORY_KEY,
      `[{"id":"x","createdAt":1,"network":"testnet","walletId":"w","account":"a","txType":"T",` +
        `"tx":{"__proto__":{"polluted":true}},"hash":"${"A".repeat(64)}","status":"signed"}]`,
    );
    loadHistory(storage);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("addEntry refuses an invalid hash or network", () => {
    addEntry(entry(1, { hash: "nope" }), storage);
    addEntry(entry(2, { network: "constructor" as never }), storage);
    expect(loadHistory(storage)).toEqual([]);
  });
});

describe("explorerUrl and lookupTx with bad input", () => {
  it("explorerUrl gives an inert link for a bad hash or network", () => {
    expect(explorerUrl("testnet", "../etc/passwd")).toBe("#");
    expect(explorerUrl("constructor" as never, "A".repeat(64))).toBe("#");
  });

  it("explorerUrl uppercases a valid hash", () => {
    expect(explorerUrl("testnet", "ab".repeat(32))).toBe(
      `https://testnet.xrpl.org/transactions/${"AB".repeat(32)}`,
    );
  });

  it("lookupTx rejects before connecting when the hash or network is bad", async () => {
    vi.mocked(withClient).mockClear();
    await expect(lookupTx("testnet", "nope")).rejects.toThrow(/64 hex/);
    await expect(lookupTx("constructor" as never, "A".repeat(64))).rejects.toThrow(
      /Unknown network/,
    );
    expect(withClient).not.toHaveBeenCalled();
  });
});

describe("re-keyed rows", () => {
  const OLD = "A".repeat(64);
  const NEW = "B".repeat(64);

  it("updateEntry with a new hash re-keys the row and remembers the old one", () => {
    addEntry(entry(1, { hash: OLD }), storage);
    updateEntry("id-1", { hash: NEW, status: "submitted" }, storage);
    const [row] = loadHistory(storage);
    expect(row.hash).toBe(NEW);
    expect(row.previousHashes).toEqual([OLD]);
    expect(row.status).toBe("submitted");
  });

  it("re-signing the old blob updates the same row instead of adding a duplicate", () => {
    addEntry(entry(1, { hash: OLD }), storage);
    updateEntry("id-1", { hash: NEW, status: "submitted", engineResult: "tesSUCCESS" }, storage);
    addEntry(entry(2, { hash: OLD }), storage);
    const rows = loadHistory(storage);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("id-1");
    expect(rows[0].hash).toBe(NEW);
    expect(rows[0].status).toBe("submitted"); // not downgraded to signed
    expect(rows[0].engineResult).toBe("tesSUCCESS");
  });

  it("an invalid hash in an update patch is ignored", () => {
    addEntry(entry(1, { hash: OLD }), storage);
    updateEntry("id-1", { hash: "garbage", status: "failed" }, storage);
    const [row] = loadHistory(storage);
    expect(row.hash).toBe(OLD);
    expect(row.status).toBe("failed");
  });

  it("re-keying onto a hash another row already has does not leave two rows with it", () => {
    addEntry(entry(1, { hash: OLD }), storage);
    addEntry(entry(2, { hash: NEW }), storage);
    updateEntry("id-1", { hash: NEW }, storage);
    const rows = loadHistory(storage);
    expect(rows.filter((r) => r.hash === NEW)).toHaveLength(1);
    expect(rows.map((r) => r.id)).toEqual(["id-1"]);
  });

  it("caller-supplied previousHashes in a patch cannot overwrite the recorded ones", () => {
    addEntry(entry(1, { hash: OLD }), storage);
    updateEntry("id-1", { hash: NEW, previousHashes: ["C".repeat(64)] }, storage);
    expect(loadHistory(storage)[0].previousHashes).toEqual([OLD]);
  });
});

describe("walletLabel", () => {
  it("names the known wallets and falls back to the stored id", () => {
    expect(walletLabel("crossmark")).toBe("Crossmark");
    expect(walletLabel("gemwallet")).toBe("GemWallet");
    expect(walletLabel("xaman")).toBe("Xaman");
    expect(walletLabel("ledger")).toBe("Ledger");
    expect(walletLabel("some-future-wallet")).toBe("some-future-wallet");
    expect(walletLabel("")).toBe("Unknown wallet");
  });
});
