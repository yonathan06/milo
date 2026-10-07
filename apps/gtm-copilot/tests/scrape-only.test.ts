import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketingDatabase } from '../src/database.ts';
import { enrichSearchResult } from '../src/community-enrichment.ts';
import { MockLanguageModelV4 } from 'ai/test';
import { createEnrichmentService } from '../web/server/enrichment.ts';
import { extractionDisplayStatus } from '../web/enrichment-display.ts';
import { enrichmentRequestSchema } from '../web/enrichment.ts';
import { assessmentOutputSchema, contextFingerprint, rubricVersion } from '../src/result-assessment.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-scrape-only-'));
  const path = join(dir, 'test.sqlite');
  const db = new MarketingDatabase(path);
  const sql = new DatabaseSync(path);
  for (let id = 1; id <= 32; id++) sql.prepare('INSERT INTO search_results(id,url,title) VALUES (?,?,?)').run(id, `https://example.com/${id}`, id <= 30 ? 'Matching community' : 'Other');
  return { path, db, sql, close() { sql.close(); db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const source = { url: 'https://example.com/1', text: 'Raw public page, not extracted facts.', fetchedAt: new Date().toISOString() };

test('scrape-only persists sources and skips extraction, validation, verification and model calls', async () => {
  const f = fixture();
  try {
    const model = new MockLanguageModelV4();
    const result = await enrichSearchResult(1, f.db, {
      collectionOnly: true, model, verificationModel: model,
      collect: async () => ({ platform: 'web', sources: [source], limitations: [] }),
      extract: async () => { throw new Error('Extraction/validation must not run'); },
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.data, null);
    assert.equal(result.verification, null);
    assert.equal(result.error, null);
    assert.equal(result.outreachStatus, 'needs_review');
    assert.deepEqual(f.db.listEnrichments(1)[0].sources, [source]);
    assert.equal(model.doStreamCalls.length, 0);
    assert.equal(model.doGenerateCalls.length, 0);
    assert.equal(result.scrapeMetadata?.stages.find(s => s.name === 'extraction')?.status, 'skipped');
    assert.match(extractionDisplayStatus({ data: null, sources: [source], status: result.status, scrapeMetadata: result.scrapeMetadata as never }), /scrape only/);
    assert.equal(f.db.listAssessments(1).length, 0);
    assert.equal(f.db.getAssessmentSummary(1).assessment_ready, false);
    const failed = await enrichSearchResult(2, f.db, { collectionOnly: true, collect: async () => ({ platform: 'web', sources: [], limitations: [], error: 'HTTP 403' }) });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'HTTP 403');
    const blocked = await enrichSearchResult(3, f.db, { collectionOnly: true, collect: async () => ({ platform: 'web', sources: [], limitations: ['Unavailable'] }) });
    assert.equal(blocked.status, 'blocked');
  } finally { f.close(); }
});

test('scrape queue snapshots filtered pages that were not scraped yet, including assessed results, without an OpenRouter key', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const saved = f.db.saveEnrichment({ resultId: 1, platform: 'web', status: 'complete', sources: [source], data: { communityName: { value: 'Community', evidence: { sourceUrl: source.url, quote: 'Raw public page' } } } as never, limitations: [], error: null });
    const unknown = { score: null, explanation: 'Unknown', evidence: [] };
    const permission = { status: 'unknown', explanation: 'Unknown', evidence: [] };
    const parsed = assessmentOutputSchema.parse({ components: { audience: unknown, eventVideo: unknown, geography: unknown, activity: unknown, scale: unknown }, confidence: 'low', explanation: 'Unknown', posting: permission, adminContact: permission });
    f.db.saveAssessment({ enrichmentId: saved.id, status: 'complete', assessment: { ...parsed, version: 1, rubricVersion, score: null, coverage: 0, humanReviewRequired: true }, error: null, context: [], contextFingerprint: contextFingerprint([]), rubricVersion, modelId: 'test' });
    assert.equal(f.db.getAssessmentSummary(1).assessment_status, 'complete');
    const processed: number[] = [];
    const service = createEnrichmentService({ path: f.path, apiKey: '',
      processWork: async () => { throw new Error('Assessment/enrichment must not run'); },
      scrapeWork: async (id, db, options) => {
        assert.equal(options?.collectionOnly, true);
        assert.equal(options?.model, undefined);
        await gate;
        processed.push(id);
        return enrichSearchResult(id, db, { ...options, collect: async () => ({ platform: 'web', sources: [{ ...source, url: `https://example.com/${id}` }], limitations: [] }) });
      },
    });
    // Result 1 already has saved scrape sources, so the queue skips it even though it matches the filters.
    const started = service.start(enrichmentRequestSchema.parse({ filters: { search: 'Matching', page: 2 }, mode: 'scrape' }));
    assert.equal(started.error, null);
    assert.equal(started.job?.results.length, 29);
    assert.equal(service.getStatus()?.results[0].phase, 'scrape');
    assert.match(service.start(enrichmentRequestSchema.parse({ filters: {}, mode: 'scrape' })).error!, /already running/);
    f.sql.exec("UPDATE search_results SET title = 'Changed after start' WHERE id <= 30");
    release();
    for (let i = 0; i < 100 && service.getStatus()?.status === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(service.getStatus()?.status, 'complete');
    assert.deepEqual(processed, Array.from({ length: 30 }, (_, i) => i + 1).filter((id) => id !== 1));
    assert.ok(service.getStatus()?.results.every(r => r.status === 'complete'));
    assert.equal(f.db.listEnrichments(1).length, 1, 'already scraped results are skipped, old enrichment remains saved');
    assert.equal(f.db.listAssessments(1).length, 1, 'no new assessment');
    assert.match(service.start(enrichmentRequestSchema.parse({ filters: { search: 'Matching' }, mode: 'scrape' })).error!, /No results match/);
    assert.match(service.start(enrichmentRequestSchema.parse({ filters: { search: 'Changed' }, mode: 'scrape' })).error!, /already been scraped/);
    assert.match(service.start(enrichmentRequestSchema.parse({ filters: { search: 'No match' }, mode: 'scrape' })).error!, /No results match/);
    assert.match(service.start({ resultId: 2 }).error!, /OPENROUTER_API_KEY/);
  } finally { release(); f.close(); }
});
