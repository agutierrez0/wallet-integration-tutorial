export type WalletErrorCode =
  | "NOT_INSTALLED" // extension or device not found
  | "REJECTED" // user declined in the wallet
  | "EXPIRED" // request timed out in the wallet
  | "LOCKED" // wallet is locked or no account selected
  | "UNSUPPORTED" // wallet cannot do this (e.g. submit)
  | "UNKNOWN";

// Thrown by every WalletAdapter so the UI can show friendly, specific states.
export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WalletError";
    this.code = code;
  }
}
