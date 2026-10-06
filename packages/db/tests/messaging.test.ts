import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { conversation, deliveryEvent, message, outboundDelivery, whatsappChannel, whatsappIdentity } from "../src/schema/index.ts";

const indexes = (table: Parameters<typeof getTableConfig>[0]) => getTableConfig(table).indexes.map((value) => value.config.name);
const checks = (table: Parameters<typeof getTableConfig>[0]) => getTableConfig(table).checks.map((value) => value.name);

test("messaging identity has scoped uniqueness and no activity duplication", () => {
  assert.equal(whatsappChannel.providerPhoneNumberId.isUnique, true);
  assert.ok(indexes(whatsappIdentity).includes("whatsapp_identities_channel_sender_idx"));
  assert.equal("lastSeenAt" in whatsappIdentity, false);
  assert.equal(conversation.whatsappIdentityId.isUnique, true);
  assert.equal("userId" in conversation, false);
  assert.equal("leaseOwner" in conversation, false);
});

test("history has independent ordering, provider deduplication, and explicit content", () => {
  assert.ok(indexes(message).includes("messages_conversation_sequence_idx"));
  assert.ok(indexes(message).includes("messages_channel_provider_idx"));
  assert.ok(checks(message).includes("messages_provider_id_direction"));
  assert.ok(checks(message).includes("messages_content_envelope"));
  assert.equal(message.content.notNull, true);
  assert.equal(message.text.notNull, false);
  assert.equal("processingStatus" in message, false);
});

test("outbound logical chunks and callback evidence have independent identities", () => {
  assert.equal(outboundDelivery.operationKey.isUnique, true);
  assert.ok(indexes(outboundDelivery).includes("outbound_deliveries_message_chunk_idx"));
  assert.ok(checks(outboundDelivery).includes("outbound_deliveries_accepted_provider_id"));
  assert.equal(deliveryEvent.deduplicationKey.isUnique, true);
  assert.equal(deliveryEvent.outboundDeliveryId.notNull, false);
  assert.ok(indexes(deliveryEvent).includes("delivery_events_channel_provider_idx"));
});
