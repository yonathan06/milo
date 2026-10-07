import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { MarketingDatabase } from '../src/database.ts';
import { enrichSearchResult, enrichmentSchema } from '../src/community-enrichment.ts';
import { createEnrichmentService } from '../web/server/enrichment.ts';
import { resultsPageSchema } from '../web/results-page.ts';
import { openReadStore } from '../web/server/store.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-extraction-only-'));
  const path = join(dir, 'test.sqlite');
  const db = new MarketingDatabase(path);
  const sql = new DatabaseSync(path);
  for (let id = 1; id <= 3; id++) sql.prepare('INSERT INTO search_results(id,url,title) VALUES(?,?,?)').run(id, `https://reddit.com/r/test/comments/${id}/`, 'Community');
  const sources = [{ url: 'https://reddit.com/r/test/comments/1/', text: 'Event Professionals', fetchedAt: new Date().toISOString(), kind: 'posts' as const }];
  const data = enrichmentSchema.parse({ description: null, lastObservedActivity: null, memberCount: null, location: null, language: null, admins: [], publicContactRoutes: [], rulesAndPromotionPolicy: [], latestPosts: [], eventAndVideoSignals: [], outreachAngles: [], communityName: { value: 'Event Professionals', evidence: { sourceUrl: sources[0].url, quote: sources[0].text } }, limitations: [] });
  return { path, db, sources, data, close() { sql.close(); db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('extraction reuses preserved scrape sources, skips collection, metadata and verification', async () => {
  const f = fixture();
  try {
    f.db.saveEnrichment({ resultId: 1, platform: 'reddit', status: 'partial', sources: f.sources, data: null, limitations: [], error: null });
    // A later failed attempt must not hide earlier usable sources.
    f.db.saveEnrichment({ resultId: 1, platform: 'reddit', status: 'failed', sources: [], data: null, limitations: [], error: 'HTTP 402' });
    const model = new MockLanguageModelV4();
    const result = await enrichSearchResult(1, f.db, {
      extractionOnly: true, model, verificationModel: model,
      collect: async () => { throw new Error('Must not scrape'); },
      collectMetadata: async () => { throw new Error('Must not fetch metadata'); },
      extract: async sources => { assert.deepEqual(sources, f.sources); return f.data; },
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.platform, 'reddit');
    assert.deepEqual(result.sources, f.sources);
    assert.deepEqual(result.data, f.data);
    assert.equal(result.verification, null);
    assert.equal(model.doStreamCalls.length, 0);
    assert.equal(model.doGenerateCalls.length, 0);
    assert.equal(f.db.listAssessments(1).length, 0);
    assert.equal(f.db.getAssessmentSummary(1).assessment_ready, true);
    const missing = await enrichSearchResult(2, f.db, {
      extractionOnly: true, collect: async () => { throw new Error('Must not scrape'); },
    });
    assert.equal(missing.status, 'failed');
    assert.match(missing.error!, /Scrape this result/);
  } finally { f.close(); }
});

test('extraction queue and displayed counts include only scraped results needing facts', async () => {
  const f = fixture();
  try {
    f.db.saveEnrichment({ resultId: 1, platform: 'reddit', status: 'partial', sources: f.sources, data: null, limitations: [], error: null });
    f.db.saveEnrichment({ resultId: 3, platform: 'reddit', status: 'complete', sources: f.sources, data: f.data, limitations: [], error: null });
    const filters = resultsPageSchema.parse({ host: 'reddit' });
    const store = openReadStore(f.path);
    try { assert.equal(store.resultsPage(filters).matchedExtractionCount, 1); } finally { store.close(); }
    const processed: number[] = [];
    const service = createEnrichmentService({ path: f.path, apiKey: 'test',
      processWork: async () => { throw new Error('Combined pipeline must not run'); },
      scrapeWork: async (id, db, options) => {
        processed.push(id);
        assert.equal(options?.extractionOnly, true);
        assert.equal(options?.collectionOnly, false);
        return enrichSearchResult(id, db, { ...options, extract: async () => f.data });
      },
    });
    const started = service.start({ mode: 'extraction', filters });
    assert.equal(started.error, null);
    assert.deepEqual(started.job?.results.map(result => result.resultId), [1]);
    for (let i = 0; i < 100 && service.getStatus()?.status === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(service.getStatus()?.status, 'complete');
    assert.equal(service.getStatus()?.results[0].status, 'complete');
    assert.equal(service.getStatus()?.results[0].phase, 'extraction');
    assert.deepEqual(processed, [1]);
    assert.equal(f.db.listAssessments(1).length, 0);
    assert.match(service.start({ mode: 'extraction', filters }).error!, /No scraped results need extraction/);
  } finally { f.close(); }
});
