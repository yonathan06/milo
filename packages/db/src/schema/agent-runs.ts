import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { message } from "./conversations.ts";

// Model calls happen outside transactions; attempt tokens fence completion.
export const agentRun = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  incomingMessageId: text("incoming_message_id").notNull().unique()
    .references(() => message.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "succeeded" | "blocked">().default("pending").notNull(),
  responseMessageId: text("response_message_id").references(() => message.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  responderVersion: text("responder_version"),
  attemptToken: text("attempt_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  attempts: integer("attempts").default(0).notNull(),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("agent_runs_status", sql`${table.status} IN ('pending', 'succeeded', 'blocked')`),
  check("agent_runs_completion", sql`(${table.status} = 'pending' AND ${table.completedAt} IS NULL AND ${table.responseMessageId} IS NULL)
    OR (${table.status} <> 'pending' AND ${table.completedAt} IS NOT NULL)`),
]);
