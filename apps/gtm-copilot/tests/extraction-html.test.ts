import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from 'cheerio';
import { cleanExtractionHtml, compactExtractionHtml, containsSourceQuote } from '../src/extraction-html.ts';
import { contentDateMetadata } from '../src/community-scraper.ts';
import { prepareExtractionSources } from '../src/extraction-input.ts';

const url = 'https://example.com/community';
const html = `<html><head><title>Editors</title><style>STYLE_SECRET</style>
<meta property="article:modified_time" content="2026-01-02">
<script type="application/ld+json">{"datePublished":"2026-01-01"}</script></head>
<body><nav>NAV_SECRET</nav><main style="color:red" onclick="EVENT_SECRET">
<!-- COMMENT_SECRET --><script>SCRIPT_SECRET</script><css>CSS_SECRET</css>
<h1>Event <em>video</em> editors</h1><p>Rules: No solicitation.</p>
<time datetime="2026-01-01">January 1, 2026</time>
<a href="/contact">Contact us</a><a href="javascript:BAD_SECRET">Unsafe link</a>
<p hidden>HIDDEN_SECRET</p><form>FORM_SECRET<input></form></main></body></html>`;

test('clean semantic HTML excludes scripts, CSS, comments and widgets but retains evidence', () => {
  const cleaned = cleanExtractionHtml(html, url, contentDateMetadata(html));
  const $ = load(cleaned);
  assert.equal($('script, style, css, nav, form, input, [style], [onclick], [hidden]').length, 0);
  assert.doesNotMatch(cleaned, /SECRET|<!--|javascript:/);
  assert.equal($('h1').text(), 'Event video editors');
  assert.equal($('a').first().attr('href'), 'https://example.com/contact');
  assert.equal($('time').attr('datetime'), '2026-01-01');
  assert.match(cleaned, /datePublished: 2026-01-01/);
  assert.match(cleaned, /article:modified_time/);
  assert.ok(containsSourceQuote({ text: cleaned, format: 'html' }, 'Event video editors'));
  assert.ok(!containsSourceQuote({ text: cleaned, format: 'html' }, 'Invented evidence'));
});

test('HTML compaction respects the budget without broken tags and prioritizes dates/rules', () => {
  const cleaned = cleanExtractionHtml(`<main>${'<p>Boilerplate text.</p>'.repeat(1000)}
<p>datePublished: 2026-01-01</p><p>Rules: No solicitation.</p></main>`, url);
  const result = prepareExtractionSources([{ url, text: cleaned, format: 'html', fetchedAt: '2026-01-02' }], 2000);
  assert.ok(result.selectedChars <= 2000);
  assert.match(result.sources[0].text, /datePublished: 2026-01-01/);
  assert.match(result.sources[0].text, /Rules: No solicitation/);
  assert.match(result.sources[0].text, /<\/body><\/html>$/);
  for (const budget of [50, 100, 200, 1000]) {
    const compact = compactExtractionHtml(`<html><body><h1>${'&amp;'.repeat(2000)}</h1></body></html>`, budget);
    assert.ok(compact.length <= budget);
    if (compact) assert.match(compact, /<\/body><\/html>$/);
  }
});
