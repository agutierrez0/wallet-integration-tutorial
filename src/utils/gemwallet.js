import { isInstalled, signTransaction, getPublicKey } from "@gemwallet/api";
import { convertStringToHex, verifySignature } from "xrpl";

// handle connecting to gem wallet
export const connectToGem = async () => {
  const gemWalletInstalled = await isInstalled();

  return gemWalletInstalled.result.isInstalled;
};

// handle signing a transaction using gem wallet
export const signTransactionUsingGemWallet = async (domain) => {
  const transactionBlob = {
    transaction: {
      TransactionType: "AccountSet",
      Domain: convertStringToHex(domain),
    },
  };

  const signResult = await signTransaction(transactionBlob);

  return signResult.result.signature;
};

// validates signed transaction using gem wallet & xrpl
export const validateSignedTransactionResult = async (
  signedTransactionResult
) => {
  const publicKey = await getPublicKey();

  if (!publicKey.result) return;

  return verifySignature(signedTransactionResult, publicKey.result.publicKey);
};
