import { useMemo } from "react";
import type { UseAction } from "../hooks/useAction";
import { toUserError } from "../lib/errors";
import type { Network } from "../lib/networks";
import { explainResult } from "../lib/resultCodes";
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
import { ActionButton, Alert, SkeletonBlock, StatusPill } from "./ui";
import type { PillTone } from "./ui";

interface Props {
  network: Network;
  walletName: string;
  blob: string;
  filled: TxJson;
  canWalletSubmit: boolean;
  submitX: UseAction<[], unknown>;
  submitW: UseAction<[], string | undefined>;
  onSubmitXrplJs: () => void;
  onSubmitWallet: () => void;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

// Pulls the transaction result code out of an xrpl.js submitAndWait response.
export function resultCode(res: unknown): string | undefined {
  const r = (res as { result?: { engine_result?: unknown; meta?: unknown } } | null)?.result;
  if (typeof r?.engine_result === "string") return r.engine_result;
  const meta = r?.meta;
  if (meta && typeof meta === "object" && "TransactionResult" in meta) {
    return String((meta as { TransactionResult: unknown }).TransactionResult);
  }
  return undefined;
}

const TONE: Record<string, PillTone> = {
  success: "success",
  retry: "warning",
  failed: "error",
  unknown: "warning",
};

function ResultCard({
  code,
  validated,
  hash,
  explorerUrl,
}: {
  code: string | undefined;
  validated: boolean | undefined;
  hash: string;
  explorerUrl: string;
}) {
  const ex = code ? explainResult(code) : null;
  const link = (
    <a href={explorerUrl} target="_blank" rel="noreferrer">
      View on explorer
    </a>
  );
  const body = (lead: string) => (
    <>
      <p className="result-line">{lead}</p>
      {ex && <p className="result-line">{ex.explanation}</p>}
      <p className="result-line">
        <code>{hash}</code>
      </p>
      {link}
    </>
  );

  if (!code || !ex) {
    return (
      <Alert
        variant="info"
        title="Submitted"
        message={
          <>
            <p className="result-line">
              The node accepted the transaction but didn't report a final result.
              Look it up on the explorer.
            </p>
            <p className="result-line">
              <code>{hash}</code>
            </p>
            {link}
          </>
        }
      />
    );
  }
  if (ex.category === "success") {
    return (
      <Alert
        variant="success"
        title={`${ex.title} (${code})`}
        message={body(
          validated === false
            ? "Applied, but not yet in a validated ledger."
            : "Included in a validated ledger.",
        )}
      />
    );
  }
  if (ex.category === "retry") {
    return (
      <Alert
        variant="warning"
        title={`${ex.title} (${code})`}
        message={body("Not final yet. It may still be applied, or you may need to resubmit.")}
      />
    );
  }
  const included = code.startsWith("tec");
  return (
    <Alert
      variant="error"
      title={`${ex.title} (${code})`}
      message={body(
        included
          ? "Included in a ledger and the fee was charged, but it did not do what you asked."
          : "Rejected. It was not included in a ledger and no fee was charged.",
      )}
    />
  );
}

export function SignedOutput({
  network,
  walletName,
  blob,
  filled,
  canWalletSubmit,
  submitX,
  submitW,
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

  const xLoading = submitX.status === "loading";
  const wLoading = submitW.status === "loading";
  const submitting = xLoading || wLoading;
  const submitted = submitX.status === "success" || submitW.status === "success";

  const code = resultCode(submitX.data);
  const validated = (submitX.data as { result?: { validated?: boolean } } | undefined)?.result
    ?.validated;
  const walletHash = submitW.data;

  let pill = <StatusPill>Not submitted</StatusPill>;
  if (submitting) pill = <StatusPill tone="pending">Submitting…</StatusPill>;
  else if (submitX.status === "error" || submitW.status === "error")
    pill = <StatusPill tone="error">Submit failed</StatusPill>;
  else if (submitX.status === "success")
    pill = (
      <StatusPill tone={code ? TONE[explainResult(code).category] : "neutral"}>
        {code ?? "Submitted"}
      </StatusPill>
    );
  else if (submitW.status === "success")
    pill = <StatusPill tone="success">Sent via {walletName}</StatusPill>;

  return (
    <section className="card">
      <h2>4. Signed output</h2>
      {derived.valid ? (
        <StatusPill tone="success">Signature verifies</StatusPill>
      ) : (
        <Alert
          variant="warning"
          title="Signature did not verify"
          message="This may not be a fully signed transaction. Some wallets return a different format, so check the decoded blob below before submitting."
        />
      )}
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

      <div className="card-head">
        <h3>Submit from here</h3>
        {pill}
      </div>
      <div className="row wrap">
        <ActionButton
          loading={xLoading}
          loadingLabel="Submitting and waiting for validation…"
          disabled={wLoading || submitted}
          onClick={onSubmitXrplJs}
        >
          Submit with xrpl.js
        </ActionButton>
        {canWalletSubmit && (
          <ActionButton
            variant="secondary"
            loading={wLoading}
            loadingLabel={`Waiting for approval in ${walletName}…`}
            disabled={xLoading || submitted}
            onClick={onSubmitWallet}
          >
            Submit via wallet
          </ActionButton>
        )}
        {wLoading && (
          <ActionButton variant="ghost" onClick={submitW.reset}>
            Cancel
          </ActionButton>
        )}
      </div>
      <p className="muted">
        {submitted
          ? "Already submitted. Edit the transaction or sign again to send another."
          : "Nothing is submitted until you press one of these."}
      </p>

      {xLoading && (
        <SkeletonBlock lines={3} label="Submitted. Waiting for the ledger to validate…" />
      )}
      {wLoading && (
        <p className="muted" role="status">
          Approve the request in the {walletName} popup. Cancel stops waiting and
          ignores the result.
        </p>
      )}

      <div aria-live="polite">
        {submitX.status === "success" && (
          <ResultCard
            code={code}
            validated={validated}
            hash={derived.hash}
            explorerUrl={`${network.explorer}/transactions/${derived.hash}`}
          />
        )}
        {submitW.status === "success" && walletHash && (
          <Alert
            variant="success"
            title={`Sent through ${walletName}`}
            message={
              <>
                <p className="result-line">
                  The wallet submitted it. Its final result isn't shown here, so
                  confirm it on the explorer.
                </p>
                <p className="result-line">
                  <code>{walletHash}</code>
                </p>
                <a
                  href={`${network.explorer}/transactions/${walletHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer
                </a>
              </>
            }
          />
        )}
      </div>
      {submitX.status === "error" && (
        <Alert
          error={toUserError(submitX.error)}
          onRetry={onSubmitXrplJs}
          onDismiss={submitX.reset}
        />
      )}
      {submitW.status === "error" && (
        <Alert
          error={toUserError(submitW.error)}
          onRetry={onSubmitWallet}
          onDismiss={submitW.reset}
        />
      )}
    </section>
  );
}
