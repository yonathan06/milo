import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { respond, turnSchema } from "./agent.ts";

export interface Env {
  OPENROUTER_API_KEY: string;
  AGENT_MODEL: string;
}

const MAX_BODY_BYTES = 100_000;
async function readBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") {
      const configured = Boolean(env.OPENROUTER_API_KEY && env.AGENT_MODEL);
      return Response.json({ configured }, { status: configured ? 200 : 503 });
    }
    if (path !== "/respond") return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    // Internal-only Worker: access is controlled by the service binding, not a token.
    if (!env.OPENROUTER_API_KEY || !env.AGENT_MODEL) {
      return Response.json({ error: "Agent is not configured" }, { status: 503 });
    }
    let input;
    try {
      input = turnSchema.parse(JSON.parse(await readBody(request)));
    } catch (error) {
      return Response.json({ error: error instanceof RangeError ? "Request too large" : "Invalid turn" },
        { status: error instanceof RangeError ? 413 : 400 });
    }
    try {
      const provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
      return Response.json(await respond(provider(env.AGENT_MODEL), input, request.signal));
    } catch {
      // Never serialize provider exceptions: they can contain prompts or secrets.
      return Response.json({ error: "Agent turn failed" }, { status: 502 });
    }
  },
};
