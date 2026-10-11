import { useMemo, useState } from "react";
import type { ActionStatus, UseAction } from "../hooks/useAction";
import { isCancelled, toUserError } from "../lib/errors";
import type { LookupResult } from "../lib/history";
import type { Network } from "../lib/networks";
import { resultCode } from "../lib/historyEntries";
import { explainResult } from "../lib/resultCodes";
import {
  compareSignedToBuilt,
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
  // Result lookup that runs after a wallet-side submit (or an xrpl.js submit that threw).
  lookup?: { status: ActionStatus; result?: LookupResult };
  onSubmitXrplJs: () => void;
  onSubmitWallet: () => void;
  // Stops waiting on the wallet's submit through the app-wide cancel (adapter + prompt).
  onCancelWallet: () => void;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export { resultCode };

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
  lookup,
  onSubmitXrplJs,
  onSubmitWallet,
  onCancelWallet,
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

  // Compare what the wallet signed with what we asked it to sign. A wallet, extension or
  // backend that changed the transaction (or signed with another key) must not go unnoticed.
  const comparison = useMemo(() => compareSignedToBuilt(filled, blob), [filled, blob]);
  const [allowMismatch, setAllowMismatch] = useState(false);
  const blocked = !comparison.ok && !allowMismatch;

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
      <h2>Signed output</h2>
      {derived.valid ? (
        <StatusPill tone="success">Signature verifies</StatusPill>
      ) : (
        <Alert
          variant="warning"
          title="Signature did not verify"
          message="This may not be a fully signed transaction. Some wallets return a different format, so check the decoded blob below before submitting."
        />
      )}
      {!comparison.ok && (
        <Alert
          variant="error"
          title="The signed transaction doesn't match what you built"
          message={
            <>
              {comparison.decodeError && (
                <p className="result-line">Couldn't decode the blob: {comparison.decodeError}</p>
              )}
              {comparison.mismatches.length > 0 && (
                <ul className="mismatch-list">
                  {comparison.mismatches.map((m) => (
                    <li key={m.field}>
                      <strong>{m.field}</strong>: built <code>{JSON.stringify(m.built) ?? "(none)"}</code>
                      , signed <code>{JSON.stringify(m.signed) ?? "(none)"}</code>
                    </li>
                  ))}
                </ul>
              )}
              {comparison.signerMismatch && (
                <p className="result-line">
                  The signing key belongs to <code>{comparison.signerMismatch.derived}</code>, not{" "}
                  <code>{comparison.signerMismatch.account}</code>. That is normal for a regular
                  key or multi-signing, but otherwise another account signed this.
                </p>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={allowMismatch}
                  onChange={(e) => setAllowMismatch(e.target.checked)}
                />
                I've checked the differences. Submit anyway.
              </label>
            </>
          }
        />
      )}
      <CopyBlock label="tx_blob" value={blob} />
      <CopyBlock label="Hash (computed locally)" value={derived.hash} />

      <details>
        <summary>Transaction sent to the wallet</summary>
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
          disabled={wLoading || submitted || blocked}
          onClick={onSubmitXrplJs}
        >
          Submit with xrpl.js
        </ActionButton>
        {canWalletSubmit && (
          <ActionButton
            variant="secondary"
            loading={wLoading}
            loadingLabel={`Waiting for approval in ${walletName}…`}
            disabled={xLoading || submitted || blocked}
            onClick={onSubmitWallet}
          >
            Submit via wallet
          </ActionButton>
        )}
        {wLoading && (
          <ActionButton variant="ghost" onClick={onCancelWallet}>
            Cancel
          </ActionButton>
        )}
      </div>
      <p className="muted">
        {submitted
          ? "Already submitted. Edit the transaction or sign again to send another."
          : blocked
            ? "Submitting is blocked until you review the differences above."
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
          <>
            {lookup?.status === "loading" && (
              <SkeletonBlock lines={2} label="Submitted. Checking the ledger for the result…" />
            )}
            {lookup?.result?.found ? (
              <ResultCard
                code={lookup.result.engineResult}
                validated={lookup.result.validated}
                hash={walletHash}
                explorerUrl={`${network.explorer}/transactions/${walletHash}`}
              />
            ) : (
              lookup?.status !== "loading" && (
                <Alert
                  variant="success"
                  title={`Sent through ${walletName}`}
                  message={
                    <>
                      <p className="result-line">
                        The wallet submitted it.{" "}
                        {lookup?.status === "success"
                          ? "It hasn't shown up on the ledger yet, so check the explorer or use Check on-chain in history."
                          : "Confirm the result on the explorer."}
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
              )
            )}
          </>
        )}
      </div>
      {submitX.status === "error" && (
        <>
          <Alert
            error={toUserError(submitX.error)}
            onRetry={lookup?.result?.found ? undefined : onSubmitXrplJs}
            onDismiss={submitX.reset}
          />
          {lookup?.status === "loading" && (
            <SkeletonBlock lines={2} label="Checking whether it reached the ledger anyway…" />
          )}
          {lookup?.result?.found && (
            <ResultCard
              code={lookup.result.engineResult}
              validated={lookup.result.validated}
              hash={derived.hash}
              explorerUrl={`${network.explorer}/transactions/${derived.hash}`}
            />
          )}
        </>
      )}
      {submitW.status === "error" && !isCancelled(submitW.error) && (
        <Alert
          error={toUserError(submitW.error)}
          onRetry={onSubmitWallet}
          onDismiss={submitW.reset}
        />
      )}
    </section>
  );
}
