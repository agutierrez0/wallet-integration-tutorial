import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATEGORIES, defaultValues, getSchema, SCHEMAS } from "../../lib/txSchemas";
import type { FormValues } from "../../lib/txSchemaTypes";
import { TxForm } from "./TxForm";
import { TypeSelector } from "./TypeSelector";
import { utcValueAfter } from "./fields/DateTimeField";

const noop = () => {};

function schema(type: string) {
  const s = getSchema(type);
  if (!s) throw new Error(`no schema ${type}`);
  return s;
}

function form(
  type: string,
  values: FormValues = {},
  extra: Partial<Parameters<typeof TxForm>[0]> = {},
) {
  const s = schema(type);
  return renderToStaticMarkup(
    <TxForm
      schema={s}
      values={{ ...defaultValues(s), ...values }}
      onChange={noop}
      errors={{}}
      {...extra}
    />,
  );
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("TxForm field rendering", () => {
  it("renders a UTC datetime-local input with quick fills for date fields", () => {
    const html = form("CheckCreate");
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain("UTC");
    expect(html).toContain("In 1 hour");
    expect(html).toContain("In 1 day");
    expect(html).toContain("Time is UTC, not your local time");
  });

  it("offers Clear only once a date is set", () => {
    expect(form("CheckCreate")).not.toContain(">Clear<");
    expect(form("CheckCreate", { Expiration: "2030-01-01T00:00:00" })).toContain(">Clear<");
  });

  it("renders list fields as a textarea", () => {
    const html = form("NFTokenCancelOffer", { NFTokenOffers: "AA\nBB" });
    expect(html).toContain("<textarea");
    expect(html).toContain("2 entries");
  });

  it("hides the Domain input while 'remove domain' is on, and the NFT minter unless flag 10 is chosen", () => {
    expect(form("AccountSet")).toContain("Lowercase domain");
    expect(form("AccountSet", { ClearDomain: true })).not.toContain("Lowercase domain");
    expect(form("AccountSet")).not.toContain("allowed to mint NFTs");
    expect(form("AccountSet", { SetFlag: "10" })).toContain("allowed to mint NFTs");
  });

  it("only shows the owner field on NFT buy offers", () => {
    expect(form("NFTokenCreateOffer", { Sell: false })).toContain("currently holds the NFT");
    expect(form("NFTokenCreateOffer", { Sell: true })).not.toContain("currently holds the NFT");
  });

  it("uses each select's own placeholder (TrustSet tri-state flags)", () => {
    const html = form("TrustSet");
    expect(html).toContain("Leave unchanged");
    expect(html).toContain("Disable rippling (set NoRipple)");
    expect(html).toContain("Allow rippling (clear NoRipple)");
    expect(html).toContain("Unfreeze line");
  });

  it("gives the amount type radiogroup a roving tabindex", () => {
    const html = form("Payment");
    expect(html).toMatch(/aria-checked="true"[^>]*tabindex="0"[^>]*>XRP</);
    expect(html).toMatch(/aria-checked="false"[^>]*tabindex="-1"[^>]*>Issued currency</);
    const issued = form("Payment", {
      Amount: { mode: "issued", value: "", currency: "", issuer: "" },
    });
    expect(issued).toMatch(/aria-checked="false"[^>]*tabindex="-1"[^>]*>XRP</);
    expect(issued).toMatch(/aria-checked="true"[^>]*tabindex="0"[^>]*>Issued currency</);
  });
});

describe("TxForm error announcements", () => {
  const errors = {
    Destination: "Destination is required",
    Amount: "Enter an amount",
    TicketCount: "nope",
  };

  it("announces only the first visible error as an alert", () => {
    const html = form("Payment", {}, { errors, showAllErrors: true });
    expect(html).toContain("Destination is required");
    expect(html).toContain("Enter an amount");
    expect(count(html, 'role="alert"')).toBe(1);
    expect(html).toMatch(/role="alert"[^>]*>Destination is required</);
  });

  it("summarises the remaining errors politely in one status region", () => {
    const html = form("Payment", {}, { errors, showAllErrors: true });
    expect(html).toMatch(/role="status" aria-live="polite">1 more field needs attention/);
    const three = form(
      "Payment",
      {},
      { errors: { Destination: "a", Amount: "b", DestinationTag: "c" }, showAllErrors: true },
    );
    expect(three).toContain("2 more fields need attention");
  });

  it("stays quiet before anything is touched", () => {
    const html = form("Payment", {}, { errors });
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("more field");
  });
});

describe("DateTimeField helpers", () => {
  it("builds UTC values in the datetime-local shape", () => {
    expect(utcValueAfter(3600_000, Date.UTC(2030, 0, 1, 10, 0, 0))).toBe("2030-01-01T11:00:00");
    expect(utcValueAfter(86_400_000, Date.UTC(2030, 0, 1, 10, 0, 0))).toBe("2030-01-02T10:00:00");
  });
});

describe("TypeSelector expanded state", () => {
  const html = (value?: string) =>
    renderToStaticMarkup(
      <TypeSelector schemas={SCHEMAS} categories={CATEGORIES} value={value} onSelect={noop} />,
    );

  it("reports a real aria-expanded: open with no value, collapsed with one", () => {
    expect(html()).toContain('role="combobox"');
    expect(html()).toMatch(/role="combobox"[^>]*aria-expanded="true"/);
    expect(html("Payment")).toMatch(/role="combobox"[^>]*aria-expanded="false"/);
    expect(html("Payment")).toMatch(/class="ts-change"[^>]*aria-expanded="false"/);
  });

  it("lists every registered transaction type", () => {
    const out = html();
    for (const s of SCHEMAS) expect(out).toContain(s.label);
  });
});
