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
import { user, session as sessionTable } from "../src/schema/index.ts";
import { provisionVerifiedWhatsAppUser } from "../src/users.ts";

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
    let phoneUserId: string | undefined;
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

      const phone = `+1999${String(crypto.getRandomValues(new Uint32Array(1))[0]).padStart(10, "0")}`;
      const first = await db.transaction((tx) => provisionVerifiedWhatsAppUser(tx, phone.slice(1)));
      phoneUserId = first.id;
      assert.equal(first.phoneNumber, phone);
      assert.equal(first.phoneNumberVerified, true);
      assert.equal(first.email, `${first.id}@whatsapp.invalid`);
      assert.equal(first.emailVerified, false);
      assert.equal((await db.select().from(sessionTable).where(eq(sessionTable.userId, first.id))).length, 0);
      await db.update(user).set({
        email: "optional@example.invalid",
        emailVerified: false,
        acquisitionRef: "test-source",
        acquisitionInitializedAt: new Date(),
        acquisitionMessageId: "test-first-message",
      }).where(eq(user.id, first.id));
      const concurrent = await Promise.all(Array.from({ length: 8 }, () => provisionVerifiedWhatsAppUser(db, phone)));
      assert.ok(concurrent.every((result) => result.id === first.id));
      const [phoneUser] = await db.select().from(user).where(eq(user.id, first.id));
      assert.equal(phoneUser?.email, "optional@example.invalid");
      assert.equal(phoneUser?.emailVerified, false);
      assert.equal(phoneUser?.acquisitionRef, "test-source");
      // Phone-only users are compatible with Better Auth's session adapter too.
      const phoneSession = await context.internalAdapter.createSession(first.id);
      assert.equal((await context.internalAdapter.findSession(phoneSession.token))?.user.id, first.id);
    } finally {
      if (phoneUserId) await db.delete(user).where(eq(user.id, phoneUserId));
      await db.delete(user).where(eq(user.id, id));
    }
  };
  if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)) {
    await withLocalDatabase(databaseUrl, work);
  } else {
    await withDatabase(databaseUrl, work);
  }
});
