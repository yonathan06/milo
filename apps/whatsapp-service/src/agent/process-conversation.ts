import { and, eq, isNull, or } from "drizzle-orm";
import { agentRun, conversation, message, outboundDelivery, outboxIntent, whatsappChannel, whatsappIdentity } from "@video-editor-agent/db/schema";
import type { MessagingDatabase } from "../runtime/database.ts";
import { testResponse, TEST_RESPONDER_VERSION } from "./test-responder.ts";

// This pure deterministic responder has no HTTP/model calls. It can safely finish
// within a DB transaction; NEVER use this transaction pattern for an LLM/tool loop.
export async function processConversation(db: MessagingDatabase, conversationId: string): Promise<number> {
  return db.transaction(async tx => {
    const [chat] = await tx.select().from(conversation).where(eq(conversation.id, conversationId)).for("update");
    if (!chat) return 0;
    const [endpoint] = await tx.select({ channelId: whatsappChannel.id, status: whatsappChannel.status }).from(whatsappIdentity)
      .innerJoin(whatsappChannel, eq(whatsappChannel.id, whatsappIdentity.channelId))
      .where(eq(whatsappIdentity.id, chat.whatsappIdentityId));
    if (!endpoint) return 0;
    // Consult canonical sequence, NOT queue arrival or run creation order. Include
    // earlier messages not yet delivered by Queues; their processing intents are durable.
    const pending = await tx.select({ incoming: message }).from(message)
      .innerJoin(outboxIntent, and(eq(outboxIntent.messageId, message.id), eq(outboxIntent.kind, "processing")))
      .leftJoin(agentRun, eq(agentRun.incomingMessageId, message.id))
      .where(and(eq(message.conversationId, chat.id), eq(message.direction, "inbound"),
        or(isNull(agentRun.id), eq(agentRun.status, "pending"))))
      .orderBy(message.sequence).limit(25);
    let nextSequence = chat.nextSequence;
    for (const { incoming } of pending) {
      await tx.insert(agentRun).values({ id: crypto.randomUUID(), incomingMessageId: incoming.id })
        .onConflictDoNothing({ target: agentRun.incomingMessageId });
      const completedAt = new Date();
      if (chat.status !== "active" || endpoint.status !== "active") {
        await tx.update(agentRun).set({ status: "blocked", completedAt, responderVersion: TEST_RESPONDER_VERSION })
          .where(and(eq(agentRun.incomingMessageId, incoming.id), eq(agentRun.status, "pending")));
        continue;
      }
      const responseId = crypto.randomUUID();
      const text = testResponse(incoming);
      await tx.insert(message).values({ id: responseId, conversationId: chat.id, channelId: endpoint.channelId,
        sequence: nextSequence++, direction: "outbound", contentType: "text", text,
        content: { version: 1, responderVersion: TEST_RESPONDER_VERSION }, replyToMessageId: incoming.id });
      await tx.insert(outboundDelivery).values({ id: crypto.randomUUID(), messageId: responseId, channelId: endpoint.channelId,
        chunkIndex: 0, operationKey: `test-response:${incoming.id}:0`,
        payload: { version: 1, type: "text", text: { body: text } } });
      await tx.insert(outboxIntent).values({ id: crypto.randomUUID(), messageId: responseId, kind: "send" });
      await tx.update(agentRun).set({ status: "succeeded", responseMessageId: responseId, completedAt,
        responderVersion: TEST_RESPONDER_VERSION }).where(and(eq(agentRun.incomingMessageId, incoming.id), eq(agentRun.status, "pending")));
    }
    if (nextSequence !== chat.nextSequence) await tx.update(conversation).set({ nextSequence }).where(eq(conversation.id, chat.id));
    return pending.length;
  });
}

export async function findPendingConversations(db: MessagingDatabase): Promise<string[]> {
  const rows = await db.selectDistinct({ id: message.conversationId }).from(message)
    .innerJoin(outboxIntent, and(eq(outboxIntent.messageId, message.id), eq(outboxIntent.kind, "processing")))
    .leftJoin(agentRun, eq(agentRun.incomingMessageId, message.id))
    .where(and(eq(message.direction, "inbound"), or(isNull(agentRun.id), eq(agentRun.status, "pending")))).limit(50);
  return rows.map(row => row.id);
}
