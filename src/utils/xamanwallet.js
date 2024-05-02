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
  // set up payload for xumm
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({
    options: {
      submit: "true",
      multisign: "false",
      return_url: {
        app: "https://ripple.com/insights/ripple-pilots-a-private-ledger-for-central-banks-launching-cbdcs/",
        web: "https://ripple.com/insights/ripple-pilots-a-private-ledger-for-central-banks-launching-cbdcs/",
      },
    },
    custom_meta: {
      instruction: "Thank you for your purchase of the X10 Widget!",
    },
    txjson: {
      TransactionType: "Payment",
      Destination: "rs6DZmsbM4SjJXjkyNfR2857dg1hKg6bVr",
      Amount: "12000000",
    },
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    mode: "no-cors",
    redirect: "follow",
  };

  fetch("https://xumm.app/api/v1/platform/payload", requestOptions)
    .then((response) => response.text())
    .then((result) => console.log(result))
    .catch((error) => console.error(error));
};

export const handleLogOutOfXumm = async () => {
  await xumm.logout();
};
