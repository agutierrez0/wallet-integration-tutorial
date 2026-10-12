// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError } from "xrpl";
import type { UseAction } from "../hooks/useAction";
import { NETWORKS } from "../lib/networks";
import { WalletError } from "../wallets/errors";
import { SignedOutput } from "./SignedOutput";

afterEach(() => cleanup());

// Signed offline under Node (jsdom's Uint8Array breaks the signing library); see src/App.test.tsx.
const ADDRESS = "rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL";
const BUILT = { TransactionType: "AccountSet", Account: ADDRESS, Domain: "6578616D706C652E636F6D" };
const FILLED = { ...BUILT, Sequence: 1, Fee: "12", LastLedgerSequence: 100 };
const BLOB =
  "1200032400000001201B0000006468400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F074405B05F877799A3C49D4545CFD20E908566B2D50109CD7A065EE05773F3D5720CFEAFBAA8F57F6C80948EED8D4CAC980E4EA97FC424EB3095B291EC968D88B400D770B6578616D706C652E636F6D8114A6070B8A1822E3322676A99F0C804EE2D15B8270";
const TAMPERED_BLOB =
  "1200032400000001201B0000006468400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F074402D529A3665E5E5B7A922AE8CD01FE3011C8D72D4E654557CB16947AA64009C69B941566272C7B2F1D73537AB3FE2B11207A3DF71EE9D50F6DCFF5ED072F71C0377086576696C2E636F6D8114A6070B8A1822E3322676A99F0C804EE2D15B8270";

function action<T>(over: Partial<UseAction<[], T>> = {}): UseAction<[], T> {
  return {
    status: "idle",
    data: undefined,
    error: undefined,
    run: vi.fn(),
    reset: vi.fn(),
    ...over,
  } as unknown as UseAction<[], T>;
}

function setup(props: Partial<React.ComponentProps<typeof SignedOutput>> = {}) {
  const handlers = { onSubmitXrplJs: vi.fn(), onSubmitWallet: vi.fn(), onCancelWallet: vi.fn() };
  render(
    <SignedOutput
      network={NETWORKS.testnet}
      walletName="Fake"
      blob={BLOB}
      filled={FILLED}
      canWalletSubmit={false}
      submitX={action()}
      submitW={action<string | undefined>()}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("SignedOutput", () => {
  it("shows the blob, a verified signature and the network details", () => {
    setup();
    expect(screen.getByText("tx_blob")).toBeTruthy();
    expect(screen.getByText("Signature verifies")).toBeTruthy();
    expect(screen.getByText("Testnet")).toBeTruthy();
    expect(screen.getByText("Not submitted")).toBeTruthy();
    expect(screen.getByText("Nothing is submitted until you press one of these.")).toBeTruthy();
  });

  it("offers the Postman-ready request bodies", () => {
    setup();
    expect(screen.getByText(`POST ${NETWORKS.testnet.rpc}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "curl" }));
    expect(screen.getAllByText(/curl -X POST/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Look up result" }));
    expect(screen.getAllByText(/"method": "tx"/).length).toBeGreaterThan(0);
  });

  it("submits with xrpl.js only when pressed", () => {
    const { onSubmitXrplJs } = setup();
    expect(onSubmitXrplJs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Submit with xrpl.js" }));
    expect(onSubmitXrplJs).toHaveBeenCalledTimes(1);
  });

  it("only shows Submit via wallet for wallets that can", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Submit via wallet" })).toBeNull();
    cleanup();
    const { onSubmitWallet } = setup({ canWalletSubmit: true });
    fireEvent.click(screen.getByRole("button", { name: "Submit via wallet" }));
    expect(onSubmitWallet).toHaveBeenCalledTimes(1);
  });

  it("blocks submitting a blob that differs from what was built until the user opts in", () => {
    setup({ blob: TAMPERED_BLOB, canWalletSubmit: true });
    expect(screen.getByText(/doesn't match what you built/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Submit with xrpl.js" }) as HTMLButtonElement;
    const viaWallet = screen.getByRole("button", {
      name: "Submit via wallet",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(viaWallet.disabled).toBe(true);
    expect(
      screen.getByText("Submitting is blocked until you review the differences above."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /Submit anyway/ }));
    expect(submit.disabled).toBe(false);
    expect(viaWallet.disabled).toBe(false);
  });

  it("does not warn when the blob matches", () => {
    setup();
    expect(screen.queryByText(/doesn't match what you built/)).toBeNull();
  });

  it("while submitting: shows progress, disables both buttons and offers Cancel for the wallet", () => {
    const { onCancelWallet } = setup({
      canWalletSubmit: true,
      submitW: action<string | undefined>({ status: "loading" }),
    });
    expect(screen.getByText("Submitting…")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Submit with xrpl.js" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Approve the request in the Fake popup/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelWallet).toHaveBeenCalledTimes(1);
  });

  it("explains a successful xrpl.js submit with its result code and explorer link", () => {
    setup({
      submitX: action({
        status: "success",
        data: { result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } } },
      }),
    });
    expect(screen.getAllByText(/tesSUCCESS/).length).toBeGreaterThan(0);
    expect(screen.getByText("Included in a validated ledger.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "View on explorer" });
    expect(link.getAttribute("href")).toMatch(
      /^https:\/\/testnet\.xrpl\.org\/transactions\/[0-9A-F]{64}$/,
    );
    expect(
      (screen.getByRole("button", { name: "Submit with xrpl.js" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Already submitted/)).toBeTruthy();
  });

  it("tells a charged-but-failed tec result apart from a plain rejection", () => {
    setup({
      submitX: action({
        status: "success",
        data: { result: { meta: { TransactionResult: "tecUNFUNDED_PAYMENT" } } },
      }),
    });
    expect(screen.getByText(/fee was charged/)).toBeTruthy();
    cleanup();
    setup({
      submitX: action({
        status: "success",
        data: { result: { meta: { TransactionResult: "temMALFORMED" } } },
      }),
    });
    expect(screen.getByText(/no fee was charged/)).toBeTruthy();
  });

  it("falls back to a neutral card when the node reports no result code", () => {
    setup({ submitX: action({ status: "success", data: { result: {} } }) });
    expect(screen.getByText("Submitted", { selector: ".ant-result-title" })).toBeTruthy();
  });

  it("shows a retryable error when xrpl.js submit fails", () => {
    const submitX = action({
      status: "error",
      error: new TimeoutError("timed out"),
    });
    const { onSubmitXrplJs } = setup({ submitX });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onSubmitXrplJs).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(submitX.reset).toHaveBeenCalledTimes(1);
  });

  it("looks up the result after a wallet-side submit", () => {
    setup({
      canWalletSubmit: true,
      submitW: action<string | undefined>({ status: "success", data: "A".repeat(64) }),
      lookup: { status: "loading" },
    });
    expect(screen.getByText("Checking result…")).toBeTruthy();
    cleanup();
    setup({
      canWalletSubmit: true,
      submitW: action<string | undefined>({ status: "success", data: "A".repeat(64) }),
      lookup: {
        status: "success",
        result: { found: true, validated: true, engineResult: "tesSUCCESS" },
      },
    });
    expect(screen.getAllByText(/tesSUCCESS/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View on explorer" }).getAttribute("href")).toContain(
      "A".repeat(64),
    );
  });

  it("says the wallet sent it when the ledger doesn't know it yet", () => {
    setup({
      canWalletSubmit: true,
      submitW: action<string | undefined>({ status: "success", data: "B".repeat(64) }),
      lookup: { status: "success", result: { found: false } },
    });
    expect(screen.getByText("Sent through Fake")).toBeTruthy();
    expect(screen.getByText(/hasn't shown up on the ledger yet/)).toBeTruthy();
  });

  it("does not show an error for a wallet submit the user cancelled", () => {
    const err = new WalletError("CANCELLED", "cancelled");
    setup({
      canWalletSubmit: true,
      submitW: action<string | undefined>({ status: "error", error: err }),
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
