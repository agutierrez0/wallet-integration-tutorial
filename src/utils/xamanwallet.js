// add imports for xumm and xrpl library
import { Xumm } from "xumm";

const xummApiKey = process.env.REACT_APP_XUMM_API_KEY;
const xummApiSecret = process.env.REACT_APP_XUMM_API_SECRET;
const xumm = new Xumm(xummApiKey);

// handle connecting to Xumm wallet
export const connectToXumm = async () => {
  return await xumm.authorize();
};

// handle submitting a transaction using Xumm
export const signTransactionUsingXummWallet = async (transaction) => {
  const myHeaders = new Headers();
  myHeaders.append("X-API-Secret", xummApiSecret);
  myHeaders.append("X-API-Key", xummApiKey);
  myHeaders.append("Content-Type", "application/json");

  // set up payload for xumm
  const raw = JSON.stringify({
    options: {
      submit: "true",
      multisign: "false",
      expire: 300,
      return_url: {
        web: "http://localhost:3000",
      },
    },
    custom_meta: {
      instruction:
        "Thank you for signing this transaction using the xaman wallet",
    },
    txjson: transaction,
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
  };

  const response = await fetch("/api/v1/platform/payload", requestOptions);

  return response.json();
};

export const handleLogOutOfXumm = async () => {
  await xumm.logout();
};
