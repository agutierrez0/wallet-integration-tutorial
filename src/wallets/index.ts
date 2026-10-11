import { crossmark } from "./crossmark";
import { gemwallet } from "./gemwallet";
import { ledger } from "./ledger";
import { xaman } from "./xaman";
import type { WalletAdapter } from "./types";

export const ADAPTERS: WalletAdapter[] = [crossmark, gemwallet, xaman, ledger];
export type {
  CancelResult,
  PromptHandler,
  WalletAdapter,
  WalletContext,
  WalletPrompt,
  WalletSession,
} from "./types";
export { WalletError } from "./errors";
export { getAccountIndex, setAccountIndex } from "./ledger";
export type { WalletErrorCode } from "./errors";
