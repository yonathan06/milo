import { desc, eq, inArray } from "drizzle-orm";
import { agentRun, conversation, message, outboundDelivery, outboxIntent } from "@video-editor-agent/db/schema";
import type { MessagingDatabase } from "../runtime/database.ts";

// Canonical simulator state, reused by the HTTP snapshot and local push channel.
export async function loadConversationState(db: MessagingDatabase, conversationId: string | null) {
  const [chat] = conversationId ? await db.select({ id: conversation.id, nextSequence: conversation.nextSequence, status: conversation.status })
    .from(conversation).where(eq(conversation.id, conversationId)) : [];
  const messages = chat ? await db.select().from(message).where(eq(message.conversationId, chat.id)).orderBy(desc(message.sequence)).limit(100) : [];
  const ids = messages.map(row => row.id);
  return {
    conversation: chat ?? null,
    messages: messages.reverse(),
    intents: ids.length ? await db.select().from(outboxIntent).where(inArray(outboxIntent.messageId, ids)) : [],
    runs: ids.length ? await db.select().from(agentRun).where(inArray(agentRun.incomingMessageId, ids)) : [],
    deliveries: ids.length ? await db.select().from(outboundDelivery).where(inArray(outboundDelivery.messageId, ids)) : [],
  };
}
