import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketingDatabase } from '../src/database.ts';
import { openReadStore } from '../web/server/store.ts';
import { createBulkSearchService } from '../web/server/bulk-search.ts';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test('bulk search runs sequentially across segments, skips changed queries, and continues after failures', async () => {
  const started: number[] = [];
  let release!: () => void;
  const service = createBulkSearchService({
    candidates: () => [1, 2, 3].map((queryId) => ({ queryId, segmentId: queryId })),
    isBusy: () => false,
    run: async ({ queryId }) => {
      started.push(queryId);
      if (queryId === 1) { await new Promise<void>((resolve) => { release = resolve; }); return 0; }
      if (queryId === 2) throw new Error('provider failure');
      return null;
    },
  });
  assert.equal(service.start().error, null);
  assert.match(service.start().error!, /already running/);
  assert.deepEqual(started, [1]);
  release(); await tick();
  assert.deepEqual(started, [1, 2, 3]);
  assert.deepEqual(service.getStatus()?.queries.map((q) => q.status), ['complete', 'failed', 'skipped']);
  assert.equal(service.getStatus()?.status, 'complete');
  const copy = service.getStatus()!; copy.queries[0].resultCount = -1;
  assert.equal(service.getStatus()?.queries[0].resultCount, 0);
});

test('bulk search rejects concurrent segment searches and empty batches', () => {
  const deps = { candidates: () => [], run: async () => 0 };
  assert.match(createBulkSearchService({ ...deps, isBusy: () => true }).start().error!, /already running/);
  assert.match(createBulkSearchService({ ...deps, isBusy: () => false }).start().error!, /already been searched/);
});

test('search completion persists with zero results and unsearched counts span all segments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bulk-search-'));
  const path = join(dir, 'test.sqlite');
  const db = new MarketingDatabase(path);
  try {
    const ids = [1, 2].map((n) => {
      const segment = db.createSegment({ name: `Segment ${n}` });
      const country = db.addCountry(segment.id, 'US');
      return db.addQuery(country.id, 'en', { query: `query ${n}`, platform: 'web', rationale: 'test' }).id;
    });
    db.saveSearchResults(ids[0], []);
    assert.equal(db.hasQueryBeenSearched(ids[0]), true);
    assert.equal(db.hasQueryBeenSearched(ids[1]), false);
    const store = openReadStore(path);
    try {
      assert.deepEqual(store.segments().map((s) => s.unsearched_query_count), [0, 1]);
      assert.deepEqual(store.unsearchedQueries().map((q) => q.queryId), [ids[1]]);
    } finally { store.close(); }
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
