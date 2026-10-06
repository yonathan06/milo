import assert from "node:assert/strict";
import test from "node:test";
import { consumeProcessingBatch } from "../src/queues/processing.ts";

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
