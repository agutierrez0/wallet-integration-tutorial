# 💳 Wallet Integration App

This is a React app which leverages different Web3 wallets' libraries to sign a transaction and uses the xrpl4js library to submit transactions to the ledger.

New features:
- The app allows you to set your own customer domain

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

## 🚀 Starting the app

```bash
> npm start
```

This will run the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.