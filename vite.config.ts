import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In Docker the signing backend is reachable at http://server:3001 (set API_PROXY_TARGET).
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  // The Ledger libraries need the npm `buffer` package, not the Node built-in.
  resolve: { alias: { buffer: "buffer/" } },
  test: { exclude: ["node_modules/**", "server/**", "dist/**"] },
  server: {
    host: true,
    port: 3000,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
});
