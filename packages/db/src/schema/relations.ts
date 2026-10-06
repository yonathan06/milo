import { relations } from "drizzle-orm";
import { user } from "./auth.ts";
import { conversation, message } from "./conversations.ts";
import { deliveryEvent, outboundDelivery } from "./delivery.ts";
import { whatsappChannel, whatsappIdentity } from "./whatsapp.ts";

export const userRelations = relations(user, ({ one, many }) => ({
  whatsappIdentities: many(whatsappIdentity),
  acquisitionMessage: one(message, {
    fields: [user.acquisitionMessageId], references: [message.id], relationName: "acquisition",
  }),
}));

export const whatsappChannelRelations = relations(whatsappChannel, ({ many }) => ({
  identities: many(whatsappIdentity),
  messages: many(message),
  outboundDeliveries: many(outboundDelivery),
  deliveryEvents: many(deliveryEvent),
}));

export const whatsappIdentityRelations = relations(whatsappIdentity, ({ one }) => ({
  user: one(user, { fields: [whatsappIdentity.userId], references: [user.id] }),
  channel: one(whatsappChannel, { fields: [whatsappIdentity.channelId], references: [whatsappChannel.id] }),
  conversation: one(conversation),
}));

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  identity: one(whatsappIdentity, { fields: [conversation.whatsappIdentityId], references: [whatsappIdentity.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  conversation: one(conversation, { fields: [message.conversationId], references: [conversation.id] }),
  channel: one(whatsappChannel, { fields: [message.channelId], references: [whatsappChannel.id] }),
  replyTo: one(message, { fields: [message.replyToMessageId], references: [message.id], relationName: "replies" }),
  replies: many(message, { relationName: "replies" }),
  acquiredUsers: many(user, { relationName: "acquisition" }),
  outboundDeliveries: many(outboundDelivery),
}));

export const outboundDeliveryRelations = relations(outboundDelivery, ({ one, many }) => ({
  message: one(message, { fields: [outboundDelivery.messageId], references: [message.id] }),
  channel: one(whatsappChannel, { fields: [outboundDelivery.channelId], references: [whatsappChannel.id] }),
  events: many(deliveryEvent),
}));

export const deliveryEventRelations = relations(deliveryEvent, ({ one }) => ({
  channel: one(whatsappChannel, { fields: [deliveryEvent.channelId], references: [whatsappChannel.id] }),
  delivery: one(outboundDelivery, { fields: [deliveryEvent.outboundDeliveryId], references: [outboundDelivery.id] }),
}));
