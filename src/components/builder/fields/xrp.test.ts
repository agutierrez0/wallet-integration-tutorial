import { describe, expect, it } from "vitest";
import { sanitizeXrp, xrpToDrops } from "./XrpField";

describe("sanitizeXrp", () => {
  it("keeps digits and one dot, max 6 decimals", () => {
    expect(sanitizeXrp("1a2.3.4")).toBe("12.34");
    expect(sanitizeXrp("0.12345678")).toBe("0.123456");
    expect(sanitizeXrp("abc")).toBe("");
  });
});

describe("xrpToDrops", () => {
  it("converts to drops", () => {
    expect(xrpToDrops("1")).toBe(1_000_000n);
    expect(xrpToDrops("1.5")).toBe(1_500_000n);
    expect(xrpToDrops("0.000001")).toBe(1n);
    expect(xrpToDrops(".5")).toBe(500_000n);
  });
  it("returns null for nothing numeric", () => {
    expect(xrpToDrops("")).toBeNull();
    expect(xrpToDrops(".")).toBeNull();
  });
});
