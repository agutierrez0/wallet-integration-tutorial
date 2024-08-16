// add imports from crossmark & xrpl library
import sdk from "@crossmarkio/sdk";

// handles connection to crossmark
export const connectToCrossmark = async () => {
  const res = await sdk.methods.signInAndWait();

  return res;
};

// handles signing a transaction using crossmark
export const signTransactionUsingCrossmark = async (transaction) => {
  const res = await sdk.methods.signAndWait(transaction);

  return res.response.data.txBlob;
};
