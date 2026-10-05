import { neonConfig } from "@neondatabase/serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migrateLocal } from "drizzle-orm/node-postgres/migrator";
import WebSocket from "ws";
import { fileURLToPath } from "node:url";
import { withDatabase } from "../src/connection.ts";
import { withLocalDatabase } from "../src/local.ts";

// CLI-only fallback; Workers use their native WebSocket implementation.
neonConfig.webSocketConstructor = WebSocket;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to apply migrations");

try {
  const options = { migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)) };
  const hostname = new URL(databaseUrl).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    await withLocalDatabase(databaseUrl, (db) => migrateLocal(db, options));
  } else {
    await withDatabase(databaseUrl, (db) => migrateNeon(db, options));
  }
  console.info("Database migrations applied");
} catch {
  // Driver errors may contain connection details; do not print credentials.
  console.error("Database migration failed; check configuration and database access");
  process.exitCode = 1;
}
