// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fakes. The wallet, the network calls and the heavy child components are replaced so these
// tests exercise App's own state machine: connect, sign, submit, cancel.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const state: {
    promptHandler: ((p: unknown) => void) | null;
    txText: string;
  } = { promptHandler: null, txText: "" };
  const adapter = {
    id: "fake",
    name: "Fake",
    capabilities: { signOnly: true, submit: true, walletAutofills: false },
    isAvailable: vi.fn(async () => true),
    connect: vi.fn(),
    signTransaction: vi.fn(),
    submitTransaction: vi.fn(),
    disconnect: vi.fn(async () => {}),
    setPromptHandler: vi.fn((fn: ((p: unknown) => void) | null) => {
      state.promptHandler = fn;
    }),
    cancel: vi.fn(async () => ({ cancelled: true }) as { cancelled: boolean; reason?: string }),
  };
  return { adapter, state, autofill: vi.fn(), submitX: vi.fn(), lookup: vi.fn() };
});

vi.mock("./wallets", async () => {
  const real = await vi.importActual<typeof import("./wallets")>("./wallets");
  return { ...real, ADAPTERS: [h.adapter] };
});
vi.mock("./lib/tx", async () => {
  const real = await vi.importActual<typeof import("./lib/tx")>("./lib/tx");
  return { ...real, autofillTx: h.autofill, submitWithXrplJs: h.submitX };
});
vi.mock("./lib/history", async () => {
  const real = await vi.importActual<typeof import("./lib/history")>("./lib/history");
  return { ...real, lookupTx: h.lookup };
});
vi.mock("./components/TxEditor", async () => {
  const { useEffect } = await import("react");
  return {
    TxEditor: (p: {
      busy?: boolean;
      signing: boolean;
      disabledReason?: string;
      onChange: (v: string) => void;
      onSign: () => void;
      onCancel: () => void;
    }) => {
      useEffect(() => {
        p.onChange(h.state.txText);
      }, []);
      return (
        <div
          data-testid="editor"
          data-busy={String(!!p.busy)}
          data-signing={String(p.signing)}
          data-reason={p.disabledReason ?? ""}
        >
          <button type="button" onClick={p.onSign}>sign</button>
          <button type="button" onClick={p.onCancel}>cancel-editor</button>
        </div>
      );
    },
  };
});
vi.mock("./components/QrPrompt", () => ({
  QrPrompt: (p: { onCancel: () => void }) => (
    <div data-testid="qr">
      <button type="button" onClick={p.onCancel}>qr-cancel</button>
    </div>
  ),
}));

import App from "./App";

// Signed offline under Node with the testnet fixture seed in src/lib/tx.test.ts. jsdom's
// Uint8Array breaks the signing library, so the blobs are constants here.
const wallet = { address: "rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL" };
const BUILT = {
  TransactionType: "AccountSet",
  Account: wallet.address,
  Domain: "6578616D706C652E636F6D",
};
const FILLED = { ...BUILT, Sequence: 1, Fee: "12", LastLedgerSequence: 100 };
const BLOB =
  "1200032400000001201B0000006468400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F074405B05F877799A3C49D4545CFD20E908566B2D50109CD7A065EE05773F3D5720CFEAFBAA8F57F6C80948EED8D4CAC980E4EA97FC424EB3095B291EC968D88B400D770B6578616D706C652E636F6D8114A6070B8A1822E3322676A99F0C804EE2D15B8270";
// Same transaction signed with a different Domain, as a misbehaving wallet might return.
const TAMPERED_BLOB =
  "1200032400000001201B0000006468400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F074402D529A3665E5E5B7A922AE8CD01FE3011C8D72D4E654557CB16947AA64009C69B941566272C7B2F1D73537AB3FE2B11207A3DF71EE9D50F6DCFF5ED072F71C0377086576696C2E636F6D8114A6070B8A1822E3322676A99F0C804EE2D15B8270";
h.state.txText = JSON.stringify(BUILT);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SUBMIT_OK = { result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } } };

beforeEach(() => {
  h.adapter.connect.mockReset().mockResolvedValue({ address: wallet.address, networkHint: "Testnet" });
  h.adapter.signTransaction.mockReset().mockResolvedValue(BLOB);
  h.adapter.submitTransaction.mockReset().mockResolvedValue("AB".repeat(32));
  h.adapter.cancel.mockReset().mockResolvedValue({ cancelled: true });
  h.adapter.capabilities.walletAutofills = false;
  h.autofill.mockReset().mockResolvedValue(FILLED);
  h.submitX.mockReset().mockResolvedValue(SUBMIT_OK);
  h.lookup.mockReset().mockResolvedValue({ found: false });
  h.state.promptHandler = null;
});

afterEach(() => cleanup());

async function pickWallet() {
  render(<App />);
  const card = await screen.findByRole("button", { name: /^Fake/ });
  await waitFor(() => expect((card as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(card);
}

async function connectWallet() {
  await pickWallet();
  fireEvent.click(await screen.findByRole("button", { name: "Connect Fake" }));
  await screen.findByText(wallet.address);
}

async function signTx() {
  fireEvent.click(screen.getByRole("button", { name: "sign" }));
  await screen.findByText("tx_blob");
}

const editor = () => screen.getByTestId("editor");

describe("cancelling", () => {
  it("never opens a wallet prompt when cancelled during autofill", async () => {
    const d = deferred<typeof FILLED>();
    h.autofill.mockImplementation(() => d.promise);
    await connectWallet();

    fireEvent.click(screen.getByRole("button", { name: "sign" }));
    await screen.findByText("Autofilling transaction…");
    fireEvent.click(screen.getByRole("button", { name: "cancel-editor" }));
    await waitFor(() => expect(screen.queryByText("Autofilling transaction…")).toBeNull());
    expect(h.adapter.cancel).toHaveBeenCalled();

    await act(async () => {
      d.resolve(FILLED); // autofill finishes after the cancel
      await Promise.resolve();
    });
    expect(h.adapter.signTransaction).not.toHaveBeenCalled();
    expect(screen.queryByText("tx_blob")).toBeNull();
  });

  it("clears a pending connect and its QR prompt", async () => {
    h.adapter.connect.mockImplementation(() => new Promise(() => {}));
    await pickWallet();
    fireEvent.click(await screen.findByRole("button", { name: "Connect Fake" }));
    await screen.findByRole("button", { name: /Waiting for approval in Fake/ });
    act(() => h.state.promptHandler?.({ title: "Scan" }));
    expect(screen.getByTestId("qr")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "qr-cancel" }));
    await waitFor(() => expect(screen.queryByTestId("qr")).toBeNull());
    expect(await screen.findByRole("button", { name: "Connect Fake" })).toBeTruthy();
    const signal = h.adapter.connect.mock.calls[0][0].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it("clears a pending signature and aborts the wallet request", async () => {
    h.adapter.signTransaction.mockImplementation(() => new Promise(() => {}));
    await connectWallet();
    fireEvent.click(screen.getByRole("button", { name: "sign" }));
    await waitFor(() => expect(h.adapter.signTransaction).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "cancel-editor" }));
    await waitFor(() => expect(screen.queryByText("Waiting for approval in Fake…")).toBeNull());
    const signal = h.adapter.signTransaction.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(editor().getAttribute("data-signing")).toBe("false");
  });

  it("stops waiting on a wallet submit and says it may still go through", async () => {
    h.adapter.submitTransaction.mockImplementation(() => new Promise(() => {}));
    await connectWallet();
    await signTx();
    fireEvent.click(screen.getByRole("button", { name: "Submit via wallet" }));
    await waitFor(() => expect(h.adapter.submitTransaction).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText(/may still be submitted/i)).toBeTruthy();
    expect(h.adapter.cancel).toHaveBeenCalled();
    expect(screen.queryByText("Waiting for approval in Fake…")).toBeNull();
  });

  it("keeps waiting, and keeps the QR, when the wallet cannot withdraw the request", async () => {
    const d = deferred<{ address: string }>();
    h.adapter.connect.mockImplementation(() => d.promise);
    h.adapter.cancel.mockResolvedValue({ cancelled: false, reason: "ALREADY_OPENED" });
    await pickWallet();
    fireEvent.click(await screen.findByRole("button", { name: "Connect Fake" }));
    await screen.findByRole("button", { name: /Waiting for approval in Fake/ });
    act(() => h.state.promptHandler?.({ title: "Scan" }));

    fireEvent.click(screen.getByRole("button", { name: "qr-cancel" }));
    expect(await screen.findByText(/Already open in Fake/)).toBeTruthy();
    expect(screen.getByTestId("qr")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Waiting for approval in Fake/ })).toBeTruthy();

    // the real outcome still arrives
    await act(async () => {
      d.resolve({ address: wallet.address });
      await Promise.resolve();
    });
    expect(await screen.findByText(wallet.address)).toBeTruthy();
  });
});

describe("while a submission is in flight", () => {
  it("locks the editor, then unlocks and records the result", async () => {
    const d = deferred<typeof SUBMIT_OK>();
    h.submitX.mockImplementation(() => d.promise);
    await connectWallet();
    await signTx();
    expect(editor().getAttribute("data-busy")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Submit with xrpl.js" }));
    await waitFor(() => expect(editor().getAttribute("data-busy")).toBe("true"));

    await act(async () => {
      d.resolve(SUBMIT_OK);
      await Promise.resolve();
    });
    await waitFor(() => expect(editor().getAttribute("data-busy")).toBe("false"));
    expect((await screen.findAllByText(/tesSUCCESS/)).length).toBeGreaterThan(0);
  });
});

describe("network guard", () => {
  it("warns and blocks signing when the wallet is on another network", async () => {
    h.adapter.connect.mockResolvedValue({ address: wallet.address, networkHint: "Devnet" });
    await connectWallet();
    expect(await screen.findByText(/Your wallet is on Devnet but the app is on Testnet/)).toBeTruthy();
    expect(editor().getAttribute("data-reason")).toMatch(/Devnet/);
  });

  it("stays quiet when the networks match", async () => {
    await connectWallet();
    expect(screen.queryByText(/Network mismatch/)).toBeNull();
  });
});

describe("wallets that autofill themselves", () => {
  it("skips the client-side autofill", async () => {
    h.adapter.capabilities.walletAutofills = true;
    await connectWallet();
    await signTx();
    expect(h.autofill).not.toHaveBeenCalled();
    expect(h.adapter.signTransaction.mock.calls[0][0]).toEqual(BUILT);
  });
});

describe("signed blob safety", () => {
  it("blocks submitting a blob that differs from what was built until the user opts in", async () => {
    h.adapter.signTransaction.mockResolvedValue(TAMPERED_BLOB);
    await connectWallet();
    await signTx();
    expect(await screen.findByText(/doesn't match what you built/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Submit with xrpl.js" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Submit anyway/ }));
    expect(submit.disabled).toBe(false);
  });

  it("does not warn when the blob matches", async () => {
    await connectWallet();
    await signTx();
    expect(screen.queryByText(/doesn't match what you built/)).toBeNull();
    expect((screen.getByRole("button", { name: "Submit with xrpl.js" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("result lookup", () => {
  it("looks the hash up after a wallet-side submit and shows the result", async () => {
    h.lookup.mockResolvedValue({ found: true, validated: true, engineResult: "tesSUCCESS" });
    await connectWallet();
    await signTx();
    fireEvent.click(screen.getByRole("button", { name: "Submit via wallet" }));
    await waitFor(() => expect(h.lookup).toHaveBeenCalled());
    expect((await screen.findAllByText(/tesSUCCESS/)).length).toBeGreaterThan(0);
  });
});
