import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { whatsappChannel, whatsappIdentity } from "./whatsapp.ts";

// Payload shape/size and supported modalities must also be validated by the adapter.
export interface MessageContent {
  version: number;
  [key: string]: unknown;
}

export const conversation = pgTable("conversations", {
  id: text("id").primaryKey(),
  whatsappIdentityId: text("whatsapp_identity_id").notNull().unique()
    .references(() => whatsappIdentity.id, { onDelete: "cascade" }),
  status: text("status").$type<"active" | "closed" | "blocked">().default("active").notNull(),
  nextSequence: bigint("next_sequence", { mode: "bigint" }).default(sql`1`).notNull(),
  lastIncomingAt: timestamp("last_incoming_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  check("conversations_status", sql`${table.status} IN ('active', 'closed', 'blocked')`),
  check("conversations_next_sequence_positive", sql`${table.nextSequence} > 0`),
]);

export const message = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
  sequence: bigint("sequence", { mode: "bigint" }).notNull(),
  direction: text("direction").$type<"inbound" | "outbound">().notNull(),
  // Kept extensible: unknown provider types are normalized as unsupported, not empty text.
  contentType: text("content_type").notNull(),
  text: text("text"),
  content: jsonb("content").$type<MessageContent>().notNull(),
  channelId: text("channel_id").notNull().references(() => whatsappChannel.id),
  // Only inbound provider IDs live here; outbound IDs belong to send units.
  providerMessageId: text("provider_message_id"),
  replyToMessageId: text("reply_to_message_id").references((): AnyPgColumn => message.id, { onDelete: "set null" }),
  providerReplyToId: text("provider_reply_to_id"),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("messages_conversation_sequence_idx").on(table.conversationId, table.sequence),
  uniqueIndex("messages_channel_provider_idx").on(table.channelId, table.providerMessageId)
    .where(sql`${table.providerMessageId} IS NOT NULL`),
  index("messages_conversation_incoming_idx").on(table.conversationId, table.acceptedAt)
    .where(sql`${table.direction} = 'inbound'`),
  index("messages_reply_to_idx").on(table.replyToMessageId),
  check("messages_sequence_positive", sql`${table.sequence} > 0`),
  check("messages_direction", sql`${table.direction} IN ('inbound', 'outbound')`),
  check("messages_provider_id_direction", sql`
    (${table.direction} = 'inbound' AND ${table.providerMessageId} IS NOT NULL AND length(${table.providerMessageId}) > 0)
    OR (${table.direction} = 'outbound' AND ${table.providerMessageId} IS NULL)
  `),
  check("messages_content_envelope", sql`jsonb_typeof(${table.content}) = 'object' AND ${table.content} ? 'version'
    AND jsonb_typeof(${table.content}->'version') = 'number'`),
  check("messages_text_content", sql`${table.contentType} <> 'text' OR ${table.text} IS NOT NULL`),
]);
