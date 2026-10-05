import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openReadStore, type AllResult } from '../web/server/store.ts';
import { matchesResult } from '../web/result-filters.ts';
import { audienceFitScore, enrichmentRequestSchema, rankingSortValue, rankingLabel } from '../web/enrichment.ts';

const result: AllResult = {
  id: 1, url: 'https://example.com', title: 'Community', description: 'Public forum', created_at: '2026-01-01',
  discoveries: [
    { query_id: 1, query: 'video creators', country_code: 'US', language: 'en', rank: 1, collected_at: '2026-01-02', segment_id: 1, segment_name: 'Creators' },
    { query_id: 2, query: 'business groups', country_code: 'DE', language: 'de', rank: 2, collected_at: '2026-01-03', segment_id: 2, segment_name: 'Businesses' },
  ],
};

test('bulk enrichment accepts global or valid segment scope and ranks known audience fit', () => {
  assert.deepEqual(enrichmentRequestSchema.parse({}), {});
  assert.deepEqual(enrichmentRequestSchema.parse({ segmentId: 2 }), { segmentId: 2 });
  assert.deepEqual(enrichmentRequestSchema.parse({ resultId: 2 }), { resultId: 2 });
  assert.equal(enrichmentRequestSchema.safeParse({ resultId: -1 }).success, false);
  for (const segmentId of [0, -1, 1.5, '2', Infinity]) assert.equal(enrichmentRequestSchema.safeParse({ segmentId }).success, false);
  assert.deepEqual(['high', 'medium', 'low', 'unknown', null].map(audienceFitScore), [3, 2, 1, 0, 0]);
});

test('default ranking puts enriched unknown fit above pending results without inventing a score', () => {
  const results = [
    { id: 1, enriched: false, audience_fit: null },
    { id: 2, enriched: true, audience_fit: 'unknown' },
    { id: 3, enriched: true, audience_fit: 'low' },
    { id: 4, enriched: true, audience_fit: 'high' },
  ];
  results.sort((a, b) => rankingSortValue(b.audience_fit, b.enriched) - rankingSortValue(a.audience_fit, a.enriched));
  assert.deepEqual(results.map((result) => result.id), [4, 3, 2, 1]);
  assert.equal(rankingLabel('unknown', true), 'Enriched · fit unknown');
  assert.equal(rankingLabel(null, false), 'Not enriched');
  assert.equal(audienceFitScore('unknown'), 0);
});

test('country and segment filters match the same discovery', () => {
  assert.equal(matchesResult(result, { countries: ['DE'], segments: [1], search: '' }), false);
  assert.equal(matchesResult(result, { countries: ['DE'], segments: [2], search: '' }), true);
  assert.equal(matchesResult(result, { countries: ['US', 'DE'], segments: [1, 2], search: '' }), true);
});

test('independent filters and case-insensitive text search', () => {
  assert.equal(matchesResult(result, { countries: ['US'], segments: [], search: ' VIDEO ' }), true);
  assert.equal(matchesResult(result, { countries: [], segments: [2], search: 'PUBLIC' }), true);
  assert.equal(matchesResult(result, { countries: [], segments: [], search: 'missing' }), false);
});

test('unlinked saved results are visible only without discovery filters', () => {
  const unlinked = { ...result, discoveries: [] };
  assert.equal(matchesResult(unlinked, { countries: [], segments: [], search: '' }), true);
  assert.equal(matchesResult(unlinked, { countries: ['US'], segments: [], search: '' }), false);
  assert.equal(matchesResult(unlinked, { countries: [], segments: [1], search: '' }), false);
});

test('store returns one row per URL, all discovery associations, and unlinked results', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gtm-results-'));
  const path = join(directory, 'test.sqlite');
  try {
    const db = new DatabaseSync(path);
    try {
      db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
      db.exec(`
        INSERT INTO marketing_segments (id, name) VALUES (1, 'Creators'), (2, 'Businesses');
        INSERT INTO marketing_segment_countries (id, marketing_segment_id, country_code) VALUES (1, 1, 'US'), (2, 2, 'DE');
        INSERT INTO marketing_segment_country_queries (id, marketing_segment_country_id, language, query, platform, rationale)
          VALUES (1, 1, 'en', 'creators', 'web', 'test'), (2, 2, 'de', 'business', 'web', 'test');
        INSERT INTO search_results (id, url, title) VALUES (1, 'https://example.com', 'Shared'), (2, 'https://unlinked.example', 'Unlinked'), (3, 'https://empty.example', 'Empty extraction');
        INSERT INTO search_query_results (query_id, result_id, rank, collected_at)
          VALUES (1, 1, 1, '2026-01-01'), (2, 1, 2, '2026-01-02');
        INSERT INTO search_result_enrichments (result_id, platform, status, sources_json, data_json, limitations_json, verification_json)
          VALUES (1, 'web', 'partial', '[]', '{"communityName":{"value":"Shared","evidence":{"sourceUrl":"https://example.com","quote":"Shared"}}}', '[]', '{"assessment":{"audienceFit":{"rating":"high"}}}');
        INSERT INTO search_result_enrichments (result_id, platform, status, sources_json, limitations_json)
          VALUES (1, 'web', 'failed', '[]', '[]'), (2, 'web', 'blocked', '[]', '[]');
        INSERT INTO search_result_enrichments (result_id, platform, status, sources_json, data_json, limitations_json, verification_json)
          VALUES (3, 'web', 'partial', '[]', '{"communityName":null,"latestPosts":[],"limitations":["No sources"]}', '[]', '{"assessment":{"audienceFit":{"rating":"high"}}}');
      `);
    } finally { db.close(); }
    const store = openReadStore(path);
    try {
      const results = store.results();
      assert.equal(results.length, 3);
      assert.equal(Boolean(results.find((item) => item.id === 3)!.enriched), false, 'legacy empty partial attempts stay retryable');
      assert.equal(results.find((item) => item.id === 3)!.audience_fit, null);
      const shared = results.find((item) => item.id === 1)!;
      assert.deepEqual(shared.discoveries.map((item) => [item.country_code, item.segment_id]), [['DE', 2], ['US', 1]]);
      assert.equal(shared.discoveries[0].collected_at, '2026-01-02');
      assert.ok(shared.enriched, 'a later failure does not invalidate successful enrichment');
      assert.equal(shared.audience_fit, 'high');
      assert.equal(Boolean(results.find((item) => item.id === 2)!.enriched), false);
      assert.equal(store.segment(1)!.results[0].audience_fit, 'high');
      assert.ok(store.segment(1)!.results[0].enriched);
      assert.deepEqual(results.find((item) => item.id === 2)!.discoveries, []);
    } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
