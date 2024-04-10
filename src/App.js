// standard react imports
import { useEffect, useState } from "react";

// adding necessary types/functions from wallet libraries
import {
  isInstalled,
  getAddress,
  getNetwork,
  signMessage,
  signTransaction,
  getPublicKey,
} from "@gemwallet/api";
import { Client, convertStringToHex, verifySignature } from "xrpl";
import { Xumm } from "xumm";
import sdk from "@crossmarkio/sdk";

// initializing xumm wallet library by passing in your api key
// TODO: scrub this API key
const xumm = new Xumm("62ef6e2a-414b-4d53-933d-4fa4ad37b09c");

// define our react app
export default function App() {
  // defining state bounded variables, some with default values using React functions
  const [gemWalletConnected, setGemWalletConnected] = useState(false);
  const [xummWalletConnected, setXummWalletConnected] = useState(false);
  const [crossmarkWalletConnected, setCrossmarkWalletConnected] =
    useState(false);
  const [address, setAddress] = useState();
  const [network, setNetwork] = useState();
  const [account, setAccount] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [userToken, setUserToken] = useState("");
  const [domain, setDomain] = useState("");

  /* 
  TODO: clean up
  initializing xrpl client and specifying the network URL, options below:
  Testnet WebSocket -> wss://s.altnet.rippletest.net:51233/
  Testnet JSON-RPC -> https://s.altnet.rippletest.net:51234/

Devnet Servers
// WebSocket
wss://s.devnet.rippletest.net:51233/

// JSON-RPC
https://s.devnet.rippletest.net:51234/
Xahau-Testnet Servers
// WebSocket
wss://xahau-test.net/

// JSON-RPC
https://xahau-test.net/
  */
  //
  const [client] = useState(new Client("wss://s.altnet.rippletest.net:51233/"));

  // check to see if xumm wallet is connected
  // TODO: clean up this, maybe different method
  useEffect(() => {
    if (account) {
      setXummWalletConnected(true);
    }
  }, [account]);

  // handles connection to crossmark
  const handleConnectCrossmark = () => {
    sdk.methods.signInAndWait().then((res) => {
      if (res.response.data) {
        setCrossmarkWalletConnected(true);
        setAccount(res.response.data.address);
      }
    });
  };

  // handles signing a transaction using crossmark
  const handleSignTransactionOnCrossmark = () => {
    sdk.methods
      .signAndWait({
        TransactionType: "AccountSet",
        Domain: convertStringToHex("april10.com"),
        Account: account,
      })
      .then((res) => {
        setTransactionHash(res.response.data.txBlob);
      });
  };

  // handles submitting a transaction using crossmark
  // TODO: probably can make one universal method for submitting this
  const handleSubmitTransactionWithCrossmark = () => {
    client.connect().then(() => {
      client.submit(transactionHash);
    });
  };

  // handle connecting to gem wallet
  const handleConnectGem = () => {
    isInstalled().then((isInstalled) => {
      const hasConnected = isInstalled.result.isInstalled;
      if (hasConnected) {
        getAddress().then((address) => {
          console.log(`Your address: `, address.result.address);
          setAddress(address.result.address);
        });

        getNetwork().then((network) => {
          console.log(`Your network: `, network);
          setNetwork(network.result);
        });

        setGemWalletConnected(true);
      }
    });
  };

  // handle signing a transaction using gem wallet
  const handleSignTransactionUsingGemWallet = () => {
    if (gemWalletConnected) {
      signMessage("You have accessed Angel's Gem Wallet website.").then(
        (signedMessage) => console.log("Signed message: ", signedMessage)
      );
    }
  };

  // TODO: sign using gem, submit using xrpl, but should be in two diff methods
  const handleSubmitTransaction = async () => {
    const transactionBlob = {
      transaction: {
        TransactionType: "AccountSet",
        Domain: "616E67656C2E636F6D",
      },
    };

    signTransaction(transactionBlob)
      .then((res) => {
        console.log("result when signing transaction");

        const signedTransactionResult = res.result.signature;
        console.log({ signedTransactionResult });

        getPublicKey().then((res) => {
          const publicKey = res.result.publicKey;
          const verifyResult = verifySignature(
            signedTransactionResult,
            publicKey
          );
          console.log({ verifyResult });
        });

        client.connect().then(() => {
          console.log("before submitting to xrp ledger ");
          client.submit(signedTransactionResult);
        });
      })
      .then((error) => {
        console.log(error);
      });
  };

  // handle connecting to Xumm wallet
  const handleConnectXumm = () => {
    const result = xumm.authorize().then((res) => {
      console.log({ res });

      if (res.jwt) {
        setUserToken(res.jwt);
      }
      if (res.me) {
        setAccount(res.me.account);
        setDomain(res.me.domain);
      }
    });
  };

  // handle submitting a transaction using Xumm
  const submitTransactionUsingXumm = () => {
    const payload = xumm.payload
      ?.create({
        user_token: userToken,
        txjson: {
          TransactionType: "AccountSet",
          Domain: convertStringToHex("wednesday.com"),
        },
      })
      .then((res) => {
        console.log({ res });
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
      {!gemWalletConnected && !xummWalletConnected && (
        <>
          <h2>Gem Wallet App</h2>
          <button onClick={handleConnectGem}>
            Click to connect Gem Wallet
          </button>
          <button onClick={handleConnectXumm}>
            Click to connect Xumm Wallet
          </button>
          <button onClick={handleConnectCrossmark}>
            Click to connect Crossmark Wallet
          </button>
        </>
      )}

      {gemWalletConnected && (
        <div>
          <div>{address && <>your address: {address}</>}</div>

          <div style={{ marginTop: "24px", alignItems: "center" }}>
            details about your network
          </div>

          {network && (
            <ul>
              <li>chain: {network.chain}</li>
              <li>network: {network.network}</li>
              <li>websocket: {network.websocket}</li>
            </ul>
          )}

          <div>
            <button onClick={handleSignTransactionUsingGemWallet}>
              Click to sign Angel's message
            </button>
          </div>

          <div>
            <button onClick={handleSubmitTransaction}>
              Click to submit a transaction
            </button>
          </div>
        </div>
      )}

      {xummWalletConnected && (
        <>
          <h2>Xumm Wallet App</h2>

          <p>domain: {domain}</p>
          <p>account: {account}</p>

          <button onClick={submitTransactionUsingXumm}>
            submit accountset transaction
          </button>
        </>
      )}

      {crossmarkWalletConnected && (
        <>
          <h2>Crossmark Wallet App</h2>

          <p>transaction hash: {transactionHash} </p>

          <button onClick={handleSignTransactionOnCrossmark}>
            sign transaction
          </button>

          <button
            onClick={handleSubmitTransactionWithCrossmark}
            disabled={!transactionHash}
          >
            submit transaction
          </button>
        </>
      )}
    </div>
  );
}
