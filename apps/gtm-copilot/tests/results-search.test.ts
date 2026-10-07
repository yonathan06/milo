import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResultsSearch, parseResultsSearch } from '../web/results-search.ts';

test('URL search restores filters, sorting and pagination from strings or JSON values', () => {
  const request = parseResultsSearch({ search: 'video editors', countries: ['US', 'CA'], segments: ['1', 2],
    jevMin: '70', jevMax: 90, ranking: 'ranked', enrichment: 'not_enriched',
    sort: 'jev', descending: 'false', page: '2', pageSize: '50' });
  assert.deepEqual(request, { search: 'video editors', host: 'all', customHost: '', countries: ['US', 'CA'], segments: [1, 2],
    jevMin: 70, jevMax: 90, ranking: 'ranked', enrichment: 'not_enriched',
    sort: 'jev', descending: false, page: 2, pageSize: 50 });
  assert.deepEqual(parseResultsSearch({ countries: 'US', segments: '3' }).countries, ['US']);
  assert.deepEqual(parseResultsSearch({ segments: '3' }).segments, [3]);
});

test('malformed URL values fall back independently and unknown fields are ignored', () => {
  assert.deepEqual(parseResultsSearch({}), defaultResultsSearch);
  assert.deepEqual(parseResultsSearch({ sort: 'bad', page: '-1', pageSize: '10', descending: 'bad',
    jevMin: 101, jevMax: -1, ranking: 'bad', enrichment: 'bad', countries: [false], segments: ['bad'], extra: true }), defaultResultsSearch);
  const request = parseResultsSearch({ jevMin: 90, jevMax: 20, search: 'keep this', sort: 'jev' });
  assert.equal(request.jevMin, 0);
  assert.equal(request.jevMax, 100);
  assert.equal(request.search, 'keep this');
  assert.equal(request.sort, 'jev');
});
