import { deriveAddress, encode, verifySignature } from "xrpl";
import type { TxJson } from "../lib/tx";
import { WalletError } from "./errors";
import { runPrompt, throwIfAborted } from "./prompt";
import type { WalletAdapter, WalletContext } from "./types";

const NAME = "Ledger";
const INSTALL_URL = "https://www.ledger.com/ledger-live";
const UNSUPPORTED_REASON = "WebUSB needs Chrome/Edge/Opera on HTTPS or localhost";

// BIP44 path for XRP (coin type 144). Only the account index is configurable.
let accountIndex = 0;

export function setAccountIndex(n: number): void {
  if (!Number.isInteger(n) || n < 0 || n >= 2 ** 31) {
    throw new RangeError("Ledger account index must be an integer from 0 to 2147483647");
  }
  accountIndex = n;
}

export function getAccountIndex(): number {
  return accountIndex;
}

export function derivationPath(index = accountIndex): string {
  return `44'/144'/${index}'/0/0`;
}

// The slice of the Ledger XRP app that signing needs; tests pass a fake.
export interface LedgerDevice {
  getAddress(path: string): Promise<{ address: string; publicKey: string }>;
  signTransaction(path: string, rawTxHex: string): Promise<string>;
}

export interface OpenDevice {
  device: LedgerDevice;
  close(): Promise<void>;
}

// The device can hand back an uncompressed key (04 || X || Y); the ledger wants the compressed form.
export function normalizePublicKey(publicKey: string): string {
  const hex = publicKey.toUpperCase();
  if (/^04[0-9A-F]{128}$/.test(hex)) {
    const x = hex.slice(2, 66);
    const lastYByte = Number.parseInt(hex.slice(-2), 16);
    return `${lastYByte % 2 === 0 ? "02" : "03"}${x}`;
  }
  if (/^(0[23]|ED)[0-9A-F]{64}$/.test(hex)) return hex;
  throw new WalletError("UNKNOWN", "Ledger returned a public key in an unexpected format.");
}

// Builds the signed blob. The Ledger XRP app takes the serialized transaction WITHOUT a signature
// (xrpl `encode`, with SigningPubKey set) and adds the signing prefix itself, so encodeForSigning
// would be wrong. The returned signature is hex DER.
export async function signWithDevice(
  tx: TxJson,
  device: LedgerDevice,
  path: string = derivationPath(),
): Promise<string> {
  const { address, publicKey: rawKey } = await device.getAddress(path);
  const publicKey = normalizePublicKey(rawKey);
  if (deriveAddress(publicKey) !== address) {
    throw new WalletError(
      "UNKNOWN",
      "Ledger returned an address that does not match its public key.",
    );
  }
  if (tx.Account !== undefined && tx.Account !== address) {
    throw new WalletError(
      "UNKNOWN",
      `This transaction is for ${String(tx.Account)} but the connected Ledger account is ${address}.`,
    );
  }

  const { TxnSignature: _dropped, ...unsigned } = tx;
  const forDevice: TxJson = { ...unsigned, Account: address, SigningPubKey: publicKey };
  const signature = await device.signTransaction(path, encode(forDevice as never));

  const blob = encode({ ...forDevice, TxnSignature: signature.toUpperCase() } as never);
  let valid = false;
  try {
    valid = verifySignature(blob);
  } catch {
    // treated as invalid below
  }
  if (!valid) {
    throw new WalletError(
      "UNKNOWN",
      "Ledger returned a signature that does not verify. Nothing was signed.",
    );
  }
  return blob;
}

const STATUS_REJECTED = [0x6985];
const STATUS_APP_NOT_OPEN = [0x6e00, 0x6d00, 0x6e01, 0x6511, 0x5123];
const STATUS_LOCKED = [0x6b0c, 0x5515];

const STOP_ON_DEVICE =
  "The request may still be showing on the Ledger. Reject it there, or it will be ignored.";

// Ledger errors expose a `name` and, for device replies, a numeric `statusCode`. Matching on those
// avoids importing @ledgerhq/errors, which is only a transitive dependency.
export function mapLedgerError(err: unknown, action = "request"): WalletError {
  if (err instanceof WalletError) return err;
  const e = err as { name?: unknown; statusCode?: unknown; message?: unknown } | null;
  const name = typeof e?.name === "string" ? e.name : "";
  const status = typeof e?.statusCode === "number" ? e.statusCode : undefined;

  if (status !== undefined && STATUS_REJECTED.includes(status)) {
    return new WalletError("REJECTED", "Rejected on your Ledger.", { cause: err });
  }
  if (status !== undefined && STATUS_APP_NOT_OPEN.includes(status)) {
    return new WalletError("NOT_INSTALLED", "Open the XRP app on your Ledger, then try again.", {
      cause: err,
    });
  }
  if ((status !== undefined && STATUS_LOCKED.includes(status)) || name === "LockedDeviceError") {
    return new WalletError("LOCKED", "Unlock your Ledger, then try again.", { cause: err });
  }
  if (name === "TransportOpenUserCancelled") {
    return new WalletError("CANCELLED", "Ledger selection was cancelled.", { cause: err });
  }
  if (name === "NotAllowedError" || name === "NotFoundError") {
    return new WalletError(
      "NOT_INSTALLED",
      "No Ledger selected. Plug it in, unlock it and choose it in the browser prompt.",
      {
        cause: err,
      },
    );
  }
  if (name === "DisconnectedDevice" || name === "DisconnectedDeviceDuringOperation") {
    return new WalletError("NOT_INSTALLED", "Ledger disconnected. Reconnect it and try again.", {
      cause: err,
    });
  }
  if (name === "TransportInterfaceNotAvailable" || name === "InvalidStateError") {
    return new WalletError(
      "UNKNOWN",
      "Ledger is busy. Close Ledger Live or other tabs using it, then try again.",
      {
        cause: err,
      },
    );
  }
  if (name === "TimeoutError" || name === "TransportRaceCondition") {
    return new WalletError("EXPIRED", `Ledger ${action} timed out. ${STOP_ON_DEVICE}`, {
      cause: err,
    });
  }
  return new WalletError("UNKNOWN", `Ledger: ${action} failed`, { cause: err });
}

// runPrompt can only stop waiting; make that explicit for a device that keeps its prompt open.
function deviceStopped(err: unknown): never {
  if (err instanceof WalletError && err.code === "CANCELLED") {
    throw new WalletError("CANCELLED", `Stopped waiting for Ledger. ${STOP_ON_DEVICE}`, {
      cause: err,
    });
  }
  if (err instanceof WalletError && err.code === "EXPIRED") {
    throw new WalletError("EXPIRED", `Stopped waiting for Ledger. ${STOP_ON_DEVICE}`, {
      cause: err,
    });
  }
  throw err;
}

type LedgerLibs = {
  Transport: typeof import("@ledgerhq/hw-transport-webusb").default;
  Xrp: typeof import("@ledgerhq/hw-app-xrp").default;
};

// The Ledger libraries expect a global Buffer. Install it and fetch them only on first use so the
// main bundle stays small.
let libsPromise: Promise<LedgerLibs> | undefined;
function loadLibs(): Promise<LedgerLibs> {
  libsPromise ??= (async () => {
    const { Buffer } = await import("buffer");
    const g = globalThis as { Buffer?: unknown };
    g.Buffer ??= Buffer;
    const [transport, app] = await Promise.all([
      import("@ledgerhq/hw-transport-webusb"),
      import("@ledgerhq/hw-app-xrp"),
    ]);
    return { Transport: transport.default, Xrp: app.default };
  })().catch((err) => {
    libsPromise = undefined; // allow a retry after a failed chunk load
    throw err;
  });
  return libsPromise;
}

// Opens the WebUSB transport. The browser only allows this from a user gesture (e.g. a click)
// the first time, because it shows the device picker.
async function openWebUsb(): Promise<OpenDevice> {
  const { Transport, Xrp } = await loadLibs();
  const transport = await Transport.create();
  const xrp = new Xrp(transport);
  return {
    device: xrp as unknown as LedgerDevice,
    close: () => transport.close(),
  };
}

function webUsbSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "usb" in navigator &&
    typeof window !== "undefined" &&
    window.isSecureContext
  );
}

export interface LedgerDeps {
  open?: () => Promise<OpenDevice>;
  isSupported?: () => boolean;
}

export function createLedgerAdapter(deps: LedgerDeps = {}): WalletAdapter {
  const open = deps.open ?? openWebUsb;
  const isSupported = deps.isSupported ?? webUsbSupported;
  let current: { opened: OpenDevice; path: string } | undefined;

  async function closeCurrent() {
    const c = current;
    current = undefined;
    try {
      await c?.opened.close();
    } catch {
      // closing a device that already went away is fine
    }
  }

  function requireSupported() {
    if (!isSupported()) {
      throw new WalletError("NOT_INSTALLED", `${UNSUPPORTED_REASON}.`);
    }
  }

  const adapter: WalletAdapter = {
    id: "ledger",
    name: NAME,
    capabilities: { signOnly: true, submit: false },
    installUrl: INSTALL_URL,

    async isAvailable() {
      const ok = isSupported();
      adapter.unavailableReason = ok ? undefined : UNSUPPORTED_REASON;
      return ok;
    },

    async connect(ctx?: WalletContext) {
      throwIfAborted(NAME, ctx?.signal);
      requireSupported();
      await closeCurrent();
      const path = derivationPath();
      try {
        return await runPrompt({
          wallet: NAME,
          action: "connect",
          signal: ctx?.signal,
          run: async () => {
            let opened: OpenDevice | undefined;
            try {
              opened = await open();
              const { address, publicKey } = await opened.device.getAddress(path);
              const key = normalizePublicKey(publicKey);
              if (ctx?.signal?.aborted) {
                // we stopped waiting while the device answered; do not keep a session nobody asked for
                // (the catch below closes the transport)
                throw new WalletError("CANCELLED", "Stopped waiting for Ledger.");
              }
              current = { opened, path };
              return { address, publicKey: key, networkHint: `account ${accountIndex}` };
            } catch (err) {
              if (opened && current?.opened !== opened) await opened.close().catch(() => {});
              throw mapLedgerError(err, "connect");
            }
          },
        });
      } catch (err) {
        return deviceStopped(err);
      }
    },

    async signTransaction(tx, ctx?: WalletContext) {
      throwIfAborted(NAME, ctx?.signal);
      const session = current;
      if (!session) throw new WalletError("LOCKED", "Connect your Ledger first.");
      try {
        return await runPrompt({
          wallet: NAME,
          action: "signing",
          signal: ctx?.signal,
          run: async () => {
            try {
              return await signWithDevice(tx, session.opened.device, session.path);
            } catch (err) {
              throw mapLedgerError(err, "signing");
            }
          },
        });
      } catch (err) {
        return deviceStopped(err);
      }
    },

    async disconnect() {
      await closeCurrent();
    },
  };

  return adapter;
}

export const ledger: WalletAdapter = createLedgerAdapter();
