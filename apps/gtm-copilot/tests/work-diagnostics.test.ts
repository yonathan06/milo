import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosticStep, tokenUsage, type WorkDiagnostic } from '../src/work-diagnostics.ts';

test('diagnostic steps report start, waiting heartbeats, duration and completion metadata then stop', async () => {
  const events: WorkDiagnostic[] = [];
  const result = await diagnosticStep((event) => events.push(event), 'assessment.model', { model: 'test', attempt: 1 },
    async () => { await new Promise((resolve) => setTimeout(resolve, 30)); return { usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 } }; }, tokenUsage, 5);
  assert.equal(result.usage.totalTokens, 16);
  assert.equal(events[0].status, 'started');
  assert.ok(events.some((event) => event.status === 'waiting' && event.elapsedMs >= 0));
  assert.equal(events.at(-1)?.status, 'completed');
  assert.equal(events.at(-1)?.fields?.inputTokens, 12);
  assert.equal(events.at(-1)?.fields?.model, 'test');
  const count = events.length;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(events.length, count, 'heartbeat is cleared on completion');
});

test('diagnostic failures include the original cause and stop heartbeat timers', async () => {
  const events: WorkDiagnostic[] = [];
  const cause = new Error('provider timeout');
  await assert.rejects(diagnosticStep((event) => events.push(event), 'collection.primary', {}, async () => { throw cause; }, undefined, 5), cause);
  assert.deepEqual(events.map((event) => event.status), ['started', 'failed']);
  assert.equal(events[1].error, cause);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(events.length, 2);
});

test('diagnostic observers and formatters cannot break successful work', async () => {
  assert.equal(await diagnosticStep(() => { throw new Error('observer'); }, 'test', {}, async () => 42), 42);
  assert.equal(await diagnosticStep(() => {}, 'test', {}, async () => 42, () => { throw new Error('formatter'); }), 42);
  assert.equal(await diagnosticStep(undefined, 'test', {}, async () => 42), 42);
});
