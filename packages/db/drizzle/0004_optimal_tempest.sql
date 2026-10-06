CREATE TABLE "outbox_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_token" text,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error_code" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_intents_kind" CHECK ("outbox_intents"."kind" IN ('processing', 'acquisition')),
	CONSTRAINT "outbox_intents_status" CHECK ("outbox_intents"."status" IN ('pending', 'claimed', 'published')),
	CONSTRAINT "outbox_intents_attempts" CHECK ("outbox_intents"."attempt_count" >= 0),
	CONSTRAINT "outbox_intents_claim" CHECK (("outbox_intents"."status" = 'claimed' AND "outbox_intents"."claim_token" IS NOT NULL AND "outbox_intents"."lease_expires_at" IS NOT NULL)
    OR ("outbox_intents"."status" <> 'claimed' AND "outbox_intents"."claim_token" IS NULL AND "outbox_intents"."lease_expires_at" IS NULL)),
	CONSTRAINT "outbox_intents_publication" CHECK (("outbox_intents"."status" = 'published') = ("outbox_intents"."published_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "outbox_intents" ADD CONSTRAINT "outbox_intents_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_intents_message_kind_idx" ON "outbox_intents" USING btree ("message_id","kind");--> statement-breakpoint
CREATE INDEX "outbox_intents_due_idx" ON "outbox_intents" USING btree ("kind","next_attempt_at") WHERE "outbox_intents"."status" <> 'published';