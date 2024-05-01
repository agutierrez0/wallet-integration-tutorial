import sdk from "@crossmarkio/sdk";
import { convertStringToHex } from "xrpl";

// handles connection to crossmark
export const connectToCrossmark = async () => {
  const res = await sdk.methods.signInAndWait();
  if (res.response.data) {
    console.log(res.response.data);
    return res.response.data.address;
  }
};

// handles signing a transaction using crossmark
export const signTransactionUsingCrossmark = async (domain) => {
  const address = sdk.methods.getAddress();

  const res = await sdk.methods.signAndWait({
    TransactionType: "AccountSet",
    Domain: convertStringToHex(domain),
    Account: address,
  });

  return res.response.data.txBlob;
};
