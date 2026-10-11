import { ECDSA, Wallet, decode, verifySignature } from "xrpl";
import { describe, expect, it, vi } from "vitest";
import { WalletError } from "./errors";
import {
  type LedgerDevice,
  createLedgerAdapter,
  derivationPath,
  getAccountIndex,
  mapLedgerError,
  normalizePublicKey,
  setAccountIndex,
  signWithDevice,
} from "./ledger";

// Throwaway key generated per run; never a real account.
function fakeDevice(wallet = Wallet.generate(ECDSA.secp256k1)) {
  const seen: { path?: string; hex?: string } = {};
  const device: LedgerDevice = {
    getAddress: async () => ({ address: wallet.classicAddress, publicKey: wallet.publicKey }),
    signTransaction: async (path, hex) => {
      seen.path = path;
      seen.hex = hex;
      // The real app gets the unsigned serialization and returns just the DER signature.
      const { tx_blob } = wallet.sign(decode(hex) as never);
      return (decode(tx_blob) as { TxnSignature: string }).TxnSignature;
    },
  };
  return { wallet, device, seen };
}

function payment(account: string): Record<string, unknown> {
  return {
    TransactionType: "Payment",
    Account: account,
    Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    Amount: "1000000",
    Fee: "12",
    Sequence: 7,
    LastLedgerSequence: 12345,
  };
}

const deviceError = (name: string, statusCode?: number) =>
  Object.assign(new Error(name), { name, statusCode });

describe("signWithDevice", () => {
  it("assembles a blob that verifies and keeps every original field", async () => {
    const { wallet, device, seen } = fakeDevice();
    const tx = payment(wallet.classicAddress);

    const blob = await signWithDevice(tx, device);

    expect(verifySignature(blob)).toBe(true);
    const decoded = decode(blob) as Record<string, unknown>;
    expect(decoded).toMatchObject({ ...tx, SigningPubKey: wallet.publicKey.toUpperCase() });
    expect(typeof decoded.TxnSignature).toBe("string");
    expect(seen.path).toBe("44'/144'/0'/0/0");
  });

  it("sends the device the unsigned serialization: SigningPubKey set, no TxnSignature", async () => {
    const { wallet, device, seen } = fakeDevice();
    await signWithDevice({ ...payment(wallet.classicAddress), TxnSignature: "AABB" }, device);

    const sent = decode(seen.hex as string) as Record<string, unknown>;
    expect(sent.SigningPubKey).toBe(wallet.publicKey.toUpperCase());
    expect(sent.TxnSignature).toBeUndefined();
  });

  it("fills in Account when the transaction has none", async () => {
    const { wallet, device } = fakeDevice();
    const { Account: _omit, ...noAccount } = payment(wallet.classicAddress);
    const blob = await signWithDevice(noAccount, device);
    expect((decode(blob) as { Account: string }).Account).toBe(wallet.classicAddress);
  });

  it("refuses a transaction for a different account", async () => {
    const { device } = fakeDevice();
    const other = Wallet.generate(ECDSA.secp256k1);
    await expect(signWithDevice(payment(other.classicAddress), device)).rejects.toMatchObject({
      name: "WalletError",
      code: "UNKNOWN",
    });
  });

  it("rejects a signature that does not verify, without echoing it", async () => {
    const { wallet, device } = fakeDevice();
    const bogus = "3044022000000000000000000000000000000000000000000000000000000000000000010220000000000000000000000000000000000000000000000000000000000000002";
    device.signTransaction = async () => bogus;
    const err = await signWithDevice(payment(wallet.classicAddress), device).catch((e) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect(err.code).toBe("UNKNOWN");
    expect(String(err.message)).not.toContain(bogus);
  });

  it("rejects an address that does not match the public key", async () => {
    const { wallet, device } = fakeDevice();
    const other = Wallet.generate(ECDSA.secp256k1);
    device.getAddress = async () => ({ address: other.classicAddress, publicKey: wallet.publicKey });
    await expect(signWithDevice(payment(other.classicAddress), device)).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});

describe("normalizePublicKey", () => {
  const G_X = "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798";
  it("compresses an uncompressed key using the parity of Y", () => {
    expect(normalizePublicKey(`04${G_X}${"00".repeat(31)}B8`)).toBe(`02${G_X}`);
    expect(normalizePublicKey(`04${G_X.toLowerCase()}${"00".repeat(31)}01`)).toBe(`03${G_X}`);
  });
  it("uppercases and accepts compressed and ed25519 keys", () => {
    expect(normalizePublicKey(`02${G_X.toLowerCase()}`)).toBe(`02${G_X}`);
    expect(normalizePublicKey(`ed${G_X}`)).toBe(`ED${G_X}`);
  });
  it("rejects other shapes", () => {
    expect(() => normalizePublicKey("abcd")).toThrow(WalletError);
  });
});

describe("mapLedgerError", () => {
  const cases: [string, unknown, string, RegExp?][] = [
    ["user rejected on device", deviceError("TransportStatusError", 0x6985), "REJECTED"],
    ["app not open (CLA)", deviceError("TransportStatusError", 0x6e00), "NOT_INSTALLED", /Open the XRP app/],
    ["app not open (INS)", deviceError("TransportStatusError", 0x6d00), "NOT_INSTALLED", /Open the XRP app/],
    ["bootloader CLA", deviceError("TransportStatusError", 0x6e01), "NOT_INSTALLED", /Open the XRP app/],
    ["app not open (6511)", deviceError("TransportStatusError", 0x6511), "NOT_INSTALLED", /Open the XRP app/],
    ["locked 6b0c", deviceError("TransportStatusError", 0x6b0c), "LOCKED", /Unlock/],
    ["locked 5515", deviceError("TransportStatusError", 0x5515), "LOCKED", /Unlock/],
    ["locked by name", deviceError("LockedDeviceError"), "LOCKED"],
    ["picker closed by user", deviceError("TransportOpenUserCancelled"), "CANCELLED"],
    ["no device selected", deviceError("NotFoundError"), "NOT_INSTALLED", /No Ledger selected/],
    ["permission denied", deviceError("NotAllowedError"), "NOT_INSTALLED", /No Ledger selected/],
    ["unplugged", deviceError("DisconnectedDeviceDuringOperation"), "NOT_INSTALLED", /disconnected/i],
    ["busy", deviceError("TransportInterfaceNotAvailable"), "UNKNOWN", /busy/i],
    ["timeout", deviceError("TimeoutError"), "EXPIRED"],
    ["anything else", new Error("boom"), "UNKNOWN"],
  ];
  it.each(cases)("%s", (_label, input, code, message) => {
    const err = mapLedgerError(input, "signing");
    expect(err).toBeInstanceOf(WalletError);
    expect(err.code).toBe(code);
    if (message) expect(err.message).toMatch(message);
  });

  it("passes WalletError through untouched", () => {
    const original = new WalletError("REJECTED", "x");
    expect(mapLedgerError(original)).toBe(original);
  });
});

describe("account index", () => {
  it("builds the BIP44 path and validates the index", () => {
    expect(derivationPath()).toBe("44'/144'/0'/0/0");
    setAccountIndex(3);
    expect(getAccountIndex()).toBe(3);
    expect(derivationPath()).toBe("44'/144'/3'/0/0");
    expect(() => setAccountIndex(-1)).toThrow(RangeError);
    expect(() => setAccountIndex(1.5)).toThrow(RangeError);
    setAccountIndex(0);
  });
});

describe("ledger adapter", () => {
  function adapterWith(device: LedgerDevice) {
    const close = vi.fn(async () => {});
    const open = vi.fn(async () => ({ device, close }));
    return { adapter: createLedgerAdapter({ open, isSupported: () => true }), open, close };
  }

  it("is signOnly with no submit and points at Ledger Live", () => {
    const { adapter } = adapterWith(fakeDevice().device);
    expect(adapter.capabilities).toEqual({ signOnly: true, submit: false });
    expect(adapter.installUrl).toBe("https://www.ledger.com/ledger-live");
    expect(adapter.submitTransaction).toBeUndefined();
  });

  it("reports why it is unavailable when WebUSB is missing", async () => {
    const adapter = createLedgerAdapter({ isSupported: () => false });
    expect(await adapter.isAvailable()).toBe(false);
    expect(adapter.unavailableReason).toBe("WebUSB needs Chrome/Edge/Opera on HTTPS or localhost");
    await expect(adapter.connect()).rejects.toMatchObject({ code: "NOT_INSTALLED" });
  });

  it("connects, signs, and closes the transport on disconnect", async () => {
    const { wallet, device } = fakeDevice();
    const { adapter, close } = adapterWith(device);

    const session = await adapter.connect({ network: "testnet" });
    expect(session.address).toBe(wallet.classicAddress);
    expect(session.publicKey).toBe(wallet.publicKey.toUpperCase());

    const blob = await adapter.signTransaction(payment(wallet.classicAddress), { network: "testnet" });
    expect(verifySignature(blob)).toBe(true);

    await adapter.disconnect();
    expect(close).toHaveBeenCalledTimes(1);
    await expect(adapter.signTransaction(payment(wallet.classicAddress))).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("signing before connecting says to connect first", async () => {
    const { adapter } = adapterWith(fakeDevice().device);
    await expect(adapter.signTransaction(payment("rX"))).rejects.toThrow(/Connect your Ledger first/);
  });

  it("maps a device rejection to REJECTED", async () => {
    const { wallet, device } = fakeDevice();
    const { adapter } = adapterWith(device);
    await adapter.connect();
    device.signTransaction = async () => {
      throw deviceError("TransportStatusError", 0x6985);
    };
    await expect(adapter.signTransaction(payment(wallet.classicAddress))).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("an already-aborted signal throws before the device is opened", async () => {
    const { adapter, open } = adapterWith(fakeDevice().device);
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.connect({ network: "testnet", signal: controller.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(open).not.toHaveBeenCalled();
  });

  it("an already-aborted signal throws before signing", async () => {
    const { wallet, device } = fakeDevice();
    const { adapter } = adapterWith(device);
    await adapter.connect();
    const sign = vi.spyOn(device, "signTransaction");
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.signTransaction(payment(wallet.classicAddress), { network: "testnet", signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("aborting mid-signature stops waiting and says the device may still prompt", async () => {
    const { wallet, device } = fakeDevice();
    const { adapter } = adapterWith(device);
    await adapter.connect();
    device.signTransaction = () => new Promise(() => {}); // user never answers on the device
    const controller = new AbortController();

    const pending = adapter.signTransaction(payment(wallet.classicAddress), {
      network: "testnet",
      signal: controller.signal,
    });
    controller.abort();

    const err = await pending.catch((e) => e);
    expect(err).toBeInstanceOf(WalletError);
    expect(err.code).toBe("CANCELLED");
    expect(err.message).toMatch(/Reject it there/);
  });

  it("aborting mid-connect closes a device that answers late and keeps no session", async () => {
    const { wallet, device } = fakeDevice();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const close = vi.fn(async () => {});
    const open = vi.fn(async () => {
      await gate; // the browser device picker is still open
      return { device, close };
    });
    const adapter = createLedgerAdapter({ isSupported: () => true, open });
    const controller = new AbortController();

    const pending = adapter.connect({ network: "testnet", signal: controller.signal });
    await vi.waitFor(() => expect(open).toHaveBeenCalled()); // the prompt is genuinely in flight
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });

    release();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    await expect(adapter.signTransaction(payment(wallet.classicAddress))).rejects.toThrow(/Connect your Ledger first/);
  });

  it("closes the transport when connecting fails", async () => {
    const { device } = fakeDevice();
    device.getAddress = async () => {
      throw deviceError("TransportStatusError", 0x6e00);
    };
    const { adapter, close } = adapterWith(device);
    await expect(adapter.connect()).rejects.toMatchObject({ code: "NOT_INSTALLED" });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
