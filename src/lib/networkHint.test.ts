import { describe, expect, it } from "vitest";
import { networkMismatchMessage, normalizeNetworkHint } from "./networkHint";

describe("normalizeNetworkHint", () => {
  it.each([
    ["Testnet", "testnet"],
    ["wss://s.altnet.rippletest.net:51233", "testnet"],
    ["https://s.altnet.rippletest.net:51234", "testnet"],
    ["devnet", "devnet"],
    ["AMM-Devnet", "devnet"],
    ["wss://s.devnet.rippletest.net:51233", "devnet"],
    ["Mainnet", "mainnet"],
    ["wss://xrplcluster.com", "mainnet"],
    ["wss://s1.ripple.com", "mainnet"],
    ["XRPL", "unknown"],
    ["Custom", "unknown"],
  ])("%s -> %s", (hint, expected) => {
    expect(normalizeNetworkHint(hint)).toBe(expected);
  });

  it("returns undefined without a hint", () => {
    expect(normalizeNetworkHint(undefined)).toBeUndefined();
    expect(normalizeNetworkHint("  ")).toBeUndefined();
  });
});

describe("networkMismatchMessage", () => {
  it("names both networks when they differ", () => {
    expect(networkMismatchMessage("Testnet", "devnet")).toMatch(/wallet is on Testnet but the app is on Devnet/);
  });
  it("is quiet when they match, are unknown, or missing", () => {
    expect(networkMismatchMessage("testnet", "testnet")).toBeNull();
    expect(networkMismatchMessage("XRPL", "devnet")).toBeNull();
    expect(networkMismatchMessage(undefined, "devnet")).toBeNull();
  });
});
