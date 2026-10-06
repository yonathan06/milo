import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { collectCommunitySources } from '../src/community-scraper.ts';
import { renderWebHtml } from '../src/rendered-web.ts';
import { extractCommunity, enrichmentSchema } from '../src/community-enrichment.ts';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

const browserAvailable = existsSync(process.env.GTM_PLAYWRIGHT_EXECUTABLE_PATH ?? chromium.executablePath());

test('auto collector renders JavaScript before cleanup and sends only semantic HTML to extraction', { skip: !browserAvailable }, async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    if (request.url === '/robots.txt') { response.end('User-agent: *\nAllow: /'); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<html><head><style>STYLE_SECRET</style>
<script type="application/ld+json">{"datePublished":"2026-01-01"}</script></head>
<body><main id="app">Loading</main><script>
// SCRIPT_SECRET
setTimeout(() => {
  document.querySelector('#app').innerHTML = '<h1>Rendered Editors</h1><p>Event <strong>video</strong> editing.</p>';
}, 100);
</script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/community`;
  try {
    // Only this local fixture is allowed; production uses assertPublicUrl.
    const collection = await collectCommunitySources(url, {
      collector: 'auto', requestDelayMs: 0,
      validateUrl: async (target) => { assert.equal(target.origin, new URL(url).origin); },
    });
    assert.equal(collection.error, undefined);
    assert.deepEqual(requests, ['/robots.txt', '/community']);
    assert.equal(collection.sources.length, 1);
    const source = collection.sources[0];
    assert.equal(source.collector, 'playwright');
    assert.equal(source.format, 'html');
    assert.match(source.text, /Rendered Editors/);
    assert.match(source.text, /datePublished: 2026-01-01/);
    assert.doesNotMatch(source.text, /SECRET|<script|<style|Loading/);
    const data = enrichmentSchema.parse({
      communityName: { value: 'Rendered Editors', evidence: { sourceUrl: url, quote: 'Rendered Editors' } },
      description: null, lastObservedActivity: null, memberCount: null, location: null, language: null,
      admins: [], publicContactRoutes: [], rulesAndPromotionPolicy: [], latestPosts: [],
      eventAndVideoSignals: [], outreachAngles: [], limitations: [],
    });
    const model = new MockLanguageModelV4({ doStream: {
      stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: JSON.stringify(data) }, { type: 'text-end', id: 'text' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 100, text: 100, reasoning: undefined } } },
      ] }),
    } });
    assert.equal((await extractCommunity(collection.sources, model)).communityName?.value, 'Rendered Editors');
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt.filter((message) => message.role === 'user'));
    assert.match(prompt, /Rendered Editors/);
    assert.doesNotMatch(prompt, /SECRET|<script|<style/);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('browser rejects robots denial and pre-aborted work before launch', async () => {
  const url = new URL('https://example.com/community');
  await assert.rejects(renderWebHtml(url, { validateUrl: async () => {}, isAllowed: () => false }), /robots/);
  await assert.rejects(renderWebHtml(url, { validateUrl: async () => {}, isAllowed: () => true, abortSignal: AbortSignal.abort(new Error('Cancelled')) }), /Cancelled/);
});
