import { Card, Checkbox, Collapse, Descriptions, Flex, Result, Spin, Tabs, Typography } from "antd";
import { useMemo, useState } from "react";
import type { ActionStatus, UseAction } from "../hooks/useAction";
import { isCancelled, toUserError } from "../lib/errors";
import type { LookupResult } from "../lib/history";
import { resultCode } from "../lib/historyEntries";
import type { Network } from "../lib/networks";
import { explainResult } from "../lib/resultCodes";
import { curlFor, rpcSubmitBody, rpcTxBody } from "../lib/tx";
import { compareSignedToBuilt, decodeBlob, hashOfBlob, isSignatureValid } from "../lib/txCodec";
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

type ResultStatus = "success" | "warning" | "error" | "info";

// A compact result: no oversized illustration, just status, explanation, hash and link.
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

  let status: ResultStatus = "info";
  let title = "Submitted";
  let lead =
    "The node accepted the transaction but didn't report a final result. Look it up on the explorer.";

  if (code && ex) {
    title = `${ex.title} (${code})`;
    if (ex.category === "success") {
      status = "success";
      lead =
        validated === false
          ? "Applied, but not yet in a validated ledger."
          : "Included in a validated ledger.";
    } else if (ex.category === "retry") {
      status = "warning";
      lead = "Not final yet. It may still be applied, or you may need to resubmit.";
    } else {
      status = "error";
      lead = code.startsWith("tec")
        ? "Included in a ledger and the fee was charged, but it did not do what you asked."
        : "Rejected. It was not included in a ledger and no fee was charged.";
    }
  }

  return (
    <Result
      status={status}
      title={title}
      subTitle={
        <>
          <div>{lead}</div>
          {ex && code && <div>{ex.explanation}</div>}
        </>
      }
      extra={
        <Flex vertical align="center" gap="small">
          <Typography.Text code copyable style={{ wordBreak: "break-all" }}>
            {hash}
          </Typography.Text>
          <Typography.Link href={explorerUrl} target="_blank" rel="noopener noreferrer">
            View on explorer
          </Typography.Link>
        </Flex>
      }
      styles={{
        root: { padding: "16px 0" },
        icon: { marginBottom: 12, fontSize: 40 },
        title: { fontSize: 18 },
        subTitle: { fontSize: 14 },
      }}
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
    <Card
      title="Signed output"
      extra={
        derived.valid ? (
          <StatusPill tone="success">Signature verifies</StatusPill>
        ) : (
          <StatusPill tone="warning">Signature not verified</StatusPill>
        )
      }
    >
      <Flex vertical gap="large">
        {!derived.valid && (
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
              <Flex vertical gap="small">
                {comparison.decodeError && (
                  <div>Couldn't decode the blob: {comparison.decodeError}</div>
                )}
                {comparison.mismatches.length > 0 && (
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    {comparison.mismatches.map((m) => (
                      <li key={m.field}>
                        <strong>{m.field}</strong>: built{" "}
                        <Typography.Text code>
                          {JSON.stringify(m.built) ?? "(none)"}
                        </Typography.Text>
                        , signed{" "}
                        <Typography.Text code>
                          {JSON.stringify(m.signed) ?? "(none)"}
                        </Typography.Text>
                      </li>
                    ))}
                  </ul>
                )}
                {comparison.signerMismatch && (
                  <div>
                    The signing key belongs to{" "}
                    <Typography.Text code>{comparison.signerMismatch.derived}</Typography.Text>, not{" "}
                    <Typography.Text code>{comparison.signerMismatch.account}</Typography.Text>.
                    That is normal for a regular key or multi-signing, but otherwise another account
                    signed this.
                  </div>
                )}
                <Checkbox
                  checked={allowMismatch}
                  onChange={(e) => setAllowMismatch(e.target.checked)}
                >
                  I've checked the differences. Submit anyway.
                </Checkbox>
              </Flex>
            }
          />
        )}

        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "network", label: "Network", children: network.label },
            { key: "wallet", label: "Signed with", children: walletName },
            {
              key: "hash",
              label: "Hash (computed locally)",
              children: (
                <Typography.Text code copyable style={{ wordBreak: "break-all" }}>
                  {derived.hash}
                </Typography.Text>
              ),
            },
          ]}
        />

        <CopyBlock label="tx_blob" value={blob} />

        <Collapse
          ghost
          items={[
            {
              key: "sent",
              label: "Transaction sent to the wallet",
              children: <CopyBlock label="JSON" value={pretty(filled)} />,
            },
            {
              key: "decoded",
              label: "Decoded blob",
              children: <CopyBlock label="JSON" value={pretty(derived.decoded)} />,
            },
          ]}
        />

        <div>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Submit it yourself (Postman, curl)
          </Typography.Title>
          <Tabs
            size="small"
            items={[
              {
                key: "rpc",
                label: "JSON-RPC",
                children: (
                  <CopyBlock label={`POST ${network.rpc}`} value={pretty(derived.submit)} />
                ),
              },
              {
                key: "curl",
                label: "curl",
                children: <CopyBlock label="curl" value={curlFor(network, derived.submit)} />,
              },
              {
                key: "lookup",
                label: "Look up result",
                children: (
                  <CopyBlock label="Look up result afterwards" value={pretty(derived.lookup)} />
                ),
              },
            ]}
          />
        </div>

        <div>
          <Flex justify="space-between" align="center" wrap gap="small">
            <Typography.Title level={5} style={{ margin: 0 }}>
              Submit from here
            </Typography.Title>
            {pill}
          </Flex>
          <Flex wrap gap="small" style={{ marginTop: 12 }}>
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
          </Flex>
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
            {submitted
              ? "Already submitted. Edit the transaction or sign again to send another."
              : blocked
                ? "Submitting is blocked until you review the differences above."
                : "Nothing is submitted until you press one of these."}
          </Typography.Paragraph>
        </div>

        {xLoading && (
          <SkeletonBlock lines={3} label="Submitted. Waiting for the ledger to validate…" />
        )}
        {wLoading && (
          <Typography.Text type="secondary" role="status">
            Approve the request in the {walletName} popup. Cancel stops waiting and ignores the
            result.
          </Typography.Text>
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
                <Flex align="center" gap="small" role="status">
                  <Spin size="small" />
                  <Typography.Text type="secondary">Checking result…</Typography.Text>
                </Flex>
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
                  <Result
                    status="success"
                    title={`Sent through ${walletName}`}
                    subTitle={
                      lookup?.status === "success"
                        ? "The wallet submitted it. It hasn't shown up on the ledger yet, so check the explorer or use Check on-chain in history."
                        : "The wallet submitted it. Confirm the result on the explorer."
                    }
                    extra={
                      <Flex vertical align="center" gap="small">
                        <Typography.Text code copyable style={{ wordBreak: "break-all" }}>
                          {walletHash}
                        </Typography.Text>
                        <Typography.Link
                          href={`${network.explorer}/transactions/${walletHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View on explorer
                        </Typography.Link>
                      </Flex>
                    }
                    styles={{
                      root: { padding: "16px 0" },
                      icon: { marginBottom: 12, fontSize: 40 },
                      title: { fontSize: 18 },
                    }}
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
              <Flex align="center" gap="small" role="status">
                <Spin size="small" />
                <Typography.Text type="secondary">
                  Checking whether it reached the ledger anyway…
                </Typography.Text>
              </Flex>
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
      </Flex>
    </Card>
  );
}
