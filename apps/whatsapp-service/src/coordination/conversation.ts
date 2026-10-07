import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.ts";
import type { DatabaseRunner } from "../service.ts";
import { processConversation } from "../agent/process-conversation.ts";
import { processAgentConversation } from "../agent/process-agent-conversation.ts";
import { callAgent, responderEnabled } from "../agent/agent-client.ts";
import { loadConversationState } from "../agent/conversation-state.ts";

// Work references and wakeups only; canonical history/runs remain in PostgreSQL.
export function createConversationCoordinator(withDatabase: DatabaseRunner, runtimeEnv: (env: Env) => Env = env => env) {
  return class extends DurableObject<Env> {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/events") {
        // This debug channel is only enabled by the local simulator config.
        if (this.env.SIMULATOR_EVENTS_ENABLED !== "true") return new Response("Not found", { status: 404 });
        if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
          return new Response("WebSocket required", { status: 426 });
        }
        const conversationId = url.searchParams.get("conversationId");
        if (!conversationId || conversationId.length > 256) return new Response("Invalid conversation", { status: 400 });
        await this.ctx.blockConcurrencyWhile(async () => {
          const existing = await this.ctx.storage.get<string>("conversationId");
          if (existing && existing !== conversationId) throw new Error("Coordinator identity mismatch");
          await this.ctx.storage.put("conversationId", conversationId);
        });
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        // Catch up from canonical state so completion before subscription isn't lost.
        try {
          const state = await withDatabase(runtimeEnv(this.env).DATABASE_URL, db => loadConversationState(db, conversationId));
          pair[1].send(JSON.stringify({ type: "state", state }, (_, value) => typeof value === "bigint" ? value.toString() : value));
        } catch {
          pair[1].close(1011, "Could not load conversation");
        }
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      if (!responderEnabled(this.env)) return new Response("Responder disabled", { status: 409 });
      const input = await request.json() as { conversationId?: unknown };
      if (typeof input.conversationId !== "string" || !input.conversationId.length || input.conversationId.length > 256) return new Response("Invalid conversation", { status: 400 });
      await this.ctx.blockConcurrencyWhile(async () => {
        const existing = await this.ctx.storage.get<string>("conversationId");
        if (existing && existing !== input.conversationId) throw new Error("Coordinator identity mismatch");
        const generation = await this.ctx.storage.get<number>("generation") ?? 0;
        await this.ctx.storage.put({ conversationId: input.conversationId, generation: generation + 1 });
        await this.ctx.storage.setAlarm(Date.now() + 10);
      });
      return new Response("Scheduled", { status: 202 });
    }

    webSocketMessage(socket: WebSocket): void {
      // Read-only notifications; clients cannot submit work through this channel.
      socket.close(1008, "Read-only channel");
    }

    webSocketClose(socket: WebSocket, code: number, reason: string): void {
      socket.close(code, reason);
    }

    async publishState(conversationId: string): Promise<void> {
      const sockets = this.ctx.getWebSockets();
      if (!sockets.length) return;
      try {
        const state = await withDatabase(runtimeEnv(this.env).DATABASE_URL, db => loadConversationState(db, conversationId));
        const payload = JSON.stringify({ type: "state", state }, (_, value) => typeof value === "bigint" ? value.toString() : value);
        for (const socket of sockets) {
          try { socket.send(payload); } catch { /* Disconnected clients can use Refresh. */ }
        }
      } catch {
        console.error("whatsapp.simulator_notification_failed");
      }
    }

    async alarm(): Promise<void> {
      if (!responderEnabled(this.env)) return;
      const conversationId = await this.ctx.storage.get<string>("conversationId");
      if (!conversationId) return;
      const generation = await this.ctx.storage.get<number>("generation") ?? 0;
      // Arm recovery before doing work. Failed/terminated attempts can repeat safely.
      await this.ctx.storage.setAlarm(Date.now() + 65_000);
      const env = runtimeEnv(this.env);
      const retryAfterMs = await withDatabase(env.DATABASE_URL, async db => {
        if (env.AGENT_ENABLED === "true") {
          const outcome = await processAgentConversation(db, conversationId, input => callAgent(env, input));
          return outcome.retryAfterMs;
        }
        const processed = await processConversation(db, conversationId);
        return processed === 25 ? 10 : null;
      });
      await this.ctx.blockConcurrencyWhile(async () => {
        const latest = await this.ctx.storage.get<number>("generation") ?? 0;
        if (latest !== generation || retryAfterMs !== null) await this.ctx.storage.setAlarm(Date.now() + (retryAfterMs ?? 10));
        else await this.ctx.storage.deleteAlarm();
      });
      // Push only after canonical work has committed; no interval polling.
      if (this.env.SIMULATOR_EVENTS_ENABLED === "true") await this.publishState(conversationId);
    }
  };
}
