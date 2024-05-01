import { convertStringToHex } from "xrpl";
import { Xumm } from "xumm";

const xumm = new Xumm(process.env.REACT_APP_XUMM_API_KEY);
// handle connecting to Xumm wallet

export const connectToXumm = async () => {
  return await xumm.authorize();
};

// handle submitting a transaction using Xumm
export const signTransactionUsingXummWallet = async (domain) => {
  const payload = {
    txjson: {
      TransactionType: "AccountSet",
      Domain: convertStringToHex(domain),
    },
  };

  const res = await xumm.payload.create(payload);

  window.open(res.next.always);
  console.log({ res });

  /* 
  const payload = xumm.payload
    ?.create({
      user_token: userToken,
      
    })
    .then((res) => {
      console.log({ res });
    });
    */
};
