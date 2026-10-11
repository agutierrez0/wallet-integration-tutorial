import { useEffect, useState } from "react";
import { ADAPTERS } from "./wallets";
import type { WalletSession } from "./wallets/types";
import { NETWORKS } from "./lib/networks";
import type { NetworkId } from "./lib/networks";
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
import { SignedOutput } from "./components/SignedOutput";

interface Signed {
  blob: string;
  filled: TxJson;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [networkId, setNetworkId] = useState<NetworkId>("testnet");
  const [mainnetOk, setMainnetOk] = useState(false);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [adapterId, setAdapterId] = useState("");
  const [session, setSession] = useState<WalletSession | null>(null);
  const [txText, setTxText] = useState(JSON.stringify(TEMPLATES.AccountSet, null, 2));
  const [signed, setSigned] = useState<Signed | null>(null);
  const [submitResult, setSubmitResult] = useState<unknown>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const network = NETWORKS[networkId];
  const adapter = ADAPTERS.find((a) => a.id === adapterId);

  useEffect(() => {
    // Extensions inject late, so re-check shortly after load.
    const check = async () => {
      const entries = await Promise.all(
        ADAPTERS.map(async (a) => [a.id, await a.isAvailable().catch(() => false)] as const),
      );
      setAvailable(Object.fromEntries(entries));
    };
    check();
    const t = setTimeout(check, 1000);
    return () => clearTimeout(t);
  }, []);

  const clearOutput = () => {
    setSigned(null);
    setSubmitResult(null);
    setSubmittedHash(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const changeNetwork = (id: NetworkId) => {
    setNetworkId(id);
    clearOutput();
  };

  const changeMainnetOk = (ok: boolean) => {
    setMainnetOk(ok);
    if (!ok && networkId === "mainnet") changeNetwork("testnet");
  };

  const selectAdapter = (id: string) => {
    if (id === adapterId) return;
    setAdapterId(id);
    setSession(null);
    clearOutput();
  };

  const connect = () =>
    run(async () => {
      if (!adapter) return;
      setSession(await adapter.connect());
      clearOutput();
    });

  const disconnect = () =>
    run(async () => {
      await adapter?.disconnect();
      setSession(null);
      clearOutput();
    });

  const fund = () =>
    run(async () => {
      if (!session) return;
      await fundFromFaucet(network, session.address);
      setNotice("Faucet request sent. The balance can take a few seconds to appear.");
    });

  const changeTx = (v: string) => {
    setTxText(v);
    clearOutput();
  };

  const sign = () =>
    run(async () => {
      if (!adapter || !session) return;
      clearOutput();
      const tx = parseTx(txText, session.address);
      const filled = await autofillTx(network, tx);
      const blob = await adapter.signTransaction(filled);
      setSigned({ blob, filled });
    });

  const submitXrplJs = () =>
    run(async () => {
      if (!signed) return;
      setSubmittedHash(null);
      setSubmitResult(await submitWithXrplJs(network, signed.blob));
    });

  const submitWallet = () =>
    run(async () => {
      if (!signed || !adapter?.submitTransaction) return;
      const hash = await adapter.submitTransaction(signed.filled);
      setSubmittedHash(hash);
      setSubmitResult({ hash, note: "Submitted through the wallet." });
    });

  return (
    <main>
      <header>
        <h1>XRPL Wallet Sandbox</h1>
        <p className="muted">
          Connect any wallet, sign a transaction, get the blob and hash, then
          submit it however you like.
        </p>
      </header>

      <NetworkBar
        networkId={networkId}
        mainnetOk={mainnetOk}
        networkHint={session?.networkHint}
        onNetwork={changeNetwork}
        onMainnetOk={changeMainnetOk}
      />
      <WalletPicker
        adapters={ADAPTERS}
        available={available}
        selectedId={adapterId}
        session={session}
        canFund={!!network.faucet}
        busy={busy}
        onSelect={selectAdapter}
        onConnect={connect}
        onDisconnect={disconnect}
        onFund={fund}
      />
      <TxEditor
        value={txText}
        disabled={busy || !session}
        signLabel={session ? `Autofill and sign with ${adapter?.name}` : "Connect a wallet to sign"}
        onChange={changeTx}
        onSign={sign}
      />

      {error && <p className="bad banner">{error}</p>}
      {notice && <p className="ok banner">{notice}</p>}
      {busy && <p className="muted">Working…</p>}

      {signed && (
        <SignedOutput
          network={network}
          blob={signed.blob}
          filled={signed.filled}
          canWalletSubmit={!!adapter?.capabilities.submit}
          busy={busy}
          submitResult={submitResult}
          submittedHash={submittedHash}
          onSubmitXrplJs={submitXrplJs}
          onSubmitWallet={submitWallet}
        />
      )}
    </main>
  );
}
