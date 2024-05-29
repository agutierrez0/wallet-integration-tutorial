// add imports for xumm and xrpl library
import { Xumm } from "xumm";
import { convertStringToHex } from "xrpl";

const xumm = new Xumm(process.env.REACT_APP_XUMM_API_KEY);

// handle connecting to Xumm wallet
export const connectToXumm = async () => {
  return await xumm.authorize();
};

// handle submitting a transaction using Xumm
export const signTransactionUsingXummWallet = async (domain) => {
  const myHeaders = new Headers();
  myHeaders.append("X-API-Secret", "f99700b1-1d61-44d5-800f-f3b09e2953fc");
  myHeaders.append("X-API-Key", "f63d25c3-d99e-4444-89fe-ed6d5a9bcfad");
  myHeaders.append("Content-Type", "application/json");

  // set up payload for xumm
  const raw = JSON.stringify({
    options: {
      submit: "true",
      multisign: "false",
      expire: 300,
      return_url: {
        app: "http://localhost:3000",
        web: "http://localhost:3000",
      },
    },
    custom_meta: {
      instruction: "Thank you for your purchase of the X10 Widget!",
    },
    txjson: {
      TransactionType: "AccountSet",
      Domain: convertStringToHex(domain),
    },
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
