import { withDatabase } from "@video-editor-agent/db";
import type { Env } from "../env.ts";
import { acceptEvents, ChannelRejected } from "../messaging/accept-events.ts";
import { InvalidWebhook, normalizeWebhook, type NormalizedEvent } from "../whatsapp/normalize.ts";
import { verifySignature } from "../whatsapp/signature.ts";

const MAX_BODY_BYTES = 256 * 1024;
export class BodyTooLarge extends Error {}
export async function readBoundedBody(request: Request, limit = MAX_BODY_BYTES): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit) throw new BodyTooLarge("Body too large");
  if (!request.body) throw new InvalidWebhook("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new BodyTooLarge("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function handleWebhook(request: Request, env: Env,
  persist: (events: NormalizedEvent[]) => Promise<void> = events => withDatabase(env.DATABASE_URL, db => acceptEvents(db, events)),
): Promise<Response> {
  if (!env.WHATSAPP_APP_SECRET) return new Response("Service unavailable", { status: 503 });
  try {
    const body = await readBoundedBody(request);
    if (!await verifySignature(body, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)) {
      return new Response("Invalid signature", { status: 401 });
    }
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
    catch { throw new InvalidWebhook("Invalid JSON"); }
    await persist(normalizeWebhook(payload));
    return new Response("EVENT_RECEIVED");
  } catch (error) {
    if (error instanceof BodyTooLarge) return new Response("Payload too large", { status: 413 });
    if (error instanceof InvalidWebhook) return new Response("Invalid webhook", { status: 400 });
    if (error instanceof ChannelRejected) return new Response("Channel rejected", { status: 403 });
    // Never log bodies, phone numbers, driver errors or credentials.
    console.error("whatsapp.accept_failed");
    return new Response("Persistence unavailable", { status: 503 });
  }
}

export function verifyWebhook(url: URL, token: string): Response {
  const params = url.searchParams;
  if (!token || params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== token) {
    return new Response("Verification rejected", { status: 403 });
  }
  const challenge = params.get("hub.challenge");
  return challenge && challenge.length <= 1024 ? new Response(challenge) : new Response("Missing challenge", { status: 400 });
}
