ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_status";--> statement-breakpoint
ALTER TABLE "outbox_intents" DROP CONSTRAINT "outbox_intents_kind";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "response_message_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "responder_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_response_message_id_messages_id_fk" FOREIGN KEY ("response_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_completion" CHECK (("agent_runs"."status" = 'pending' AND "agent_runs"."completed_at" IS NULL AND "agent_runs"."response_message_id" IS NULL)
    OR ("agent_runs"."status" <> 'pending' AND "agent_runs"."completed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status" CHECK ("agent_runs"."status" IN ('pending', 'succeeded', 'blocked'));--> statement-breakpoint
ALTER TABLE "outbox_intents" ADD CONSTRAINT "outbox_intents_kind" CHECK ("outbox_intents"."kind" IN ('processing', 'acquisition', 'send'));
--> statement-breakpoint
-- Preserve identity guard and validate completion ownership. Snapshots omit this function.
CREATE OR REPLACE FUNCTION "guard_agent_run_identity"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.incoming_message_id, NEW.created_at) IS DISTINCT FROM
       ROW(OLD.id, OLD.incoming_message_id, OLD.created_at) THEN
      RAISE EXCEPTION 'agent run identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'pending' AND (
      ROW(NEW.status, NEW.completed_at, NEW.responder_version) IS DISTINCT FROM
      ROW(OLD.status, OLD.completed_at, OLD.responder_version)
      OR (NEW.response_message_id IS NOT NULL AND NEW.response_message_id IS DISTINCT FROM OLD.response_message_id)) THEN
      RAISE EXCEPTION 'completed agent run cannot be rewritten' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages WHERE id = NEW.incoming_message_id AND direction = 'inbound') THEN
    -- FK deletion actions may clear response pointers during whole-user erasure.
    IF TG_OP = 'UPDATE' AND NEW.response_message_id IS NULL AND OLD.response_message_id IS NOT NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'agent run requires incoming message' USING ERRCODE = '23514';
  END IF;
  IF NEW.response_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages incoming JOIN messages outgoing ON outgoing.conversation_id = incoming.conversation_id
    WHERE incoming.id = NEW.incoming_message_id AND outgoing.id = NEW.response_message_id
      AND outgoing.direction = 'outbound' AND outgoing.reply_to_message_id = incoming.id
  ) THEN
    RAISE EXCEPTION 'response must be an owned outgoing reply' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
