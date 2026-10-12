// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultValues, getSchema } from "../../lib/txSchemas";
import type { FormValues } from "../../lib/txSchemaTypes";
import { TxForm, isFieldFilled } from "./TxForm";
import { utcValueAfter } from "./fields/DateTimeField";
import { sanitizeXrp, xrpToDrops } from "./fields/XrpField";

afterEach(() => cleanup());

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
  return render(
    <TxForm
      schema={s}
      values={{ ...defaultValues(s), ...values }}
      onChange={noop}
      errors={{}}
      {...extra}
    />,
  );
}

const text = () => document.body.textContent ?? "";

// Advanced fields are not mounted until the panel is opened, like a user would.
const openAdvanced = () => fireEvent.click(screen.getByText(/Advanced options/));

describe("TxForm field rendering", () => {
  it("renders a UTC date-time picker for date fields", async () => {
    form("CheckCreate", { Expiration: "2030-01-01T10:30:00" });
    openAdvanced();
    expect(text()).toContain("Time is UTC, not your local time");
    // The picker shows the stored UTC digits, never a local-time conversion.
    // The picker is a lazily loaded chunk, so wait for it.
    const input = (await screen.findByLabelText(/Expires/)) as HTMLInputElement;
    expect(input.value).toBe("2030-01-01 10:30:00 UTC");
  });

  it("starts a date field empty", async () => {
    form("CheckCreate");
    openAdvanced();
    expect(((await screen.findByLabelText(/Expires/)) as HTMLInputElement).value).toBe("");
  });

  it("offers 'In 1 hour' and 'In 1 day' presets when the picker opens", async () => {
    form("CheckCreate");
    openAdvanced();
    const input = await screen.findByLabelText(/Expires/);
    act(() => input.focus());
    fireEvent.click(input);
    expect(screen.getByText("In 1 hour")).toBeTruthy();
    expect(screen.getByText("In 1 day")).toBeTruthy();
  });

  it("renders list fields as a textarea with an entry count", () => {
    form("NFTokenCancelOffer", { NFTokenOffers: "AA\nBB" });
    const area = screen.getByRole("textbox", { name: /Offer/i }) as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(text()).toContain("2 entries");
  });

  it("hides the Domain input while 'remove domain' is on, and the NFT minter unless flag 10 is chosen", () => {
    const { unmount } = form("AccountSet");
    expect(text()).toContain("Lowercase domain");
    expect(text()).not.toContain("allowed to mint NFTs");
    unmount();
    form("AccountSet", { ClearDomain: true });
    expect(text()).not.toContain("Lowercase domain");
    cleanup();
    form("AccountSet", { SetFlag: "10" });
    expect(text()).toContain("allowed to mint NFTs");
  });

  it("only shows the owner field on NFT buy offers", () => {
    form("NFTokenCreateOffer", { Sell: false });
    expect(text()).toContain("currently holds the NFT");
    cleanup();
    form("NFTokenCreateOffer", { Sell: true });
    expect(text()).not.toContain("currently holds the NFT");
  });

  it("uses each select's own empty label and lists its choices (TrustSet tri-state flags)", () => {
    form("TrustSet");
    openAdvanced();
    expect(screen.getAllByText("Leave unchanged").length).toBeGreaterThan(0);
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    expect(screen.getByText("Disable rippling (set NoRipple)")).toBeTruthy();
    expect(screen.getByText("Allow rippling (clear NoRipple)")).toBeTruthy();
  });

  it("switches an amount between XRP and issued currency with a native radio group", () => {
    form("Payment");
    expect((screen.getByRole("radio", { name: "XRP" }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "Issued currency" }) as HTMLInputElement).checked,
    ).toBe(false);
    cleanup();
    form("Payment", { Amount: { mode: "issued", value: "", currency: "", issuer: "" } });
    expect((screen.getByRole("radio", { name: "XRP" }) as HTMLInputElement).checked).toBe(false);
    expect(
      (screen.getByRole("radio", { name: "Issued currency" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByLabelText(/currency code/i)).toBeTruthy();
    expect(screen.getByLabelText(/issuer address/i)).toBeTruthy();
  });

  it("shows the live drops conversion for XRP amounts", () => {
    form("Payment", { Amount: { mode: "xrp", value: "1.5" } });
    expect(text()).toContain("1,500,000 drops");
  });

  it("filters XRP input and reports edits through onChange", () => {
    const onChange = vi.fn();
    form("Payment", {}, { onChange });
    fireEvent.change(screen.getByLabelText(/Amount in XRP/i), {
      target: { value: "1a.2.3456789" },
    });
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.Amount).toMatchObject({ mode: "xrp", value: "1.234567" });
  });

  it("keeps integer fields as digit-only strings", () => {
    const onChange = vi.fn();
    form("TicketCreate", {}, { onChange });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1a2" } });
    expect(onChange.mock.calls.at(-1)?.[0].TicketCount).toBe("12");
  });

  it("fills in the connected account with 'Use my address'", () => {
    const onChange = vi.fn();
    const account = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
    form("Payment", {}, { onChange, account });
    fireEvent.click(screen.getByRole("button", { name: "Use my address" }));
    expect(onChange.mock.calls.at(-1)?.[0].Destination).toBe(account);
  });

  it("puts rarely used fields under 'Advanced options' and counts the filled ones", () => {
    form("Payment", { SourceTag: "5" });
    expect(screen.getByText(/Advanced options/)).toBeTruthy();
    expect(screen.getByText("filled")).toBeTruthy();
  });

  it("does not render a <form> element, so Enter can never submit", () => {
    const { container } = form("Payment");
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("TxForm error announcements", () => {
  const errors = {
    Destination: "Destination is required",
    Amount: "Enter an amount",
    TicketCount: "nope",
  };

  it("announces only the first visible error as an alert", () => {
    form("Payment", {}, { errors, showAllErrors: true });
    expect(screen.getByText("Enter an amount")).toBeTruthy();
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toBe("Destination is required");
  });

  it("summarises the remaining errors politely in one status region", () => {
    form("Payment", {}, { errors, showAllErrors: true });
    expect(screen.getByText("1 more field needs attention")).toBeTruthy();
    cleanup();
    form(
      "Payment",
      {},
      { errors: { Destination: "a", Amount: "b", DestinationTag: "c" }, showAllErrors: true },
    );
    expect(screen.getByText("2 more fields need attention")).toBeTruthy();
  });

  it("stays quiet before anything is touched, then shows an error once a field is blurred", () => {
    form("Payment", {}, { errors });
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    fireEvent.blur(screen.getByLabelText(/Destination/));
    expect(within(screen.getByRole("alert")).getByText("Destination is required")).toBeTruthy();
  });

  it("links an error to its control with aria-describedby and marks it invalid", () => {
    form("Payment", {}, { errors, showAllErrors: true });
    const input = screen.getByLabelText(/Destination/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const id = input.getAttribute("aria-describedby")?.split(" ").at(-1) ?? "";
    expect(document.getElementById(id)?.textContent).toBe("Destination is required");
  });
});

describe("helpers", () => {
  it("builds UTC values in the datetime-local shape", () => {
    expect(utcValueAfter(3600_000, Date.UTC(2030, 0, 1, 10, 0, 0))).toBe("2030-01-01T11:00:00");
    expect(utcValueAfter(86_400_000, Date.UTC(2030, 0, 1, 10, 0, 0))).toBe("2030-01-02T10:00:00");
  });

  it("sanitizes XRP and converts it to drops", () => {
    expect(sanitizeXrp("1,2.3456789")).toBe("12.345678");
    expect(xrpToDrops("1.5")).toBe(1_500_000n);
    expect(xrpToDrops("")).toBeNull();
  });

  it("knows which values count as filled", () => {
    expect(isFieldFilled(undefined)).toBe(false);
    expect(isFieldFilled("  ")).toBe(false);
    expect(isFieldFilled("x")).toBe(true);
    expect(isFieldFilled(false)).toBe(false);
    expect(isFieldFilled(true)).toBe(true);
    expect(isFieldFilled({ mode: "xrp", value: "" })).toBe(false);
    expect(isFieldFilled({ mode: "xrp", value: "1" })).toBe(true);
  });
});
