import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { withLocalDatabase } from "@video-editor-agent/db/local";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// The local config intentionally contains valid JSON; never read production config.
const config = JSON.parse(await readFile(new URL("../wrangler.local.jsonc", import.meta.url), "utf8"));
await withLocalDatabase(config.vars.LOCAL_DATABASE_URL, db => migrate(db, {
  migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle/", import.meta.url)),
}));
console.log("Local PostgreSQL migrations applied. Start the simulator with pnpm dev.");
