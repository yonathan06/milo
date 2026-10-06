import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readResultsPage } from '../web/server/results-page-store.ts';
import { resultsPageSchema, paginateResults } from '../web/results-page.ts';
import { linkFingerprint, rankingModel, rankingRubric } from '../src/link-ranking.ts';

test('Jev scores sort globally, preserve zero, exclude outdated/failed rankings, and tolerate older schemas', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
    db.function('has_enrichment_data', (_value) => 0);
    for (let id = 1; id <= 30; id++) {
      const link = { id, url: `https://example.com/${id}`, title: `Result ${id}`, description: '' };
      db.prepare('INSERT INTO search_results(id,url,title,description) VALUES(?,?,?,?)').run(id, link.url, link.title, link.description);
      if (id === 30) continue;
      db.prepare(`INSERT INTO search_result_link_rankings(result_id,status,score,confidence,model_id,rubric_version,input_fingerprint)
        VALUES(?,?,?,?,?,?,?)`).run(id, id === 28 ? 'failed' : 'complete', (id - 1) * 3, 0.8, rankingModel, rankingRubric,
          id === 29 ? 'old-fingerprint' : linkFingerprint(link));
    }
    const descending = readResultsPage(db, resultsPageSchema.parse({ sort: 'jev' }));
    assert.equal(descending.results[0].id, 27);
    assert.equal(descending.results[0].jev_confidence, 0.8);
    const second = readResultsPage(db, resultsPageSchema.parse({ sort: 'jev', page: 2 }));
    assert.deepEqual(second.results.map((r) => r.id), [2, 1, 30, 29, 28]);
    assert.equal(second.results[1].jev_score, 0);
    assert.equal(second.results[2].jev_score, undefined);
    const ascending = readResultsPage(db, resultsPageSchema.parse({ sort: 'jev', descending: false, pageSize: 100 }));
    assert.equal(ascending.results[0].id, 1);
    assert.deepEqual(ascending.results.slice(-3).map((r) => r.id), [30, 29, 28]);
    assert.deepEqual(paginateResults(ascending.results, resultsPageSchema.parse({ sort: 'jev', page: 2 })), second);
    for (const filters of [
      { jevMin: 30, jevMax: 60 }, { jevMin: 0, jevMax: 0 }, { jevMin: 78, jevMax: 78 },
      { ranking: 'ranked' }, { ranking: 'unranked' }, { ranking: 'unranked', jevMin: 1 },
      { enrichment: 'enriched' }, { enrichment: 'not_enriched', jevMax: 30 },
    ]) {
      const request = resultsPageSchema.parse({ ...filters, sort: 'jev', page: 2 });
      assert.deepEqual(readResultsPage(db, request), paginateResults(ascending.results, request));
    }
    assert.equal(readResultsPage(db, resultsPageSchema.parse({ jevMin: 30, jevMax: 60 })).matchedCount, 11);
    assert.equal(readResultsPage(db, resultsPageSchema.parse({ jevMax: 0 })).results[0].id, 1, 'zero is a valid score');
    assert.equal(readResultsPage(db, resultsPageSchema.parse({ ranking: 'unranked' })).matchedCount, 3, 'failed, outdated and missing scores are unranked');
    db.exec('DROP TABLE search_result_link_rankings');
    assert.equal(readResultsPage(db, resultsPageSchema.parse({ ranking: 'ranked' })).matchedCount, 0);
    assert.ok(readResultsPage(db, resultsPageSchema.parse({ sort: 'jev' })).results.every((r) => r.jev_score === undefined));
  } finally { db.close(); }
});

test('SQLite selects only the requested page with a fixed query count, including discovery filters', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
    db.function('has_enrichment_data', (_value) => { throw new Error('Unenriched results must not be projected'); });
    db.exec(`
      INSERT INTO marketing_segments (id, name) VALUES (1, 'Creators'), (2, 'Businesses');
      INSERT INTO marketing_segment_countries (id, marketing_segment_id, country_code) VALUES (1, 1, 'US'), (2, 2, 'DE');
      INSERT INTO marketing_segment_country_queries (id, marketing_segment_country_id, language, query, platform, rationale)
        VALUES (1, 1, 'en', 'video editors', 'web', 'test'), (2, 2, 'de', 'business groups', 'web', 'test');
      WITH RECURSIVE ids(id) AS (VALUES(1) UNION ALL SELECT id + 1 FROM ids WHERE id < 5000)
        INSERT INTO search_results (id, url, title, created_at) SELECT id, 'https://example.com/' || id, 'Community ' || id, '2026-01-01' FROM ids;
      INSERT INTO search_query_results (query_id, result_id, rank) SELECT 1, id, 1 FROM search_results WHERE id % 2 = 0;
      INSERT INTO search_query_results (query_id, result_id, rank) SELECT 2, id, 1 FROM search_results WHERE id % 3 = 0;
    `);
    const prepare = db.prepare.bind(db);
    const queries: string[] = [];
    db.prepare = (sql) => { queries.push(sql); return prepare(sql); };
    const first = readResultsPage(db, resultsPageSchema.parse({}));
    assert.equal(first.totalCount, 5000);
    assert.equal(first.pendingCount, 5000);
    assert.equal(first.pageCount, 200);
    assert.deepEqual(first.results.map((result) => result.id), Array.from({ length: 25 }, (_, i) => 5000 - i));
    assert.ok(queries.length < 12, 'projection query count must not scale with result count');
    assert.ok(queries.some((sql) => sql.includes('LIMIT ? OFFSET ?')), 'page selection belongs in SQLite');
    const second = readResultsPage(db, resultsPageSchema.parse({ page: 2 }));
    assert.equal(second.results[0].id, 4975);
    const sorted = readResultsPage(db, resultsPageSchema.parse({ sort: 'result', descending: false, page: 2 }));
    assert.equal(sorted.results[0].id, 26);
    const filtered = readResultsPage(db, resultsPageSchema.parse({ countries: ['US'], segments: [2] }));
    assert.equal(filtered.matchedCount, 0, 'country and segment must match the same discovery');
    const matched = readResultsPage(db, resultsPageSchema.parse({ search: 'VIDEO', countries: ['US'], segments: [1] }));
    assert.equal(matched.matchedCount, 2500);
    assert.equal(matched.results.length, 25);
    assert.equal(matched.pendingCount, 5000, 'global enrichment counts ignore filters');
    assert.deepEqual(matched.countries, ['DE', 'US']);
    assert.equal(readResultsPage(db, resultsPageSchema.parse({ search: '%' })).matchedCount, 0, 'search is literal, not a LIKE pattern');
  } finally { db.close(); }
});
