import type { Client, SubmittableTransaction } from "xrpl";
import type { Network } from "./networks";
import { loadXrpl } from "./xrplLoader";

export type TxJson = Record<string, unknown>;

// Connect, run fn, always disconnect. Keeps the sandbox free of long-lived sockets.
export async function withClient<T>(
  network: Network,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const { Client } = await loadXrpl();
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
