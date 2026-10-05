import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import WebSocket from "ws";
import { createAuth } from "../src/auth.ts";
import { withDatabase } from "../src/connection.ts";
import type { Database } from "../src/connection.ts";
import { withLocalDatabase } from "../src/local.ts";
import type { LocalDatabase } from "../src/local.ts";
import { user } from "../src/schema/index.ts";

// Run only against a migrated local or disposable Neon database.
test("PostgreSQL: Better Auth user/session adapter and transaction rollback", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  neonConfig.webSocketConstructor = WebSocket;
  const databaseUrl = process.env.TEST_DATABASE_URL!;
  const work = async (db: Database | LocalDatabase) => {
    const auth = createAuth(db, {
      secret: "integration-test-only-secret-1234567890",
      baseURL: "http://localhost:8787",
    });
    const context = await auth.$context;
    const id = crypto.randomUUID();
    try {
      const created = await context.internalAdapter.createUser({
        id, name: "DB integration test", email: `${id}@example.invalid`, emailVerified: false,
      }, { method: "admin" });
      assert.equal(created.id, id);
      const session = await context.internalAdapter.createSession(id);
      const found = await context.internalAdapter.findSession(session.token);
      assert.equal(found?.user.id, id);
      const [stored] = await db.select().from(user).where(eq(user.id, id));
      assert.equal(stored?.acquisitionInitializedAt, null);
      assert.equal(stored?.acquisitionRef, null);
      await assert.rejects(db.transaction(async (tx) => {
        await tx.update(user).set({ name: "Must roll back" }).where(eq(user.id, id));
        throw new Error("rollback probe");
      }), /rollback probe/);
      const [after] = await db.select().from(user).where(eq(user.id, id));
      assert.equal(after?.name, "DB integration test");
    } finally {
      await db.delete(user).where(eq(user.id, id));
    }
  };
  if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)) {
    await withLocalDatabase(databaseUrl, work);
  } else {
    await withDatabase(databaseUrl, work);
  }
});
