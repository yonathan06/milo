import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

export const whatsappChannel = pgTable("whatsapp_channels", {
  id: text("id").primaryKey(),
  businessAccountId: text("business_account_id").notNull(),
  providerPhoneNumberId: text("provider_phone_number_id").notNull().unique(),
  displayPhoneNumber: text("display_phone_number"),
  status: text("status").$type<"active" | "disabled">().default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  check("whatsapp_channels_status", sql`${table.status} IN ('active', 'disabled')`),
]);

export const whatsappIdentity = pgTable("whatsapp_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull().references(() => whatsappChannel.id),
  providerSenderId: text("provider_sender_id").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_identities_channel_sender_idx").on(table.channelId, table.providerSenderId),
  index("whatsapp_identities_user_id_idx").on(table.userId),
]);
