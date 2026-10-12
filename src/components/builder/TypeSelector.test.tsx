// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { CATEGORIES, SCHEMAS } from "../../lib/txSchemas";
import { TypeSelector } from "./TypeSelector";
import { describe, expect, it } from "vitest";
import type { TxSchema } from "../../lib/txSchemaTypes";
import { filterSchemas } from "./TypeSelector";

const mk = (
  type: string,
  label: string,
  description: string,
  category: TxSchema["category"],
): TxSchema => ({
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

afterEach(() => cleanup());

describe("TypeSelector", () => {
  const setup = (value?: string, onSelect = vi.fn()) => {
    render(
      <TypeSelector schemas={SCHEMAS} categories={CATEGORIES} value={value} onSelect={onSelect} />,
    );
    return onSelect;
  };

  it("is a labelled combobox", () => {
    setup();
    expect(screen.getByRole("combobox", { name: "Transaction type" })).toBeTruthy();
  });

  it("lists every registered transaction type when opened", () => {
    setup();
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")).toHaveLength(SCHEMAS.length);
  });

  it("reports the chosen TransactionType", () => {
    const onSelect = setup();
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const payment = screen.getAllByRole("option").find((o) => /Payment/.test(o.textContent ?? ""));
    expect(payment).toBeTruthy();
    fireEvent.click(payment as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith("Payment");
  });

  it("narrows the list as you type", () => {
    setup();
    const box = screen.getByRole("combobox");
    fireEvent.mouseDown(box);
    fireEvent.change(box, { target: { value: "escrow" } });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThan(SCHEMAS.length);
    for (const o of options) expect(o.textContent?.toLowerCase()).toContain("escrow");
  });

  it("shows the chosen type and its description", () => {
    setup("Payment");
    expect(screen.getAllByText("Payment").length).toBeGreaterThan(0);
  });

  it("jumps to the search field with '/' unless a modal is open", () => {
    setup();
    const box = screen.getByRole("combobox");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(box);
    (box as HTMLElement).blur();
    document.documentElement.dataset.modalOpen = "true";
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).not.toBe(box);
    delete document.documentElement.dataset.modalOpen;
  });
});
