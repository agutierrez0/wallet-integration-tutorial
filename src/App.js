import React, { useEffect, useState } from "react";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Xrp from "@ledgerhq/hw-app-xrp";
import {
  Client,
  Wallet,
  xrpToDrops,
  encode,
  convertStringToHex,
  decode,
} from "xrpl";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [ledgerResponse, setLedgerResponse] = useState("");
  const [ledgerInstance, setLedgerInstance] = useState();
  // const [client] = useState(new Client("wss://s.altnet.rippletest.net:51233"));

  function fetchAddress(xrp) {
    return xrp.getAddress("44'/144'/0'/0/0");
  }

  function prepareAndSign(xrp, seqNo) {
    return fetchAddress(xrp).then((deviceData) => console.log({ deviceData }));
  }

  async function handleConnection() {
    const transport = await TransportWebUSB.create();
    const xrp = new Xrp(transport);

    setConnected(true);
    const address = await xrp.getAddress("44'/144'/0'/0/0");
    console.log({ address });
    setAddress(address.address);
    setPublicKey(address.publicKey);

    setLedgerInstance(xrp);

    // xrp.signTransaction("44'/144'/0'/0/0", prepared);

    // console.log({ config: await xrp.getAppConfiguration() });

    //.then((xrp) => prepareAndSign(xrp, 123))
    //.then((signature) => console.log(`Signature: ${signature}`))
    //.catch((e) => console.log(`An error occurred: `, e));
  }

  async function handleEnableClawback() {
    const originalTransaction = {
      TransactionType: "AccountSet",
      Account: "rG12oUGgZ2rUVNTQ49GBoETQ1koxe6dW2X",
      Sequence: 1993030,
      Fee: "12",
      LastLedgerSequence: 2938216,
      SetFlag: 16,
      SigningPubKey: publicKey.toUpperCase(),
    };

    const encodedOriginalTransaction = encode(originalTransaction);

    console.log({ txAfter: encodedOriginalTransaction });

    // const preparedTx = xrp.prepare();
    const ledgerResponse = await ledgerInstance.signTransaction(
      "44'/144'/0'/0/0",
      encodedOriginalTransaction
    );

    console.log({ ledgerResponse });
    originalTransaction["TxnSignature"] = ledgerResponse.toUpperCase();
    originalTransaction["TxnSignature"] = ledgerResponse.toUpperCase();

    // console.log({ newTx: oldTx, encodedNewTx:  });

    const transactionBlob = encode(originalTransaction);

    console.log({ originalTransaction, encodedTx: transactionBlob });

    setLedgerResponse(ledgerResponse);
    console.log({ res: ledgerResponse });
    console.log({
      ledgerResponse,
      encodedTx: transactionBlob,
    });

    const client = new Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    console.log({
      oldTx: originalTransaction,
      encodedTx: encode(originalTransaction),
    });

    const response = client
      .submit(encode(originalTransaction))
      .then((result) => console.log({ result }));
    console.log({ response });
  }

  async function handleSendMoney() {
    const originalTransaction = {
      TransactionType: "Payment",
      Account: address,
      Destination: "rBfyStBKSF1qpzznwjbTV2KtHJ9Xg9dGp1",
      Amount: {
        currency: "USD",
        issuer: address,
        value: "100",
      },
      SigningPubKey: publicKey.toUpperCase(),
      Sequence: 1993031,
      Fee: "12",
      LastLedgerSequence: 2938216,
    };

    const encodedOriginalTransaction = encode(originalTransaction);

    // const preparedTx = xrp.prepare();
    const ledgerResponse = await ledgerInstance.signTransaction(
      "44'/144'/0'/0/0",
      encodedOriginalTransaction
    );

    originalTransaction["TxnSignature"] = ledgerResponse.toUpperCase();

    setLedgerResponse(ledgerResponse);

    const client = new Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    console.log({
      oldTx: originalTransaction,
      encodedTx: encode(originalTransaction),
    });

    const response = client
      .submit(encode(originalTransaction))
      .then((result) => console.log({ result }));
    console.log({ response });
  }

  async function handleClawback() {
    const originalTransaction = {
      TransactionType: "Clawback",
      Account: address,
      Amount: {
        currency: "USD",
        issuer: "rBfyStBKSF1qpzznwjbTV2KtHJ9Xg9dGp1",
        value: "50",
      },
      SigningPubKey: publicKey.toUpperCase(),
      Sequence: 1993032,
      Fee: "12",
      LastLedgerSequence: 2938216,
    };

    const encodedOriginalTransaction = encode(originalTransaction);

    // const preparedTx = xrp.prepare();
    const ledgerResponse = await ledgerInstance.signTransaction(
      "44'/144'/0'/0/0",
      encodedOriginalTransaction
    );

    originalTransaction["TxnSignature"] = ledgerResponse.toUpperCase();

    setLedgerResponse(ledgerResponse);

    const client = new Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    console.log({
      oldTx: originalTransaction,
      encodedTx: encode(originalTransaction),
    });

    const response = client
      .submit(encode(originalTransaction))
      .then((result) => console.log({ result }));
    console.log({ response });
  }

  // brett address: rBfyStBKSF1qpzznwjbTV2KtHJ9Xg9dGp1
  async function handleSignTransaction() {
    const oldTx = {
      TransactionType: "AccountSet",
      Account: "rG12oUGgZ2rUVNTQ49GBoETQ1koxe6dW2X",
      Sequence: 1993029,
      Fee: "12",
      NetworkID: 1,
      LastLedgerSequence: 2994216,
    };

    const newTx = {
      TransactionType: "AccountSet",
      Account: "rG12oUGgZ2rUVNTQ49GBoETQ1koxe6dW2X",
      Sequence: 1993029,
      Fee: "12",
      NetworkID: 1,
      LastLedgerSequence: 2994216,
    };

    const betterPreppedTx = encode(newTx);

    console.log({ txBefore: newTx, txAfter: betterPreppedTx });

    // const preparedTx = xrp.prepare();
    const res = await ledgerInstance.signTransaction(
      "44'/144'/0'/0/0",
      betterPreppedTx,
      true
    );

    setLedgerResponse(res);
    console.log({ res });
  }

  //   const handleConnectLedger = async () => {
  //     try {
  //       const transport = await TransportWebUSB.create();
  //       console.log({ transport });

  //       return TransportWebUSB.create().then((transport) => {
  //         const newXrp = new Xrp({ transport });
  //         console.log({ newXrp });
  //         console.log({ transport });

  //         console.log(newXrp.getAddress());
  //         console.log(newXrp.getAppConfiguration());
  //         // console.log(newXrp.signTransaction());
  //       });
  //       /*
  //       const eth = new AppEth(transport);

  //       // Example: get the Ethereum address from the Ledger device
  //       const result = await eth.getAddress("44'/60'/0'/0/0");
  //       setAddress(result.address);
  //       setConnected(true);
  //       */
  //     } catch (error) {
  //       console.error("Failed to connect to Ledger:", error);
  //     }
  //   };

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

      {connected ? (
        <>
          <p>Connected to Ledger</p>

          <button onClick={handleEnableClawback}>enable clawback</button>
          <button onClick={handleSignTransaction}>sign transaction</button>
          <button onClick={handleSendMoney}>send money</button>
          <button onClick={handleClawback}>do clawback</button>
        </>
      ) : (
        <button onClick={handleConnection}>Connect to Ledger</button>
      )}

      {connected && <p>Address: {address}</p>}
      {ledgerResponse && <p>Ledger Response: {ledgerResponse}</p>}
    </div>
  );
}
