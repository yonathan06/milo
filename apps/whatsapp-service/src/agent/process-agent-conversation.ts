import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { agentRun, conversation, message, outboundDelivery, outboxIntent, whatsappChannel, whatsappIdentity } from "@video-editor-agent/db/schema";
import type { MessagingDatabase } from "../runtime/database.ts";
import type { AgentInput, AgentReply } from "./agent-client.ts";

const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;
const FALLBACK: AgentReply = { version: "agent-fallback-v1", text: "Sorry, I couldn't respond right now. Please try again in a moment." };

// One turn per alarm. Short claim + completion transactions surround external inference.
export async function processAgentConversation(
  db: MessagingDatabase,
  conversationId: string,
  generate: (input: AgentInput) => Promise<AgentReply>,
): Promise<{ retryAfterMs: number | null }> {
  const claim = await db.transaction(async tx => {
    const [chat] = await tx.select().from(conversation).where(eq(conversation.id, conversationId)).for("update");
    if (!chat) return null;
    // Include unconsumed earlier messages to prevent a later queue item overtaking
    // them. But NEVER claim a turn until its run was created by the queue consumer.
    const [row] = await tx.select({ incoming: message, run: agentRun }).from(message)
      .innerJoin(outboxIntent, and(eq(outboxIntent.messageId, message.id), eq(outboxIntent.kind, "processing")))
      .leftJoin(agentRun, eq(agentRun.incomingMessageId, message.id))
      .where(and(eq(message.conversationId, chat.id), eq(message.direction, "inbound"),
        or(isNull(agentRun.id), eq(agentRun.status, "pending"))))
      .orderBy(message.sequence).limit(1);
    if (!row || !row.run) return null;
    const { incoming, run } = row;
    const [endpoint] = await tx.select({ status: whatsappChannel.status }).from(whatsappIdentity)
      .innerJoin(whatsappChannel, eq(whatsappChannel.id, whatsappIdentity.channelId))
      .where(eq(whatsappIdentity.id, chat.whatsappIdentityId));
    if (chat.status !== "active" || endpoint?.status !== "active") {
      await tx.update(agentRun).set({ status: "blocked", completedAt: new Date(), responderVersion: "agent-blocked-v1",
        attemptToken: null, leaseExpiresAt: null }).where(eq(agentRun.id, run.id));
      return { wait: 10 };
    }
    if (run.leaseExpiresAt && run.leaseExpiresAt.getTime() > Date.now()) {
      return { wait: run.leaseExpiresAt.getTime() - Date.now() + 10 };
    }
    const token = crypto.randomUUID();
    await tx.update(agentRun).set({ attemptToken: token, leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      attempts: run.attempts + 1 }).where(eq(agentRun.id, run.id));
    const source = alias(message, "history_source");
    const history = await tx.select({ direction: message.direction, text: message.text }).from(message)
      .leftJoin(source, eq(source.id, message.replyToMessageId))
      .where(and(eq(message.conversationId, chat.id), eq(message.contentType, "text"),
        or(and(eq(message.direction, "inbound"), lt(message.sequence, incoming.sequence)),
          and(eq(message.direction, "outbound"), eq(source.conversationId, chat.id), lt(source.sequence, incoming.sequence)))))
      .orderBy(desc(message.sequence)).limit(20);
    return { incoming, runId: run.id, token, attempts: run.attempts + 1,
      input: { message: (incoming.text ?? "").trim().slice(0, 4000), history: history.reverse()
        .filter(item => item.text?.trim()).map(item => ({ role: item.direction === "inbound" ? "user" as const : "assistant" as const,
          content: item.text!.trim().slice(0, 4000) })) } };
  });
  if (!claim) return { retryAfterMs: null };
  if (claim.wait !== undefined) return { retryAfterMs: claim.wait };

  let reply: AgentReply;
  let failed = false;
  try {
    if (claim.incoming.contentType !== "text" || !claim.input.message) {
      reply = { version: "agent-unsupported-v1", text: "I can only handle text messages for now." };
    } else if (claim.attempts > MAX_ATTEMPTS) {
      // Repeated interrupted attempts must not trigger unbounded paid inference.
      failed = true;
      reply = FALLBACK;
    } else {
      reply = await generate(claim.input);
      if (!reply.text.trim() || reply.text.length > 4000 || !reply.version || reply.version.length > 128) {
        throw new Error("Invalid agent response");
      }
    }
  } catch {
    failed = true;
    reply = FALLBACK;
  }

  return db.transaction(async tx => {
    const [chat] = await tx.select().from(conversation).where(eq(conversation.id, conversationId)).for("update");
    const [run] = await tx.select().from(agentRun).where(eq(agentRun.id, claim.runId)).for("update");
    if (!chat || !run || run.status !== "pending" || run.attemptToken !== claim.token
      || !run.leaseExpiresAt || run.leaseExpiresAt.getTime() <= Date.now()) return { retryAfterMs: 10 };
    const fence = and(eq(agentRun.id, run.id), eq(agentRun.status, "pending"), eq(agentRun.attemptToken, claim.token));
    const [endpoint] = await tx.select({ status: whatsappChannel.status }).from(whatsappIdentity)
      .innerJoin(whatsappChannel, eq(whatsappChannel.id, whatsappIdentity.channelId))
      .where(eq(whatsappIdentity.id, chat.whatsappIdentityId));
    if (chat.status !== "active" || endpoint?.status !== "active") {
      await tx.update(agentRun).set({ status: "blocked", completedAt: new Date(), responderVersion: reply.version,
        attemptToken: null, leaseExpiresAt: null }).where(fence);
      return { retryAfterMs: 10 };
    }
    if (failed && claim.attempts < MAX_ATTEMPTS) {
      // Retain a short backoff lease so duplicate wakeups cannot bypass it.
      await tx.update(agentRun).set({ lastErrorCode: "agent_turn_failed", leaseExpiresAt: new Date(Date.now() + 5000) }).where(fence);
      return { retryAfterMs: 5010 };
    }
    const responseId = crypto.randomUUID();
    await tx.insert(message).values({ id: responseId, conversationId: chat.id, channelId: claim.incoming.channelId,
      sequence: chat.nextSequence, direction: "outbound", contentType: "text", text: reply.text,
      content: { version: 1, responderVersion: reply.version, fallback: failed }, replyToMessageId: claim.incoming.id });
    await tx.insert(outboundDelivery).values({ id: crypto.randomUUID(), messageId: responseId, channelId: claim.incoming.channelId,
      chunkIndex: 0, operationKey: `agent-response:${claim.incoming.id}:0`,
      payload: { version: 1, type: "text", text: { body: reply.text } } });
    await tx.insert(outboxIntent).values({ id: crypto.randomUUID(), messageId: responseId, kind: "send" });
    await tx.update(agentRun).set({ status: "succeeded", responseMessageId: responseId, completedAt: new Date(),
      responderVersion: reply.version, attemptToken: null, leaseExpiresAt: null,
      lastErrorCode: failed ? "agent_turn_failed" : null }).where(fence);
    await tx.update(conversation).set({ nextSequence: chat.nextSequence + 1n }).where(eq(conversation.id, chat.id));
    return { retryAfterMs: 10 };
  });
}
