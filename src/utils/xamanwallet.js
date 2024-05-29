// add imports for xumm and xrpl library
import { Xumm } from "xumm";
import { convertStringToHex } from "xrpl";

const xumm = new Xumm(process.env.REACT_APP_XUMM_API_KEY);

// handle connecting to Xumm wallet
export const connectToXumm = async () => {
  return await xumm.authorize();
};

// handle submitting a transaction using Xumm
export const signTransactionUsingXummWallet = async (domain, account) => {
  // set up payload for xumm
  const payload = {
    txjson: {
      TransactionType: "AccountSet",
      Domain: convertStringToHex(domain),
      Account: account,
    },
  };

  // create payload
  const res = await xumm.payload.create(payload);

  // new window opens, prompts phone to sign transaction & submit
  window.open(res.next.always);
  console.log({ res });
};

export const handleLogOutOfXumm = async () => {
  await xumm.logout();
};
