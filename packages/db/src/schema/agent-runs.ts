import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { message } from "./conversations.ts";

// Durable consumer handoff. Execution/attempt leases are a subsequent milestone.
export const agentRun = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  incomingMessageId: text("incoming_message_id").notNull().unique()
    .references(() => message.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending">().default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [check("agent_runs_status", sql`${table.status} = 'pending'`)]);
