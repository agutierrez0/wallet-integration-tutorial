// standard react imports
import { useState } from "react";

// import client from xrpl library
import { Client } from "xrpl";

// import necessary helpers from wallet/blockchain libraries
import {
  connectToGem,
  getAddressUsingGemWallet,
  getNetworkUsingGemWallet,
  signTransactionUsingGemWallet,
} from "./utils/gemwallet";
import {
  connectToXumm,
  signTransactionUsingXummWallet,
} from "./utils/xamanwallet";
import {
  connectToCrossmark,
  signTransactionUsingCrossmark,
} from "./utils/crossmark";

// define react app
export default function App() {
  // defining state bounded variables, some with default values using React functions
  const [gemWalletConnected, setGemWalletConnected] = useState(false);
  const [xummWalletConnected, setXummWalletConnected] = useState(false);
  const [crossmarkWalletConnected, setCrossmarkWalletConnected] =
    useState(false);
  const [transactionBlob, setTransactionBlob] = useState("");
  const [domain, setDomain] = useState("");
  const [address, setAddress] = useState("");
  const [resultHash, setResultHash] = useState("");
  const [imagePng, setImagePng] = useState("");
  const [network, setNetwork] = useState("");
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState("");
  const [successfullySubmitted, setSuccessfullySubmitted] = useState();

  // handles connecting to wallets using their library
  const handleConnectGem = async () => {
    var result = await connectToGem();
    var addr = await getAddressUsingGemWallet();
    var gemWalletNetwork = await getNetworkUsingGemWallet();
    setNetwork(gemWalletNetwork);
    console.log({ result });
    console.log({ addr });
    setAddress(addr);
    setGemWalletConnected(result);
  };

  const handleSignGem = async () => {
    const signedTransactionResult = await signTransactionUsingGemWallet(domain);
    setTransactionBlob(signedTransactionResult);
  };

  const handleConnectCrossmark = async () => {
    var result = await connectToCrossmark();
    setAddress(result);
    setCrossmarkWalletConnected(!!result);
  };

  const handleSignCrossMark = async () => {
    const signedTransactionResult = await signTransactionUsingCrossmark(domain);
    setTransactionBlob(signedTransactionResult);
  };

  const handleConnectXumm = async () => {
    const res2 = await signTransactionUsingXummWallet(domain, address);

    window.open(res2.next.always);
    setXummWalletConnected(true);
    setImagePng(res2.refs.qr_png);
  };

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

  // submit transaction using xrpljs library
  const handleSubmitTransaction = async () => {
    setIsSubmittingTransaction(true);
    client
      .connect()
      .then(async () => {
        client.submitAndWait(transactionBlob).then((res) => {
          setIsSubmittingTransaction(false);

          if (res.result.hash) {
            setSuccessfullySubmitted(true);
            setResultHash(res.result.hash);
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
      <h2>Wallet Integration App</h2>

      {!gemWalletConnected &&
        !crossmarkWalletConnected &&
        !xummWalletConnected && (
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
              </>
            )}
          </>
        )}

      {(gemWalletConnected ||
        xummWalletConnected ||
        crossmarkWalletConnected) && (
        <>
          {(gemWalletConnected || crossmarkWalletConnected) && (
            <>
              <p>Your address: {address}</p>
              <p>Your network: {network}</p>
              <button
                style={{ margin: "8px" }}
                onClick={
                  gemWalletConnected ? handleSignGem : handleSignCrossMark
                }
              >
                sign transaction
              </button>
            </>
          )}

          {xummWalletConnected && (
            <>
              <p>Finish signing the transaction on your phone 👇🏽</p>

              <img src={imagePng}></img>
            </>
          )}
          {transactionBlob && (
            <>
              <p>Your signed transaction blob:</p>
              <p style={{ wordWrap: "break-word", width: "1000px" }}>
                {transactionBlob}
              </p>
              <button
                disabled={isSubmittingTransaction}
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
