ALTER TABLE "users" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contact_email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_verified_phone_present" CHECK ("users"."phone_number_verified" = false OR "users"."phone_number" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164" CHECK ("users"."phone_number" IS NULL OR "users"."phone_number" ~ '^[+][1-9][0-9]{1,14}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_verified_contact_email_present" CHECK ("users"."contact_email_verified" = false OR "users"."contact_email" IS NOT NULL);