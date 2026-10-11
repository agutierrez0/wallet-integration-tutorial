import sdk from "@crossmarkio/sdk";
import { WalletError } from "./errors";
import type { WalletAdapter } from "./types";

const PROMPT_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 3_000;

// The SDK types its responses as `any`, so describe only what we read.
interface CrossmarkStatus {
  isError?: boolean;
  isRejected?: boolean;
  isExpired?: boolean;
}
interface SignInResult {
  response: {
    data: {
      address: string;
      publicKey?: string;
      network?: { label?: string; rpc?: string };
      meta?: CrossmarkStatus;
    };
  };
}
interface SignResult {
  response: { data: { txBlob?: string; meta?: CrossmarkStatus } };
}

function installed(): boolean {
  try {
    return Boolean(sdk.sync.isInstalled?.());
  } catch {
    return false;
  }
}

function assertInstalled() {
  if (!installed()) {
    throw new WalletError("NOT_INSTALLED", "Crossmark was not found. Install the extension and reload.");
  }
}

function assertOk(meta: CrossmarkStatus | undefined, action: string) {
  if (meta?.isRejected) throw new WalletError("REJECTED", `Crossmark: ${action} was rejected`);
  if (meta?.isExpired) throw new WalletError("EXPIRED", `Crossmark: ${action} request expired`);
  if (meta?.isError) throw new WalletError("UNKNOWN", `Crossmark: ${action} failed`);
}

// Wallet prompts wait on a human, so bound them; anything unexpected becomes UNKNOWN.
async function prompt<T>(action: string, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new WalletError("EXPIRED", `Crossmark: ${action} timed out waiting for approval`)),
      PROMPT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new WalletError("UNKNOWN", `Crossmark: ${action} failed`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export const crossmark: WalletAdapter = {
  id: "crossmark",
  name: "Crossmark",
  capabilities: { signOnly: true, submit: false },

  async isAvailable() {
    // Bounded in case the extension injects late or the check never settles.
    return Promise.race([
      Promise.resolve(installed()),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS)),
    ]);
  },

  async connect() {
    assertInstalled();
    return prompt("sign-in", async () => {
      const res = (await sdk.methods.signInAndWait()) as unknown as SignInResult;
      const data = res?.response?.data;
      assertOk(data?.meta, "sign-in");
      if (!data?.address) {
        throw new WalletError("LOCKED", "Crossmark returned no account. Unlock it and select an account.");
      }
      return {
        address: data.address,
        publicKey: data.publicKey,
        networkHint: data.network?.label ?? data.network?.rpc,
      };
    });
  },

  async signTransaction(tx) {
    assertInstalled();
    return prompt("signing", async () => {
      const res = (await sdk.methods.signAndWait(tx as never)) as unknown as SignResult;
      const data = res?.response?.data;
      assertOk(data?.meta, "signing");
      if (!data?.txBlob) throw new WalletError("UNKNOWN", "Crossmark: no signed blob returned");
      return data.txBlob;
    });
  },

  async submitTransaction() {
    throw new WalletError("UNSUPPORTED", "Crossmark cannot submit transactions from this app. Use xrpl.js or the JSON-RPC body instead.");
  },

  async disconnect() {
    // Crossmark has no programmatic disconnect; the session is just dropped here.
  },
};
