export async function connectToLedger(ledgerInstance) {
  try {
    const address = await ledgerInstance.getAddress("44'/144'/0'/0/0");
    return address;
  } catch (e) {
    console.error(e);
    alert("Error connecting to Ledger Device!");
  }
}
