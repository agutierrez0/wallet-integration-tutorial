// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TxSchema } from "../lib/txSchemaTypes";
import { activeValues, buildText } from "./builder/TxBuilder";
import { TxEditor } from "./TxEditor";

afterEach(() => cleanup());

const noop = () => {};
function setup(value: string, extra: Record<string, unknown> = {}) {
  return render(
    <TxEditor
      value={value}
      signing={false}
      signLabel="Sign"
      signingLabel="Signing"
      onChange={noop}
      onSign={noop}
      onCancel={noop}
      {...extra}
    />,
  );
}
const text = () => document.body.textContent ?? "";

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
    setup("");
    expect(text()).toContain("Choose a transaction type to get started.");
    expect((screen.getByRole("button", { name: "Sign" }) as HTMLButtonElement).disabled).toBe(true);
    expect(text()).not.toContain("Transaction JSON (preview)");
  });

  it("shows only Payment fields for a Payment", () => {
    setup(PAYMENT);
    expect(screen.getByLabelText(/Destination/)).toBeTruthy();
    expect(screen.queryByLabelText(/Domain/)).toBeNull();
    expect(text()).not.toContain("Set flag");
    expect(text()).toContain("Transaction JSON (preview)");
    expect(text()).toContain("filled in automatically when you sign");
  });

  it("shows only AccountSet fields for an AccountSet", () => {
    setup(ACCOUNT_SET);
    expect(text()).toContain("Domain");
    expect(screen.queryByLabelText(/Destination/)).toBeNull();
    expect(text()).not.toContain("Amount");
  });

  it("starts in raw mode for a tx type it cannot show as a form", () => {
    setup(JSON.stringify({ TransactionType: "AMMCreate", Amount: "1" }));
    expect(screen.getByLabelText("Transaction JSON").tagName).toBe("TEXTAREA");
    expect((screen.getByRole("radio", { name: "Raw JSON" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("keeps the no-wallet hint once a type is chosen", () => {
    setup(ACCOUNT_SET, { disabledReason: "Connect a wallet in step 2 to sign." });
    expect(text()).toContain("Connect a wallet in step 2 to sign.");
  });

  it("clicking Sign with an invalid form reveals the errors and focuses the first bad field", async () => {
    const onSign = vi.fn();
    setup(JSON.stringify({ TransactionType: "Payment" }), { onSign });
    const sign = screen.getByRole("button", { name: "Sign" });
    expect(sign.getAttribute("aria-disabled")).toBe("true");
    expect((sign as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sign);
    expect(onSign).not.toHaveBeenCalled();
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Destination/)));
  });

  it("signs when the form is valid", () => {
    const onSign = vi.fn();
    setup(PAYMENT, { onSign, account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh" });
    fireEvent.click(screen.getByRole("button", { name: "Sign" }));
    expect(onSign).toHaveBeenCalledTimes(1);
  });

  it("shows the signing label and a Cancel button while signing", () => {
    const onCancel = vi.fn();
    setup(PAYMENT, { signing: true, signingLabel: "Waiting for approval", onCancel });
    expect(text()).toContain("Waiting for approval");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("switches to raw JSON and back from the mode control", () => {
    const onChange = vi.fn();
    setup(PAYMENT, { onChange });
    fireEvent.click(screen.getByRole("radio", { name: "Raw JSON" }));
    expect(screen.getByLabelText("Transaction JSON")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Form" }));
    expect(screen.getByLabelText(/Destination/)).toBeTruthy();
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
