import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { message } from "./conversations.ts";
import { whatsappChannel } from "./whatsapp.ts";

export type SubmissionStatus = "pending" | "submitting" | "accepted" | "unknown" | "blocked" | "failed";
export type DeliveryStatus = "none" | "sent" | "delivered" | "read" | "failed";
export interface DeliveryPayload {
  version: number;
  [key: string]: unknown;
}

// One logical send chunk, NOT one HTTP attempt. Retrying reuses the saved payload.
export const outboundDelivery = pgTable("outbound_deliveries", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => message.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull().references(() => whatsappChannel.id),
  chunkIndex: integer("chunk_index").notNull(),
  operationKey: text("operation_key").notNull().unique(),
  payload: jsonb("payload").$type<DeliveryPayload>().notNull(),
  submissionStatus: text("submission_status").$type<SubmissionStatus>().default("pending").notNull(),
  deliveryStatus: text("delivery_status").$type<DeliveryStatus>().default("none").notNull(),
  providerMessageId: text("provider_message_id"),
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("outbound_deliveries_message_chunk_idx").on(table.messageId, table.chunkIndex),
  uniqueIndex("outbound_deliveries_channel_provider_idx").on(table.channelId, table.providerMessageId)
    .where(sql`${table.providerMessageId} IS NOT NULL`),
  index("outbound_deliveries_due_idx").on(table.nextAttemptAt)
    .where(sql`${table.submissionStatus} = 'pending'`),
  check("outbound_deliveries_counts", sql`${table.chunkIndex} >= 0 AND ${table.attemptCount} >= 0`),
  check("outbound_deliveries_submission_status", sql`${table.submissionStatus} IN ('pending', 'submitting', 'accepted', 'unknown', 'blocked', 'failed')`),
  check("outbound_deliveries_delivery_status", sql`${table.deliveryStatus} IN ('none', 'sent', 'delivered', 'read', 'failed')`),
  check("outbound_deliveries_accepted_provider_id", sql`${table.submissionStatus} <> 'accepted' OR ${table.providerMessageId} IS NOT NULL`),
  check("outbound_deliveries_payload_envelope", sql`jsonb_typeof(${table.payload}) = 'object' AND ${table.payload} ? 'version'
    AND jsonb_typeof(${table.payload}->'version') = 'number'`),
]);

// Status evidence may arrive before the send response is persisted.
export const deliveryEvent = pgTable("delivery_events", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => whatsappChannel.id),
  outboundDeliveryId: text("outbound_delivery_id").references(() => outboundDelivery.id, { onDelete: "cascade" }),
  providerMessageId: text("provider_message_id").notNull(),
  deduplicationKey: text("deduplication_key").notNull().unique(),
  status: text("status").$type<Exclude<DeliveryStatus, "none">>().notNull(),
  providerTimestamp: timestamp("provider_timestamp", { withTimezone: true }).notNull(),
  errorCode: text("error_code"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("delivery_events_channel_provider_idx").on(table.channelId, table.providerMessageId),
  index("delivery_events_outbound_delivery_idx").on(table.outboundDeliveryId),
  check("delivery_events_status", sql`${table.status} IN ('sent', 'delivered', 'read', 'failed')`),
]);
