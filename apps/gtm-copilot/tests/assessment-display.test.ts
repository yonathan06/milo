import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareMatchResults, matchLabel, permissionLabel } from '../web/assessment-display.ts';
import { createColumnHelper, createTable, createSortedRowModel, createPaginatedRowModel, rowSortingFeature, rowPaginationFeature, sortFn_basic, tableFeatures } from '@tanstack/solid-table';
import type { Result } from '../web/server/store.ts';

const result = (id: number, score: number | null, enriched = true): Result => ({ id, url: 'https://example.com', title: 'Test', description: '', created_at: '', enriched, match_score: score, assessment_status: score === null ? 'pending' : 'complete' });
test('match sorting preserves numeric zero and keeps unknown/pending last in both directions and pagination', () => {
  const values = [result(1, null, false), result(2, 0), result(3, 100), result(4, null), result(5, 50)];
  assert.deepEqual([...values].sort(compareMatchResults).map((item) => item.id), [3, 5, 2, 4, 1]);
  assert.deepEqual([...values].sort((a, b) => compareMatchResults(a, b, false)).map((item) => item.id), [2, 5, 3, 4, 1]);
  assert.deepEqual([...values].sort(compareMatchResults).slice(0, 2).map((item) => item.match_score), [100, 50]);
  assert.equal(matchLabel(result(2, 0)), '0/100');
  assert.equal(matchLabel({ ...result(4, null), assessment_status: 'complete' }), 'Enriched · match unknown');
});
test('actual table sorting and pagination keep unknown values after scored values in both directions', () => {
  const features = tableFeatures({ rowSortingFeature, rowPaginationFeature, sortedRowModel: createSortedRowModel(), paginatedRowModel: createPaginatedRowModel() });
  const helper = createColumnHelper<typeof features, Result>();
  const columns = helper.columns([helper.accessor((value) => value.match_score ?? undefined, { id: 'fit', sortFn: sortFn_basic, sortUndefined: 'last' })]);
  const data = [result(1, null, false), result(2, 0), result(3, 100), result(4, null), result(5, 50)].sort(compareMatchResults);
  for (const desc of [true, false]) {
    const table = createTable({ features, columns, data, initialState: { sorting: [{ id: 'fit', desc }], pagination: { pageIndex: 0, pageSize: 4 } } });
    assert.deepEqual(table.getRowModel().rows.map((row) => row.original.id), desc ? [3, 5, 2, 4] : [2, 5, 3, 4]);
  }
});

test('display distinguishes all permission and assessment states without implying approval', () => {
  assert.deepEqual(['allowed', 'approval_required', 'prohibited', 'unknown'].map(permissionLabel), ['Allowed · review required', 'Approval required', 'Prohibited', 'Unknown']);
  assert.equal(matchLabel(result(1, null, false)), 'Not enriched');
  assert.equal(matchLabel(result(1, null)), 'Assessment pending');
  assert.equal(matchLabel({ ...result(1, null), assessment_status: 'failed' }), 'Assessment failed');
  assert.equal(matchLabel({ ...result(1, null), assessment_status: 'stale' }), 'Stale · reassess');
});
