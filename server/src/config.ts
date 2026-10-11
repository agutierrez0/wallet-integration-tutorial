import { z } from "zod";

const schema = z.object({
  XAMAN_API_KEY: z.string().min(1, "XAMAN_API_KEY is required"),
  XAMAN_API_SECRET: z.string().min(1, "XAMAN_API_SECRET is required"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ALLOWED_ORIGIN: z.string().default("http://localhost:3000"),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Mainnet payloads are refused unless this is explicitly enabled.
  ALLOW_MAINNET: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export interface Config {
  apiKey: string;
  apiSecret: string;
  port: number;
  allowedOrigins: string[];
  trustProxy: boolean;
  allowMainnet: boolean;
}

// Fails fast with a readable message. Never echoes values, only variable names.
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  const e = parsed.data;
  return {
    apiKey: e.XAMAN_API_KEY,
    apiSecret: e.XAMAN_API_SECRET,
    port: e.PORT,
    allowedOrigins: e.ALLOWED_ORIGIN.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    trustProxy: e.TRUST_PROXY,
    allowMainnet: e.ALLOW_MAINNET,
  };
}
