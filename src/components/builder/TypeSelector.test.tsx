import { describe, expect, it } from "vitest";
import type { TxSchema } from "../../lib/txSchemaTypes";
import { filterSchemas } from "./TypeSelector";

const mk = (type: string, label: string, description: string, category: TxSchema["category"]): TxSchema => ({
  type,
  label,
  description,
  category,
  icon: type[0],
  fields: [],
  build: () => ({ TransactionType: type }),
});

const schemas = [
  mk("Payment", "Payment", "Send XRP or issued currency", "payments"),
  mk("AccountSet", "Account Settings", "Change domain and account flags", "account"),
  mk("TrustSet", "Trust Line", "Allow holding an issued currency", "trust-dex"),
  mk("NFTokenMint", "Mint NFT", "Create a new NFT", "nft"),
];

describe("filterSchemas", () => {
  it("keeps the original order with no query", () => {
    expect(filterSchemas(schemas, "").map((s) => s.type)).toEqual(schemas.map((s) => s.type));
  });

  it("filters by category", () => {
    expect(filterSchemas(schemas, "", "nft").map((s) => s.type)).toEqual(["NFTokenMint"]);
  });

  it("matches label, type and description, case-insensitively", () => {
    expect(filterSchemas(schemas, "PAYMENT").map((s) => s.type)).toEqual(["Payment"]);
    expect(filterSchemas(schemas, "trustset").map((s) => s.type)).toEqual(["TrustSet"]);
    expect(filterSchemas(schemas, "domain").map((s) => s.type)).toEqual(["AccountSet"]);
  });

  it("matches fuzzily (in-order characters) in label or type", () => {
    expect(filterSchemas(schemas, "nftm").map((s) => s.type)).toEqual(["NFTokenMint"]);
  });

  it("ranks prefix matches above description matches", () => {
    // "issued" is in two descriptions; "iss" prefix-matches neither label, so order falls back to input order
    expect(filterSchemas(schemas, "issued").map((s) => s.type)).toEqual(["Payment", "TrustSet"]);
    expect(filterSchemas(schemas, "acc")[0].type).toBe("AccountSet");
  });

  it("requires every token to match", () => {
    expect(filterSchemas(schemas, "issued trust").map((s) => s.type)).toEqual(["TrustSet"]);
    expect(filterSchemas(schemas, "issued nft")).toEqual([]);
  });

  it("combines query with category", () => {
    expect(filterSchemas(schemas, "issued", "payments").map((s) => s.type)).toEqual(["Payment"]);
  });
});
