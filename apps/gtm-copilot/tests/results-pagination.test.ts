import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateResults, resultsPageSchema } from '../web/results-page.ts';
import type { AllResult } from '../web/server/store.ts';

const results: AllResult[] = Array.from({ length: 61 }, (_, index) => ({
  id: index + 1, url: `https://example.com/${index}`, title: `Community ${index + 1}`, description: '',
  created_at: '2026-01-01', enriched: index === 0, match_score: index === 0 ? 95 : null,
  discoveries: index === 60 ? [] : [{ query_id: index + 1, query: index === 0 ? 'video creators' : 'business', country_code: index % 2 ? 'DE' : 'US', language: 'en', rank: 1, collected_at: '2026-01-01', segment_id: index % 2 ? 2 : 1, segment_name: index % 2 ? 'Businesses' : 'Creators' }],
}));

test('server pagination bounds payloads and ranks globally before slicing', () => {
  const pages = [1, 2, 3].map((page) => paginateResults(results, resultsPageSchema.parse({ page })));
  assert.deepEqual(pages.map((page) => page.results.length), [25, 25, 11]);
  assert.equal(pages[0].results[0].id, 1);
  assert.equal(new Set(pages.flatMap((page) => page.results.map((result) => result.id))).size, 61);
  assert.equal(pages[0].totalCount, 61);
  assert.equal(pages[0].enrichedCount, 1);
  assert.equal(pages[0].pendingCount, 61);
  assert.equal(pages[0].pageCount, 3);
  assert.deepEqual(pages[2].countries, ['DE', 'US']);
  assert.deepEqual(pages[2].segments, [[2, 'Businesses'], [1, 'Creators']]);
  assert.equal(paginateResults(results, resultsPageSchema.parse({ page: 99 })).page, 3);
});

test('search and discovery filters apply across pages, not just visible rows', () => {
  const request = resultsPageSchema.parse({ search: ' VIDEO ', countries: ['US'], segments: [1] });
  const page = paginateResults(results, request);
  assert.equal(page.matchedCount, 1);
  assert.equal(page.results[0].id, 1);
  assert.equal(page.totalCount, 61);
  assert.equal(page.pendingCount, 61, 'bulk counts ignore filters');
  assert.equal(paginateResults(results, { ...request, countries: ['DE'] }).matchedCount, 0);
  const empty = paginateResults(results, { ...request, search: 'missing', page: 10 });
  assert.deepEqual(empty.results, []);
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.equal(paginateResults([], request).totalCount, 0);
});

test('column sorting is global and unlinked results remain visible', () => {
  const page = paginateResults(results, resultsPageSchema.parse({ sort: 'result', descending: false }));
  assert.deepEqual(page.results.slice(0, 3).map((result) => result.id), [1, 2, 3]);
  const last = paginateResults(results, resultsPageSchema.parse({ page: 3, sort: 'result', descending: false }));
  assert.equal(last.results.at(-1)?.id, 61);
});

test('page request rejects invalid or unbounded pagination', () => {
  for (const request of [{ page: 0 }, { page: -1 }, { page: 1.5 }, { pageSize: 10000 }, { pageSize: 0 }, { sort: 'invalid' }]) {
    assert.equal(resultsPageSchema.safeParse(request).success, false);
  }
  assert.equal(resultsPageSchema.parse({}).pageSize, 25);
});
