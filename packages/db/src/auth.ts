import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./connection.ts";
import type { LocalDatabase } from "./local.ts";
import * as schema from "./schema/index.ts";

export interface AuthConfig {
  secret: string;
  baseURL: string;
  trustedOrigins?: string[];
}

/** Web authentication only. Does not authenticate WhatsApp webhook senders. */
export function createAuth(db: Database | LocalDatabase, config: AuthConfig) {
  if (config.secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  let url: URL;
  try {
    url = new URL(config.baseURL);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP(S) URL without credentials");
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside localhost");
  }

  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins ?? [url.origin],
    // Raw adapter errors can include SQL and personal data. Services must emit
    // sanitized diagnostics rather than use Better Auth's default logger.
    logger: { disabled: true },
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    // No sign-in method is selected yet. Do not ship unverified password sign-up.
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        phoneNumber: { type: "string", required: false, input: false, returned: false },
        phoneNumberVerified: { type: "boolean", required: false, input: false, returned: false },
        acquisitionOrigin: { type: "string", required: false, input: false, returned: false },
        acquisitionRef: { type: "string", required: false, input: false, returned: false },
        acquisitionInitializedAt: { type: "date", required: false, input: false, returned: false },
        acquisitionMessageId: { type: "string", required: false, input: false, returned: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
