import { Alert, Card, Flex, Layout, Skeleton, Steps, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { ADAPTERS, WalletError } from "./wallets";
import type { CancelResult, WalletPrompt } from "./wallets";
import { useAction } from "./hooks/useAction";
import { useGlobalNetwork } from "./hooks/useGlobalNetwork";
import { useHistory } from "./hooks/useHistory";
import { NETWORKS } from "./lib/networks";
import type { NetworkId } from "./lib/networks";
import { NETWORK_NAMES } from "./lib/networkStore";
import { isCancelled, toUserError } from "./lib/errors";
import { networkMismatchMessage } from "./lib/networkHint";
import { pollTxResult } from "./lib/pollResult";
import { explainResult } from "./lib/resultCodes";
import { lookupTx } from "./lib/history";
import {
  engineCodeFromError,
  entryFromSigned,
  findEntryIndex,
  newEntryId,
  patchFromLookup,
  patchFromSubmitFailure,
  patchFromWalletSubmit,
  patchFromXrplJsSubmit,
  prepareRestore,
} from "./lib/historyEntries";
import type { RestoreNotice } from "./lib/historyEntries";
import type { HistoryEntry } from "./lib/historyTypes";
import { autofillTx, fundFromFaucet, parseTx, submitWithXrplJs } from "./lib/tx";
import type { TxJson } from "./lib/tx";
import { Header } from "./components/Header";
import { WalletPicker } from "./components/WalletPicker";
import { TxEditor } from "./components/TxEditor";
import { QrPrompt } from "./components/QrPrompt";
import { HistoryPanel } from "./components/HistoryPanel";
import { SignedOutput, resultCode } from "./components/SignedOutput";
import { UserErrorAlert } from "./components/shell/UserErrorAlert";

interface Signed {
  blob: string;
  filled: TxJson;
  // The history row for this signature (recorded once the sign succeeds).
  entry: HistoryEntry;
}

// `brief` notices fade on their own, like the success ones.
interface AppNotice extends RestoreNotice {
  brief?: boolean;
}

type SignPhase = "autofill" | "wallet";

const STEP_TITLES = ["Connect", "Build", "Sign", "Submit"];

// `at` is the step in progress (0-3); 4 means every step is done. `failed` marks it as an error.
interface Progress {
  at: number;
  failed: boolean;
}
const stepsAt = (at: number, failed = false): Progress => ({ at, failed });

async function readAvailability(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    ADAPTERS.map(async (a) => [a.id, await a.isAvailable().catch(() => false)] as const),
  );
  return Object.fromEntries(entries);
}

export default function App() {
  const [networkId, setNetworkId] = useGlobalNetwork();
  const [adapterId, setAdapterId] = useState("");
  const [txText, setTxText] = useState("");
  const [signPhase, setSignPhase] = useState<SignPhase>("autofill");
  // Extensions inject late, so we re-check shortly after load.
  const [lateAvailable, setLateAvailable] = useState<Record<string, boolean> | null>(null);

  const [prompt, setPrompt] = useState<WalletPrompt | null>(null);

  const history = useHistory();
  // Always the latest rows, for effects that run after a click.
  const entriesRef = useRef(history.entries);
  entriesRef.current = history.entries;
  const [loadRequest, setLoadRequest] = useState({ nonce: 0, text: "" });
  const [notices, setNotices] = useState<AppNotice[]>([]);

  const network = NETWORKS[networkId];
  const adapter = ADAPTERS.find((a) => a.id === adapterId);

  // Wallets that need an out-of-band approval (QR) report it through this channel.
  useEffect(() => {
    adapter?.setPromptHandler?.(setPrompt);
    return () => {
      adapter?.setPromptHandler?.(null);
      setPrompt(null);
    };
  }, [adapter]);

  const checkAvail = useAction(readAvailability);
  const available = lateAvailable ?? checkAvail.data ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only availability probe; checkAvail.run is intentionally not a trigger
  useEffect(() => {
    void checkAvail.run();
    const t = setTimeout(() => {
      readAvailability().then(setLateAvailable, () => {});
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  // The session and signed output are derived from action state, so cancelling
  // (reset) an action also discards a late result from the wallet.
  const connect = useAction(async ({ signal }) => {
    if (!adapter) throw new Error("Pick a wallet first.");
    return adapter.connect({ network: networkId, signal });
  });
  const session = connect.status === "success" ? (connect.data ?? null) : null;

  const disconnect = useAction(async () => {
    await adapter?.disconnect();
  });

  const fund = useAction(async () => {
    if (!session) throw new Error("Connect a wallet first.");
    return fundFromFaucet(network, session.address);
  });

  // Patches the history row for a signature, found by id or by the hash it has now or had
  // before (a wallet-side submit can re-key a row). Written straight from the action so it
  // still lands if the UI was reset while the request was in flight.
  const recordPatch = (entry: HistoryEntry, patch: Partial<HistoryEntry>, alsoHash?: string) => {
    const i = findEntryIndex(entriesRef.current, {
      id: entry.id,
      hash: entry.hash,
      prevHash: alsoHash,
    });
    if (i >= 0) history.update(entriesRef.current[i].id, patch);
    else history.add({ ...entry, ...patch });
  };

  // After a wallet-side submit, or an xrpl.js submit that threw, ask the ledger what happened.
  const check = useAction(async ({ signal }, entry: HistoryEntry, hash: string, net: NetworkId) => {
    const res = await pollTxResult(net, hash, { lookup: lookupTx, signal });
    if (res.found) {
      const i = findEntryIndex(entriesRef.current, {
        id: entry.id,
        hash: entry.hash,
        prevHash: hash,
      });
      const patch = patchFromLookup(entriesRef.current[i] ?? entry, res, Date.now());
      if (patch) recordPatch(entry, patch, hash);
    }
    return res;
  });

  const cancelledBeforePrompt = () =>
    new WalletError("CANCELLED", "Cancelled before the wallet was asked.");

  const sign = useAction(async ({ signal }): Promise<Signed> => {
    if (!adapter || !session) throw new Error("Connect a wallet first.");
    setSignPhase("autofill");
    // A new signature must not inherit the previous one's submit result.
    submitX.reset();
    submitW.reset();
    check.reset();
    const tx = parseTx(txText, session.address);
    // Wallets that fill Sequence/Fee/LastLedgerSequence themselves (Xaman) are not given
    // values that could expire while the user scans a QR code.
    const filled = adapter.capabilities.walletAutofills ? tx : await autofillTx(network, tx);
    // Cancelled while autofilling: do not open a wallet prompt nobody is waiting for.
    if (signal.aborted) throw cancelledBeforePrompt();
    setSignPhase("wallet");
    const blob = await adapter.signTransaction(filled, { network: networkId, signal });
    const entry = entryFromSigned({
      id: newEntryId(),
      now: Date.now(),
      network: networkId,
      walletId: adapter.id,
      account: session.address,
      builtTx: tx,
      blob,
    });
    return { blob, filled, entry };
  });
  const signed = sign.status === "success" ? (sign.data ?? null) : null;

  const submitX = useAction(async () => {
    if (!signed) throw new Error("Sign a transaction first.");
    const s = signed;
    try {
      const res = await submitWithXrplJs(network, s.blob);
      recordPatch(s.entry, patchFromXrplJsSubmit(res, Date.now()));
      return res;
    } catch (e) {
      const code = engineCodeFromError(e);
      recordPatch(s.entry, patchFromSubmitFailure("xrpljs", Date.now(), code));
      // submitAndWait also throws on timeouts after the node accepted the transaction, so
      // look it up unless the node rejected it outright (tem*: never applied).
      if (!code?.startsWith("tem")) void check.run(s.entry, s.entry.hash, networkId);
      throw e;
    }
  });

  const submitW = useAction(async ({ signal }) => {
    if (!signed || !adapter?.submitTransaction) throw new Error("Sign a transaction first.");
    const s = signed;
    // The wallet signs again, so give it a transaction with fresh Sequence/LastLedgerSequence.
    const fresh = adapter.capabilities.walletAutofills
      ? s.entry.tx
      : await autofillTx(network, s.entry.tx);
    if (signal.aborted) throw cancelledBeforePrompt();
    try {
      const hash = await adapter.submitTransaction(fresh, { network: networkId, signal });
      recordPatch(s.entry, patchFromWalletSubmit(s.entry, hash, Date.now()));
      void check.run(s.entry, hash, networkId);
      return hash;
    } catch (e) {
      if (e instanceof WalletError) {
        // Declined, cancelled or timed out: nothing is known to have been sent. A timeout may
        // still have been approved later, so look for it.
        if (e.code === "EXPIRED") void check.run(s.entry, s.entry.hash, networkId);
      } else {
        recordPatch(s.entry, patchFromSubmitFailure("wallet", Date.now(), engineCodeFromError(e)));
      }
      throw e;
    }
  });

  // Record each finished signature. Submit results are written by the actions themselves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: record once per new signature; `history` is a fresh object each render and must not retrigger this
  useEffect(() => {
    if (signed) history.add(signed.entry);
  }, [signed]);

  const checkStatus = async (entry: HistoryEntry) => {
    const res = await lookupTx(entry.network, entry.hash);
    const patch = patchFromLookup(entry, res, Date.now());
    if (patch) history.update(entry.id, patch);
  };

  // Success confirmations fade after a few seconds; info notes stay until dismissed.
  useEffect(() => {
    const fades = (n: AppNotice) => n.tone === "success" || n.brief;
    if (!notices.some(fades)) return;
    const t = setTimeout(() => setNotices((ns) => ns.filter((n) => !fades(n))), 4000);
    return () => clearTimeout(t);
  }, [notices]);

  const restore = (entry: HistoryEntry) => {
    if (submitting) return;
    // The network switch is global and unconfirmed, so a restore may switch to any network,
    // mainnet included (prepareRestore only blocks mainnet when told it isn't allowed).
    const plan = prepareRestore(entry, {
      networkId,
      mainnetOk: true,
      address: session?.address,
    });
    if (plan.switchTo) changeNetwork(plan.switchTo);
    else clearOutput();
    setLoadRequest((r) => ({ nonce: r.nonce + 1, text: plan.text }));
    setNotices(
      plan.switchTo
        ? [
            ...plan.notices,
            { tone: "info", message: `Switched to ${NETWORK_NAMES[plan.switchTo]}.`, brief: true },
          ]
        : plan.notices,
    );
  };

  const addNotice = (message: string) => setNotices((ns) => [...ns, { tone: "info", message }]);

  // Stops waiting on the wallet (and withdraws its request) without dropping a finished connection.
  // A wallet that can't withdraw (the request is already open on the phone) keeps the QR and the
  // action alive so the real outcome is still seen.
  const cancelPending = async () => {
    const waiting = {
      connect: connect.status === "loading",
      sign: sign.status === "loading",
      submitW: submitW.status === "loading",
    };
    let result: CancelResult = { cancelled: true };
    if (adapter?.cancel) {
      try {
        result = await adapter.cancel();
      } catch {
        result = { cancelled: true };
      }
    }
    if (!result.cancelled) {
      addNotice(
        `Already open in ${adapter?.name ?? "the wallet"}: it may still be approved${
          result.reason ? ` (${result.reason})` : ""
        }. Still waiting for the result.`,
      );
      return;
    }
    setPrompt(null);
    if (waiting.connect) connect.reset();
    if (waiting.sign) sign.reset();
    if (waiting.submitW) {
      submitW.reset();
      addNotice(
        `Stopped waiting for ${adapter?.name ?? "the wallet"}. If it was already approved it may still be submitted, so check on-chain.`,
      );
    }
  };

  const clearOutput = () => {
    sign.reset();
    submitX.reset();
    submitW.reset();
    check.reset();
  };

  const changeNetwork = (id: NetworkId) => {
    setNetworkId(id);
    clearOutput();
    fund.reset();
  };

  const selectAdapter = (id: string) => {
    if (id === adapterId) return;
    setAdapterId(id);
    connect.reset();
    fund.reset();
    clearOutput();
  };

  const disconnectNow = async () => {
    await disconnect.run();
    connect.reset();
    fund.reset();
    clearOutput();
  };

  const recheck = () => {
    setLateAvailable(null);
    void checkAvail.run();
  };

  const submitting = submitX.status === "loading" || submitW.status === "loading";

  // Never discard the output of a submission that is on its way to the ledger.
  const changeTx = (v: string) => {
    if (submitting) return;
    setTxText(v);
    clearOutput();
  };

  const signing = sign.status === "loading";
  const busy =
    signing ||
    connect.status === "loading" ||
    fund.status === "loading" ||
    disconnect.status === "loading" ||
    submitX.status === "loading" ||
    submitW.status === "loading";

  // A cancel is the user's own choice, not a failure.
  const signCancelled = sign.status === "error" && isCancelled(sign.error);
  const signError = sign.status === "error" && !signCancelled ? toUserError(sign.error) : null;

  const networkMismatch = networkMismatchMessage(session?.networkHint, networkId);
  const hintNote = adapterId === "xaman" ? "at sign-in" : "at connect";

  const code = resultCode(submitX.data);
  const steps = (() => {
    if (submitW.status === "success") return stepsAt(4);
    if (submitX.status === "success") {
      const category = code ? explainResult(code).category : "success";
      if (category === "success") return stepsAt(4);
      return stepsAt(3, category !== "retry");
    }
    if (submitX.status === "error" || submitW.status === "error") return stepsAt(3, true);
    if (signed) return stepsAt(3);
    if (signError) return stepsAt(signError.kind === "input" ? 1 : 2, true);
    if (signing) return stepsAt(2);
    if (session) return stepsAt(1);
    return stepsAt(0, connect.status === "error");
  })();

  const announce =
    submitX.status === "success"
      ? `Transaction submitted${code ? `: ${code}` : ""}`
      : submitW.status === "success"
        ? "Transaction submitted through the wallet"
        : signed
          ? "Transaction signed"
          : session
            ? "Wallet connected"
            : "";

  const walletName = adapter?.name ?? "wallet";

  return (
    <Layout className="app-layout">
      <Header
        networkId={networkId}
        onNetwork={changeNetwork}
        busy={busy}
        networkHint={session?.networkHint}
        hintNote={hintNote}
        mismatch={networkMismatch}
      />
      <Layout.Content className="app-content">
        <Flex orientation="vertical" gap={16}>
          <Typography.Paragraph type="secondary" className="intro">
            Connect any wallet, sign a transaction, get the blob and hash, then submit it however
            you like.
          </Typography.Paragraph>

          <Steps
            size="small"
            responsive
            current={Math.min(steps.at, STEP_TITLES.length - 1)}
            status={steps.failed ? "error" : steps.at >= STEP_TITLES.length ? "finish" : "process"}
            items={STEP_TITLES.map((title) => ({ title }))}
          />
          <div className="sr-only" aria-live="polite" role="status">
            {announce}
          </div>

          <WalletPicker
            adapters={ADAPTERS}
            available={available}
            selectedId={adapterId}
            session={session}
            connect={connect}
            fund={fund}
            canFund={!!network.faucet}
            locked={busy && connect.status !== "loading"}
            disconnecting={disconnect.status === "loading"}
            onSelect={selectAdapter}
            onConnect={() => void connect.run()}
            onCancelConnect={() => void cancelPending()}
            onDisconnect={() => void disconnectNow()}
            onFund={() => void fund.run()}
            onRecheck={recheck}
          />
          <TxEditor
            value={txText}
            account={session?.address ?? ""}
            signing={signing}
            busy={submitting}
            signLabel={adapter ? `Autofill and sign with ${adapter.name}` : "Sign"}
            signingLabel={
              signPhase === "autofill"
                ? `Autofilling from ${network.label}…`
                : `Waiting for approval in ${walletName}…`
            }
            disabledReason={
              networkMismatch ??
              (session
                ? undefined
                : "Connect a wallet above to sign. Signing is disabled until then.")
            }
            loadRequest={loadRequest}
            onChange={changeTx}
            onSign={() => void sign.run()}
            onCancel={() => void cancelPending()}
          />

          {notices.map((n, i) => (
            <Alert
              // biome-ignore lint/suspicious/noArrayIndexKey: notices have no id; the list is replaced wholesale per restore (nonce)
              key={`${loadRequest.nonce}-${i}`}
              type={n.tone}
              showIcon
              title={n.message}
              closable={{
                onClose: () => setNotices((ns) => ns.filter((x) => x !== n)),
                "aria-label": "Dismiss",
              }}
            />
          ))}

          {signError && (
            <UserErrorAlert
              error={signError}
              onRetry={() => void sign.run()}
              onDismiss={sign.reset}
            />
          )}
          {signCancelled && (
            <div role="status">
              <Typography.Text type="secondary">Cancelled. Nothing was signed.</Typography.Text>
            </div>
          )}

          {signing && (
            <Card
              title={
                <Typography.Title level={2} className="card-title">
                  Signed output
                </Typography.Title>
              }
            >
              <div role="status" aria-live="polite" aria-busy="true">
                <Typography.Text type="secondary">
                  {signPhase === "autofill"
                    ? "Autofilling transaction…"
                    : `Waiting for approval in ${walletName}…`}
                </Typography.Text>
                <Skeleton active title={false} paragraph={{ rows: 5 }} className="skeleton-gap" />
              </div>
            </Card>
          )}

          {signed && (
            <SignedOutput
              key={signed.blob}
              network={network}
              walletName={walletName}
              blob={signed.blob}
              filled={signed.filled}
              canWalletSubmit={!!adapter?.capabilities.submit}
              submitX={submitX}
              submitW={submitW}
              lookup={{ status: check.status, result: check.data }}
              onSubmitXrplJs={() => void submitX.run()}
              onSubmitWallet={() => void submitW.run()}
              onCancelWallet={() => void cancelPending()}
            />
          )}
          <HistoryPanel
            entries={history.entries}
            available={history.available}
            disabled={busy}
            onRestore={restore}
            onRemove={history.remove}
            onClear={history.clear}
            onCheckStatus={checkStatus}
          />
        </Flex>
        {prompt && adapter && (
          <QrPrompt
            prompt={prompt}
            walletName={adapter.name}
            onCancel={() => void cancelPending()}
          />
        )}
      </Layout.Content>
    </Layout>
  );
}
