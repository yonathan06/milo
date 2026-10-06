import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { and, eq, sql } from "drizzle-orm";
import WebSocket from "ws";
import { withDatabase, type Database } from "../src/connection.ts";
import { withLocalDatabase, type LocalDatabase } from "../src/local.ts";
import { conversation, deliveryEvent, message, outboundDelivery, user, whatsappChannel, whatsappIdentity } from "../src/schema/index.ts";

const id = () => crypto.randomUUID();
function hasCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; cause?: unknown };
  return value.code === code || hasCode(value.cause, code);
}
const rejectsCode = (work: Promise<unknown>, code = "23514") => assert.rejects(work, (error: unknown) => hasCode(error, code));

async function withTestDatabase(work: (db: Database | LocalDatabase) => Promise<void>) {
  const url = process.env.TEST_DATABASE_URL!;
  if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    await withLocalDatabase(url, work);
  } else {
    neonConfig.webSocketConstructor = WebSocket;
    await withDatabase(url, work);
  }
}

const skip = !process.env.TEST_DATABASE_URL;

test("PostgreSQL: WhatsApp history, acquisition, send units, callbacks and erasure", { skip }, async (t) => {
  await withTestDatabase(async (db) => {
    const u1 = id(), u2 = id(), u3 = id();
    const ch1 = id(), ch2 = id();
    const i1 = id(), i2 = id(), i3 = id();
    const c1 = id(), c2 = id(), c3 = id();
    const incoming1 = id(), incoming2 = id(), outgoing = id();
    const d1 = id(), d2 = id();
    const incoming = (mid: string, cid = c1, channelId = ch1, sequence = 1n, providerMessageId = mid) => ({
      id: mid, conversationId: cid, channelId, sequence, providerMessageId,
      direction: "inbound" as const, contentType: "text", text: "Test message", content: { version: 1 },
    });
    try {
      await db.transaction(async (tx) => {
        await tx.insert(user).values([u1, u2, u3].map((uid) => ({ id: uid, name: "Messaging test", email: `${uid}@example.invalid` })));
        await tx.insert(whatsappChannel).values([ch1, ch2].map((cid) => ({ id: cid, businessAccountId: cid, providerPhoneNumberId: cid })));
        await tx.insert(whatsappIdentity).values([
          { id: i1, userId: u1, channelId: ch1, providerSenderId: "sender-a", verifiedAt: new Date() },
          { id: i2, userId: u2, channelId: ch2, providerSenderId: "sender-a", verifiedAt: new Date() },
          { id: i3, userId: u3, channelId: ch1, providerSenderId: "sender-b", verifiedAt: new Date() },
        ]);
        await tx.insert(conversation).values([
          { id: c1, whatsappIdentityId: i1, nextSequence: 4n },
          { id: c2, whatsappIdentityId: i2, nextSequence: 2n },
          { id: c3, whatsappIdentityId: i3 },
        ]);
        await tx.insert(message).values([
          incoming(incoming1), incoming(incoming2, c2, ch2, 1n, incoming1),
          { ...incoming(outgoing, c1, ch1, 2n), direction: "outbound", providerMessageId: null, replyToMessageId: incoming1 },
        ]);
      });

      await t.test("scoped identities, sequences, IDs, envelopes and replies", async () => {
        await rejectsCode(db.insert(whatsappIdentity).values({ id: id(), userId: u1, channelId: ch1, providerSenderId: "sender-a", verifiedAt: new Date() }), "23505");
        await rejectsCode(db.insert(conversation).values({ id: id(), whatsappIdentityId: i1 }), "23505");
        await rejectsCode(db.insert(message).values(incoming(id(), c1, ch1, 3n, incoming1)), "23505");
        await rejectsCode(db.insert(message).values(incoming(id())), "23505");
        await rejectsCode(db.insert(message).values(incoming(id(), c1, ch2, 3n)));
        await rejectsCode(db.insert(message).values({ ...incoming(id(), c1, ch1, 3n), replyToMessageId: incoming2 }));
        await rejectsCode(db.insert(message).values({ ...incoming(id(), c1, ch1, 3n), content: {} as { version: number } }));
        await rejectsCode(db.update(whatsappIdentity).set({ userId: u2 }).where(eq(whatsappIdentity.id, i1)));
        await rejectsCode(db.update(conversation).set({ whatsappIdentityId: i2 }).where(eq(conversation.id, c1)));
        await rejectsCode(db.update(message).set({ direction: "outbound", providerMessageId: null }).where(eq(message.id, incoming1)));
        await db.insert(message).values({ ...incoming(id(), c1, ch1, 3n), contentType: "unsupported", text: null });
        const history = await db.query.conversation.findFirst({ where: eq(conversation.id, c1), with: { identity: { with: { user: true } }, messages: true } });
        assert.equal(history?.identity.user.id, u1);
        assert.equal(history?.messages.length, 3);
      });

      await t.test("acquisition is owned, incoming, one-time and can be permanently unattributed", async () => {
        const state = { acquisitionOrigin: "whatsapp_first_message" as const, acquisitionInitializedAt: new Date() };
        await rejectsCode(db.update(user).set({ ...state, acquisitionMessageId: incoming2 }).where(eq(user.id, u1)));
        await rejectsCode(db.update(user).set({ ...state, acquisitionMessageId: outgoing }).where(eq(user.id, u1)));
        await rejectsCode(db.update(user).set({ acquisitionRef: "late" }).where(eq(user.id, u1)));
        await rejectsCode(db.update(user).set({ acquisitionInitializedAt: new Date() }).where(eq(user.id, u1)));
        await db.update(user).set({ ...state, acquisitionMessageId: incoming1 }).where(eq(user.id, u1));
        await db.update(user).set({ ...state, acquisitionMessageId: incoming2, acquisitionRef: "unknown-code" }).where(eq(user.id, u2));
        await rejectsCode(db.update(user).set({ acquisitionRef: "late" }).where(eq(user.id, u1)));
        await rejectsCode(db.update(user).set({ acquisitionRef: "replacement" }).where(eq(user.id, u2)));
        await rejectsCode(db.update(user).set({ acquisitionOrigin: null, acquisitionInitializedAt: null, acquisitionMessageId: null }).where(eq(user.id, u1)));
        await db.update(user).set({ name: "Renamed" }).where(eq(user.id, u1));
        await rejectsCode(db.delete(message).where(eq(message.id, incoming1)), "23503");
      });

      await t.test("rollback and concurrent duplicate acceptance preserve the first acquisition", async () => {
        // Illustration of the future ingestion transaction, not a production webhook handler.
        const accept = async (providerId: string, ref: string | null) => db.transaction(async (tx) => {
          const [owner] = await tx.select().from(user).where(eq(user.id, u3)).for("update");
          const [existing] = await tx.select().from(message).where(and(eq(message.channelId, ch1), eq(message.providerMessageId, providerId)));
          if (existing) return existing.id;
          const [allocated] = await tx.update(conversation).set({ nextSequence: sql`${conversation.nextSequence} + 1`, lastIncomingAt: new Date() }).where(eq(conversation.id, c3)).returning();
          const mid = id();
          await tx.insert(message).values(incoming(mid, c3, ch1, allocated!.nextSequence - 1n, providerId));
          if (!owner!.acquisitionInitializedAt) {
            await tx.update(user).set({ acquisitionOrigin: "whatsapp_first_message", acquisitionInitializedAt: new Date(), acquisitionMessageId: mid, acquisitionRef: ref }).where(eq(user.id, u3));
          }
          return mid;
        });
        const rollbackId = id();
        await assert.rejects(db.transaction(async (tx) => {
          await tx.update(conversation).set({ nextSequence: 2n }).where(eq(conversation.id, c3));
          await tx.insert(message).values(incoming(rollbackId, c3));
          await tx.update(user).set({ acquisitionOrigin: "whatsapp_first_message", acquisitionInitializedAt: new Date(), acquisitionMessageId: rollbackId, acquisitionRef: "rolled-back" }).where(eq(user.id, u3));
          throw new Error("rollback probe");
        }), /rollback probe/);
        assert.equal((await db.select().from(message).where(eq(message.id, rollbackId))).length, 0);
        const results = await Promise.all(Array.from({ length: 8 }, () => accept("duplicate-" + c3, null)));
        assert.equal(new Set(results).size, 1);
        await Promise.all(Array.from({ length: 4 }, (_, n) => accept(`${c3}-${n}`, "later-ref")));
        const accepted = await db.select().from(message).where(eq(message.conversationId, c3)).orderBy(message.sequence);
        assert.deepEqual(accepted.map((row) => row.sequence), [1n, 2n, 3n, 4n, 5n]);
        const [owner] = await db.select().from(user).where(eq(user.id, u3));
        assert.equal(owner?.acquisitionMessageId, results[0]);
        assert.equal(owner?.acquisitionRef, null);
      });

      await t.test("outbound chunks have stable payloads and separate unknown submission", async () => {
        const send = { messageId: outgoing, channelId: ch1, payload: { version: 1, text: "Saved response" } };
        await db.insert(outboundDelivery).values([
          { ...send, id: d1, chunkIndex: 0, operationKey: d1 },
          { ...send, id: d2, chunkIndex: 1, operationKey: d2, submissionStatus: "unknown" },
        ]);
        await rejectsCode(db.insert(outboundDelivery).values({ ...send, id: id(), chunkIndex: 2, operationKey: d1 }), "23505");
        await rejectsCode(db.insert(outboundDelivery).values({ ...send, id: id(), chunkIndex: 0, operationKey: id() }), "23505");
        await rejectsCode(db.insert(outboundDelivery).values({ ...send, id: id(), messageId: incoming1, chunkIndex: 0, operationKey: id() }));
        await rejectsCode(db.insert(outboundDelivery).values({ ...send, id: id(), channelId: ch2, chunkIndex: 2, operationKey: id() }));
        await rejectsCode(db.update(outboundDelivery).set({ payload: { version: 1, text: "Regenerated" } }).where(eq(outboundDelivery.id, d1)));
        await rejectsCode(db.update(outboundDelivery).set({ submissionStatus: "accepted" }).where(eq(outboundDelivery.id, d1)));
        await db.update(outboundDelivery).set({ submissionStatus: "accepted", providerMessageId: d1, submittedAt: new Date() }).where(eq(outboundDelivery.id, d1));
        await rejectsCode(db.update(outboundDelivery).set({ providerMessageId: id() }).where(eq(outboundDelivery.id, d1)));
        const [unknown] = await db.select().from(outboundDelivery).where(eq(outboundDelivery.id, d2));
        assert.equal(unknown?.submissionStatus, "unknown");
        assert.equal(unknown?.deliveryStatus, "none");
      });

      await t.test("callbacks deduplicate, reconcile and cannot regress read state", async () => {
        const eid = id();
        const event = { id: eid, channelId: ch1, providerMessageId: d1, deduplicationKey: eid, status: "read" as const, providerTimestamp: new Date() };
        await db.insert(deliveryEvent).values(event);
        await rejectsCode(db.insert(deliveryEvent).values({ ...event, id: id() }), "23505");
        await rejectsCode(db.update(deliveryEvent).set({ outboundDeliveryId: d2 }).where(eq(deliveryEvent.id, eid)));
        await rejectsCode(db.insert(deliveryEvent).values({ ...event, id: id(), deduplicationKey: id(), channelId: ch2, outboundDeliveryId: d1 }));
        await db.update(deliveryEvent).set({ outboundDeliveryId: d1 }).where(eq(deliveryEvent.id, eid));
        await rejectsCode(db.update(deliveryEvent).set({ status: "sent" }).where(eq(deliveryEvent.id, eid)));
        await db.update(outboundDelivery).set({ deliveryStatus: "read", deliveredAt: new Date(), readAt: new Date() }).where(eq(outboundDelivery.id, d1));
        await db.insert(deliveryEvent).values({ ...event, id: id(), deduplicationKey: id(), status: "sent", outboundDeliveryId: d1 });
        await rejectsCode(db.update(outboundDelivery).set({ deliveryStatus: "sent" }).where(eq(outboundDelivery.id, d1)));
        await rejectsCode(db.update(outboundDelivery).set({ readAt: null }).where(eq(outboundDelivery.id, d1)));
        const linked = await db.query.outboundDelivery.findFirst({ where: eq(outboundDelivery.id, d1), with: { events: true } });
        assert.equal(linked?.deliveryStatus, "read");
        assert.equal(linked?.events.length, 2);
      });
    } finally {
      // Exercises the deferred acquisition FK and replies during whole-user erasure.
      for (const uid of [u1, u2, u3]) await db.delete(user).where(eq(user.id, uid));
      assert.equal((await db.select().from(message).where(eq(message.conversationId, c1))).length, 0);
      assert.equal((await db.select().from(outboundDelivery).where(eq(outboundDelivery.id, d1))).length, 0);
      assert.equal((await db.select().from(deliveryEvent).where(eq(deliveryEvent.providerMessageId, d1))).length, 0);
      for (const cid of [ch1, ch2]) await db.delete(whatsappChannel).where(eq(whatsappChannel.id, cid));
    }
  });
});

test("PostgreSQL: migration classifies existing users and refuses fabricated acquisition evidence", { skip }, async () => {
  const migrations = await Promise.all([
    "0000_tranquil_marten_broadcloak.sql", "0001_hot_silver_samurai.sql", "0002_illegal_krista_starr.sql", "0003_noisy_joseph.sql",
  ].map((file) => readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")));
  await withTestDatabase(async (db) => {
    for (const legacy of [false, true]) {
      // All fixture objects are rolled back; never reset the configured database.
      const rollback = new Error("migration fixture complete");
      await assert.rejects(db.transaction(async (tx) => {
        const schema = `wa_fixture_${id().replaceAll("-", "")}`;
        await tx.execute(sql.raw(`CREATE SCHEMA "${schema}"`));
        await tx.execute(sql.raw(`SET LOCAL search_path = "${schema}", pg_catalog`));
        const apply = async (body: string) => {
          const scoped = body.replaceAll('"public".', `"${schema}".`)
            .replaceAll("SET search_path = public, pg_temp", `SET search_path = "${schema}", pg_temp`);
          for (const statement of scoped.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
        };
        for (const body of migrations.slice(0, 3)) await apply(body!);
        await tx.execute(sql`INSERT INTO users (id, name, email) VALUES ('existing', 'Existing', 'existing@example.invalid')`);
        if (legacy) {
          await tx.execute(sql`UPDATE users SET acquisition_ref = 'old-ref', acquisition_initialized_at = now(), acquisition_message_id = 'fabricated'`);
          await tx.execute(sql.raw("SAVEPOINT legacy_migration"));
          await rejectsCode(apply(migrations[3]!), "P0001");
          await tx.execute(sql.raw("ROLLBACK TO SAVEPOINT legacy_migration"));
          const result = await tx.execute(sql`SELECT acquisition_ref FROM users WHERE id = 'existing'`);
          assert.equal(result.rows[0]?.acquisition_ref, "old-ref");
        } else {
          await apply(migrations[3]!);
          const result = await tx.execute(sql`SELECT acquisition_origin, acquisition_initialized_at, acquisition_message_id FROM users WHERE id = 'existing'`);
          assert.equal(result.rows[0]?.acquisition_origin, "preexisting");
          assert.ok(result.rows[0]?.acquisition_initialized_at);
          assert.equal(result.rows[0]?.acquisition_message_id, null);
          await tx.execute(sql.raw("SAVEPOINT attribution_change"));
          await rejectsCode(tx.execute(sql`UPDATE users SET acquisition_ref = 'late-ref' WHERE id = 'existing'`));
          await tx.execute(sql.raw("ROLLBACK TO SAVEPOINT attribution_change"));
        }
        throw rollback;
      }), (error: unknown) => error === rollback);
    }
  });
});
