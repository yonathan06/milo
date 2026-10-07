import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { matchesResultHost } from '../web/result-filters.ts';
import { resultsPageSchema, paginateResults } from '../web/results-page.ts';
import { parseResultsSearch } from '../web/results-search.ts';
import { enrichmentRequestSchema } from '../web/enrichment.ts';
import { readResultsPage, readFilteredEnrichmentResults } from '../web/server/results-page-store.ts';

test('host presets match domains and subdomains, not lookalikes or URL text', () => {
  for (const url of ['https://reddit.com/r/test', 'https://old.reddit.com/r/test', 'https://redd.it/abc']) {
    assert.equal(matchesResultHost(url, { host: 'reddit' }), true);
  }
  for (const url of ['https://notreddit.com', 'https://reddit.com.evil.com', 'https://example.com/reddit.com', 'https://reddit.com@example.com', 'invalid']) {
    assert.equal(matchesResultHost(url, { host: 'reddit' }), false);
  }
  for (const domain of ['x.com', 'twitter.com', 'mobile.twitter.com', 't.co']) {
    assert.equal(matchesResultHost(`https://${domain}/abc`, { host: 'x' }), true);
  }
  assert.equal(matchesResultHost('https://www.facebook.com/groups/a', { host: 'facebook' }), true);
  assert.equal(matchesResultHost('https://forum.example.com/a', { host: 'custom', customHost: 'WWW.EXAMPLE.COM' }), true);
  assert.equal(matchesResultHost('https://example.com', { host: 'custom', customHost: '' }), false);
});

test('host filters round-trip through URL parsing and bulk action validation', () => {
  assert.equal(parseResultsSearch({ host: 'reddit' }).host, 'reddit');
  assert.equal(parseResultsSearch({ host: 'invalid' }).host, 'all');
  assert.equal(parseResultsSearch({ host: 'custom', customHost: ' Example.COM ' }).customHost, 'example.com');
  assert.equal(parseResultsSearch({ customHost: 'https://example.com/path' }).customHost, '');
  assert.equal(enrichmentRequestSchema.parse({ mode: 'scrape', filters: { host: 'x' } }).filters?.host, 'x');
});

test('SQL host filtering matches pagination, counts and whole-scope bulk actions', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
    db.function('has_enrichment_data', (_value) => 0);
    for (let id = 1; id <= 60; id++) {
      const domain = id <= 30 ? 'old.reddit.com' : id <= 40 ? 'twitter.com' : id <= 50 ? 'forum.example.com' : 'reddit.com.evil.com';
      db.prepare('INSERT INTO search_results(id,url,title) VALUES(?,?,?)').run(id, `https://${domain}/${id}`, `Result ${id}`);
    }
    const all = readResultsPage(db, resultsPageSchema.parse({ pageSize: 100 })).results;
    for (const filter of [{ host: 'reddit' }, { host: 'x' }, { host: 'custom', customHost: 'example.com' }, { host: 'custom', customHost: '' }, { host: 'facebook' }]) {
      const request = resultsPageSchema.parse({ ...filter, page: 2 });
      const page = readResultsPage(db, request);
      assert.deepEqual(page, paginateResults(all, request));
      const scope = readFilteredEnrichmentResults(db, request);
      assert.equal(scope.length, page.matchedCount);
      assert.equal(page.matchedUnscrapedCount, scope.length);
      assert.equal(page.matchedPendingCount, scope.length);
      assert.ok(scope.every(r => matchesResultHost(all.find(item => item.id === r.id)!.url, request)));
    }
    const reddit = readResultsPage(db, resultsPageSchema.parse({ host: 'reddit', page: 2 }));
    assert.equal(reddit.matchedCount, 30);
    assert.equal(reddit.results.length, 5);
    assert.equal(readResultsPage(db, resultsPageSchema.parse({ host: 'reddit', search: 'Result 1' })).matchedCount, 11);
  } finally { db.close(); }
});
