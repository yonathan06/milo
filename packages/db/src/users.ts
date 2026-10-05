import type { Database } from "./connection.ts";
import type { LocalDatabase } from "./local.ts";
import { user } from "./schema/index.ts";

// Accept a database or transaction so ingestion can provision and accept a message atomically.
type UserWriter = Pick<Database, "insert"> | Pick<LocalDatabase, "insert">;

export function normalizeWhatsAppPhoneNumber(sender: string): string {
  // WhatsApp wa_id/from contains international digits without a leading +.
  // Do not guess a country code or silently strip punctuation.
  const phone = sender.startsWith("+") ? sender : `+${sender}`;
  if (!/^\+[1-9][0-9]{1,14}$/.test(phone)) {
    throw new Error("WhatsApp sender must be an international phone number");
  }
  return phone;
}

/**
 * SERVER ONLY: call only after verifying the raw webhook signature and resolving
 * its trusted WhatsApp business channel. Never accept a phone from a public body
 * as proof of ownership. Does not create sessions or link an existing web account.
 */
export async function provisionVerifiedWhatsAppUser(db: UserWriter, sender: string) {
  const phoneNumber = normalizeWhatsAppPhoneNumber(sender);
  const id = crypto.randomUUID();
  const [resolved] = await db.insert(user).values({
    id,
    name: "WhatsApp user",
    email: `${id}@whatsapp.invalid`,
    emailVerified: false,
    phoneNumber,
    phoneNumberVerified: true,
  }).onConflictDoUpdate({
    target: user.phoneNumber,
    // Preserve identity, real email, acquisition state and name on retries.
    set: { phoneNumberVerified: true },
  }).returning({
    id: user.id,
    phoneNumber: user.phoneNumber,
    phoneNumberVerified: user.phoneNumberVerified,
    email: user.email,
    emailVerified: user.emailVerified,
  });
  if (!resolved) throw new Error("WhatsApp user provisioning failed");
  return resolved;
}
