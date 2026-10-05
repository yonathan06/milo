-- Preserve any optional email already entered before removing the duplicate fields.
-- Uniqueness conflicts abort the migration instead of silently merging users.
UPDATE "users"
SET "email" = "contact_email", "email_verified" = "contact_email_verified"
WHERE "contact_email" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_verified_contact_email_present";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "contact_email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "contact_email_verified";