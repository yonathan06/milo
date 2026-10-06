// Local-only entry point. Never referenced by the production Wrangler config.
import { withLocalDatabase, validateLocalDatabaseUrl } from "@video-editor-agent/db/local";
import { and, desc, eq, inArray } from "drizzle-orm";
import { agentRun, conversation, deliveryEvent, message, outboxIntent, whatsappChannel, whatsappIdentity } from "@video-editor-agent/db/schema";
import type { Env } from "./env.ts";
import { createService } from "./service.ts";
import { dispatchProcessing } from "./outbox/dispatch.ts";
import { BodyTooLarge, readBoundedBody } from "./http/webhook.ts";

interface LocalEnv extends Env { LOCAL_DATABASE_URL: string; SIMULATOR_PUBLIC_ORIGIN?: string; ASSETS: Fetcher }
const service = createService(withLocalDatabase);
const channelId = "local-whatsapp-channel";
const accountId = "local-business-account";
const phoneId = "local-business-phone";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v),
  { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function runtimeEnv(env: LocalEnv): Env {
  validateLocalDatabaseUrl(env.LOCAL_DATABASE_URL);
  return { ...env, DATABASE_URL: env.LOCAL_DATABASE_URL };
}

async function seed(env: Env) {
  await withLocalDatabase(env.DATABASE_URL, async db => {
    await db.insert(whatsappChannel).values({ id: channelId, businessAccountId: accountId, providerPhoneNumberId: phoneId })
      .onConflictDoNothing({ target: whatsappChannel.id });
  });
}

async function simulate(input: Record<string, unknown>, env: Env): Promise<Response> {
  const sender = input.sender;
  if (typeof sender !== "string" || !/^[1-9][0-9]{1,14}$/.test(sender)) return json({ error: "Use international digits, without +." }, 400);
  if (typeof input.text !== "string" || !input.text.length || input.text.length > 4096) return json({ error: "Text must be 1–4096 characters." }, 400);
  if (input.providerMessageId !== undefined && (typeof input.providerMessageId !== "string" || !input.providerMessageId.length || input.providerMessageId.length > 256)) return json({ error: "Invalid provider ID." }, 400);
  await seed(env);
  const providerMessageId = input.providerMessageId ?? `wamid.local.${crypto.randomUUID()}`;
  const payload = { object: "whatsapp_business_account", entry: [{ id: accountId, changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneId }, messages: [{ id: providerMessageId, from: sender,
      timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: input.text } }],
  } }] }] };
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WHATSAPP_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const response = await service.fetch(new Request("http://localhost/webhooks/whatsapp", {
    method: "POST", body, headers: { "x-hub-signature-256": `sha256=${input.invalidSignature === true ? "0".repeat(64) : signature}` },
  }), env);
  return json({ providerMessageId, webhookStatus: response.status, result: await response.text() }, response.status);
}

async function snapshot(sender: string, env: Env): Promise<Response> {
  if (!/^[1-9][0-9]{1,14}$/.test(sender)) return json({ error: "Invalid sender." }, 400);
  return withLocalDatabase(env.DATABASE_URL, async db => {
    const [chat] = await db.select({ id: conversation.id, nextSequence: conversation.nextSequence, status: conversation.status })
      .from(conversation).innerJoin(whatsappIdentity, eq(whatsappIdentity.id, conversation.whatsappIdentityId))
      .where(and(eq(whatsappIdentity.channelId, channelId), eq(whatsappIdentity.providerSenderId, sender)));
    const messages = chat ? await db.select().from(message).where(eq(message.conversationId, chat.id)).orderBy(desc(message.sequence)).limit(100) : [];
    const ids = messages.map(row => row.id);
    const intents = ids.length ? await db.select().from(outboxIntent).where(inArray(outboxIntent.messageId, ids)) : [];
    const runs = ids.length ? await db.select().from(agentRun).where(inArray(agentRun.incomingMessageId, ids)) : [];
    return json({ conversation: chat ?? null, messages: messages.reverse(), intents, runs,
      callbacks: await db.select().from(deliveryEvent).where(eq(deliveryEvent.channelId, channelId)).orderBy(desc(deliveryEvent.receivedAt)).limit(20) });
  });
}

export default {
  async fetch(request: Request, env: LocalEnv): Promise<Response> {
    const url = new URL(request.url);
    // Tunnel TLS terminates before the local Worker, so its URL may be HTTP while
    // the browser Origin is HTTPS. Explicit configuration handles that difference.
    const publicOrigin = env.SIMULATOR_PUBLIC_ORIGIN ? new URL(env.SIMULATOR_PUBLIC_ORIGIN).origin : null;
    const publicHost = publicOrigin ? new URL(publicOrigin).host : null;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.host !== publicHost) return new Response("Local only", { status: 403 });
    if (url.pathname.startsWith("/dev/")) {
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin && origin !== publicOrigin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Same-origin requests only." }, 403);
      try {
        const runtime = runtimeEnv(env);
        if (url.pathname === "/dev/state" && request.method === "GET") return await snapshot(url.searchParams.get("sender") ?? "", runtime);
        if (request.method !== "POST") return json({ error: "Not found" }, 404);
        if (url.pathname === "/dev/dispatch") return json({ published: await withLocalDatabase(runtime.DATABASE_URL, db => dispatchProcessing(db, runtime.PROCESSING_QUEUE)) });
        if (url.pathname === "/dev/send") {
          if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 400);
          const body = new TextDecoder().decode(await readBoundedBody(request, 8192));
          let input: unknown;
          try { input = JSON.parse(body); } catch { return json({ error: "Invalid JSON" }, 400); }
          if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid input" }, 400);
          return await simulate(input as Record<string, unknown>, runtime);
        }
        return json({ error: "Not found" }, 404);
      } catch (error) {
        if (error instanceof BodyTooLarge) return json({ error: "Request too large" }, 413);
        console.error("whatsapp.local_operation_failed");
        return json({ error: "Local operation failed. Check PostgreSQL, migrations and the Worker terminal." }, 503);
      }
    }
    if (url.pathname === "/health" || url.pathname === "/webhooks/whatsapp") return service.fetch(request, runtimeEnv(env));
    return env.ASSETS.fetch(request);
  },
  queue: (batch: MessageBatch<unknown>, env: LocalEnv) => service.queue(batch, runtimeEnv(env)),
  scheduled: (event: ScheduledController, env: LocalEnv) => service.scheduled(event, runtimeEnv(env)),
} satisfies ExportedHandler<LocalEnv>;
