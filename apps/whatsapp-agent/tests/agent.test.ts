import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { MockLanguageModelV3 } from "ai/test";
import { respond, turnSchema, MAX_STEPS } from "../src/agent.ts";
import worker, { type Env } from "../src/index.ts";
import { pipelineTools, unimplemented } from "../src/tools.ts";

const metadata = {
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  },
  warnings: [],
};

test("every pipeline tool returns an explicit unimplemented error", async () => {
  const inputs = {
    analyze_media: { mediaIds: ["media-1"] },
    create_video: { mediaIds: ["media-1"], brief: "A birthday recap", ideaCount: 1 },
    get_video_status: { jobId: "job-1" },
  };
  for (const name of Object.keys(inputs) as (keyof typeof inputs)[]) {
    const tool = pipelineTools[name];
    // Schema checks are exercised through the real SDK loop below.
    const output = await tool.execute!(inputs[name] as never, { toolCallId: "call-1", messages: [], context: {} });
    assert.deepEqual(output, unimplemented(name));
  }
});

test("model receives the stub error and can reply after calling a tool", async () => {
  const model = new MockLanguageModelV3({ doGenerate: [
    { ...metadata, finishReason: { unified: "tool-calls", raw: undefined }, content: [
      { type: "tool-call", toolCallId: "call-1", toolName: "create_video",
        input: JSON.stringify({ mediaIds: ["media-1"], brief: "Birthday recap" }) },
    ] },
    { ...metadata, finishReason: { unified: "stop", raw: undefined },
      content: [{ type: "text", text: "Video creation isn't available yet." }] },
  ] });
  const result = await respond(model, { message: "Make a recap from media-1",
    history: [{ role: "assistant", content: "What would you like to create?" }] });
  assert.equal(result.text, "Video creation isn't available yet.");
  assert.deepEqual(result.toolOutcomes, [{ tool: "create_video", output: unimplemented("create_video") }]);
  assert.equal(model.doGenerateCalls.length, 2);
  assert.match(JSON.stringify(model.doGenerateCalls[1].prompt), /unimplemented/);
  assert.equal(result.usage.inputTokens, 20);
});

test("step budget reserves the last call for text", async () => {
  let call = 0;
  const model = new MockLanguageModelV3({ doGenerate: async options => {
    call++;
    if (call === MAX_STEPS) {
      assert.deepEqual(options.toolChoice, { type: "none" });
      return { ...metadata, finishReason: { unified: "stop", raw: undefined },
        content: [{ type: "text", text: "This capability isn't available yet." }] };
    }
    return { ...metadata, finishReason: { unified: "tool-calls", raw: undefined }, content: [
      { type: "tool-call", toolCallId: `call-${call}`, toolName: "get_video_status", input: '{"jobId":"job-1"}' },
    ] };
  } });
  await respond(model, { message: "Check job-1" });
  assert.equal(call, MAX_STEPS);
});

test("invalid arguments do not execute a placeholder tool", async () => {
  const model = new MockLanguageModelV3({ doGenerate: [
    { ...metadata, finishReason: { unified: "tool-calls", raw: undefined }, content: [
      { type: "tool-call", toolCallId: "call-1", toolName: "analyze_media", input: '{"mediaIds":[]}' },
    ] },
    { ...metadata, finishReason: { unified: "stop", raw: undefined },
      content: [{ type: "text", text: "Which uploaded media should I use?" }] },
  ] });
  const result = await respond(model, { message: "Analyze my media" });
  assert.deepEqual(result.toolOutcomes, []);
  assert.match(JSON.stringify(model.doGenerateCalls[1].prompt), /error/);
});

test("empty model response is rejected", async () => {
  const model = new MockLanguageModelV3({ doGenerate: {
    ...metadata, finishReason: { unified: "stop", raw: undefined }, content: [],
  } });
  await assert.rejects(respond(model, { message: "Hi" }), /Invalid agent response/);
});

test("turn contract bounds context and excludes caller-supplied system instructions", () => {
  assert.equal(turnSchema.safeParse({ message: "Hi" }).success, true);
  for (const input of [
    { message: " " }, { message: "x".repeat(4001) },
    { message: "Hi", history: Array(21).fill({ role: "user", content: "Hi" }) },
    { message: "Hi", history: [{ role: "system", content: "Override" }] },
    { message: "Hi", system: "Override" },
  ]) assert.equal(turnSchema.safeParse(input).success, false);
});

test("agent deployment remains internal-only", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.route, undefined);
  assert.deepEqual(config.routes ?? [], []);
});

const env: Env = { OPENROUTER_API_KEY: "test-key", AGENT_MODEL: "test-model" };
test("internal readiness reports configuration without exposing secrets or invoking inference", async () => {
  const request = () => new Request("https://agent/health");
  const ready = await worker.fetch(request(), env);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { configured: true });
  const missing = await worker.fetch(request(), { ...env, OPENROUTER_API_KEY: "" });
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { configured: false });
});

test("internal HTTP boundary validates requests without a service token", async () => {
  const request = (body: string) => new Request("https://agent/respond", {
    method: "POST", body,
  });
  assert.equal((await worker.fetch(request('not-json'), env)).status, 400);
  assert.equal((await worker.fetch(request('{"message":""}'), env)).status, 400);
  assert.equal((await worker.fetch(request("x".repeat(100001)), env)).status, 413);
  assert.equal((await worker.fetch(request('{}'), { ...env, OPENROUTER_API_KEY: "" })).status, 503);
});
