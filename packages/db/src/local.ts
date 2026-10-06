import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.ts";

/** Loopback development only; deliberately separate from the deployed Worker transport. */
export function validateLocalDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Local DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.username || !url.password || url.pathname.length <= 1
  ) {
    throw new Error("Local DATABASE_URL must use a credentialed loopback PostgreSQL endpoint");
  }
  return value;
}

export function createLocalDatabase(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: validateLocalDatabaseUrl(databaseUrl),
    max: 4,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  let closing = false;
  // Workerd's net compatibility may emit an idle socket error during intentional
  // pool teardown. In-flight queries still reject; don't report shutdown as failure.
  pool.on("error", () => { if (!closing) console.error("Local database idle connection failed"); });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => { closing = true; return pool.end(); } };
}

export type LocalDatabase = ReturnType<typeof createLocalDatabase>["db"];

export async function withLocalDatabase<T>(
  databaseUrl: string,
  work: (db: LocalDatabase) => Promise<T>,
): Promise<T> {
  const connection = createLocalDatabase(databaseUrl);
  try {
    return await work(connection.db);
  } finally {
    await connection.close();
  }
}
