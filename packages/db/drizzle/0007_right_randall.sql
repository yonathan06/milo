ALTER TABLE "agent_runs" ADD COLUMN "attempt_token" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "last_error_code" text;