export class InvalidWebhook extends Error {}
export interface ChannelReference { businessAccountId: string; phoneNumberId: string }
export interface IncomingMessage extends ChannelReference {
  kind: "message";
  providerMessageId: string;
  sender: string;
  providerCreatedAt: Date;
  providerReplyToId: string | null;
  contentType: "text" | "unsupported";
  text: string | null;
  content: { version: 1; providerType: string };
}
export interface StatusEvent extends ChannelReference {
  kind: "status";
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  providerTimestamp: Date;
  errorCode: string | null;
}
export type NormalizedEvent = IncomingMessage | StatusEvent;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidWebhook("Expected object");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new InvalidWebhook("Invalid array");
  return value;
}
function string(value: unknown, max = 256): string {
  if (typeof value !== "string" || !value.length || value.length > max) throw new InvalidWebhook("Invalid string");
  return value;
}
function timestamp(value: unknown): Date {
  const raw = string(value, 16);
  if (!/^\d+$/.test(raw)) throw new InvalidWebhook("Invalid timestamp");
  const result = new Date(Number(raw) * 1000);
  if (!Number.isFinite(result.getTime()) || result.getTime() <= 0) throw new InvalidWebhook("Invalid timestamp");
  return result;
}

// Called only after raw-body authentication. Never retain raw envelopes/media URLs.
export function normalizeWebhook(payload: unknown): NormalizedEvent[] {
  const root = object(payload);
  if (root.object !== "whatsapp_business_account") throw new InvalidWebhook("Invalid object type");
  const events: NormalizedEvent[] = [];
  for (const entryValue of array(root.entry)) {
    const entry = object(entryValue);
    const businessAccountId = string(entry.id);
    for (const changeValue of array(entry.changes)) {
      const change = object(changeValue);
      if (change.field !== "messages") continue;
      const value = object(change.value);
      const channel = { businessAccountId, phoneNumberId: string(object(value.metadata).phone_number_id) };
      for (const raw of array(value.messages ?? [])) {
        const message = object(raw);
        const sender = string(message.from, 16);
        if (!/^[1-9][0-9]{1,14}$/.test(sender)) throw new InvalidWebhook("Invalid sender");
        const providerType = string(message.type, 64);
        events.push({
          ...channel, kind: "message", sender,
          providerMessageId: string(message.id), providerCreatedAt: timestamp(message.timestamp),
          providerReplyToId: message.context == null ? null : string(object(message.context).id),
          contentType: providerType === "text" ? "text" : "unsupported",
          text: providerType === "text" ? string(object(message.text).body, 16_384) : null,
          content: { version: 1, providerType },
        });
      }
      for (const raw of array(value.statuses ?? [])) {
        const status = object(raw);
        const state = string(status.status, 64);
        if (!["sent", "delivered", "read", "failed"].includes(state)) throw new InvalidWebhook("Unsupported status");
        // Keep every error code, sorted for stable callback identity; omit raw descriptions.
        const codes = array(status.errors ?? []).map(raw => {
          const code = object(raw).code;
          if (typeof code !== "number" || !Number.isSafeInteger(code) || code < 0) throw new InvalidWebhook("Invalid error code");
          return String(code);
        }).sort();
        events.push({ ...channel, kind: "status", providerMessageId: string(status.id),
          status: state as StatusEvent["status"], providerTimestamp: timestamp(status.timestamp),
          errorCode: codes.length ? [...new Set(codes)].join(",") : null });
      }
    }
  }
  if (events.length > 1000) throw new InvalidWebhook("Too many events");
  return events;
}
