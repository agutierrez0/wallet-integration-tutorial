import { Client, decode, deriveAddress, hashes, verifySignature } from "xrpl";
import type { SubmittableTransaction } from "xrpl";
import type { Network } from "./networks";

export type TxJson = Record<string, unknown>;

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

// ---------------------------------------------------------------------------
// Does the blob the wallet returned match the transaction we asked it to sign?
// ---------------------------------------------------------------------------

// Fields a wallet (or the network) may legitimately add or change when signing.
const WALLET_FILLED = new Set([
  "SigningPubKey",
  "TxnSignature",
  "Signers",
  "Fee",
  "Sequence",
  "LastLedgerSequence",
  "NetworkID",
]);

export interface FieldMismatch {
  field: string;
  built: unknown;
  signed: unknown;
}

export interface SignedComparison {
  ok: boolean;
  mismatches: FieldMismatch[];
  // SigningPubKey does not belong to Account. Legitimate for regular-key or multi-signing,
  // but worth a warning because it can also mean another account signed.
  signerMismatch: { derived: string; account: string } | null;
  decodeError: string | null;
}

function normNumeric(s: string): string | null {
  if (/^[+-]?\d+$/.test(s)) {
    try {
      return BigInt(s).toString();
    } catch {
      return null;
    }
  }
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? String(n) : null;
  }
  return null;
}

// Makes values from the builder and from the binary codec comparable: numbers vs numeric
// strings, hex case, key order.
function canon(v: unknown): unknown {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const n = normNumeric(v);
    if (n !== null) return n;
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) return v.toUpperCase();
    return v;
  }
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canon(x)]),
    );
  }
  return v;
}

const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export function compareSignedToBuilt(built: TxJson, blob: string): SignedComparison {
  let decoded: TxJson;
  try {
    decoded = decodeBlob(blob);
  } catch (e) {
    return {
      ok: false,
      mismatches: [],
      signerMismatch: null,
      decodeError: e instanceof Error ? e.message : "Could not decode the signed blob.",
    };
  }

  const mismatches: FieldMismatch[] = [];
  for (const [field, b] of Object.entries(built)) {
    if (WALLET_FILLED.has(field) || b === undefined) continue;
    if (!same(b, decoded[field])) mismatches.push({ field, built: b, signed: decoded[field] });
  }
  for (const [field, d] of Object.entries(decoded)) {
    if (WALLET_FILLED.has(field) || field in built) continue;
    if (field === "Flags" && same(d, 0)) continue; // the codec writes an explicit zero
    mismatches.push({ field, built: undefined, signed: d });
  }

  let signerMismatch: SignedComparison["signerMismatch"] = null;
  const pub = decoded.SigningPubKey;
  if (typeof pub === "string" && pub !== "" && typeof decoded.Account === "string") {
    try {
      const derived = deriveAddress(pub);
      if (derived !== decoded.Account) signerMismatch = { derived, account: decoded.Account };
    } catch {
      signerMismatch = { derived: "(invalid key)", account: decoded.Account };
    }
  }

  return {
    ok: mismatches.length === 0 && signerMismatch === null,
    mismatches,
    signerMismatch,
    decodeError: null,
  };
}
