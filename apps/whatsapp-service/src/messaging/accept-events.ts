import { and, eq, or, sql } from "drizzle-orm";
import { conversation, deliveryEvent, message, outboundDelivery, outboxIntent, user, whatsappChannel, whatsappIdentity } from "@video-editor-agent/db/schema";
import { provisionVerifiedWhatsAppUser } from "@video-editor-agent/db/users";
import type { MessagingDatabase } from "../runtime/database.ts";
import type { NormalizedEvent, StatusEvent } from "../whatsapp/normalize.ts";
import { parseReferral } from "../referral/parse.ts";

export class ChannelRejected extends Error {}

async function callbackKey(channelId: string, event: StatusEvent): Promise<string> {
  const identity = JSON.stringify([1, channelId, event.providerMessageId, event.status, event.providerTimestamp.toISOString(), event.errorCode]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

// One short transaction per event. A retried partially accepted batch deduplicates.
export async function acceptEvents(db: MessagingDatabase, events: NormalizedEvent[]): Promise<void> {
  for (const event of events) {
    await db.transaction(async tx => {
      const [channel] = await tx.select().from(whatsappChannel).where(and(
        eq(whatsappChannel.providerPhoneNumberId, event.phoneNumberId),
        eq(whatsappChannel.businessAccountId, event.businessAccountId),
      )).for("share");
      if (!channel || (event.kind === "message" && channel.status !== "active")) throw new ChannelRejected("Unrecognized or disabled channel");
      if (event.kind === "status") {
        // Deliberately unmatched: reconciliation is a later milestone, independent
        // of send-response persistence. Callbacks never create conversational work.
        await tx.insert(deliveryEvent).values({
          id: crypto.randomUUID(), channelId: channel.id, providerMessageId: event.providerMessageId,
          deduplicationKey: await callbackKey(channel.id, event), status: event.status,
          providerTimestamp: event.providerTimestamp, errorCode: event.errorCode,
        }).onConflictDoNothing({ target: deliveryEvent.deduplicationKey });
        return;
      }
      // The conflict update locks the canonical user, serializing acquisition across
      // channels, identities and concurrent webhook requests until transaction end.
      const owner = await provisionVerifiedWhatsAppUser(tx, event.sender);
      const [lockedOwner] = await tx.select().from(user).where(eq(user.id, owner.id)).for("update");
      const [identity] = await tx.insert(whatsappIdentity).values({
        id: crypto.randomUUID(), userId: owner.id, channelId: channel.id,
        providerSenderId: event.sender, verifiedAt: new Date(),
      }).onConflictDoUpdate({ target: [whatsappIdentity.channelId, whatsappIdentity.providerSenderId], set: { providerSenderId: event.sender } }).returning();
      if (!identity || identity.userId !== owner.id) throw new ChannelRejected("Identity mismatch");
      const [chat] = await tx.insert(conversation).values({ id: crypto.randomUUID(), whatsappIdentityId: identity.id })
        .onConflictDoUpdate({ target: conversation.whatsappIdentityId, set: { whatsappIdentityId: identity.id } }).returning();
      if (!chat) throw new Error("Conversation resolution failed");
      const [existing] = await tx.select().from(message).where(and(eq(message.channelId, channel.id), eq(message.providerMessageId, event.providerMessageId)));
      if (existing) {
        if (existing.conversationId !== chat.id) throw new ChannelRejected("Message identity mismatch");
        return;
      }
      const now = new Date();
      const [allocated] = await tx.update(conversation).set({ nextSequence: sql`${conversation.nextSequence} + 1`, lastIncomingAt: now })
        .where(eq(conversation.id, chat.id)).returning();
      const mid = crypto.randomUUID();
      const [reply] = event.providerReplyToId ? await tx.select({ id: message.id }).from(message)
        .leftJoin(outboundDelivery, eq(outboundDelivery.messageId, message.id)).where(and(
          eq(message.conversationId, chat.id),
          or(eq(message.providerMessageId, event.providerReplyToId), eq(outboundDelivery.providerMessageId, event.providerReplyToId)),
        )).limit(1) : [];
      await tx.insert(message).values({
        id: mid, conversationId: chat.id, channelId: channel.id, sequence: allocated!.nextSequence - 1n,
        direction: "inbound", providerMessageId: event.providerMessageId, contentType: event.contentType,
        text: event.text, content: event.content, providerCreatedAt: event.providerCreatedAt,
        providerReplyToId: event.providerReplyToId, replyToMessageId: reply?.id ?? null, acceptedAt: now,
      });
      await tx.insert(outboxIntent).values({ id: crypto.randomUUID(), messageId: mid, kind: "processing" });
      if (!lockedOwner!.acquisitionInitializedAt) {
        await tx.update(user).set({ acquisitionOrigin: "whatsapp_first_message", acquisitionInitializedAt: now,
          acquisitionMessageId: mid, acquisitionRef: parseReferral(event.text) }).where(eq(user.id, owner.id));
        await tx.insert(outboxIntent).values({ id: crypto.randomUUID(), messageId: mid, kind: "acquisition" });
      }
    });
  }
}
