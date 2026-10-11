import { crossmark } from "./crossmark";
import { gemwallet } from "./gemwallet";
import { xaman } from "./xaman";
import type { WalletAdapter } from "./types";

export const ADAPTERS: WalletAdapter[] = [crossmark, gemwallet, xaman];
export type {
  PromptHandler,
  WalletAdapter,
  WalletContext,
  WalletPrompt,
  WalletSession,
} from "./types";
export { WalletError } from "./errors";
export type { WalletErrorCode } from "./errors";
