import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
import { evidenceUrlSchema } from '../src/evidence-url.ts';
import { enrichmentSchema, enrichmentOutputSchema, extractCommunity, validateEvidence, enrichSearchResult } from '../src/community-enrichment.ts';
import type { WorkDiagnostic } from '../src/work-diagnostics.ts';
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
function response(data: unknown) { return textResponse(JSON.stringify(data)); }
function textResponse(text: string, finishReason: 'stop' | 'length' = 'stop') {
  return { stream: simulateReadableStream({ chunks: [
    { type: 'stream-start' as const, warnings: [] }, { type: 'text-start' as const, id: 'text' },
    { type: 'text-delta' as const, id: 'text', delta: text }, { type: 'text-end' as const, id: 'text' },
    { type: 'finish' as const, finishReason: { unified: finishReason, raw: undefined },
      usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 100, text: 100, reasoning: undefined } } },
  ] }) };
}
test('model output schema requires all fields without unsupported URL formats', () => {
  const schema = z.toJSONSchema(enrichmentOutputSchema);
  assert.ok(schema.required?.includes('visibility'));
  assert.ok(schema.required?.includes('communityMetrics'));
  assert.ok(schema.required?.includes('contentDates'));
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
  const model = new MockLanguageModelV4({ doStream: [response(empty), response(valid)] });
  assert.equal((await extractCommunity(sources, model)).communityName?.value, 'Event Professionals');
  assert.equal(model.doStreamCalls.length, 2);
  for (const call of model.doStreamCalls) {
    const user = JSON.stringify(call.prompt.filter((message) => message.role === 'user'));
    assert.ok(user.includes(sources[0].url));
    assert.ok(user.includes(sources[0].text));
  }
  assert.ok(JSON.stringify(model.doStreamCalls[1].prompt).includes('no evidenced facts'));
});
test('JSON mode corrects malformed, truncated, and schema-invalid output once', async () => {
  for (const bad of [textResponse('{"communityName":'), textResponse('', 'length'), response({ unexpected: true })]) {
    const model = new MockLanguageModelV4({ doStream: [bad, response(valid)] });
    const diagnostics: WorkDiagnostic[] = [];
    assert.equal((await extractCommunity(sources, model, undefined, e => diagnostics.push(e))).communityName?.value, 'Event Professionals');
    assert.equal(model.doStreamCalls.length, 2);
    const format = model.doStreamCalls[0].responseFormat;
    assert.equal(format?.type, 'json');
    assert.ok(format?.type === 'json' && !format.schema, 'do not send the looping provider-enforced schema');
    assert.ok(JSON.stringify(model.doStreamCalls[0].prompt).includes('limitations'));
    assert.ok(JSON.stringify(model.doStreamCalls[1].prompt).includes('Correction:'));
    assert.ok(diagnostics.some(e => e.step === 'extraction.validation' && e.status === 'retrying'));
    assert.ok(diagnostics.some(e => e.step === 'extraction.model' && e.fields?.finishReason));
  }
});
test('repeated malformed JSON fails after two attempts and transport errors are not corrected', async () => {
  const malformed = new MockLanguageModelV4({ doStream: [textResponse('{'), textResponse('{')] });
  await assert.rejects(extractCommunity(sources, malformed), /could not parse/);
  assert.equal(malformed.doStreamCalls.length, 2);
  const broken = new MockLanguageModelV4({ doStream: async () => { throw new Error('Transport unavailable'); } });
  await assert.rejects(extractCommunity(sources, broken), /Transport unavailable/);
  assert.equal(broken.doStreamCalls.length, 1);
});
test('JSON mode still rejects structurally valid but fabricated evidence', async () => {
  const fabricated = { ...valid, communityName: { ...valid.communityName, evidence: { ...valid.communityName.evidence, quote: 'Invented community' } } };
  const model = new MockLanguageModelV4({ doStream: [response(fabricated), response(fabricated)] });
  await assert.rejects(extractCommunity(sources, model), /not found in collected sources/);
  assert.equal(model.doStreamCalls.length, 2);
});
test('streamed extraction limits input/output and reports first-token progress without logging source bodies', async () => {
  const largeSources = [{ ...sources[0], text: `${sources[0].text}\n${'Navigation boilerplate. '.repeat(2500)}` }];
  const model = new MockLanguageModelV4({ doStream: response(valid) });
  const diagnostics: WorkDiagnostic[] = [];
  const data = await extractCommunity(largeSources, model, undefined, (event) => diagnostics.push(event));
  assert.match(data.limitations.join(' '), /omitted content is unknown/);
  const call = model.doStreamCalls[0];
  assert.equal(call.maxOutputTokens, 4096);
  assert.deepEqual(call.providerOptions?.openrouter, { reasoning: { enabled: false }, provider: { sort: 'latency' } });
  const input = diagnostics.find((event) => event.step === 'extraction.input');
  assert.ok(Number(input?.fields?.selectedChars) <= 16000);
  assert.ok(Number(input?.fields?.originalChars) > 40000);
  const streaming = diagnostics.find((event) => event.status === 'streaming');
  assert.ok(Number(streaming?.fields?.firstTokenMs) >= 0);
  assert.ok(Number(streaming?.fields?.outputChars) > 0);
  assert.ok(!JSON.stringify(diagnostics).includes(sources[0].text));
  assert.equal(diagnostics.at(-1)?.fields?.finishReason, 'stop');
});

test('cancelled extraction does not retry an outstanding provider request', async () => {
  const controller = new AbortController();
  const model = new MockLanguageModelV4({ doStream: async (options) => {
    await new Promise((_, reject) => {
      const signal = options.abortSignal!;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    return response(valid);
  } });
  const timer = setTimeout(() => controller.abort(new Error('Extraction deadline exceeded')), 30);
  try { await assert.rejects(extractCommunity(sources, model, controller.signal)); }
  finally { clearTimeout(timer); }
  assert.equal(model.doStreamCalls.length, 1);
});

test('repeated empty output fails; missing source content never calls the model', async () => {
  const model = new MockLanguageModelV4({ doStream: [response(empty), response(empty)] });
  await assert.rejects(extractCommunity(sources, model), /no evidenced facts/);
  assert.equal(model.doStreamCalls.length, 2);
  await assert.rejects(extractCommunity([], model), /non-empty collected sources/);
  assert.equal(model.doStreamCalls.length, 2);
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
