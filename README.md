# 💳 Wallet Integration App

This is a React app which leverages different Web3 wallets' libraries to sign a transaction and uses the xrpl4js library to submit transactions to the ledger.

Features:
- Submit an `AccountSet` transaction and set your own `Domain` in the `Transaction` field.
- Sign transactions using Xumm, Crossmark, or GemWallet, and submit using the `xrpl` library.

## 📄 Instructions for getting started

The following environment variables need to be defined, you can create a file `.env.local` in the root directory with the following fields filled in:

```
REACT_APP_XUMM_API_KEY={your-xumm-api-key}
```

You can replace `{your-xumm-api-key}` with the API key provided by Xumm.

## 📦 Install dependencies

```bash
> npm install
```

This will install necessary dependencies from libraries such as [xumm](https://www.npmjs.com/package/xumm), [crossmark](https://www.npmjs.com/package/@crossmarkio/sdk), [gemwallet](https://www.npmjs.com/package/@gemwallet/api), [xrpl](https://www.npmjs.com/package/xrpl) and more...
## 🚀 Starting the app

```bash
> npm start
```

This will run the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.