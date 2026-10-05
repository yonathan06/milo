import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBulkPlanningService } from '../web/server/bulk-planning.ts';
import type { PlanningJob } from '../web/planning.ts';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function completed(segmentId: number, failed = false): PlanningJob {
  return {
    id: String(segmentId), segmentId, status: 'complete', queriesPerLanguage: 20,
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    countries: [{ countryId: segmentId, countryCode: 'US', languages: ['en'], status: failed ? 'failed' : 'complete', savedCount: failed ? 0 : 20, error: failed ? 'Provider failed' : null }],
  };
}

test('bulk planning selects only zero-query segments and continues after failures', async () => {
  const started: number[] = [];
  const service = createBulkPlanningService({
    candidates: () => [1, 2, 3, 4, 5].map((id) => ({ id, name: `Segment ${id}`, query_count: id === 2 ? 10 : 0 })),
    request: (segmentId) => segmentId === 3 ? null : { segmentId, countryIds: segmentId === 4 ? [] : [segmentId], queriesPerLanguage: 20 },
    hasCapacity: () => true,
    start: ({ segmentId }) => { started.push(segmentId); return { job: completed(segmentId, segmentId === 1), error: null }; },
    status: () => null,
  });
  const result = service.start();
  assert.equal(result.error, null);
  await tick();
  assert.deepEqual(started, [1, 5]);
  assert.deepEqual(service.getStatus()?.segments.map((segment) => segment.status), ['failed', 'skipped', 'failed', 'complete']);
  assert.equal(service.getStatus()?.segments[3].savedCount, 20);
  assert.match(service.getStatus()?.segments[0].error ?? '', /US: Provider failed/);
  assert.match(service.getStatus()?.segments[2].error ?? '', /No countries/);
  assert.equal(service.getStatus()?.status, 'complete');
});

test('bulk queue waits for capacity, rejects duplicates, polls progress and runs sequentially', async () => {
  let capacity = false;
  let active: PlanningJob | null = null;
  let release!: () => void;
  const started: number[] = [];
  const service = createBulkPlanningService({
    candidates: () => [1, 2].map((id) => ({ id, name: String(id), query_count: 0 })),
    request: (segmentId) => ({ segmentId, countryIds: [segmentId], queriesPerLanguage: 20 }),
    hasCapacity: () => capacity,
    start: ({ segmentId }) => {
      started.push(segmentId);
      active = { ...completed(segmentId), status: 'running', finishedAt: null };
      return { job: active, error: null };
    },
    status: (segmentId) => active?.segmentId === segmentId ? active : null,
    wait: () => new Promise<void>((resolve) => { release = resolve; }),
  });
  service.start();
  assert.match(service.start().error ?? '', /already running/);
  assert.deepEqual(started, []);
  capacity = true; release(); await tick();
  assert.deepEqual(started, [1]);
  active = completed(1); release(); await tick();
  assert.deepEqual(started, [1, 2]);
  active = completed(2); release(); await tick();
  assert.equal(service.getStatus()?.status, 'complete');
  const copy = service.getStatus()!; copy.segments[0].savedCount = -1;
  assert.equal(service.getStatus()?.segments[0].savedCount, 20);
});

test('empty batches do not start jobs', () => {
  const service = createBulkPlanningService({
    candidates: () => [{ id: 1, name: 'Existing', query_count: 1 }],
    request: () => { throw new Error('must not read requests'); },
    hasCapacity: () => true,
    start: () => { throw new Error('must not start jobs'); },
    status: () => null,
  });
  assert.match(service.start().error ?? '', /already have queries/);
  assert.equal(service.getStatus(), null);
});
