CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"incoming_message_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_incoming_message_id_unique" UNIQUE("incoming_message_id"),
	CONSTRAINT "agent_runs_status" CHECK ("agent_runs"."status" = 'pending')
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_incoming_message_id_messages_id_fk" FOREIGN KEY ("incoming_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Reviewed guard: a logical run must belong to immutable incoming evidence.
-- Drizzle snapshots do not represent this trigger; preserve it in later migrations.
CREATE FUNCTION "guard_agent_run_identity"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    ROW(NEW.id, NEW.incoming_message_id, NEW.created_at) IS DISTINCT FROM
    ROW(OLD.id, OLD.incoming_message_id, OLD.created_at) THEN
    RAISE EXCEPTION 'agent run identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages WHERE id = NEW.incoming_message_id AND direction = 'inbound') THEN
    RAISE EXCEPTION 'agent run requires incoming message' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "agent_runs_identity_guard" BEFORE INSERT OR UPDATE ON "agent_runs"
FOR EACH ROW EXECUTE FUNCTION "guard_agent_run_identity"();
