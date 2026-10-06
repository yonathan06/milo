import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { MockLanguageModelV4 } from 'ai/test';
import { assessmentOutputSchema, contextFingerprint, finalizeAssessment, generateResultAssessment, assessSavedResult, rubricVersion, type AssessmentOutput } from '../src/result-assessment.ts';
import { assessmentSummary } from '../src/assessment-state.ts';
import { unavailableVerification } from '../src/outreach-verification.ts';
import { enrichmentSchema } from '../src/community-enrichment.ts';
import { MarketingDatabase } from '../src/database.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openReadStore } from '../web/server/store.ts';
import { resultsPageSchema } from '../web/results-page.ts';

const now = Date.now();
export const sources = [{ url: 'https://example.com/community', text: 'Event video editors. Commercial posting allowed. Contact admins for commercial offers. Members: 1000.', fetchedAt: new Date(now).toISOString() }];
const evidence = { sourceUrl: sources[0].url, quote: 'Event video editors.' };
const context = [{ queryId: 1, query: 'event editors', segment: 'Organizers', segmentDescription: 'Event video editing', countryCode: 'US', language: 'en' }];
const unknown = { score: null, explanation: 'Unknown', evidence: [] };
export const output: AssessmentOutput = { components: { audience: { score: 100, explanation: 'Direct match', evidence: [evidence] }, eventVideo: { score: 100, explanation: 'Direct need', evidence: [evidence] }, geography: unknown, activity: unknown, scale: unknown }, confidence: 'high', explanation: 'Matches event video editing.', posting: { status: 'allowed', explanation: 'Posting allowed', evidence: [{ ...evidence, quote: 'Commercial posting allowed.' }] }, adminContact: { status: 'allowed', explanation: 'Admin contact explicitly allowed', evidence: [{ ...evidence, quote: 'Contact admins for commercial offers.' }] } };
const data = enrichmentSchema.parse({ communityName: { value: 'Editors', evidence }, description: null, lastObservedActivity: null, memberCount: null, location: null, language: null, admins: [], publicContactRoutes: [{ value: 'Admin route', evidence }], rulesAndPromotionPolicy: [], latestPosts: [], eventAndVideoSignals: [], outreachAngles: [], limitations: [] });
const verification = { ...unavailableVerification('test', data, sources), error: null, checks: { quotesPresent: true, sourcesFresh: true, activityFresh: true, factsSupported: true, anglesSupported: true }, assessment: { audienceFit: { rating: 'high' as const, explanation: 'match', evidence: [evidence] }, factualSupport: { supported: true, issues: [] }, promotionPolicy: { communityPosting: 'allowed' as const, directContact: 'allowed' as const, explanation: 'Commercial permission', evidence: output.posting.evidence }, contactChecks: [{ routeIndex: 0, ownershipExplicit: true, role: 'admin' as const, explanation: 'Admin', evidence: [evidence] }], angleChecks: [] } };
function response(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], finishReason: { unified: 'stop' as const, raw: undefined }, usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 100, text: 100, reasoning: undefined } }, warnings: [] }; }
const finish = (value = output) => finalizeAssessment(value, data, sources, context, verification, now);

test('assessment schema supports providers; score bounds, deterministic aggregation, unknown, confidence and context', () => {
  assert.equal(JSON.stringify(z.toJSONSchema(assessmentOutputSchema)).includes('"format":"uri"'), false);
  assert.equal(finish().score, 100);
  assert.equal(finish().coverage, 70);
  assert.equal(finish().confidence, 'medium');
  const sized = finalizeAssessment(output, { ...data, memberCount: { value: 'members: 1,000', evidence: { sourceUrl: sources[0].url, quote: 'Members: 1000.' } } }, sources, context, verification, now);
  assert.equal(sized.components.scale.score, 75);
  const active = finalizeAssessment(output, { ...data, latestPosts: [{ title: 'Event video editors', url: sources[0].url, publishedAt: new Date(now).toISOString(), summary: 'Event video editors', evidence }] }, sources, context, verification, now);
  assert.equal(active.components.activity.score, 100);
  assert.equal(active.confidence, 'high');
  const zero = structuredClone(output); zero.components.audience.score = 0; zero.components.eventVideo.score = 0;
  assert.equal(finish(zero).score, 0);
  const empty = structuredClone(output); empty.components.audience = unknown; empty.components.eventVideo = unknown;
  assert.equal(finish(empty).score, null);
  assert.equal(finalizeAssessment(output, data, sources, [], verification, now).score, null);
  assert.equal(assessmentOutputSchema.safeParse({ ...output, components: { ...output.components, audience: { ...output.components.audience, score: 101 } } }).success, false);
  assert.equal(contextFingerprint(context), contextFingerprint([...context].reverse()));
  assert.notEqual(contextFingerprint(context), contextFingerprint([{ ...context[0], segmentDescription: 'Changed' }]));
});
test('permissions are independent of match; prohibition, approval, unknown admin ownership, freshness and verification', () => {
  assert.equal(finish().posting.status, 'allowed');
  assert.equal(finish().adminContact.status, 'allowed');
  const noAdmin = { ...verification, assessment: { ...verification.assessment, contactChecks: [] } };
  assert.equal(finalizeAssessment(output, data, sources, context, noAdmin, now).adminContact.status, 'unknown');
  const business = { ...verification, assessment: { ...verification.assessment, contactChecks: [{ ...verification.assessment.contactChecks[0], role: 'business' as const }] } };
  assert.equal(finalizeAssessment(output, data, sources, context, business, now).adminContact.status, 'unknown');
  const prohibited = { ...verification, assessment: { ...verification.assessment, promotionPolicy: { ...verification.assessment.promotionPolicy, communityPosting: 'prohibited' as const } } };
  const constrained = finalizeAssessment(output, data, sources, context, prohibited, now);
  assert.equal(constrained.score, 100); assert.equal(constrained.posting.status, 'prohibited');
  const approval = structuredClone(output); approval.posting.status = 'approval_required'; approval.adminContact.status = 'prohibited';
  assert.equal(finish(approval).posting.status, 'approval_required'); assert.equal(finish(approval).adminContact.status, 'prohibited');
  const stale = sources.map((source) => ({ ...source, fetchedAt: new Date(now - 31 * 86400000).toISOString() }));
  assert.equal(finalizeAssessment(output, data, stale, context, verification, now).posting.status, 'unknown');
  assert.equal(finalizeAssessment(output, data, sources, context, unavailableVerification('failed'), now).posting.status, 'unknown');
});
test('invalid quotes and unsupported scored components/permissions are rejected', () => {
  const bad = structuredClone(output); bad.components.audience.evidence[0].quote = 'invented';
  assert.throws(() => finish(bad), /quote not found/);
  const noEvidence = structuredClone(output); noEvidence.components.audience.evidence = [];
  assert.throws(() => finish(noEvidence), /require source evidence/);
  noEvidence.components.audience = unknown; noEvidence.posting.evidence = [];
  assert.throws(() => finish(noEvidence), /explicit channel-specific evidence/);
});
test('assessment model receives saved sources and correction is bounded', async () => {
  const bad = structuredClone(output); bad.components.audience.evidence[0].quote = 'invented';
  const model = new MockLanguageModelV4({ doGenerate: [response(bad), response(output)] });
  const result = await generateResultAssessment({ data, sources, context, verification }, model);
  assert.equal(result.score, 100); assert.equal(model.doGenerateCalls.length, 2);
  for (const call of model.doGenerateCalls) assert.ok(JSON.stringify(call.prompt).includes(sources[0].text));
  const invalid = new MockLanguageModelV4({ doGenerate: response({}) });
  await assert.rejects(generateResultAssessment({ data, sources, context, verification }, invalid));
  assert.equal(invalid.doGenerateCalls.length, 2);
  const aborted = AbortSignal.abort();
  await assert.rejects(generateResultAssessment({ data, sources, context, verification }, model, aborted));
});
test('persistence, retry, migration, currentness, stale/failure projection, and cascade retain immutable evidence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-assessment-')); const path = join(dir, 'test.sqlite');
  let db = new MarketingDatabase(path);
  try {
    const sql = new DatabaseSync(path); sql.exec("INSERT INTO search_results (id,url,title) VALUES (1,'https://example.com/community','Editors')"); sql.close();
    const enrichment = db.saveEnrichment({ resultId: 1, platform: 'web', status: 'partial', data, sources, limitations: [], error: null, verification });
    db.recordOutreachReview(enrichment.id, { decision: 'rejected', channel: 'communityPosting', reviewer: 'Tester', notes: 'Keep this human review during migration.' });
    const legacy = new DatabaseSync(path); legacy.exec('DROP TABLE search_result_assessments'); legacy.close();
    const unmigratedRead = openReadStore(path);
    try { assert.throws(() => unmigratedRead.results(), /no such table/); } finally { unmigratedRead.close(); }
    const unchanged = new DatabaseSync(path, { readOnly: true });
    assert.equal(unchanged.prepare("SELECT count(*) n FROM sqlite_master WHERE name='search_result_assessments'").get()!.n, 0, 'browsing must not migrate schema'); unchanged.close();
    db.close(); db = new MarketingDatabase(path);
    assert.equal(db.listOutreachReviews(enrichment.id).length, 1);
    assert.equal(db.getAssessmentSummary(1).assessment_status, 'pending');
    const model = new MockLanguageModelV4({ modelId: 'configured-assessor', doGenerate: response(output) });
    const failed = await assessSavedResult(1, db, { model, generate: async () => { throw new Error('timeout'); } });
    assert.equal(failed.status, 'failed'); assert.equal(db.listEnrichments(1).length, 1);
    const saved = db.saveAssessment({ enrichmentId: enrichment.id, status: 'complete', assessment: finish(), error: null, context: [], contextFingerprint: contextFingerprint([]), rubricVersion, modelId: model.modelId });
    assert.equal(db.getAssessmentSummary(1).match_score, 100);
    assert.equal(db.listAssessments(1).length, 2);
    db.close(); db = new MarketingDatabase(path); // repeat explicit migration
    assert.equal(db.listEnrichments(1)[0].data.communityName.value, 'Editors');
    assert.equal(db.listOutreachReviews(enrichment.id).length, 1);
    const zero = structuredClone(output); zero.components.audience.score = 0; zero.components.eventVideo.score = 0;
    db.saveAssessment({ ...saved, assessment: finish(zero) });
    const read = openReadStore(path);
    try {
      assert.equal(read.results()[0].match_score, 0);
      assert.equal(read.result(1)!.assessments.length, 3);
      const page = read.resultsPage(resultsPageSchema.parse({}));
      assert.equal(page.results[0].match_score, 0);
      assert.equal(page.results[0].assessment_status, 'complete');
      assert.equal(page.pendingCount, 0);
      assert.equal(page.pendingAssessmentCount, 0);
    } finally { read.close(); }
    assert.equal(assessmentSummary(enrichment, saved, context, now).assessment_status, 'stale');
    assert.equal(assessmentSummary({ ...enrichment, sources: [] }, saved, [], now).posting_permission, 'unknown');
    db.saveAssessment({ ...failed, error: 'retry failed' });
    assert.equal(db.getAssessmentSummary(1).assessment_status, 'failed');
    assert.equal(db.getAssessmentSummary(1).posting_permission, 'unknown');
    const failedRead = openReadStore(path);
    try {
      assert.equal(failedRead.results()[0].match_score, null);
      assert.equal(failedRead.results()[0].assessment_status, 'failed');
      const page = failedRead.resultsPage(resultsPageSchema.parse({}));
      assert.equal(page.results[0].assessment_status, 'failed');
      assert.equal(page.results[0].match_score, null);
      assert.equal(page.pendingCount, 1);
      assert.equal(page.pendingAssessmentCount, 1);
    } finally { failedRead.close(); }
    db.saveEnrichment({ resultId: 1, platform: 'web', status: 'failed', data: null, sources: [], limitations: [], error: 'refresh failed' });
    await assert.rejects(assessSavedResult(1, db, { model }), /latest enrichment/);
    const remove = new DatabaseSync(path); remove.exec('PRAGMA foreign_keys=ON; DELETE FROM search_results WHERE id=1;'); remove.close();
    assert.equal(db.listAssessments(1).length, 0);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
