import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeValues, buildText } from "./builder/TxBuilder";
import { TxEditor } from "./TxEditor";
import type { TxSchema } from "../lib/txSchemaTypes";

const noop = () => {};
function render(value: string, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(TxEditor, {
      value,
      signing: false,
      signLabel: "Sign",
      signingLabel: "Signing",
      onChange: noop,
      onSign: noop,
      onCancel: noop,
      ...extra,
    }),
  );
}

const PAYMENT = JSON.stringify({
  TransactionType: "Payment",
  Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  Amount: "1000000",
});
const ACCOUNT_SET = JSON.stringify({
  TransactionType: "AccountSet",
  Domain: "6578616D706C652E636F6D",
});

describe("TxEditor", () => {
  it("asks for a type and disables Sign when nothing is selected", () => {
    const html = render("");
    expect(html).toContain("Choose a transaction type to get started.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Sign/s);
    expect(html).not.toContain("Transaction JSON (preview)");
  });

  it("shows only Payment fields for a Payment", () => {
    const html = render(PAYMENT);
    expect(html).toContain("Destination");
    expect(html).not.toContain("Domain");
    expect(html).not.toContain("Set flag");
    expect(html).toContain("Transaction JSON (preview)");
    expect(html).toContain("filled in automatically when you sign");
  });

  it("shows only AccountSet fields for an AccountSet", () => {
    const html = render(ACCOUNT_SET);
    expect(html).toContain("Domain");
    expect(html).not.toContain("Destination");
    expect(html).not.toContain("Amount");
  });

  it("starts in raw mode for a tx type it cannot show as a form", () => {
    const html = render(JSON.stringify({ TransactionType: "AMMCreate", Amount: "1" }));
    expect(html).toContain("Transaction JSON");
    expect(html).toContain("<textarea");
    expect(html).toContain("Back to form");
  });

  it("keeps the no-wallet hint once a type is chosen", () => {
    const html = render(ACCOUNT_SET, { disabledReason: "Connect a wallet in step 2 to sign." });
    expect(html).toContain("Connect a wallet in step 2 to sign.");
  });
});

describe("hidden fields never reach the built tx", () => {
  const schema: TxSchema = {
    type: "Fake",
    label: "Fake",
    description: "",
    category: "account",
    icon: "F",
    fields: [
      { name: "mode", kind: "toggle", label: "Advanced mode" },
      {
        name: "secret",
        kind: "text",
        label: "Only in advanced mode",
        showWhen: { field: "mode", equals: true },
      },
    ],
    build: (v, account) => ({ TransactionType: "Fake", Account: account, ...v }),
  };

  it("drops values whose showWhen is inactive", () => {
    expect(activeValues(schema, { mode: false, secret: "leak" })).toEqual({ mode: false });
    expect(activeValues(schema, { mode: true, secret: "kept" })).toEqual({
      mode: true,
      secret: "kept",
    });
  });

  it("builds text without them", () => {
    const tx = JSON.parse(buildText(schema, { mode: false, secret: "leak" }, "rX"));
    expect(tx.secret).toBeUndefined();
  });
});
