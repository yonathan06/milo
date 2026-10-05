import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { evidenceUrlSchema } from '../src/evidence-url.ts';
import { enrichmentSchema, enrichmentOutputSchema, extractCommunity, validateEvidence, enrichSearchResult } from '../src/community-enrichment.ts';
import { hasEnrichmentData } from '../src/enrichment-data.ts';
import { extractionDisplayStatus, fieldLabel, partitionEnrichmentData } from '../web/enrichment-display.ts';
import { MarketingDatabase } from '../src/database.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sources = [{ url: 'https://example.com/community', text: 'Event Professionals: Discuss event video editing.', fetchedAt: new Date().toISOString() }];
const empty = enrichmentSchema.parse({ communityName: null, description: null, lastObservedActivity: null, memberCount: null, location: null, language: null, admins: [], publicContactRoutes: [], rulesAndPromotionPolicy: [], latestPosts: [], eventAndVideoSignals: [], outreachAngles: [], limitations: ['No sources supplied.'] });
const valid = { ...empty, communityName: { value: 'Event Professionals', evidence: { sourceUrl: sources[0].url, quote: 'Event Professionals' } }, limitations: [] };
function response(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], finishReason: { unified: 'stop' as const, raw: undefined },
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 100, text: 100, reasoning: undefined } }, warnings: [] };
}
test('model output schema requires all fields without unsupported URL formats', () => {
  const schema = z.toJSONSchema(enrichmentOutputSchema);
  assert.ok(schema.required?.includes('visibility'));
  assert.ok(schema.required?.includes('communityMetrics'));
  assert.equal(JSON.stringify(schema).includes('"format":"uri"'), false);
  assert.equal(evidenceUrlSchema.safeParse('not a URL').success, false);
  assert.equal(evidenceUrlSchema.safeParse('https://example.com').success, true);
});

test('empty extraction is rejected; limitations/angles alone are not factual enrichment', () => {
  assert.equal(hasEnrichmentData(empty), false);
  assert.equal(hasEnrichmentData({ ...empty, outreachAngles: [{ supportingEvidence: valid.communityName.evidence }] }), false);
  assert.equal(hasEnrichmentData(valid), true);
  assert.throws(() => validateEvidence(empty, sources), /no evidenced facts/);
  assert.throws(() => validateEvidence({ ...valid, communityName: { ...valid.communityName, evidence: { ...valid.communityName.evidence, quote: 'invented' } } }, sources), /not found/);
});
test('model receives sources on both passes and empty output triggers one correction', async () => {
  const model = new MockLanguageModelV4({ doGenerate: [response(empty), response(valid)] });
  assert.equal((await extractCommunity(sources, model)).communityName?.value, 'Event Professionals');
  assert.equal(model.doGenerateCalls.length, 2);
  for (const call of model.doGenerateCalls) {
    const user = JSON.stringify(call.prompt.filter((message) => message.role === 'user'));
    assert.ok(user.includes(sources[0].url));
    assert.ok(user.includes(sources[0].text));
  }
  assert.ok(JSON.stringify(model.doGenerateCalls[1].prompt).includes('no evidenced facts'));
});
test('repeated empty output fails; missing source content never calls the model', async () => {
  const model = new MockLanguageModelV4({ doGenerate: response(empty) });
  await assert.rejects(extractCommunity(sources, model), /no evidenced facts/);
  assert.equal(model.doGenerateCalls.length, 2);
  await assert.rejects(extractCommunity([], model), /non-empty collected sources/);
  assert.equal(model.doGenerateCalls.length, 2);
});
test('pipeline retains collected sources but saves empty extraction as failed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gtm-extraction-'));
  const path = join(directory, 'test.sqlite');
  const db = new MarketingDatabase(path);
  try {
    const sql = new DatabaseSync(path);
    sql.exec("INSERT INTO search_results (id,url,title) VALUES (1,'https://example.com/community','Community')"); sql.close();
    const attempt = await enrichSearchResult(1, db, { collect: async () => ({ platform: 'web', sources, limitations: [] }), extract: async () => empty });
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.data, null);
    assert.equal(attempt.sources.length, 1);
    assert.match(attempt.error!, /no evidenced facts/);
    assert.ok(attempt.scrapeMetadata.stages.some((stage) => stage.name === 'extraction' && stage.status === 'failed'));
    const retry = await enrichSearchResult(1, db, { collect: async () => ({ platform: 'web', sources, limitations: [] }), extract: async () => valid });
    assert.equal(retry.status, 'partial');
    assert.equal(retry.data?.communityName?.value, 'Event Professionals');
    assert.equal(retry.error, null);
    assert.equal(db.listEnrichments(1).length, 2, 'retry preserves the failed attempt');
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('detail labels distinguish collection and extraction and collapse unavailable fields', () => {
  assert.equal(fieldLabel('lastObservedActivity'), 'Last observed activity');
  assert.equal(fieldLabel('public_contact_routes'), 'Public contact routes');
  assert.match(extractionDisplayStatus({ data: empty, sources, status: 'partial' }), /Extraction failed/);
  assert.equal(extractionDisplayStatus({ data: valid, sources, status: 'partial' }), 'Extraction succeeded');
  assert.equal(extractionDisplayStatus({ data: null, sources: [], status: 'blocked' }), 'Extraction not run');
  const partition = partitionEnrichmentData(valid);
  assert.ok(partition.emptyCount > 0);
  assert.ok(!('latestPosts' in (partition.populated as object)));
  assert.ok('communityName' in (partition.populated as object));
});
