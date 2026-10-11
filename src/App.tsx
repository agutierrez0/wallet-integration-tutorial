import { useEffect, useRef, useState } from "react";
import { ADAPTERS } from "./wallets";
import type { WalletPrompt } from "./wallets";
import { useAction } from "./hooks/useAction";
import { useHistory } from "./hooks/useHistory";
import { NETWORKS } from "./lib/networks";
import type { NetworkId } from "./lib/networks";
import { toUserError } from "./lib/errors";
import { explainResult } from "./lib/resultCodes";
import { lookupTx } from "./lib/history";
import {
  entryFromSigned,
  newEntryId,
  patchFromLookup,
  patchFromSubmitFailure,
  patchFromWalletSubmit,
  patchFromXrplJsSubmit,
  prepareRestore,
} from "./lib/historyEntries";
import type { RestoreNotice } from "./lib/historyEntries";
import type { HistoryEntry } from "./lib/historyTypes";
import {
  autofillTx,
  fundFromFaucet,
  parseTx,
  submitWithXrplJs,
} from "./lib/tx";
import type { TxJson } from "./lib/tx";
import { NetworkBar } from "./components/NetworkBar";
import { WalletPicker } from "./components/WalletPicker";
import { TxEditor } from "./components/TxEditor";
import { QrPrompt } from "./components/QrPrompt";
import { HistoryPanel } from "./components/HistoryPanel";
import { SignedOutput, resultCode } from "./components/SignedOutput";
import { Alert, SkeletonBlock, Steps, stepsAt } from "./components/ui";

interface Signed {
  blob: string;
  filled: TxJson;
  // The history row for this signature (recorded once the sign succeeds).
  entry: HistoryEntry;
}

type SignPhase = "autofill" | "wallet";

async function readAvailability(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    ADAPTERS.map(async (a) => [a.id, await a.isAvailable().catch(() => false)] as const),
  );
  return Object.fromEntries(entries);
}

export default function App() {
  const [networkId, setNetworkId] = useState<NetworkId>("testnet");
  const [mainnetOk, setMainnetOk] = useState(false);
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
  const [notices, setNotices] = useState<RestoreNotice[]>([]);

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

  useEffect(() => {
    void checkAvail.run();
    const t = setTimeout(() => {
      readAvailability().then(setLateAvailable, () => {});
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  // The session and signed output are derived from action state, so cancelling
  // (reset) an action also discards a late result from the wallet.
  const connect = useAction(async () => {
    if (!adapter) throw new Error("Pick a wallet first.");
    return adapter.connect({ network: networkId });
  });
  const session = connect.status === "success" ? (connect.data ?? null) : null;

  const disconnect = useAction(async () => {
    await adapter?.disconnect();
  });

  const fund = useAction(async () => {
    if (!session) throw new Error("Connect a wallet first.");
    return fundFromFaucet(network, session.address);
  });

  const sign = useAction(async (): Promise<Signed> => {
    if (!adapter || !session) throw new Error("Connect a wallet first.");
    setSignPhase("autofill");
    // A new signature must not inherit the previous one's submit result.
    submitX.reset();
    submitW.reset();
    const tx = parseTx(txText, session.address);
    const filled = await autofillTx(network, tx);
    setSignPhase("wallet");
    const blob = await adapter.signTransaction(filled, { network: networkId });
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
    return submitWithXrplJs(network, signed.blob);
  });
  const submitW = useAction(async () => {
    if (!signed || !adapter?.submitTransaction) throw new Error("Sign a transaction first.");
    return adapter.submitTransaction(signed.filled, { network: networkId });
  });

  // Record each finished signature, then keep its row up to date as it is submitted.
  // Rows are found by hash because signing the same blob again reuses the existing row.
  const rowFor = (hash: string) => entriesRef.current.find((e) => e.hash === hash);

  useEffect(() => {
    if (signed) history.add(signed.entry);
  }, [signed]);

  useEffect(() => {
    if (!signed) return;
    const row = rowFor(signed.entry.hash);
    if (submitX.status === "success") {
      const patch = patchFromXrplJsSubmit(submitX.data, Date.now());
      if (row) history.update(row.id, patch);
      else history.add({ ...signed.entry, ...patch });
    } else if (submitX.status === "error") {
      const patch = patchFromSubmitFailure("xrpljs", Date.now());
      if (row) history.update(row.id, patch);
      else history.add({ ...signed.entry, ...patch });
    }
  }, [submitX.status]);

  useEffect(() => {
    if (!signed) return;
    const row = rowFor(signed.entry.hash);
    if (submitW.status === "success") {
      const patch = patchFromWalletSubmit(signed.entry, submitW.data, Date.now());
      if (row) history.update(row.id, patch);
      else history.add({ ...signed.entry, ...patch });
    } else if (submitW.status === "error") {
      const patch = patchFromSubmitFailure("wallet", Date.now());
      if (row) history.update(row.id, patch);
      else history.add({ ...signed.entry, ...patch });
    }
  }, [submitW.status]);

  const checkStatus = async (entry: HistoryEntry) => {
    const res = await lookupTx(entry.network, entry.hash);
    const patch = patchFromLookup(entry, res, Date.now());
    if (patch) history.update(entry.id, patch);
  };

  // Success confirmations fade after a few seconds; info notes stay until dismissed.
  useEffect(() => {
    if (!notices.some((n) => n.tone === "success")) return;
    const t = setTimeout(() => setNotices((ns) => ns.filter((n) => n.tone !== "success")), 4000);
    return () => clearTimeout(t);
  }, [notices]);

  const restore = (entry: HistoryEntry) => {
    const plan = prepareRestore(entry, {
      networkId,
      mainnetOk,
      address: session?.address,
    });
    if (plan.switchTo) changeNetwork(plan.switchTo);
    else clearOutput();
    setLoadRequest((r) => ({ nonce: r.nonce + 1, text: plan.text }));
    setNotices(plan.notices);
  };

  // Stops waiting on the wallet (and withdraws its request) without dropping a finished connection.
  const cancelPending = () => {
    adapter?.cancel?.();
    setPrompt(null);
    if (connect.status === "loading") connect.reset();
    if (sign.status === "loading") sign.reset();
    if (submitW.status === "loading") submitW.reset();
  };

  const clearOutput = () => {
    sign.reset();
    submitX.reset();
    submitW.reset();
  };

  const changeNetwork = (id: NetworkId) => {
    setNetworkId(id);
    clearOutput();
    fund.reset();
  };

  const changeMainnetOk = (ok: boolean) => {
    setMainnetOk(ok);
    if (!ok && networkId === "mainnet") changeNetwork("testnet");
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

  const changeTx = (v: string) => {
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

  const signError = sign.status === "error" ? toUserError(sign.error) : null;

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
    <main>
      <header>
        <h1>XRPL Wallet Sandbox</h1>
        <p className="muted">
          Connect any wallet, sign a transaction, get the blob and hash, then
          submit it however you like.
        </p>
      </header>

      <Steps steps={steps} />
      <div className="ui-sr-only" aria-live="polite" role="status">
        {announce}
      </div>

      <NetworkBar
        networkId={networkId}
        mainnetOk={mainnetOk}
        networkHint={session?.networkHint}
        disabled={busy}
        onNetwork={changeNetwork}
        onMainnetOk={changeMainnetOk}
      />
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
        onCancelConnect={cancelPending}
        onDisconnect={() => void disconnectNow()}
        onFund={() => void fund.run()}
        onRecheck={recheck}
      />
      <TxEditor
        value={txText}
        account={session?.address ?? ""}
        signing={signing}
        signLabel={adapter ? `Autofill and sign with ${adapter.name}` : "Sign"}
        signingLabel={
          signPhase === "autofill"
            ? `Autofilling from ${network.label}…`
            : `Waiting for approval in ${walletName}…`
        }
        disabledReason={
          session ? undefined : "Connect a wallet in step 2 to sign. Signing is disabled until then."
        }
        loadRequest={loadRequest}
        onChange={changeTx}
        onSign={() => void sign.run()}
        onCancel={cancelPending}
      />

      {notices.map((n, i) => (
        <Alert
          key={`${loadRequest.nonce}-${i}`}
          variant={n.tone}
          message={n.message}
          onDismiss={() => setNotices((ns) => ns.filter((x) => x !== n))}
        />
      ))}

      {signError && (
        <Alert error={signError} onRetry={() => void sign.run()} onDismiss={sign.reset} />
      )}

      {signing && (
        <section className="card">
          <h2>4. Signed output</h2>
          <SkeletonBlock
            lines={6}
            label={
              signPhase === "autofill"
                ? "Autofilling transaction…"
                : `Waiting for approval in ${walletName}…`
            }
          />
        </section>
      )}

      {signed && (
        <SignedOutput
          network={network}
          walletName={walletName}
          blob={signed.blob}
          filled={signed.filled}
          canWalletSubmit={!!adapter?.capabilities.submit}
          submitX={submitX}
          submitW={submitW}
          onSubmitXrplJs={() => void submitX.run()}
          onSubmitWallet={() => void submitW.run()}
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
      {prompt && adapter && (
        <QrPrompt prompt={prompt} walletName={adapter.name} onCancel={cancelPending} />
      )}
    </main>
  );
}
