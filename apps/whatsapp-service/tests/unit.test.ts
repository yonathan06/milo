import assert from "node:assert/strict";
import test from "node:test";
import { handleWebhook, verifyWebhook } from "../src/http/webhook.ts";
import { normalizeWebhook } from "../src/whatsapp/normalize.ts";
import { parseReferral } from "../src/referral/parse.ts";
import type { Env } from "../src/env.ts";

export const payload = (messages: unknown[], statuses: unknown[] = []) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "account", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "phone" }, messages, statuses,
  } }] }],
});
const incoming = { id: "wamid.test", from: "491234567890", timestamp: "1700000000", type: "text", text: { body: "Hi [ref: abc_123]" } };

async function signedRequest(body: string, secret: string): Promise<Request> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return new Request("https://example.test/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${hex}` } });
}

test("webhook authenticates raw bytes and acknowledges only successful persistence", async () => {
  const env = { WHATSAPP_APP_SECRET: "test-secret" } as Env;
  const body = JSON.stringify(payload([incoming]));
  let writes = 0;
  const persist = async () => { writes++; };
  assert.equal((await handleWebhook(new Request("https://example.test", { method: "POST", body }), env, persist)).status, 401);
  assert.equal(writes, 0);
  assert.equal((await handleWebhook(await signedRequest(body, env.WHATSAPP_APP_SECRET), env, persist)).status, 200);
  assert.equal(writes, 1);
  assert.equal((await handleWebhook(await signedRequest(body, env.WHATSAPP_APP_SECRET), env, async () => { throw new Error("DB unavailable"); })).status, 503);
  assert.equal((await handleWebhook(await signedRequest("{", env.WHATSAPP_APP_SECRET), env, persist)).status, 400);
  assert.equal((await handleWebhook(new Request("https://example.test", { method: "POST", body: "x".repeat(262_145) }), env, persist)).status, 413);
  const url = new URL("https://example.test?hub.mode=subscribe&hub.verify_token=token&hub.challenge=123");
  assert.equal(await verifyWebhook(url, "token").text(), "123");
  assert.equal(verifyWebhook(url, "wrong").status, 403);
});

test("normalization separates unsupported content and callbacks; referrals reject ambiguity", () => {
  const events = normalizeWebhook(payload([incoming, { ...incoming, id: "media", type: "image", image: { id: "private" } }],
    [{ id: "send", status: "failed", timestamp: "1700000001", errors: [{ code: 131000 }] }]));
  assert.equal(events.length, 3);
  assert.equal(events[1]?.kind, "message");
  if (events[1]?.kind === "message") { assert.equal(events[1].contentType, "unsupported"); assert.equal(events[1].text, null); }
  assert.equal(events[2]?.kind, "status");
  assert.equal(parseReferral(incoming.text.body), "abc_123");
  for (const text of [null, "[ref: bad code]", "[ref: a] [ref: b]", "[REF: a]", `[ref: ${"a".repeat(65)}]`]) assert.equal(parseReferral(text), null);
});
