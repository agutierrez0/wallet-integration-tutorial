import { serve } from "@hono/node-server";
import { XummSdk } from "xumm-sdk";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : "Invalid environment");
  process.exit(1);
}

const xaman = new XummSdk(config.apiKey, config.apiSecret);
const app = createApp(config, xaman as unknown as Parameters<typeof createApp>[1]);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`xaman server listening on :${info.port}`);
});
