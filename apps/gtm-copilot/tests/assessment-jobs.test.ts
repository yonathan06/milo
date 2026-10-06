import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { MarketingDatabase } from '../src/database.ts';
import { enrichAndAssess } from '../src/enrichment-pipeline.ts';
import { runAssessmentCli } from '../src/assess-cli.ts';
import { createEnrichmentService } from '../web/server/enrichment.ts';
import { assessmentOutputSchema, contextFingerprint, rubricVersion } from '../src/result-assessment.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-jobs-')); const path = join(dir, 'test.sqlite'); const db = new MarketingDatabase(path);
  const sql = new DatabaseSync(path); sql.exec("INSERT INTO search_results (id,url,title) VALUES (1,'https://example.com/community','Editors'),(2,'https://example.com/new','New'); INSERT INTO marketing_segments (id,name) VALUES (1,'Segment')"); sql.close();
  const sources = [{ url: 'https://example.com/community', text: 'Editors', fetchedAt: new Date().toISOString() }];
  const data = { communityName: { value: 'Editors', evidence: { sourceUrl: sources[0].url, quote: 'Editors' } } };
  db.saveEnrichment({ resultId: 1, status: 'partial', platform: 'web', data: data as never, sources, limitations: [], error: null });
  return { db, path, close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('saved-source pipeline/CLI never invokes scraping and assessment failure preserves enrichment', async () => {
  const f = fixture();
  try {
    const phases: string[] = []; let assessments = 0;
    const enrich = async () => { throw new Error('scraping must not run'); };
    const assess = async (id: number, db: MarketingDatabase) => {
      assessments++;
      assert.equal(db.listEnrichments(id)[0].status, 'partial');
      return db.saveAssessment({ enrichmentId: db.listEnrichments(id)[0].id, status: 'failed', assessment: null, error: 'model timeout', context: [], contextFingerprint: contextFingerprint([]), rubricVersion, modelId: 'selected' });
    };
    const work: typeof enrichAndAssess = (id, db, opts) => enrichAndAssess(id, db, { ...opts, enrich, assess, onPhase: (phase) => phases.push(phase) });
    const result = await work(1, f.db, { assessmentOnly: true });
    assert.equal(result.status, 'failed'); assert.deepEqual(phases, ['assessment']); assert.equal(assessments, 1);
    await assert.rejects(runAssessmentCli(['--result-id', '1'], { database: f.db, model: new MockLanguageModelV4(), processWork: work, log: () => {} }), /enrichment is retained/);
    assert.equal(assessments, 2); assert.equal(f.db.listEnrichments(1).length, 1);
    await assert.rejects(work(2, f.db, { assessmentOnly: true }), /latest enrichment/);
    await assert.rejects(runAssessmentCli(['--result-id=-1'], { database: f.db }), /positive integer/);
    const blocked = await enrichAndAssess(2, f.db, { enrich: async (id, db) => db.saveEnrichment({ resultId: id, platform: 'web', status: 'blocked', data: null, sources: [], limitations: [], error: null }), assess: async () => { throw new Error('must not assess blocked extraction'); } });
    assert.equal(blocked.status, 'blocked');
    const freshPhases: string[] = [];
    const newlyEnriched = await enrichAndAssess(2, f.db, {
      onPhase: (phase) => freshPhases.push(phase),
      enrich: async (id, db) => db.saveEnrichment({ resultId: id, platform: 'web', status: 'partial', data: f.db.listEnrichments(1)[0].data, sources: f.db.listEnrichments(1)[0].sources, limitations: [], error: null }), assess,
    });
    assert.deepEqual(freshPhases, ['enrichment', 'assessment']);
    assert.equal(newlyEnriched.status, 'failed');
    assert.equal(f.db.listEnrichments(2)[0].status, 'partial');
    const unknown = { score: null, explanation: 'Unknown', evidence: [] };
    const permission = { status: 'unknown', explanation: 'No consent evidence', evidence: [] };
    const parsed = assessmentOutputSchema.parse({ components: { audience: unknown, eventVideo: unknown, geography: unknown, activity: unknown, scale: unknown }, confidence: 'low', explanation: 'Unknown relevance', posting: permission, adminContact: permission });
    f.db.saveAssessment({ enrichmentId: f.db.listEnrichments(1)[0].id, status: 'complete', assessment: { ...parsed, version: 1, rubricVersion, score: null, coverage: 0, humanReviewRequired: true }, error: null, context: [], contextFingerprint: contextFingerprint([]), rubricVersion, modelId: 'test' });
    const before = assessments;
    assert.equal((await work(1, f.db, { assessmentOnly: true })).status, 'skipped');
    assert.equal(assessments, before, 'current assessments do not trigger paid work');
    const service = createEnrichmentService({ path: f.path, apiKey: 'test-key' });
    assert.match(service.start({ resultId: 1, mode: 'assessment' }).error!, /No enriched results need/);
  } finally { f.close(); }
});
test('shared queue validates scope and prevents duplicate overlapping assessment/enrichment work', async () => {
  const f = fixture(); let release!: () => void;
  try {
    let count = 0;
    const service = createEnrichmentService({ path: f.path, apiKey: 'test-key', processWork: async (id, db, options) => {
      count++; assert.equal(id, 1); assert.equal(db.listEnrichments(id).length, 1);
      assert.equal(options?.assessmentOnly, true); options?.onPhase?.('assessment');
      options?.onDiagnostic?.({ step: 'assessment.model', status: 'waiting', elapsedMs: 15000, fields: { model: 'test' } });
      await new Promise<void>((resolve) => { release = resolve; });
      return { status: 'complete', enrichment: db.listEnrichments(id)[0], assessment: null };
    } });
    assert.match(service.start({ resultId: 1, segmentId: 1, mode: 'assessment' }).error!, /scope/);
    assert.equal(count, 0);
    const started = service.start({ resultId: 1, mode: 'assessment' });
    assert.equal(started.job?.results.length, 1);
    assert.equal(service.getStatus()?.results[0].phase, 'assessment');
    assert.equal(service.getStatus()?.results[0].step, 'assessment.model');
    assert.equal(service.getStatus()?.results[0].stepStatus, 'waiting');
    assert.equal(service.getStatus()?.results[0].stepElapsedMs, 15000);
    assert.ok(service.getStatus()?.results[0].lastActivityAt);
    assert.match(service.start({ resultId: 2 }).error!, /already running/);
    assert.equal(count, 1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(service.getStatus()?.status, 'complete');
    assert.equal(f.db.listEnrichments(1).length, 1);
  } finally { release?.(); f.close(); }
});
