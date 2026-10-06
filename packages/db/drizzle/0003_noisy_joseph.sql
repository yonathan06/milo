-- Reviewed additions: preexisting-user backfill and custom integrity triggers below.
-- Legacy acquisition references cannot be validated: no canonical messages table existed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE acquisition_initialized_at IS NOT NULL
    OR acquisition_message_id IS NOT NULL OR acquisition_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'WhatsApp schema migration requires an explicit legacy acquisition import; initialized acquisition records already exist';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"whatsapp_identity_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_sequence" bigint DEFAULT 1 NOT NULL,
	"last_incoming_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_whatsapp_identity_id_unique" UNIQUE("whatsapp_identity_id"),
	CONSTRAINT "conversations_status" CHECK ("conversations"."status" IN ('active', 'closed', 'blocked')),
	CONSTRAINT "conversations_next_sequence_positive" CHECK ("conversations"."next_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"outbound_delivery_id" text,
	"provider_message_id" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"status" text NOT NULL,
	"provider_timestamp" timestamp with time zone NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_events_deduplication_key_unique" UNIQUE("deduplication_key"),
	CONSTRAINT "delivery_events_status" CHECK ("delivery_events"."status" IN ('sent', 'delivered', 'read', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"direction" text NOT NULL,
	"content_type" text NOT NULL,
	"text" text,
	"content" jsonb NOT NULL,
	"channel_id" text NOT NULL,
	"provider_message_id" text,
	"reply_to_message_id" text,
	"provider_reply_to_id" text,
	"provider_created_at" timestamp with time zone,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sequence_positive" CHECK ("messages"."sequence" > 0),
	CONSTRAINT "messages_direction" CHECK ("messages"."direction" IN ('inbound', 'outbound')),
	CONSTRAINT "messages_provider_id_direction" CHECK (
    ("messages"."direction" = 'inbound' AND "messages"."provider_message_id" IS NOT NULL AND length("messages"."provider_message_id") > 0)
    OR ("messages"."direction" = 'outbound' AND "messages"."provider_message_id" IS NULL)
  ),
	CONSTRAINT "messages_content_envelope" CHECK (jsonb_typeof("messages"."content") = 'object' AND "messages"."content" ? 'version'
    AND jsonb_typeof("messages"."content"->'version') = 'number'),
	CONSTRAINT "messages_text_content" CHECK ("messages"."content_type" <> 'text' OR "messages"."text" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "outbound_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"operation_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"submission_status" text DEFAULT 'pending' NOT NULL,
	"delivery_status" text DEFAULT 'none' NOT NULL,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"submitted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_deliveries_operation_key_unique" UNIQUE("operation_key"),
	CONSTRAINT "outbound_deliveries_counts" CHECK ("outbound_deliveries"."chunk_index" >= 0 AND "outbound_deliveries"."attempt_count" >= 0),
	CONSTRAINT "outbound_deliveries_submission_status" CHECK ("outbound_deliveries"."submission_status" IN ('pending', 'submitting', 'accepted', 'unknown', 'blocked', 'failed')),
	CONSTRAINT "outbound_deliveries_delivery_status" CHECK ("outbound_deliveries"."delivery_status" IN ('none', 'sent', 'delivered', 'read', 'failed')),
	CONSTRAINT "outbound_deliveries_accepted_provider_id" CHECK ("outbound_deliveries"."submission_status" <> 'accepted' OR "outbound_deliveries"."provider_message_id" IS NOT NULL),
	CONSTRAINT "outbound_deliveries_payload_envelope" CHECK (jsonb_typeof("outbound_deliveries"."payload") = 'object' AND "outbound_deliveries"."payload" ? 'version'
    AND jsonb_typeof("outbound_deliveries"."payload"->'version') = 'number')
);
--> statement-breakpoint
CREATE TABLE "whatsapp_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"business_account_id" text NOT NULL,
	"provider_phone_number_id" text NOT NULL,
	"display_phone_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_channels_provider_phone_number_id_unique" UNIQUE("provider_phone_number_id"),
	CONSTRAINT "whatsapp_channels_status" CHECK ("whatsapp_channels"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"provider_sender_id" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_acquisition_state";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_origin" text;--> statement-breakpoint
-- Classify every existing user before enabling first-message initialization.
UPDATE "users" SET "acquisition_origin" = 'preexisting', "acquisition_initialized_at" = now();
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_identity_id_whatsapp_identities_id_fk" FOREIGN KEY ("whatsapp_identity_id") REFERENCES "public"."whatsapp_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_outbound_delivery_id_outbound_deliveries_id_fk" FOREIGN KEY ("outbound_delivery_id") REFERENCES "public"."outbound_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_identities" ADD CONSTRAINT "whatsapp_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_identities" ADD CONSTRAINT "whatsapp_identities_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_events_channel_provider_idx" ON "delivery_events" USING btree ("channel_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "delivery_events_outbound_delivery_idx" ON "delivery_events" USING btree ("outbound_delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_idx" ON "messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_channel_provider_idx" ON "messages" USING btree ("channel_id","provider_message_id") WHERE "messages"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_conversation_incoming_idx" ON "messages" USING btree ("conversation_id","accepted_at") WHERE "messages"."direction" = 'inbound';--> statement-breakpoint
CREATE INDEX "messages_reply_to_idx" ON "messages" USING btree ("reply_to_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_deliveries_message_chunk_idx" ON "outbound_deliveries" USING btree ("message_id","chunk_index");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_deliveries_channel_provider_idx" ON "outbound_deliveries" USING btree ("channel_id","provider_message_id") WHERE "outbound_deliveries"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "outbound_deliveries_due_idx" ON "outbound_deliveries" USING btree ("next_attempt_at") WHERE "outbound_deliveries"."submission_status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_identities_channel_sender_idx" ON "whatsapp_identities" USING btree ("channel_id","provider_sender_id");--> statement-breakpoint
CREATE INDEX "whatsapp_identities_user_id_idx" ON "whatsapp_identities" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_acquisition_message_id_messages_id_fk" FOREIGN KEY ("acquisition_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_acquisition_state" CHECK (
    ("users"."acquisition_origin" IS NULL AND "users"."acquisition_initialized_at" IS NULL AND "users"."acquisition_message_id" IS NULL AND "users"."acquisition_ref" IS NULL)
    OR ("users"."acquisition_origin" IS NOT NULL AND "users"."acquisition_origin" = 'whatsapp_first_message'
      AND "users"."acquisition_initialized_at" IS NOT NULL AND "users"."acquisition_message_id" IS NOT NULL)
    OR ("users"."acquisition_origin" IS NOT NULL AND "users"."acquisition_origin" = 'preexisting'
      AND "users"."acquisition_initialized_at" IS NOT NULL AND "users"."acquisition_message_id" IS NULL AND "users"."acquisition_ref" IS NULL)
  );
--> statement-breakpoint
-- These triggers are deliberately maintained in reviewed SQL, not Drizzle snapshots.
CREATE FUNCTION whatsapp_scope_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'WhatsApp record ID is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'whatsapp_channels' THEN
      IF ROW(NEW.business_account_id, NEW.provider_phone_number_id)
        IS DISTINCT FROM ROW(OLD.business_account_id, OLD.provider_phone_number_id) THEN
        RAISE EXCEPTION 'Business channel identity is immutable' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'whatsapp_identities' THEN
      IF ROW(NEW.user_id, NEW.channel_id, NEW.provider_sender_id)
        IS DISTINCT FROM ROW(OLD.user_id, OLD.channel_id, OLD.provider_sender_id) THEN
        RAISE EXCEPTION 'Sender identity ownership is immutable' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'conversations' THEN
      IF NEW.whatsapp_identity_id IS DISTINCT FROM OLD.whatsapp_identity_id THEN
        RAISE EXCEPTION 'Conversation identity is immutable' USING ERRCODE = '23514';
      END IF;
      IF NEW.next_sequence < OLD.next_sequence THEN
        RAISE EXCEPTION 'Conversation sequence cannot regress' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER whatsapp_channels_scope BEFORE UPDATE ON whatsapp_channels
FOR EACH ROW EXECUTE FUNCTION whatsapp_scope_guard();
--> statement-breakpoint
CREATE TRIGGER whatsapp_identities_scope BEFORE UPDATE ON whatsapp_identities
FOR EACH ROW EXECUTE FUNCTION whatsapp_scope_guard();
--> statement-breakpoint
CREATE TRIGGER conversations_scope BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION whatsapp_scope_guard();
--> statement-breakpoint
CREATE FUNCTION whatsapp_message_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.conversation_id, NEW.channel_id, NEW.direction,
    NEW.sequence, NEW.provider_message_id, NEW.accepted_at, NEW.content_type, NEW.text, NEW.content)
    IS DISTINCT FROM ROW(OLD.id, OLD.conversation_id, OLD.channel_id, OLD.direction,
    OLD.sequence, OLD.provider_message_id, OLD.accepted_at, OLD.content_type, OLD.text, OLD.content) THEN
    RAISE EXCEPTION 'Canonical message identity and content are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM conversations c JOIN whatsapp_identities i ON i.id = c.whatsapp_identity_id
    WHERE c.id = NEW.conversation_id AND i.channel_id = NEW.channel_id) THEN
    RAISE EXCEPTION 'Message channel must match conversation' USING ERRCODE = '23514';
  END IF;
  IF NEW.reply_to_message_id IS NOT NULL AND (NEW.reply_to_message_id = NEW.id OR NOT EXISTS (
    SELECT 1 FROM messages m WHERE m.id = NEW.reply_to_message_id AND m.conversation_id = NEW.conversation_id)) THEN
    RAISE EXCEPTION 'Reply must reference another message in the same conversation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER messages_integrity BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION whatsapp_message_guard();
--> statement-breakpoint
CREATE FUNCTION whatsapp_acquisition_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Canonical user ID is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.acquisition_initialized_at IS NOT NULL AND ROW(NEW.acquisition_origin, NEW.acquisition_ref,
      NEW.acquisition_initialized_at, NEW.acquisition_message_id) IS DISTINCT FROM ROW(OLD.acquisition_origin,
      OLD.acquisition_ref, OLD.acquisition_initialized_at, OLD.acquisition_message_id) THEN
      RAISE EXCEPTION 'Initialized acquisition is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.acquisition_origin = 'whatsapp_first_message' AND NOT EXISTS (
    SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
    JOIN whatsapp_identities i ON i.id = c.whatsapp_identity_id
    WHERE m.id = NEW.acquisition_message_id AND m.direction = 'inbound' AND i.user_id = NEW.id) THEN
    RAISE EXCEPTION 'Acquisition must reference an owned incoming message' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_acquisition_integrity BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION whatsapp_acquisition_guard();
--> statement-breakpoint
CREATE FUNCTION whatsapp_outbound_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.message_id, NEW.channel_id, NEW.chunk_index, NEW.operation_key, NEW.payload)
      IS DISTINCT FROM ROW(OLD.id, OLD.message_id, OLD.channel_id, OLD.chunk_index, OLD.operation_key, OLD.payload) THEN
      RAISE EXCEPTION 'Outbound send unit identity and payload are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id THEN
      RAISE EXCEPTION 'Submitted provider message ID is immutable' USING ERRCODE = '23514';
    END IF;
    IF (OLD.delivery_status = 'read' AND NEW.delivery_status <> 'read')
      OR (OLD.delivery_status = 'delivered' AND NEW.delivery_status NOT IN ('delivered', 'read'))
      OR (OLD.delivery_status = 'sent' AND NEW.delivery_status = 'none') THEN
      RAISE EXCEPTION 'Delivery state cannot regress' USING ERRCODE = '23514';
    END IF;
    IF (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
      OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
      RAISE EXCEPTION 'Delivery milestones are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = NEW.message_id
    AND m.direction = 'outbound' AND m.channel_id = NEW.channel_id) THEN
    RAISE EXCEPTION 'Send unit must reference an outgoing message on its channel' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER outbound_deliveries_integrity BEFORE INSERT OR UPDATE ON outbound_deliveries
FOR EACH ROW EXECUTE FUNCTION whatsapp_outbound_guard();
--> statement-breakpoint
CREATE FUNCTION whatsapp_delivery_event_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.channel_id, NEW.provider_message_id, NEW.deduplication_key, NEW.status,
      NEW.provider_timestamp, NEW.error_code, NEW.received_at) IS DISTINCT FROM ROW(OLD.id,
      OLD.channel_id, OLD.provider_message_id, OLD.deduplication_key, OLD.status,
      OLD.provider_timestamp, OLD.error_code, OLD.received_at)
      OR (OLD.outbound_delivery_id IS NOT NULL AND NEW.outbound_delivery_id IS DISTINCT FROM OLD.outbound_delivery_id) THEN
      RAISE EXCEPTION 'Callback evidence is immutable except for initial reconciliation' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.outbound_delivery_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM outbound_deliveries d
    WHERE d.id = NEW.outbound_delivery_id AND d.channel_id = NEW.channel_id
    AND d.provider_message_id = NEW.provider_message_id) THEN
    RAISE EXCEPTION 'Callback must match the send channel and provider message ID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER delivery_events_integrity BEFORE INSERT OR UPDATE ON delivery_events
FOR EACH ROW EXECUTE FUNCTION whatsapp_delivery_event_guard();