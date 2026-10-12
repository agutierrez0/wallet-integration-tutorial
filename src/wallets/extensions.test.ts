import { beforeEach, describe, expect, it, vi } from "vitest";

const gem = vi.hoisted(() => ({
  isInstalled: vi.fn(),
  getAddress: vi.fn(),
  getPublicKey: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  submitTransaction: vi.fn(),
}));
const cm = vi.hoisted(() => ({
  sync: { isInstalled: vi.fn(() => true) },
  methods: { signInAndWait: vi.fn(), signAndWait: vi.fn() },
}));

vi.mock("@gemwallet/api", () => gem);
vi.mock("@crossmarkio/sdk", () => ({ default: cm }));

import { crossmark } from "./crossmark";
import { gemwallet } from "./gemwallet";

const tx = { TransactionType: "AccountSet" };
const aborted = () => {
  const ac = new AbortController();
  ac.abort();
  return { network: "testnet", signal: ac.signal } as const;
};

beforeEach(() => {
  vi.clearAllMocks();
  gem.isInstalled.mockResolvedValue({ result: { isInstalled: true } });
  cm.sync.isInstalled.mockReturnValue(true);
});

describe("GemWallet adapter", () => {
  it("throws CANCELLED before touching the extension when already aborted", async () => {
    await expect(gemwallet.signTransaction(tx, aborted())).rejects.toMatchObject({
      code: "CANCELLED",
    });
    await expect(gemwallet.connect(aborted())).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(gemwallet.submitTransaction!(tx, aborted())).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(gem.isInstalled).not.toHaveBeenCalled();
    expect(gem.signTransaction).not.toHaveBeenCalled();
    expect(gem.getAddress).not.toHaveBeenCalled();
  });

  it("stops waiting with CANCELLED when aborted mid-prompt", async () => {
    gem.signTransaction.mockReturnValue(new Promise(() => {}));
    const ac = new AbortController();
    const p = gemwallet.signTransaction(tx, { network: "testnet", signal: ac.signal });
    await vi.waitFor(() => expect(gem.signTransaction).toHaveBeenCalled());
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("returns the signature as the signed blob and maps a decline to REJECTED", async () => {
    gem.signTransaction.mockResolvedValueOnce({ type: "response", result: { signature: "AABB" } });
    await expect(gemwallet.signTransaction(tx)).resolves.toBe("AABB");
    gem.signTransaction.mockResolvedValueOnce({ type: "reject" });
    await expect(gemwallet.signTransaction(tx)).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("submit returns the hash, and throws UNKNOWN when the wallet gives none", async () => {
    gem.submitTransaction.mockResolvedValueOnce({ type: "response", result: { hash: "H1" } });
    await expect(gemwallet.submitTransaction!(tx)).resolves.toBe("H1");
    gem.submitTransaction.mockResolvedValueOnce({ type: "response", result: {} });
    await expect(gemwallet.submitTransaction!(tx)).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining("no transaction hash"),
    });
  });

  it("reports NOT_INSTALLED when the extension is missing", async () => {
    gem.isInstalled.mockResolvedValue({ result: { isInstalled: false } });
    await expect(gemwallet.signTransaction(tx)).rejects.toMatchObject({ code: "NOT_INSTALLED" });
    expect(await gemwallet.isAvailable()).toBe(false);
  });
});

describe("Crossmark adapter", () => {
  it("throws CANCELLED before touching the extension when already aborted", async () => {
    await expect(crossmark.signTransaction(tx, aborted())).rejects.toMatchObject({
      code: "CANCELLED",
    });
    await expect(crossmark.connect(aborted())).rejects.toMatchObject({ code: "CANCELLED" });
    expect(cm.methods.signAndWait).not.toHaveBeenCalled();
    expect(cm.methods.signInAndWait).not.toHaveBeenCalled();
  });

  it("stops waiting with CANCELLED when aborted mid-prompt", async () => {
    cm.methods.signAndWait.mockReturnValue(new Promise(() => {}));
    const ac = new AbortController();
    const p = crossmark.signTransaction(tx, { network: "testnet", signal: ac.signal });
    await vi.waitFor(() => expect(cm.methods.signAndWait).toHaveBeenCalled());
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("returns the txBlob and maps a rejection", async () => {
    cm.methods.signAndWait.mockResolvedValueOnce({
      response: { data: { txBlob: "CC", meta: {} } },
    });
    await expect(crossmark.signTransaction(tx)).resolves.toBe("CC");
    cm.methods.signAndWait.mockResolvedValueOnce({
      response: { data: { meta: { isRejected: true } } },
    });
    await expect(crossmark.signTransaction(tx)).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("lets Crossmark fill Sequence/Fee/LastLedgerSequence so it doesn't warn they were replaced", async () => {
    expect(crossmark.capabilities.walletAutofills).toBe(true);
    cm.methods.signAndWait.mockResolvedValueOnce({
      response: { data: { txBlob: "CC", meta: {} } },
    });
    await crossmark.signTransaction({
      ...tx,
      Sequence: 7,
      Fee: "12",
      LastLedgerSequence: 123456,
    });
    const sent = cm.methods.signAndWait.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("Sequence");
    expect(sent).not.toHaveProperty("Fee");
    expect(sent).not.toHaveProperty("LastLedgerSequence");
    expect(sent).toMatchObject(tx);
  });

  it("waits for the SDK's background detection instead of reporting a false negative", async () => {
    cm.sync.isInstalled.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    await expect(crossmark.isAvailable()).resolves.toBe(true);
  });

  it("cannot submit, and reports NOT_INSTALLED when the extension is missing", async () => {
    await expect(crossmark.submitTransaction!(tx)).rejects.toMatchObject({ code: "UNSUPPORTED" });
    cm.sync.isInstalled.mockReturnValue(false);
    await expect(crossmark.connect()).rejects.toMatchObject({ code: "NOT_INSTALLED" });
    expect(await crossmark.isAvailable()).toBe(false);
  });
});
