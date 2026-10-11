import sdk from "@crossmarkio/sdk";
import type { WalletAdapter } from "./types";

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

function assertOk(meta: CrossmarkStatus | undefined, action: string) {
  if (meta?.isRejected) throw new Error(`Crossmark: ${action} was rejected`);
  if (meta?.isExpired) throw new Error(`Crossmark: ${action} request expired`);
  if (meta?.isError) throw new Error(`Crossmark: ${action} failed`);
}

export const crossmark: WalletAdapter = {
  id: "crossmark",
  name: "Crossmark",
  capabilities: { signOnly: true, submit: false },

  async isAvailable() {
    try {
      return Boolean(sdk.sync.isInstalled?.());
    } catch {
      return false;
    }
  },

  async connect() {
    const res = (await sdk.methods.signInAndWait()) as unknown as SignInResult;
    const data = res?.response?.data;
    assertOk(data?.meta, "sign-in");
    if (!data?.address) throw new Error("Crossmark: no address returned");
    return {
      address: data.address,
      publicKey: data.publicKey,
      networkHint: data.network?.label ?? data.network?.rpc,
    };
  },

  async signTransaction(tx) {
    const res = (await sdk.methods.signAndWait(tx as never)) as unknown as SignResult;
    const data = res?.response?.data;
    assertOk(data?.meta, "signing");
    if (!data?.txBlob) throw new Error("Crossmark: no signed blob returned");
    return data.txBlob;
  },

  async disconnect() {
    // Crossmark has no programmatic disconnect; the session is just dropped here.
  },
};
