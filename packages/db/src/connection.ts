import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema/index.ts";

/** Validate without echoing credentials in errors. This transport targets Neon only. */
export function validateDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    !url.hostname.split(".")[0]?.endsWith("-pooler") ||
    !url.username || !url.password || url.pathname.length <= 1 ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")
  ) {
    throw new Error("DATABASE_URL must use a credentialed Neon pooled endpoint with TLS");
  }
  return value;
}

/** Create per Worker invocation, never as a cross-request socket singleton. */
export function createDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: validateDatabaseUrl(databaseUrl),
    max: 4,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  // Idle-client failures must not become unhandled EventEmitter errors.
  // In-flight query failures still reject and must be handled by the caller.
  pool.on("error", () => console.error("Database idle connection failed"));
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDatabase>["db"];

/** Keeps sockets alive through all awaited work, then closes even on failure. */
export async function withDatabase<T>(
  databaseUrl: string,
  work: (db: Database) => Promise<T>,
): Promise<T> {
  const connection = createDatabase(databaseUrl);
  try {
    return await work(connection.db);
  } finally {
    await connection.close();
  }
}
