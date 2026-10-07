import assert from "node:assert/strict";
import test from "node:test";
import { agentReadiness, callAgent, responderEnabled } from "../src/agent/agent-client.ts";
import type { Env } from "../src/env.ts";

const base = { AGENT_ENABLED: "true" } as Env;
const input = { message: "Hi", history: [] };
const binding = (fetch: (request: Request) => Promise<Response>): Fetcher => ({
  fetch: async (url: string, init: RequestInit) => fetch(new Request(url, init)),
}) as unknown as Fetcher;

test("agent service binding sends normalized context without a service token", async () => {
  const env = { ...base, AGENT: binding(async request => {
    assert.equal(request.url, "https://agent/respond");
    assert.equal(request.headers.get("Authorization"), null);
    assert.deepEqual(await request.json(), input);
    return Response.json({ text: " Hello! ", version: "milo-whatsapp-v1", usage: {}, toolOutcomes: [] });
  }) };
  assert.deepEqual(await callAgent(env, input), { text: "Hello!", version: "milo-whatsapp-v1" });
  assert.equal(responderEnabled(env), true);
  assert.equal(responderEnabled({ ...env, AGENT_ENABLED: "false" }), false);
});

test("simulator readiness distinguishes missing provider configuration and unavailable bindings", async () => {
  assert.equal(await agentReadiness({ ...base, AGENT_ENABLED: "false" }), "disabled");
  assert.equal(await agentReadiness(base), "unavailable");
  assert.equal(await agentReadiness({ ...base, AGENT: binding(async request => {
    assert.equal(request.url, "https://agent/health");
    return Response.json({ configured: true });
  }) }), "ready");
  assert.equal(await agentReadiness({ ...base, AGENT: binding(async () => Response.json({ configured: false }, { status: 503 })) }), "not_configured");
  assert.equal(await agentReadiness({ ...base, AGENT: binding(async () => { throw new Error("disconnected"); }) }), "unavailable");
});

test("agent client rejects missing config and invalid replies without exposing provider data", async () => {
  await assert.rejects(callAgent(base, input), /not configured/);
  for (const response of [
    new Response("private provider diagnostic", { status: 502 }),
    Response.json({ text: "", version: "v1" }),
    Response.json({ text: "x".repeat(4001), version: "v1" }),
    Response.json({ text: "Hello" }),
  ]) {
    await assert.rejects(callAgent({ ...base, AGENT: binding(async () => response) }, input),
      error => error instanceof Error && !error.message.includes("private") && /Agent request failed|Invalid agent reply/.test(error.message));
  }
});
