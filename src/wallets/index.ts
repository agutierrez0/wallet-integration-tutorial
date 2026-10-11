import { crossmark } from "./crossmark";
import { gemwallet } from "./gemwallet";
import type { WalletAdapter } from "./types";

export const ADAPTERS: WalletAdapter[] = [crossmark, gemwallet];
export type { WalletAdapter, WalletSession } from "./types";
