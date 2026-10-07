import assert from "node:assert/strict";
import test from "node:test";
import { consumeProcessingBatch } from "../src/queues/processing.ts";
import { allowsSimulatorRequest } from "../src/http/local-access.ts";

test("local simulator allows changing tunnel hosts but not sibling origins or lookalike domains", () => {
  const request = (host: string, origin?: string) => new Request(`http://${host}/dev/send`, { headers: origin ? { origin } : {} });
  assert.equal(allowsSimulatorRequest(request("127.0.0.1"), false), true);
  assert.equal(allowsSimulatorRequest(request("new-tunnel.trycloudflare.com", "https://new-tunnel.trycloudflare.com"), true), true);
  assert.equal(allowsSimulatorRequest(request("new-tunnel.trycloudflare.com"), false), false);
  assert.equal(allowsSimulatorRequest(request("new-tunnel.trycloudflare.com", "https://other.trycloudflare.com"), true), false);
  assert.equal(allowsSimulatorRequest(request("trycloudflare.com.evil.test"), true), false);
  assert.equal(allowsSimulatorRequest(request("eviltrycloudflare.com"), true), false);
});

test("consumer acknowledges after durable handoff and isolates retries within a batch", async () => {
  const outcomes: string[] = [];
  const item = (id: string, body: unknown) => ({ body,
    ack: () => outcomes.push(`${id}:ack`), retry: () => outcomes.push(`${id}:retry`) });
  await consumeProcessingBatch({ messages: [
    item("invalid", { version: 2, messageId: "a" }),
    item("failed", { version: 1, messageId: "fail" }),
    item("good", { version: 1, messageId: "good" }),
  ] }, async job => {
    if (job.messageId === "fail") throw new Error("database failure");
    outcomes.push(`${job.messageId}:committed`);
  });
  assert.deepEqual(outcomes, ["invalid:retry", "failed:retry", "good:committed", "good:ack"]);
});
