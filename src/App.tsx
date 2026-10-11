import { useEffect, useState } from "react";
import { ADAPTERS } from "./wallets";
import type { WalletPrompt } from "./wallets";
import { useAction } from "./hooks/useAction";
import { NETWORKS } from "./lib/networks";
import type { NetworkId } from "./lib/networks";
import { toUserError } from "./lib/errors";
import { explainResult } from "./lib/resultCodes";
import {
  TEMPLATES,
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
import { SignedOutput, resultCode } from "./components/SignedOutput";
import { Alert, SkeletonBlock, Steps, stepsAt } from "./components/ui";

interface Signed {
  blob: string;
  filled: TxJson;
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
  const [txText, setTxText] = useState(JSON.stringify(TEMPLATES.AccountSet, null, 2));
  const [signPhase, setSignPhase] = useState<SignPhase>("autofill");
  // Extensions inject late, so we re-check shortly after load.
  const [lateAvailable, setLateAvailable] = useState<Record<string, boolean> | null>(null);

  const [prompt, setPrompt] = useState<WalletPrompt | null>(null);

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
    const tx = parseTx(txText, session.address);
    const filled = await autofillTx(network, tx);
    setSignPhase("wallet");
    const blob = await adapter.signTransaction(filled, { network: networkId });
    return { blob, filled };
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
        onChange={changeTx}
        onSign={() => void sign.run()}
        onCancel={cancelPending}
      />

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
      {prompt && adapter && (
        <QrPrompt prompt={prompt} walletName={adapter.name} onCancel={cancelPending} />
      )}
    </main>
  );
}
