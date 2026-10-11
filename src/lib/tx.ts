import { Client, decode, hashes, verifySignature } from "xrpl";
import type { SubmittableTransaction } from "xrpl";
import type { Network } from "./networks";

export type TxJson = Record<string, unknown>;

export const TEMPLATES: Record<string, TxJson> = {
  AccountSet: {
    TransactionType: "AccountSet",
    Domain: "6578616D706C652E636F6D", // hex of "example.com"
  },
  Payment: {
    TransactionType: "Payment",
    Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    Amount: "1000000", // drops (1 XRP)
  },
  TrustSet: {
    TransactionType: "TrustSet",
    LimitAmount: {
      currency: "USD",
      issuer: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      value: "100",
    },
  },
};

// Connect, run fn, always disconnect. Keeps the sandbox free of long-lived sockets.
export async function withClient<T>(
  network: Network,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(network.ws);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

export function parseTx(text: string, account: string): TxJson {
  const tx = JSON.parse(text) as TxJson;
  if (!tx.TransactionType) throw new Error("TransactionType is required");
  return { ...tx, Account: tx.Account ?? account };
}

// Fills Sequence, Fee and LastLedgerSequence from the selected network.
export async function autofillTx(network: Network, tx: TxJson): Promise<TxJson> {
  return withClient(network, async (client) => {
    const filled = await client.autofill(tx as unknown as SubmittableTransaction);
    return filled as unknown as TxJson;
  });
}

// A signed tx's ID is derived from the blob, so it is known before submitting.
export function hashOfBlob(blob: string): string {
  return hashes.hashSignedTx(blob);
}

export function decodeBlob(blob: string): TxJson {
  return decode(blob) as unknown as TxJson;
}

export function isSignatureValid(blob: string): boolean {
  try {
    return verifySignature(blob);
  } catch {
    return false;
  }
}

export function rpcSubmitBody(blob: string) {
  return { method: "submit", params: [{ tx_blob: blob }] };
}

export function rpcTxBody(hash: string) {
  return { method: "tx", params: [{ transaction: hash }] };
}

export function curlFor(network: Network, body: unknown): string {
  return `curl -X POST ${network.rpc} \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(body)}'`;
}

export async function submitWithXrplJs(network: Network, blob: string) {
  return withClient(network, (client) => client.submitAndWait(blob));
}

export async function fundFromFaucet(network: Network, address: string) {
  if (!network.faucet) throw new Error("No faucet on this network");
  const res = await fetch(network.faucet, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination: address }),
  });
  if (!res.ok) throw new Error(`Faucet returned ${res.status}`);
  return res.json();
}
