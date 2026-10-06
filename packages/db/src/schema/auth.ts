import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { message } from "./conversations.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date());

export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Canonical Better Auth email; phone-only users start with an unverified placeholder.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  // Application-owned acquisition state; never writable through Better Auth.
  acquisitionOrigin: text("acquisition_origin").$type<"whatsapp_first_message" | "preexisting">(),
  acquisitionRef: text("acquisition_ref"),
  acquisitionInitializedAt: timestamp("acquisition_initialized_at", { withTimezone: true }),
  // Migration makes this FK DEFERRABLE for whole-user erasure through the history cascade.
  acquisitionMessageId: text("acquisition_message_id").references((): AnyPgColumn => message.id),
}, (table) => [
  check("users_verified_phone_present", sql`${table.phoneNumberVerified} = false OR ${table.phoneNumber} IS NOT NULL`),
  check("users_phone_e164", sql`${table.phoneNumber} IS NULL OR ${table.phoneNumber} ~ '^[+][1-9][0-9]{1,14}$'`),
  check("users_acquisition_state", sql`
    (${table.acquisitionOrigin} IS NULL AND ${table.acquisitionInitializedAt} IS NULL AND ${table.acquisitionMessageId} IS NULL AND ${table.acquisitionRef} IS NULL)
    OR (${table.acquisitionOrigin} IS NOT NULL AND ${table.acquisitionOrigin} = 'whatsapp_first_message'
      AND ${table.acquisitionInitializedAt} IS NOT NULL AND ${table.acquisitionMessageId} IS NOT NULL)
    OR (${table.acquisitionOrigin} IS NOT NULL AND ${table.acquisitionOrigin} = 'preexisting'
      AND ${table.acquisitionInitializedAt} IS NOT NULL AND ${table.acquisitionMessageId} IS NULL AND ${table.acquisitionRef} IS NULL)
  `),
]);

export const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("sessions_user_id_idx").on(table.userId)]);

export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("accounts_user_id_idx").on(table.userId),
  uniqueIndex("accounts_provider_account_idx").on(table.providerId, table.accountId),
]);

export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("verifications_identifier_idx").on(table.identifier)]);
