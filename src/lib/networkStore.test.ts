import { describe, expect, it } from "vitest";
import {
  DEFAULT_NETWORK,
  NETWORK_KEY,
  isNetworkId,
  readStoredNetwork,
  storeNetwork,
} from "./networkStore";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("readStoredNetwork", () => {
  it("defaults to testnet when nothing is stored", () => {
    expect(readStoredNetwork(fakeStorage())).toBe("testnet");
    expect(DEFAULT_NETWORK).toBe("testnet");
  });

  it.each(["testnet", "devnet", "mainnet"] as const)("restores %s", (id) => {
    expect(readStoredNetwork(fakeStorage({ [NETWORK_KEY]: id }))).toBe(id);
  });

  it.each(["", "foo", "MAINNET", "constructor", "__proto__", "toString", "hasOwnProperty"])(
    "falls back to testnet for invalid value %j",
    (bad) => {
      expect(readStoredNetwork(fakeStorage({ [NETWORK_KEY]: bad }))).toBe("testnet");
    },
  );

  it("falls back to testnet when storage throws or is unavailable", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(readStoredNetwork(throwing)).toBe("testnet");
    expect(readStoredNetwork(null)).toBe("testnet");
  });
});

describe("storeNetwork", () => {
  it("persists under the versioned key", () => {
    const s = fakeStorage();
    storeNetwork("devnet", s);
    expect(s.data.get("xrpl-wallet-sandbox:network:v1")).toBe("devnet");
    expect(readStoredNetwork(s)).toBe("devnet");
  });

  it("never throws when storage is blocked or full", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => storeNetwork("mainnet", throwing)).not.toThrow();
    expect(() => storeNetwork("mainnet", null)).not.toThrow();
  });
});

describe("isNetworkId", () => {
  it("accepts own keys only", () => {
    expect(isNetworkId("mainnet")).toBe(true);
    expect(isNetworkId("constructor")).toBe(false);
    expect(isNetworkId(undefined)).toBe(false);
    expect(isNetworkId(1)).toBe(false);
  });
});
