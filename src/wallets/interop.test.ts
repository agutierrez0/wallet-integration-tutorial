import { describe, expect, it } from "vitest";
import { unwrapDefault } from "./interop";

const sdk = { sync: {}, methods: {} };
const hasSync = (v: unknown) => typeof v === "object" && v !== null && "sync" in v;

describe("unwrapDefault", () => {
  it("returns the value however deeply it is wrapped in `default`", () => {
    expect(unwrapDefault(sdk, hasSync)).toBe(sdk);
    expect(unwrapDefault({ default: sdk }, hasSync)).toBe(sdk);
    // The shape Vite's dev server produces for @crossmarkio/sdk.
    expect(unwrapDefault({ default: { vanilla: 1, typings: 2, default: sdk } }, hasSync)).toBe(sdk);
  });

  it("throws a clear error when the value is nowhere in the chain", () => {
    expect(() => unwrapDefault({ default: { other: 1 } }, hasSync)).toThrow(/unexpected shape/);
    expect(() => unwrapDefault(undefined, hasSync)).toThrow(/unexpected shape/);
  });
});
