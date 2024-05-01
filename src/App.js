// standard react imports
import { useState } from "react";

// adding necessary types/functions from wallet libraries
import { Client } from "xrpl";
import { connectToGem, signTransactionUsingGemWallet } from "./utils/gemwallet";
import {
  connectToXumm,
  signTransactionUsingXummWallet,
} from "./utils/xamanwallet";
import {
  connectToCrossmark,
  signTransactionUsingCrossmark,
} from "./utils/crossmark";
import { getAddress } from "@gemwallet/api";

// define our react app
export default function App() {
  // defining state bounded variables, some with default values using React functions
  const [gemWalletConnected, setGemWalletConnected] = useState(false);
  const [xummWalletConnected, setXummWalletConnected] = useState(false);
  const [crossmarkWalletConnected, setCrossmarkWalletConnected] =
    useState(false);
  const [transactionHash, setTransactionHash] = useState("");
  const [domain, setDomain] = useState("");

  const handleConnectGem = async () => {
    var result = await connectToGem();
    setGemWalletConnected(result);
  };

  const handleConnectCrossmark = async () => {
    var result = await connectToCrossmark();

    setCrossmarkWalletConnected(!!result);
  };

  const handleConnectXumm = async () => {
    var result = await connectToXumm();

    console.log(result);
    if (result.jwt) {
      setXummWalletConnected(true);
    }
  };

  const handleSignTransaction = async () => {
    let signedTransactionResult;
    if (gemWalletConnected) {
      signedTransactionResult = await signTransactionUsingGemWallet(domain);
    }

    if (xummWalletConnected) {
      signedTransactionResult = await signTransactionUsingXummWallet(domain);
    }

    if (crossmarkWalletConnected) {
      signedTransactionResult = await signTransactionUsingCrossmark(domain);
    }

    setTransactionHash(signedTransactionResult);
  };

  /* 
  Initializing xrpl client and specifying the network URL, 
  options below:

  Testnet
  WebSocket -> wss://s.altnet.rippletest.net:51233/
  JSON-RPC -> https://s.altnet.rippletest.net:51234/

  Devnet
  WebSocket -> wss://s.devnet.rippletest.net:51233/
  JSON-RPC -> https://s.devnet.rippletest.net:51234/

  Xahau-Testnet Servers
  WebSocket -> wss://xahau-test.net/
  JSON-RPC -> https://xahau-test.net/
  */

  const [client] = useState(new Client("wss://s.altnet.rippletest.net:51233/"));

  const handleSubmitTransaction = async (signedTransactionResult) => {
    client
      .connect()
      .then(async () => {
        const res = await client.submit(signedTransactionResult, {
          wallet: (await getAddress()).result,
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
      !xummWalletConnected &&
      !crossmarkWalletConnected ? (
        <>
          <p>Please choose a wallet from below:</p>
          <button onClick={handleConnectGem}>Gem Wallet</button>
          <button onClick={handleConnectXumm}>Xumm Wallet</button>
          <button onClick={handleConnectCrossmark}>Crossmark Wallet</button>
        </>
      ) : (
        <>
          <label>Enter a domain:</label>
          <input onChange={(e) => setDomain(e.target.value)}></input>
          <p>This will be added to the domain parameter in your transaction.</p>
          <button disabled={!domain} onClick={handleSignTransaction}>
            Sign transaction
          </button>

          {transactionHash && (
            <>
              <p>Your transaction hash:</p>
              <p style={{ wordWrap: "break-word", width: "1000px" }}>
                {transactionHash}
              </p>
              <button onClick={handleSubmitTransaction}>
                Submit transaction on XRPL
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
