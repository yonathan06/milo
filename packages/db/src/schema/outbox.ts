import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { message } from "./conversations.ts";

// Payloads are reconstructed from canonical records, not duplicated content.
export const outboxIntent = pgTable("outbox_intents", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => message.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"processing" | "acquisition" | "send">().notNull(),
  status: text("status").$type<"pending" | "claimed" | "published">().default("pending").notNull(),
  claimToken: text("claim_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  lastErrorCode: text("last_error_code"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("outbox_intents_message_kind_idx").on(table.messageId, table.kind),
  index("outbox_intents_due_idx").on(table.kind, table.nextAttemptAt).where(sql`${table.status} <> 'published'`),
  check("outbox_intents_kind", sql`${table.kind} IN ('processing', 'acquisition', 'send')`),
  check("outbox_intents_status", sql`${table.status} IN ('pending', 'claimed', 'published')`),
  check("outbox_intents_attempts", sql`${table.attemptCount} >= 0`),
  check("outbox_intents_claim", sql`(${table.status} = 'claimed' AND ${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)
    OR (${table.status} <> 'claimed' AND ${table.claimToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`),
  check("outbox_intents_publication", sql`(${table.status} = 'published') = (${table.publishedAt} IS NOT NULL)`),
]);
