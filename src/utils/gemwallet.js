// add imports from gem wallet & xrpl library
import {
  isInstalled,
  signTransaction,
  getPublicKey,
  getAddress,
  getNetwork,
} from "@gemwallet/api";
import { convertStringToHex, verifySignature } from "xrpl";

// handle connecting to gem wallet
export const connectToGem = async () => {
  const gemWalletInstalled = await isInstalled();
  console.log({ gemWalletInstalled });
  return gemWalletInstalled.result.isInstalled;
};

// handle signing a transaction using gem wallet
export const signTransactionUsingGemWallet = async (domain) => {
  // get address using gem wallet
  const address = await getAddressUsingGemWallet();

  // prepare transaction
  const transactionJson = {
    transaction: {
      TransactionType: "AccountSet",
      Domain: convertStringToHex(domain),
      Account: address,
    },
  };

  // sign transaction
  const signResult = await signTransaction(transactionJson);
  console.log({ signResult });
  return signResult.result.signature;
};

// handles getting address using gem wallet library
export const getAddressUsingGemWallet = async () => {
  const address = await getAddress();
  return address.result.address;
};

export const getNetworkUsingGemWallet = async () => {
  const network = await getNetwork();
  return network.result.websocket;
};

// validates signed transaction using gem wallet & xrpl
export const validateSignedTransactionResult = async (
  signedTransactionResult
) => {
  // get public key
  const publicKey = await getPublicKey();

  // if no public key found, exit
  if (!publicKey.result) return;

  // if public key is found, use xrpl's verify to validate
  return verifySignature(signedTransactionResult, publicKey.result.publicKey);
};
