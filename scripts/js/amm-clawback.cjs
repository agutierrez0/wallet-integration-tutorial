const {
  AccountSetAsfFlags,
  AMMDepositFlags,
  Client,
  TrustSetFlags,
} = require("xrpl");

const client = new Client("wss://s.devnet.rippletest.net:51233/");
void ammClawbackDevnet();
// The snippet walks us through the lifecycle of AMMClawback.
async function ammClawbackDevnet() {
  await client.connect();
  // creating wallets as prerequisite
  const { wallet: lpWallet } = await client.fundWallet(null, {
    usageContext: "code snippets",
  });
  const { wallet: issuerWallet } = await client.fundWallet(null, {
    usageContext: "code snippets",
  });
  const currencyCode = "USD";
  const currencyCode2 = "YEN";
  console.log("Balances of wallets lpWallet & issuerWallet:");
  console.log(
    await client.getXrpBalance(lpWallet.classicAddress),
    await client.getXrpBalance(issuerWallet.classicAddress)
  );
  const accountSetTx = {
    TransactionType: "AccountSet",
    Account: issuerWallet.classicAddress,
    SetFlag: AccountSetAsfFlags.asfDefaultRipple,
  };
  await client.submitAndWait(accountSetTx, {
    wallet: issuerWallet,
  });
  const accountSetTx2 = {
    TransactionType: "AccountSet",
    Account: issuerWallet.classicAddress,
    SetFlag: AccountSetAsfFlags.asfAllowTrustLineClawback,
  };
  await client.submitAndWait(accountSetTx2, {
    wallet: issuerWallet,
  });
  const trustSetTx = {
    TransactionType: "TrustSet",
    Flags: TrustSetFlags.tfClearNoRipple,
    Account: lpWallet.classicAddress,
    LimitAmount: {
      currency: currencyCode,
      issuer: issuerWallet.classicAddress,
      value: "1000",
    },
  };
  await client.submitAndWait(trustSetTx, {
    wallet: lpWallet,
  });
  const trustSetTx2 = {
    TransactionType: "TrustSet",
    Flags: TrustSetFlags.tfClearNoRipple,
    Account: lpWallet.classicAddress,
    LimitAmount: {
      currency: currencyCode2,
      issuer: issuerWallet.classicAddress,
      value: "1000",
    },
  };
  await client.submitAndWait(trustSetTx2, {
    wallet: lpWallet,
  });
  const paymentTx = {
    TransactionType: "Payment",
    Account: issuerWallet.classicAddress,
    Destination: lpWallet.classicAddress,
    Amount: {
      currency: currencyCode,
      issuer: issuerWallet.classicAddress,
      value: "500",
    },
  };
  await client.submitAndWait(paymentTx, {
    wallet: issuerWallet,
  });
  const paymentTx2 = {
    TransactionType: "Payment",
    Account: issuerWallet.classicAddress,
    Destination: lpWallet.classicAddress,
    Amount: {
      currency: currencyCode2,
      issuer: issuerWallet.classicAddress,
      value: "500",
    },
  };
  await client.submitAndWait(paymentTx2, {
    wallet: issuerWallet,
  });
  const ammCreateTx = {
    TransactionType: "AMMCreate",
    Account: lpWallet.classicAddress,
    Amount: {
      currency: currencyCode2,
      issuer: issuerWallet.classicAddress,
      value: "100",
    },
    Amount2: {
      currency: currencyCode,
      issuer: issuerWallet.classicAddress,
      value: "250",
    },
    TradingFee: 12,
  };
  await client.submitAndWait(ammCreateTx, {
    wallet: lpWallet,
  });
  /**
   * Actual test begins
   */
  const asset = {
    currency: "USD",
    issuer: issuerWallet.classicAddress,
  };
  const asset2 = {
    currency: "YEN",
    issuer: issuerWallet.classicAddress,
  };
  const holderWallet = lpWallet;
  const ammDepositTx = {
    TransactionType: "AMMDeposit",
    Account: holderWallet.classicAddress,
    Asset: asset,
    Asset2: asset2,
    Amount: {
      currency: "USD",
      issuer: issuerWallet.address,
      value: "10",
    },
    Flags: AMMDepositFlags.tfSingleAsset,
  };
  await client.submitAndWait(ammDepositTx, {
    wallet: holderWallet,
  });
  const ammClawback = {
    TransactionType: "AMMClawback",
    Account: issuerWallet.address,
    Holder: holderWallet.address,
    Asset: asset,
    Asset2: asset2,
    Flags: 1,
  };
  const ammClawbackResponse = await client.submitAndWait(ammClawback, {
    wallet: issuerWallet,
  });
  console.log("ammClawbackResponse:");
  console.log(ammClawbackResponse);
  await client.disconnect();
}
