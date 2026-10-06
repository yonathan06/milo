import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentRecency, dateIsGrounded, parseContentDate } from '../src/content-recency.ts';
import { enrichmentSchema, validateEvidence } from '../src/community-enrichment.ts';
import { contentDateMetadata, htmlDocument } from '../src/community-scraper.ts';
import { finalizeAssessment, type AssessmentOutput } from '../src/result-assessment.ts';

const now = Date.parse('2026-10-06T12:00:00Z');
const url = 'https://example.com/community';
const evidence = { sourceUrl: url, quote: 'Event video editors.' };
const context = [{ queryId: 1, query: 'video editors', segment: 'Creators', segmentDescription: '', countryCode: 'US', language: 'en' }];
const unknown = { score: null, explanation: 'Unknown', evidence: [] };
const output: AssessmentOutput = { components: { audience: { score: 100, explanation: 'Match', evidence: [evidence] }, eventVideo: { score: 100, explanation: 'Match', evidence: [evidence] }, geography: unknown, activity: unknown, scale: unknown }, confidence: 'high', explanation: 'Direct match.', posting: { status: 'unknown', explanation: 'Unknown', evidence: [] }, adminContact: { status: 'unknown', explanation: 'Unknown', evidence: [] } };
const base = enrichmentSchema.parse({ communityName: { value: 'Editors', evidence }, description: null, lastObservedActivity: null, memberCount: null, location: null, language: null, admins: [], publicContactRoutes: [], rulesAndPromotionPolicy: [], latestPosts: [], eventAndVideoSignals: [], outreachAngles: [], limitations: [] });
function dated(value: string) {
  const dateEvidence = { sourceUrl: url, quote: `datePublished: ${value}` };
  const data = { ...base, contentDates: [{ value, kind: 'published' as const, evidence: dateEvidence }] };
  const sources = [{ url, text: `${evidence.quote} ${dateEvidence.quote}`, fetchedAt: new Date(now).toISOString() }];
  return { data, sources };
}

test('publication dates preserve precision, require matching evidence and reject relative/invalid dates', () => {
  assert.ok(parseContentDate('2024-02-29'));
  assert.equal(parseContentDate('2023-02-29'), null);
  for (const value of ['yesterday', '2024-13-01', '2024-04-31', '2024-00', 'not a date']) assert.equal(parseContentDate(value), null);
  assert.equal(parseContentDate('2024')?.endMs, Date.parse('2024-12-31T23:59:59.999Z'));
  assert.equal(parseContentDate('2024-02')?.endMs, Date.parse('2024-02-29T23:59:59.999Z'));
  assert.ok(dateIsGrounded('2024-10-03', 'Published October 3, 2024'));
  assert.ok(dateIsGrounded('2024-10-03', 'Published 3 October 2024'));
  assert.ok(dateIsGrounded('2024-10', 'Published October 2024'));
  assert.ok(dateIsGrounded('2024-10-03', 'datePublished: 2024-10-03T10:00:00Z'));
  assert.equal(dateIsGrounded('2024-10-03', 'Published October 2024'), false, 'cannot invent a day');
  assert.equal(dateIsGrounded('2024-10-03', 'Event video editors.'), false);
  const value = new Date(1700000000000).toISOString();
  assert.ok(dateIsGrounded(value, 'created_utc: 1700000000'));
});

test('old content caps overall match, not just the low-weight activity component', () => {
  for (const [age, cap] of [[90, null], [91, 50], [180, 50], [181, 25], [365, 25], [366, 10]] as const) {
    const value = new Date(now - age * 86400000).toISOString();
    const { data, sources } = dated(value);
    validateEvidence(data, sources);
    const result = finalizeAssessment(output, data, sources, context, null, now);
    assert.equal(result.contentRecency?.ageDays, age);
    assert.equal(result.contentRecency?.scoreCap, cap);
    if (cap !== null) {
      assert.equal(result.score, cap);
      assert.match(result.explanation, /overall match score is capped/);
    } else assert.ok(result.score! > 50);
    assert.equal(result.posting.status, 'unknown', 'recency does not grant permissions');
  }
});

test('newest evidenced publication/post date wins; future and fabricated dates cannot boost freshness', () => {
  const { data, sources } = dated('2020-01-01');
  const quote = 'publishedAt: 2026-10-05';
  const recent = { title: 'New post', url, publishedAt: '2026-10-05', publishedAtEvidence: { sourceUrl: url, quote }, summary: 'Video', evidence };
  const mixedSources = [{ ...sources[0], text: `${sources[0].text} ${quote}` }];
  const mixed = { ...data, latestPosts: [recent] };
  validateEvidence(mixed, mixedSources);
  assert.equal(contentRecency(mixed, mixedSources, now).scoreCap, null);
  assert.equal(contentRecency(mixed, mixedSources, now).newest?.value, '2026-10-05');
  assert.equal(contentRecency({ ...mixed, latestPosts: [{ ...recent, publishedAt: '2026-10-06' }] }, mixedSources, now).scoreCap, 10, 'fabricated recent date ignored');
  const future = dated('2027-01-01');
  assert.equal(contentRecency(future.data, future.sources, now).ageDays, null);
  const partial = dated('2026-10');
  assert.equal(contentRecency(partial.data, partial.sources, now).ageDays, 0, 'current partial month is conservatively recent');
});

test('undated content and legacy body-only post evidence stay unknown; new post dates require date-specific evidence', () => {
  const sources = [{ url, text: evidence.quote, fetchedAt: new Date(now).toISOString() }];
  const legacy = { ...base, latestPosts: [{ title: 'Post', url, publishedAt: '2020-01-01', summary: 'Video', evidence }] };
  assert.equal(contentRecency(legacy, sources, now).ageDays, null);
  assert.equal(finalizeAssessment(output, legacy, sources, context, null, now).components.activity.score, null);
  assert.throws(() => validateEvidence(legacy, sources), /separate evidence/);
  const grounded = dated('2020-01-01');
  assert.throws(() => validateEvidence({ ...grounded.data, contentDates: [{ ...grounded.data.contentDates[0], value: '2026-10-06' }] }, grounded.sources), /must match/);
});

test('HTML publication metadata survives scraping, including meta tags, time attributes and JSON-LD', () => {
  const html = `<meta property="article:published_time" content="2024-01-01"><meta itemprop="dateModified" content="2024-03-02"><time datetime="2024-01-05">January 5</time><script type="application/ld+json">{"@type":"Article","datePublished":"2024-01-01","dateModified":"2024-03-02"}</script><body>Event video editors.</body>`;
  const metadata = contentDateMetadata(html).join('\n');
  assert.match(metadata, /article:published_time: 2024-01-01/);
  assert.match(metadata, /dateModified: 2024-03-02/);
  assert.match(metadata, /time datetime: 2024-01-05/);
  assert.match(htmlDocument(html, url), /datePublished: 2024-01-01/);
});
