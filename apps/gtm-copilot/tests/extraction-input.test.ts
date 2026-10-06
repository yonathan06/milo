import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractionSettings, prepareExtractionSources } from '../src/extraction-input.ts';

const source = (text: string, kind: 'web_page' | 'community_metadata' = 'web_page') => ({ url: 'https://example.com/community', text, kind, fetchedAt: '2026-10-06T00:00:00Z' });

test('focused extraction caps text while preserving verbatim date/rule passages beyond page boilerplate', () => {
  const text = `Title: Event community\n${'Navigation and site boilerplate. '.repeat(1400)}\ndatePublished: 2020-05-02\nRules: Commercial promotion is prohibited.\nEvent video editing workflows for organizers.`;
  const selected = prepareExtractionSources([source(text)], 4000);
  assert.ok(selected.selectedChars <= 4000);
  assert.equal(selected.originalChars, text.length);
  assert.match(selected.sources[0].text, /datePublished: 2020-05-02/);
  assert.match(selected.sources[0].text, /Commercial promotion is prohibited/);
  assert.match(selected.sources[0].text, /Title: Event community/);
  for (const excerpt of selected.sources[0].text.split('\n\n')) assert.ok(text.includes(excerpt), 'excerpts remain exact source substrings');
});

test('fair budgets cover all collected posts and retain small metadata documents unchanged', () => {
  const sources = Array.from({ length: 10 }, (_, i) => source(`Title: Post ${i}\ncreated_at: 2026-10-0${i % 5 + 1}\n${'Event video content. '.repeat(500)}`));
  sources.push(source('communityName: Editors\nRules: No solicitation.\nmembers: 1000', 'community_metadata'));
  const result = prepareExtractionSources(sources, 16000);
  assert.equal(result.sources.length, 11);
  assert.ok(result.selectedChars <= 16000);
  assert.equal(result.sources[10].text, sources[10].text);
  for (const post of result.sources.slice(0, 10)) assert.match(post.text, /created_at:/);
});

test('small inputs are unchanged and extraction settings reject unsafe budgets', () => {
  const sources = [source('Published: 2024-01-01. Video editors.')];
  assert.deepEqual(prepareExtractionSources(sources, 4000).sources, sources);
  assert.deepEqual(extractionSettings({}), { maxSourceChars: 16000, maxOutputTokens: 4096 });
  assert.equal(extractionSettings({ GTM_EXTRACTION_MAX_SOURCE_CHARS: '12000' }).maxSourceChars, 12000);
  for (const env of [{ GTM_EXTRACTION_MAX_SOURCE_CHARS: '0' }, { GTM_EXTRACTION_MAX_SOURCE_CHARS: 'NaN' }, { GTM_EXTRACTION_MAX_OUTPUT_TOKENS: '99999' }]) assert.throws(() => extractionSettings(env), /must be an integer/);
});
