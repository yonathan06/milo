import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketingDatabase } from '../src/database.ts';
import { linkFingerprint, rankingModel, rankingRubric } from '../src/link-ranking.ts';
import { createEnrichmentService } from '../web/server/enrichment.ts';
import { openReadStore } from '../web/server/store.ts';
import { resultsPageSchema } from '../web/results-page.ts';
import { enrichmentRequestSchema } from '../web/enrichment.ts';

test('filtered enrichment snapshots all matching pages using the same scope as the results table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-filtered-enrichment-'));
  const path = join(dir, 'test.sqlite');
  const init = new MarketingDatabase(path); init.close();
  const sql = new DatabaseSync(path);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const processed: number[] = [];
  try {
    sql.exec(`INSERT INTO marketing_segments (id,name) VALUES (1,'Creators'), (2,'Businesses');
      INSERT INTO marketing_segment_countries (id,marketing_segment_id,country_code) VALUES (1,1,'US'), (2,2,'DE');
      INSERT INTO marketing_segment_country_queries (id,marketing_segment_country_id,language,query,platform,rationale)
      VALUES (1,1,'en','video editors','web','test'), (2,2,'de','video editors','web','test');`);
    for (let id = 1; id <= 65; id++) {
      const link = { id, url: `https://example.com/${id}`, title: `Video ${id}`, description: '' };
      sql.prepare('INSERT INTO search_results (id,url,title,description) VALUES (?,?,?,?)').run(id, link.url, link.title, link.description);
      sql.prepare('INSERT INTO search_query_results (query_id,result_id,rank) VALUES (?,?,1)').run(id <= 60 ? 1 : 2, id);
      sql.prepare(`INSERT INTO search_result_link_rankings (result_id,status,score,confidence,model_id,rubric_version,input_fingerprint)
        VALUES (?,?,?,?,?,?,?)`).run(id, 'complete', id <= 40 ? 75 : 20, 0.8, rankingModel, rankingRubric, linkFingerprint(link));
    }
    const filters = { search: 'VIDEO', countries: ['US'], segments: [1], jevMin: 70, jevMax: 80, ranking: 'ranked' as const, enrichment: 'not_enriched' as const };
    const store = openReadStore(path);
    try {
      const page = store.resultsPage(resultsPageSchema.parse({ ...filters, page: 2 }));
      assert.equal(page.results.length, 15);
      assert.equal(page.matchedCount, 40);
      assert.equal(page.matchedPendingCount, 40);
      assert.equal(page.matchedPendingAssessmentCount, 0);
    } finally { store.close(); }
    const service = createEnrichmentService({ path, apiKey: 'test', processWork: async (id) => {
      await gate;
      processed.push(id);
      return { status: 'skipped', enrichment: null, assessment: null };
    } });
    // Pagination/sorting are stripped from the action: even a page-2 request queues the entire matching set.
    const started = service.start(enrichmentRequestSchema.parse({ filters: { ...filters, page: 2, pageSize: 25, sort: 'jev' } }));
    assert.equal(started.error, null);
    assert.deepEqual(started.job?.results.map((result) => result.resultId), Array.from({ length: 40 }, (_, i) => i + 1));
    assert.match(service.start({ filters }).error!, /already running/);
    // Changing data after startup must not change the fixed job scope.
    sql.exec("UPDATE search_results SET title = 'Changed after start' WHERE id <= 40");
    release();
    for (let i = 0; i < 100 && service.getStatus()?.status === 'running'; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(service.getStatus()?.status, 'complete');
    assert.deepEqual(processed, Array.from({ length: 40 }, (_, i) => i + 1));
    assert.match(service.start(enrichmentRequestSchema.parse({ filters: { search: 'no match' } })).error!, /No results match/);
    assert.match(service.start(enrichmentRequestSchema.parse({ filters: { enrichment: 'enriched' }, mode: 'assessment' })).error!, /No results match/);
  } finally { release(); sql.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('filtered enrichment validates ranges and rejects mixed scopes', () => {
  assert.equal(enrichmentRequestSchema.safeParse({ filters: { jevMin: 90, jevMax: 20 } }).success, false);
  assert.equal(enrichmentRequestSchema.safeParse({ filters: {}, resultId: 1 }).success, false);
  assert.equal(enrichmentRequestSchema.safeParse({ filters: {}, segmentId: 1 }).success, false);
  assert.equal(enrichmentRequestSchema.parse({ filters: {} }).filters?.jevMax, 100);
});
