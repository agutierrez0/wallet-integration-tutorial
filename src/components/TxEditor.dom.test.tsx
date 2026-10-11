// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TxEditor, describeDropped } from "./TxEditor";

afterEach(() => cleanup());

const OLD = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const NEW = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

// No form exists for this type, so the editor opens in raw JSON mode.
const customTx = (account: string) =>
  JSON.stringify({ TransactionType: "SomeFutureAmendment", Account: account }, null, 2);

function setup(props: Partial<React.ComponentProps<typeof TxEditor>> = {}) {
  const onChange = vi.fn();
  const onSign = vi.fn();
  const utils = render(
    <TxEditor
      value=""
      signing={false}
      signLabel="Sign"
      signingLabel="Signing…"
      onChange={onChange}
      onSign={onSign}
      onCancel={() => {}}
      {...props}
    />,
  );
  return { onChange, onSign, ...utils };
}

describe("locking while busy", () => {
  it("makes the raw JSON read-only and disables the toggle and Sign", () => {
    setup({ value: customTx(NEW), account: NEW, busy: true });
    expect((screen.getByLabelText("Transaction JSON") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Back to form" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Sign" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Locked while a submission is in progress/)).toBeTruthy();
  });

  it("is editable and signable when not busy", () => {
    setup({ value: customTx(NEW), account: NEW });
    expect((screen.getByLabelText("Transaction JSON") as HTMLTextAreaElement).readOnly).toBe(false);
    expect((screen.getByRole("button", { name: "Sign" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("raw JSON naming another account", () => {
  it("blocks Sign and offers a one-click fix", () => {
    const { onChange } = setup({ value: customTx(OLD), account: NEW });
    expect((screen.getByRole("button", { name: "Sign" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(OLD).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Use connected account" }));
    const fixed = JSON.parse(onChange.mock.calls.at(-1)![0] as string);
    expect(fixed).toEqual({ TransactionType: "SomeFutureAmendment", Account: NEW });
  });

  it("does not warn when the account matches or no wallet is connected", () => {
    setup({ value: customTx(NEW), account: NEW });
    expect(screen.queryByRole("button", { name: "Use connected account" })).toBeNull();
    cleanup();
    setup({ value: customTx(OLD), account: "" });
    expect(screen.queryByRole("button", { name: "Use connected account" })).toBeNull();
  });
});

describe("fields dropped when opening a transaction as a form", () => {
  it("quietly notes autofill fields that the form leaves out", () => {
    setup({
      value: JSON.stringify({
        TransactionType: "AccountSet",
        Account: NEW,
        Domain: "6578616D706C652E636F6D",
        Fee: "12",
        Sequence: 4,
      }),
      account: NEW,
    });
    expect(screen.getByText(/Fee, Sequence are filled in automatically/)).toBeTruthy();
  });
});

describe("describeDropped", () => {
  it("is quiet for autofill keys and loud for anything else", () => {
    expect(describeDropped(undefined)).toEqual({ loud: null, quiet: null });
    expect(describeDropped(["Fee"]).quiet).toMatch(/Fee is filled in automatically/);
    expect(describeDropped(["Account"]).quiet).toMatch(/taken from the connected wallet/);
    const d = describeDropped(["Fee", "Mystery"]);
    expect(d.loud).toMatch(/Mystery/);
    expect(d.quiet).toMatch(/Fee/);
  });
});
