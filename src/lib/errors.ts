import {
  ConnectionError,
  NotConnectedError,
  RippledError,
  TimeoutError,
  ValidationError,
  XrplError,
} from "xrpl";
import { WalletError } from "../wallets/errors";

export interface UserError {
  title: string;
  message: string;
  hint?: string;
  retryable: boolean;
  kind: "wallet" | "network" | "ledger" | "input" | "unknown";
}

function walletError(e: WalletError): UserError {
  switch (e.code) {
    case "NOT_INSTALLED":
      return {
        kind: "wallet",
        title: "Wallet not found",
        message: e.message,
        hint: "Install the extension or connect the device, then reload and try again.",
        retryable: true,
      };
    case "REJECTED":
      return {
        kind: "wallet",
        title: "Request declined",
        message: "You declined the request in your wallet.",
        hint: "Nothing was signed or sent. Try again when you're ready.",
        retryable: true,
      };
    case "EXPIRED":
      return {
        kind: "wallet",
        title: "Request timed out",
        message: "The wallet request expired before it was approved.",
        hint: "Try again and approve it in your wallet promptly.",
        retryable: true,
      };
    case "LOCKED":
      return {
        kind: "wallet",
        title: "Wallet is locked",
        message: e.message,
        hint: "Unlock your wallet and make sure an account is selected, then try again.",
        retryable: true,
      };
    case "CANCELLED":
      return {
        kind: "wallet",
        title: "Cancelled",
        message: "You stopped waiting for the wallet.",
        hint: "Nothing was recorded as failed. Try again whenever you're ready.",
        retryable: true,
      };
    case "UNSUPPORTED":
      return {
        kind: "wallet",
        title: "Not supported by this wallet",
        message: e.message,
        hint: "Pick another submit option, or use a different wallet.",
        retryable: false,
      };
    default:
      return {
        kind: "wallet",
        title: "Wallet error",
        message: e.message,
        retryable: true,
      };
  }
}

// A cancel is the user's own choice: callers show it quietly instead of as an error alert.
export function isCancelled(e: unknown): boolean {
  return e instanceof WalletError && e.code === "CANCELLED";
}

function rippledCode(e: RippledError): string | undefined {
  const data = e.data as { error?: unknown; error_message?: unknown } | undefined;
  return typeof data?.error === "string" ? data.error : undefined;
}

function rippledError(e: RippledError): UserError {
  const code = rippledCode(e);
  if (code === "actNotFound") {
    return {
      kind: "ledger",
      title: "Account not funded",
      message: "This account doesn't exist on the selected network yet.",
      hint: "Use the faucet on testnet or devnet, or send it the base reserve in XRP.",
      retryable: false,
    };
  }
  return {
    kind: "ledger",
    title: "Ledger server error",
    message: code ? `${code}: ${e.message}` : e.message,
    retryable: false,
  };
}

const NETWORK_HINT = "Check your connection and the selected network, then try again.";

function isFetchFailure(e: unknown): boolean {
  return (
    e instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(e.message)
  );
}

export function toUserError(e: unknown): UserError {
  if (e instanceof WalletError) return walletError(e);

  if (e instanceof SyntaxError) {
    return {
      kind: "input",
      title: "Invalid JSON",
      message: e.message,
      hint: "Fix the transaction JSON and try again.",
      retryable: false,
    };
  }

  if (e instanceof RippledError) return rippledError(e);

  if (e instanceof TimeoutError) {
    return {
      kind: "network",
      title: "Request timed out",
      message: "The XRPL server didn't respond in time.",
      hint: NETWORK_HINT,
      retryable: true,
    };
  }

  if (e instanceof NotConnectedError) {
    return {
      kind: "network",
      title: "Not connected",
      message: "Couldn't reach the XRPL server.",
      hint: NETWORK_HINT,
      retryable: true,
    };
  }

  if (e instanceof ConnectionError || isFetchFailure(e)) {
    return {
      kind: "network",
      title: "Network problem",
      message: e instanceof Error ? e.message : "Couldn't reach the server.",
      hint: NETWORK_HINT,
      retryable: true,
    };
  }

  if (e instanceof ValidationError) {
    return {
      kind: "input",
      title: "Invalid transaction",
      message: e.message,
      hint: "Review the transaction fields and try again.",
      retryable: false,
    };
  }

  if (e instanceof XrplError || e instanceof Error) {
    return { kind: "unknown", title: "Something went wrong", message: e.message, retryable: false };
  }

  return {
    kind: "unknown",
    title: "Something went wrong",
    message: typeof e === "string" ? e : "An unknown error occurred.",
    retryable: false,
  };
}
