import type { Env } from "../env.ts";

export interface AgentInput {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
}
export interface AgentReply { text: string; version: string }

export async function callAgent(env: Env, input: AgentInput): Promise<AgentReply> {
  if (!env.AGENT) throw new Error("Agent binding is not configured");
  const response = await env.AGENT.fetch("https://agent/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new Error("Agent request failed");
  const result = await response.json() as Partial<AgentReply>;
  if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 4000
    || typeof result.version !== "string" || !result.version.length || result.version.length > 128) {
    throw new Error("Invalid agent reply");
  }
  return { text: result.text.trim(), version: result.version };
}

export async function agentReadiness(env: Env): Promise<"ready" | "not_configured" | "unavailable" | "disabled"> {
  if (env.AGENT_ENABLED !== "true") return "disabled";
  if (!env.AGENT) return "unavailable";
  try {
    const response = await env.AGENT.fetch("https://agent/health", { signal: AbortSignal.timeout(2000) });
    const body = await response.json() as { configured?: unknown };
    if (response.ok && body.configured === true) return "ready";
    if (response.status === 503 && body.configured === false) return "not_configured";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export function responderEnabled(env: Env): boolean {
  return env.AGENT_ENABLED === "true" || env.TEST_RESPONDER_ENABLED === "true";
}
