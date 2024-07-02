import React, { useEffect, useState } from "react";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import AppEth from "@ledgerhq/hw-app-eth";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");

  const handleConnectLedger = async () => {
    try {
      const transport = await TransportWebHID.create();
      const eth = new AppEth(transport);

      // Example: get the Ethereum address from the Ledger device
      const result = await eth.getAddress("44'/60'/0'/0/0");
      setAddress(result.address);
      setConnected(true);
    } catch (error) {
      console.error("Failed to connect to Ledger:", error);
    }
  };

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

      <button onClick={handleConnectLedger}>
        {connected ? "Connected" : "Connect to Ledger"}
      </button>
      {connected && <p>Address: {address}</p>}
    </div>
  );
}
