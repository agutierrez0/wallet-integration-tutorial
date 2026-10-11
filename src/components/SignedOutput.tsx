import { useMemo } from "react";
import type { Network } from "../lib/networks";
import {
  curlFor,
  decodeBlob,
  hashOfBlob,
  isSignatureValid,
  rpcSubmitBody,
  rpcTxBody,
} from "../lib/tx";
import type { TxJson } from "../lib/tx";
import { CopyBlock } from "./CopyBlock";

interface Props {
  network: Network;
  blob: string;
  filled: TxJson;
  canWalletSubmit: boolean;
  busy: boolean;
  submitResult: unknown;
  submittedHash: string | null;
  onSubmitXrplJs: () => void;
  onSubmitWallet: () => void;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export function SignedOutput({
  network,
  blob,
  filled,
  canWalletSubmit,
  busy,
  submitResult,
  submittedHash,
  onSubmitXrplJs,
  onSubmitWallet,
}: Props) {
  const derived = useMemo(() => {
    const hash = hashOfBlob(blob);
    return {
      hash,
      valid: isSignatureValid(blob),
      decoded: decodeBlob(blob),
      submit: rpcSubmitBody(blob),
      lookup: rpcTxBody(hash),
    };
  }, [blob]);

  const hash = submittedHash ?? derived.hash;

  return (
    <section className="card">
      <h2>4. Signed output</h2>
      <p className={derived.valid ? "ok" : "bad"}>
        {derived.valid ? "Signature verifies" : "Signature did not verify"}
      </p>
      <CopyBlock label="tx_blob" value={blob} />
      <CopyBlock label="Hash (computed locally)" value={derived.hash} />

      <details>
        <summary>Autofilled transaction</summary>
        <pre>{pretty(filled)}</pre>
      </details>
      <details>
        <summary>Decoded blob</summary>
        <pre>{pretty(derived.decoded)}</pre>
      </details>

      <h3>Submit it yourself (Postman, curl)</h3>
      <CopyBlock label={`POST ${network.rpc}`} value={pretty(derived.submit)} />
      <CopyBlock label="curl" value={curlFor(network, derived.submit)} />
      <CopyBlock label="Look up result afterwards" value={pretty(derived.lookup)} />

      <h3>Submit from here</h3>
      <div className="row wrap">
        <button type="button" className="primary" disabled={busy} onClick={onSubmitXrplJs}>
          Submit with xrpl.js
        </button>
        {canWalletSubmit && (
          <button type="button" disabled={busy} onClick={onSubmitWallet}>
            Submit via wallet
          </button>
        )}
      </div>
      <p className="muted">Nothing is submitted until you press one of these.</p>

      {submitResult !== null && submitResult !== undefined && (
        <>
          <a
            href={`${network.explorer}/transactions/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer
          </a>
          <pre>{pretty(submitResult)}</pre>
        </>
      )}
    </section>
  );
}
