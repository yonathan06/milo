import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { withLocalDatabase } from "@video-editor-agent/db/local";
import { agentRun, conversation, deliveryEvent, message, outboundDelivery, outboxIntent, user, whatsappChannel } from "@video-editor-agent/db/schema";
import { acceptEvents } from "../src/messaging/accept-events.ts";
import { dispatchProcessing } from "../src/outbox/dispatch.ts";
import { enqueueAgentRun } from "../src/queues/processing.ts";
import { processConversation } from "../src/agent/process-conversation.ts";
import { processAgentConversation } from "../src/agent/process-agent-conversation.ts";
import type { IncomingMessage, StatusEvent } from "../src/whatsapp/normalize.ts";

// Isolated schema and connection search_path: dispatch never touches existing work.
// This suite qualifies local PostgreSQL only, not deployed Neon.
async function withFixture(work: Parameters<typeof withLocalDatabase<void>>[1]) {
  const url = process.env.TEST_DATABASE_URL!;
  await withLocalDatabase(url, async admin => {
    const name = `wa_service_${crypto.randomUUID().replaceAll("-", "")}`;
    await admin.execute(sql.raw(`CREATE SCHEMA "${name}"`));
    try {
      const fixtureUrl = new URL(url);
      fixtureUrl.searchParams.set("options", `-c search_path=${name},pg_catalog`);
      await withLocalDatabase(fixtureUrl.toString(), async db => {
        const directory = new URL("../../../packages/db/drizzle/", import.meta.url);
        for (const file of (await readdir(directory)).filter(file => file.endsWith(".sql")).sort()) {
          const body = (await readFile(new URL(file, directory), "utf8"))
            .replaceAll('"public".', `"${name}".`)
            .replaceAll("SET search_path = public, pg_temp", `SET search_path = "${name}", pg_temp`);
          for (const statement of body.split("--> statement-breakpoint")) await db.execute(sql.raw(statement));
        }
        await work(db);
      });
    } finally { await admin.execute(sql.raw(`DROP SCHEMA "${name}" CASCADE`)); }
  });
}

test("PostgreSQL ingestion and recoverable queue publication", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  await withFixture(async db => {
    const channelId = crypto.randomUUID();
    const sender = `49${String(BigInt('0x' + crypto.randomUUID().replaceAll('-', '').slice(0, 10))).padStart(13, '0')}`;
    const event: IncomingMessage = {
      kind: "message", businessAccountId: channelId, phoneNumberId: channelId, sender,
      providerMessageId: crypto.randomUUID(), providerCreatedAt: new Date("2026-01-01T00:00:00Z"),
      providerReplyToId: null, contentType: "text", text: "Hello [ref: unknown-code]", content: { version: 1, providerType: "text" },
    };
    await db.insert(whatsappChannel).values({ id: channelId, businessAccountId: channelId, providerPhoneNumberId: channelId });
    try {
      await Promise.all(Array.from({ length: 6 }, () => acceptEvents(db, [event])));
      const [saved] = await db.select().from(message).where(eq(message.channelId, channelId));
      assert.ok(saved);
      const [owner] = await db.select().from(user).where(eq(user.phoneNumber, `+${sender}`));
      assert.equal(owner?.acquisitionRef, "unknown-code");
      assert.equal(owner?.acquisitionMessageId, saved.id);
      assert.equal((await db.select().from(outboxIntent).where(eq(outboxIntent.messageId, saved.id))).length, 2);
      const [chat] = await db.select().from(conversation).where(eq(conversation.id, saved.conversationId));
      assert.equal(chat?.nextSequence, 2n);

      // Consumption can precede publication-state persistence; duplicate queue
      // deliveries still produce one logical pending run, not repeated work.
      const job = { version: 1 as const, messageId: saved.id };
      await Promise.all(Array.from({ length: 6 }, () => enqueueAgentRun(db, job)));
      const runs = await db.select().from(agentRun).where(eq(agentRun.incomingMessageId, saved.id));
      assert.equal(runs.length, 1);
      assert.equal(runs[0]?.status, "pending");
      await assert.rejects(db.update(agentRun).set({ id: crypto.randomUUID() }).where(eq(agentRun.id, runs[0]!.id)));

      // Inject termination after the real transaction has written message + intents.
      const interrupted = new Proxy(db, { get(target, key, receiver) {
        if (key === "transaction") return (work: Parameters<typeof db.transaction>[0]) => target.transaction(async tx => {
          await work(tx); throw new Error("forced rollback");
        });
        return Reflect.get(target, key, receiver);
      } });
      const second = { ...event, providerMessageId: crypto.randomUUID(), text: "Later [ref: replacement]" };
      await assert.rejects(acceptEvents(interrupted, [second]), /forced rollback/);
      assert.equal((await db.select().from(message).where(eq(message.channelId, channelId))).length, 1);
      assert.equal((await db.select().from(conversation).where(eq(conversation.id, saved.conversationId)))[0]?.nextSequence, 2n);

      const callback: StatusEvent = { kind: "status", businessAccountId: channelId, phoneNumberId: channelId,
        providerMessageId: "unmatched-send", status: "read", providerTimestamp: new Date(), errorCode: null };
      await acceptEvents(db, [callback, callback]);
      assert.equal((await db.select().from(deliveryEvent).where(eq(deliveryEvent.channelId, channelId))).length, 1);

      const scope = and(eq(outboxIntent.messageId, saved.id), eq(outboxIntent.kind, "processing"));
      assert.equal(await dispatchProcessing(db, { send: async () => { throw new Error("queue unavailable"); } }), 0);
      const [retry] = await db.select().from(outboxIntent).where(scope);
      assert.equal(retry?.status, "pending");
      assert.equal(retry?.lastErrorCode, "queue_publication_failed");
      await db.update(outboxIntent).set({ nextAttemptAt: new Date(0) }).where(scope);
      const sent: string[] = [];
      const queue = { send: async (job: { version: 1; messageId: string }) => { sent.push(job.messageId); } };
      await Promise.all([dispatchProcessing(db, queue), dispatchProcessing(db, queue)]);
      assert.deepEqual(sent, [saved.id]);
      assert.equal((await db.select().from(outboxIntent).where(scope))[0]?.status, "published");

      await acceptEvents(db, [second]);
      const [savedSecond] = await db.select().from(message).where(eq(message.providerMessageId, second.providerMessageId));
      assert.equal((await db.select().from(user).where(eq(user.id, owner!.id)))[0]?.acquisitionRef, "unknown-code");
      const publicationCrash = new Proxy(db, { get(target, key, receiver) {
        if (key === "update") return () => { throw new Error("crash after queue send"); };
        return Reflect.get(target, key, receiver);
      } });
      await assert.rejects(dispatchProcessing(publicationCrash, queue), /crash after queue send/);
      const secondScope = and(eq(outboxIntent.messageId, savedSecond!.id), eq(outboxIntent.kind, "processing"));
      assert.equal((await db.select().from(outboxIntent).where(secondScope))[0]?.status, "claimed");
      await db.update(outboxIntent).set({ leaseExpiresAt: new Date(0) }).where(secondScope);
      await dispatchProcessing(db, queue);
      assert.deepEqual(sent, [saved.id, savedSecond!.id, savedSecond!.id]);
      assert.equal((await db.select().from(outboxIntent).where(secondScope))[0]?.status, "published");

      // A stale publisher cannot complete a claim now owned by another attempt.
      const third = { ...event, providerMessageId: crypto.randomUUID() };
      await acceptEvents(db, [third]);
      const [savedThird] = await db.select().from(message).where(eq(message.providerMessageId, third.providerMessageId));
      const thirdScope = and(eq(outboxIntent.messageId, savedThird!.id), eq(outboxIntent.kind, "processing"));
      const newerToken = crypto.randomUUID();
      assert.equal(await dispatchProcessing(db, { send: async () => {
        await db.update(outboxIntent).set({ claimToken: newerToken }).where(thirdScope);
      } }), 0);
      const [fenced] = await db.select().from(outboxIntent).where(thirdScope);
      assert.equal(fenced?.status, "claimed");
      assert.equal(fenced?.claimToken, newerToken);
      await db.update(outboxIntent).set({ leaseExpiresAt: new Date(0) }).where(thirdScope);
      assert.equal(await dispatchProcessing(db, queue), 1);

      const unattributed = { ...event, sender: sender.slice(0, -1) + (sender.endsWith("9") ? "8" : "9"),
        providerMessageId: crypto.randomUUID(), text: null, contentType: "unsupported" as const, content: { version: 1 as const, providerType: "image" } };
      try {
        await acceptEvents(db, [unattributed]);
        await acceptEvents(db, [{ ...unattributed, providerMessageId: crypto.randomUUID(), contentType: "text", text: "[ref: too-late]" }]);
        const [unattributedOwner] = await db.select().from(user).where(eq(user.phoneNumber, `+${unattributed.sender}`));
        assert.ok(unattributedOwner?.acquisitionInitializedAt);
        assert.equal(unattributedOwner?.acquisitionRef, null);
      } finally { await db.delete(user).where(eq(user.phoneNumber, `+${unattributed.sender}`)); }

      // Rollback includes response content, send payload/intent and run completion.
      await assert.rejects(processConversation(interrupted, saved.conversationId), /forced rollback/);
      assert.equal((await db.select().from(message).where(and(eq(message.conversationId, saved.conversationId), eq(message.direction, "outbound")))).length, 0);
      assert.equal((await db.select().from(agentRun).where(eq(agentRun.incomingMessageId, saved.id)))[0]?.status, "pending");
      // Later queue delivery first: process every earlier durable message in sequence.
      await enqueueAgentRun(db, { version: 1, messageId: savedThird!.id });
      const processed = await Promise.all([processConversation(db, saved.conversationId), processConversation(db, saved.conversationId)]);
      assert.equal(processed.reduce((sum, count) => sum + count, 0), 3);
      const replies = await db.select().from(message).where(and(eq(message.conversationId, saved.conversationId), eq(message.direction, "outbound"))).orderBy(message.sequence);
      assert.deepEqual(replies.map(reply => reply.replyToMessageId), [saved.id, savedSecond!.id, savedThird!.id]);
      assert.deepEqual(replies.map(reply => reply.sequence), [4n, 5n, 6n]);
      assert.equal((await db.select().from(outboundDelivery)).length, 3);
      assert.equal((await db.select().from(outboxIntent).where(eq(outboxIntent.kind, "send"))).length, 3);
      await enqueueAgentRun(db, job);
      assert.equal(await processConversation(db, saved.conversationId), 0);
      await assert.rejects(db.update(agentRun).set({ status: "pending", responseMessageId: null, completedAt: null }).where(eq(agentRun.incomingMessageId, saved.id)));
      await acceptEvents(db, [{ ...event, providerMessageId: crypto.randomUUID() }]);
      await db.update(conversation).set({ status: "blocked" }).where(eq(conversation.id, saved.conversationId));
      assert.equal(await processConversation(db, saved.conversationId), 1);
      assert.equal((await db.select().from(agentRun).where(eq(agentRun.status, "blocked"))).length, 1);
      assert.equal((await db.select().from(outboundDelivery)).length, 3);
    } finally {
      const [erasedMessage] = await db.select({ id: message.id }).from(message).where(eq(message.providerMessageId, event.providerMessageId));
      await db.delete(user).where(eq(user.phoneNumber, `+${sender}`));
      if (erasedMessage) {
        assert.equal((await db.select().from(agentRun).where(eq(agentRun.incomingMessageId, erasedMessage.id))).length, 0);
        assert.equal(await enqueueAgentRun(db, { version: 1, messageId: erasedMessage.id }), "deleted");
      }
      await db.delete(deliveryEvent).where(eq(deliveryEvent.channelId, channelId));
      await db.delete(whatsappChannel).where(eq(whatsappChannel.id, channelId));
    }
  });
});

test("queued agent turns: external inference, context, leases, fenced replies and bounded failure", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  await withFixture(async db => {
    const channelId = crypto.randomUUID();
    await db.insert(whatsappChannel).values({ id: channelId, businessAccountId: channelId, providerPhoneNumberId: channelId });
    const event: IncomingMessage = {
      kind: "message", businessAccountId: channelId, phoneNumberId: channelId, sender: "491234567890",
      providerMessageId: crypto.randomUUID(), providerCreatedAt: new Date(), providerReplyToId: null,
      contentType: "text", text: "First", content: { version: 1, providerType: "text" },
    };
    const accept = async (text: string) => {
      const providerMessageId = crypto.randomUUID();
      await acceptEvents(db, [{ ...event, text, providerMessageId }]);
      return (await db.select().from(message).where(eq(message.providerMessageId, providerMessageId)))[0]!;
    };
    const first = await accept("First");
    const second = await accept("Second");
    const chatId = first.conversationId;
    const enqueue = (id: string) => enqueueAgentRun(db, { version: 1, messageId: id });
    let calls = 0;
    const generate = async () => { calls++; return { text: "AI response", version: "mock-agent-v1" }; };
    await enqueue(second.id);
    await processAgentConversation(db, chatId, generate);
    assert.equal(calls, 0, "later queue item must not overtake unconsumed earlier message");
    await enqueue(first.id);
    let later: typeof first;
    await processAgentConversation(db, chatId, async input => {
      calls++;
      assert.deepEqual(input, { message: "First", history: [] });
      // If the claim transaction were still open this would block on its locks.
      later = await accept("Arrived during inference");
      const duplicate = await processAgentConversation(db, chatId, generate);
      assert.ok(duplicate.retryAfterMs! > 0);
      assert.equal(calls, 1, "active lease prevents concurrent inference");
      return { text: "First AI reply", version: "mock-agent-v1" };
    });
    await processAgentConversation(db, chatId, async input => {
      assert.equal(input.message, "Second");
      assert.deepEqual(input.history, [{ role: "user", content: "First" }, { role: "assistant", content: "First AI reply" }]);
      return { text: "Second AI reply", version: "mock-agent-v1" };
    });
    await enqueue(first.id);
    await processAgentConversation(db, chatId, generate);
    assert.equal(calls, 1);
    await enqueue(later!.id);
    // Supersede an attempt while its external call is in flight.
    await processAgentConversation(db, chatId, async () => {
      await db.update(agentRun).set({ attemptToken: "replacement", leaseExpiresAt: new Date(0) })
        .where(eq(agentRun.incomingMessageId, later!.id));
      return { text: "Stale reply", version: "mock-agent-v1" };
    });
    assert.equal((await db.select().from(message).where(eq(message.direction, "outbound"))).length, 2);
    await processAgentConversation(db, chatId, generate);
    assert.equal((await db.select().from(message).where(eq(message.direction, "outbound"))).length, 3);
    assert.equal((await db.select().from(outboxIntent).where(eq(outboxIntent.kind, "send"))).length, 3);
    assert.equal((await db.select().from(outboundDelivery)).length, 3);
    const failing = await accept("Failure");
    await enqueue(failing.id);
    for (let attempt = 0; attempt < 3; attempt++) {
      await processAgentConversation(db, chatId, async () => { throw new Error("provider failure with private data"); });
      if (attempt < 2) await db.update(agentRun).set({ leaseExpiresAt: new Date(0) }).where(eq(agentRun.incomingMessageId, failing.id));
    }
    const [run] = await db.select().from(agentRun).where(eq(agentRun.incomingMessageId, failing.id));
    assert.equal(run?.status, "succeeded");
    assert.equal(run?.attempts, 3);
    assert.equal(run?.lastErrorCode, "agent_turn_failed");
    assert.equal(run?.responderVersion, "agent-fallback-v1");
    const [fallback] = await db.select().from(message).where(eq(message.id, run!.responseMessageId!));
    assert.equal(fallback?.content.fallback, true);
    const blocked = await accept("Block during inference");
    await enqueue(blocked.id);
    await processAgentConversation(db, chatId, async () => {
      await db.update(conversation).set({ status: "blocked" }).where(eq(conversation.id, chatId));
      return { text: "Must not be saved", version: "mock-agent-v1" };
    });
    assert.equal((await db.select().from(agentRun).where(eq(agentRun.incomingMessageId, blocked.id)))[0]?.status, "blocked");
    assert.equal((await db.select().from(message).where(eq(message.direction, "outbound"))).length, 4);
  });
});
