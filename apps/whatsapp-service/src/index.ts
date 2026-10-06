import { withDatabase } from "@video-editor-agent/db";
import type { Env } from "./env.ts";
import { handleWebhook, verifyWebhook } from "./http/webhook.ts";
import { dispatchProcessing } from "./outbox/dispatch.ts";
import { consumeProcessingBatch, enqueueAgentRun } from "./queues/processing.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return new Response("ok");
    if (url.pathname !== "/webhooks/whatsapp") return new Response("Not found", { status: 404 });
    if (request.method === "GET") return verifyWebhook(url, env.WHATSAPP_VERIFY_TOKEN);
    if (request.method === "POST") return handleWebhook(request, env);
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    await consumeProcessingBatch(batch, job => withDatabase(env.DATABASE_URL, db => enqueueAgentRun(db, job)));
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // Explicit staging opt-in while agent execution is not yet implemented.
    if (env.DISPATCH_ENABLED !== "true") return;
    try {
      await withDatabase(env.DATABASE_URL, db => dispatchProcessing(db, env.PROCESSING_QUEUE));
    } catch {
      console.error("whatsapp.outbox_dispatch_failed");
      throw new Error("Outbox dispatch failed");
    }
  },
} satisfies ExportedHandler<Env>;
