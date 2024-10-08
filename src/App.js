// standard react imports
import { useEffect, useState } from "react";

// import client from xrpl library
import { Client, convertStringToHex, encode } from "xrpl";

// import necessary helpers from wallet/blockchain libraries
import {
  connectToGem,
  getAddressUsingGemWallet,
  getNetworkUsingGemWallet,
  signTransactionUsingGemWallet,
} from "./utils/gemwallet";
import { signTransactionUsingXummWallet } from "./utils/xamanwallet";
import {
  connectToCrossmark,
  signTransactionUsingCrossmark,
} from "./utils/crossmark";
import { connectToLedger } from "./utils/ledger";

// import utils for talking to ledger nano x device
import Xrp from "@ledgerhq/hw-app-xrp";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";

// define react app
export default function App() {
  // defining state bounded variables, some with default values using React functions
  const [gemWalletConnected, setGemWalletConnected] = useState(false);
  const [xummWalletConnected, setXummWalletConnected] = useState(false);
  const [crossmarkWalletConnected, setCrossmarkWalletConnected] =
    useState(false);
  const [ledgerConnected, setLedgerConnected] = useState(false);
  const [ledgerInstance, setLedgerInstance] = useState();
  const [transactionBlob, setTransactionBlob] = useState();
  const [domain, setDomain] = useState("");
  const [address, setAddress] = useState("");
  const [publicKey, setPublicKey] = useState();
  const [resultHash, setResultHash] = useState("");
  const [imagePng, setImagePng] = useState("");
  const [network, setNetwork] = useState("");
  const [txnSignature, setTxnSignature] = useState();
  const [lastLedgerIndex, setLastLedgerIndex] = useState();
  const [sequence, setSequence] = useState();
  const [transaction, setTransaction] = useState();
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState("");
  const [successfullySubmitted, setSuccessfullySubmitted] = useState();

  // Initializing xrpl client and specifying the network URL
  const [client] = useState(new Client("wss://s.altnet.rippletest.net:51233/"));

  /* 
  Other options below:

  Testnet
  WebSocket -> wss://s.altnet.rippletest.net:51233/
  JSON-RPC -> https://s.altnet.rippletest.net:51234/

  Devnet
  WebSocket -> wss://s.devnet.rippletest.net:51233/
  JSON-RPC -> https://s.devnet.rippletest.net:51234/
  */

  // everytime any params change, we update our transaction object
  useEffect(() => {
    const transaction = {
      TransactionType: "AccountSet",
      Domain: convertStringToHex(domain),
      Account: address,
      SigningPubKey: publicKey ? publicKey.toUpperCase() : undefined,
      Fee: "12",
      TxnSignature: txnSignature,
      LastLedgerSequence: lastLedgerIndex,
      Sequence: sequence,
    };
    setTransaction(transaction);

    if (txnSignature) {
      setTransactionBlob(encode(transaction));
    }
  }, [domain, address, publicKey, txnSignature, lastLedgerIndex, sequence]);

  // handles connecting to wallets using their library,
  // saves data to state bounded variable
  const handleConnectGem = async () => {
    const result = await connectToGem();
    const addr = await getAddressUsingGemWallet();
    const gemWalletNetwork = await getNetworkUsingGemWallet();

    setNetwork(gemWalletNetwork);
    setAddress(addr);
    setGemWalletConnected(result);
  };

  const handleConnectCrossmark = async () => {
    const result = await connectToCrossmark();

    setAddress(result.response.data.address);
    setNetwork(result.response.data.network.rpc);
    setCrossmarkWalletConnected(!!result);
  };

  const handleConnectXumm = async () => {
    const result = await signTransactionUsingXummWallet(transaction);

    setXummWalletConnected(true);
    setImagePng(result.refs.qr_png);
  };

  const handleConnectLedger = async () => {
    const transport = await TransportWebUSB.create();
    const ledgerInstance = new Xrp(transport);

    const result = await connectToLedger(ledgerInstance);
    if (result) {
      setAddress(result.address);
      setPublicKey(result.publicKey);
      setLedgerConnected(true);
      setLedgerInstance(ledgerInstance);
    }
  };

  // sign transaction with each wallet's library
  const handleSignGem = async () => {
    const signedTransactionResult = await signTransactionUsingGemWallet(
      transaction
    );
    setTransactionBlob(signedTransactionResult);
  };

  const handleSignCrossMark = async () => {
    const signedTransactionResult = await signTransactionUsingCrossmark(
      transaction
    );
    setTransactionBlob(signedTransactionResult);
  };

  const handleSignLedger = async () => {
    client.connect().then(async () => {
      const autofilledTx = await client.autofill(transaction);

      const LastLedgerSequence = autofilledTx["LastLedgerSequence"];
      const Sequence = autofilledTx["Sequence"];

      setLastLedgerIndex(LastLedgerSequence);
      setSequence(Sequence);

      const modifiedTx = { ...transaction, LastLedgerSequence, Sequence };

      const encodedTransaction = encode(modifiedTx);

      const response = await ledgerInstance.signTransaction(
        "44'/144'/0'/0/0",
        encodedTransaction
      );

      setTxnSignature(response.toUpperCase());
    });
  };

  // submit transaction using xrpl library
  const handleSubmitTransaction = async () => {
    setIsSubmittingTransaction(true);
    client
      .connect()
      .then(async () => {
        client.submitAndWait(transactionBlob).then((response) => {
          setIsSubmittingTransaction(false);

          if (response.result.hash) {
            setSuccessfullySubmitted(true);
            setResultHash(response.result.hash);
          }
        });
      })
      .then((error) => {
        console.log(error);
      });
  };

  // webpage layout using state bounded variables
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <h2>Sign with Any XRPL wallet</h2>

      {!gemWalletConnected &&
        !crossmarkWalletConnected &&
        !xummWalletConnected &&
        !ledgerConnected && (
          <>
            <label>Enter a domain:</label>
            <input onChange={(e) => setDomain(e.target.value)}></input>

            {domain && (
              <>
                <p>Choose a wallet</p>
                <button onClick={handleConnectGem}>Gem Wallet</button>
                <button onClick={handleConnectXumm}>Xumm Wallet</button>
                <button onClick={handleConnectCrossmark}>
                  Crossmark Wallet
                </button>
                <button onClick={handleConnectLedger}>Ledger Device</button>
              </>
            )}
          </>
        )}

      {(gemWalletConnected ||
        xummWalletConnected ||
        crossmarkWalletConnected ||
        ledgerConnected) && (
        <>
          {(gemWalletConnected ||
            crossmarkWalletConnected ||
            ledgerConnected) && (
            <>
              {address && <p>Your address: {address}</p>}
              {network && <p>Your network: {network}</p>}
              {domain && <p>Your domain: {domain}</p>}

              {gemWalletConnected && (
                <button
                  style={{ margin: "8px" }}
                  onClick={handleSignGem}
                  disabled={transactionBlob === undefined ? false : true}
                >
                  Sign Transaction
                </button>
              )}
              {crossmarkWalletConnected && (
                <button
                  style={{ margin: "8px" }}
                  onClick={handleSignCrossMark}
                  disabled={transactionBlob === undefined ? false : true}
                >
                  Sign Transaction
                </button>
              )}
              {ledgerConnected && (
                <button
                  style={{ margin: "8px" }}
                  onClick={handleSignLedger}
                  disabled={transactionBlob === undefined ? false : true}
                >
                  Sign Transaction
                </button>
              )}
            </>
          )}

          {xummWalletConnected && (
            <>
              <p>Finish signing the transaction on your phone 👇🏽</p>

              <img src={imagePng} alt="qr code for phone"></img>
            </>
          )}

          {transactionBlob && (
            <>
              <p>Your signed transaction blob:</p>
              <p style={{ wordWrap: "break-word", width: "1000px" }}>
                {transactionBlob}
              </p>
              <button
                disabled={isSubmittingTransaction || successfullySubmitted}
                onClick={handleSubmitTransaction}
              >
                Submit transaction on XRPL
              </button>

              {isSubmittingTransaction && (
                <b style={{ margin: "8px" }}>Submitting your transaction...</b>
              )}
            </>
          )}

          {successfullySubmitted && (
            <>
              <b style={{ color: "green", marginTop: "8px" }}>
                Your transaction has been successfully submitted 🎉
              </b>

              <button
                style={{ margin: "8px" }}
                onClick={() =>
                  window.open(
                    "https://test.bithomp.com/explorer/" + resultHash,
                    "_blank"
                  )
                }
              >
                View on bithomp
              </button>

              <button onClick={() => window.location.reload()}>
                Return to start
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
