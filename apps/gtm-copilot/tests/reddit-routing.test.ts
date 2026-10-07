import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectCommunitySources } from '../src/community-scraper.ts';

for (const path of ['r/Adulting/', 'r/Adulting/comments/abc/title/']) {
  test(`auto uses RedditApis even with Apify and OAuth credentials: ${path}`, async () => {
    const requests: string[] = [];
    const result = await collectCommunitySources(`https://reddit.com/${path}`, {
      collector: 'auto', redditApiKey: 'reddit-test', apifyApiKey: 'apify-test', redditToken: 'oauth-test',
      fetch: (async (input: string | URL | Request) => {
        const url = new URL(String(input));
        requests.push(url.hostname);
        return new Response(JSON.stringify(url.pathname.endsWith('/comments')
          ? { post: { title: 'Party ideas', subreddit: 'Adulting' }, comments: [] }
          : url.pathname.endsWith('/about') ? { title: 'Adulting', subreddit_type: 'public' } : { posts: [] }),
        { headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch,
    });
    assert.ok(requests.length > 0);
    assert.ok(requests.every(host => host === 'api.redditapis.com'));
    assert.ok(result.sources.length > 0);
    assert.ok(result.sources.every(source => source.collector === 'redditapis'));
  });
}

test('auto without a RedditApis key does not fall back to Apify or OAuth', async () => {
  const result = await collectCommunitySources('https://reddit.com/r/Adulting/', {
    collector: 'auto', redditApiKey: '', apifyApiKey: 'apify-test', redditToken: 'oauth-test',
    fetch: (async () => { throw new Error('No network request expected'); }) as typeof fetch,
  });
  assert.equal(result.sources.length, 0);
  assert.match(result.limitations.join(' '), /REDDITAPIS_API_KEY/);
  assert.doesNotMatch(result.limitations.join(' '), /APIFY_KEY/);
});

test('explicit Apify is rejected for Reddit', async () => {
  await assert.rejects(collectCommunitySources('https://reddit.com/r/Adulting/', {
    collector: 'apify', apifyApiKey: 'apify-test',
    fetch: (async () => { throw new Error('No network request expected'); }) as typeof fetch,
  }), /Use redditapis for Reddit/);
});
