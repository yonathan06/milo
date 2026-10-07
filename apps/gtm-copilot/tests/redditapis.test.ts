import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectWithRedditApis, redditTarget, postText, commentsText } from '../src/redditapis.ts';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

test('redditTarget parses permalink and subreddit URLs and rejects non-Reddit hosts', () => {
  assert.deepEqual(redditTarget('https://www.reddit.com/r/WeddingPlanning/comments/nmcyub/how_on_earth/'), {
    name: 'WeddingPlanning', postId: 'nmcyub', url: 'https://www.reddit.com/r/WeddingPlanning/',
  });
  assert.deepEqual(redditTarget('https://reddit.com/r/Adulting/'), {
    name: 'Adulting', postId: undefined, url: 'https://www.reddit.com/r/Adulting/',
  });
  assert.throws(() => redditTarget('https://example.com/r/Adulting/'), /Expected a reddit\.com URL/);
  assert.throws(() => redditTarget('https://reddit.com/u/someone'), /Expected an \/r\//);
});

test('permalink URLs fetch the post and top comments in one billed call', async () => {
  const requests: string[] = [];
  const collection = await collectWithRedditApis('https://reddit.com/r/Adulting/comments/nmcyub/how_on_earth_do_you_plan_a_party', {
    apiKey: 'test-key', maxPosts: 5,
    fetch: (async (input: string | URL | Request) => {
      requests.push(String(input));
      return jsonResponse({
        post: {
          title: 'How on earth do you plan a party', author: 'planner_1', subreddit: 'Adulting',
          permalink: '/r/Adulting/comments/nmcyub/how_on_earth_do_you_plan_a_party/',
          url: 'https://www.reddit.com/r/Adulting/comments/nmcyub/how_on_earth_do_you_plan_a_party/',
          text: 'I need venue ideas.', upvotes: 42, comments: 12, created: '2026-01-01T00:00:00.000Z',
        },
        comments: [
          { kind: 't1', data: { body: 'Book a hall early.', author: 'helper', score: 7 } },
          { kind: 'more', data: { count: 273, children: ['abc', 'def'] } },
        ],
        listing_status: 'truncated', exhausted_reason: 'comment_tree_more', after: null,
      });
    }) as typeof fetch,
  });
  assert.deepEqual(requests, ['https://api.redditapis.com/api/reddit/post/nmcyub/comments']);
  assert.equal(collection.platform, 'reddit');
  assert.equal(collection.sources.length, 1);
  assert.equal(collection.sources[0].collector, 'redditapis');
  assert.equal(collection.sources[0].kind, 'posts');
  assert.match(collection.sources[0].text, /title: How on earth do you plan a party/);
  assert.match(collection.sources[0].text, /comment: Book a hall early\./);
  assert.doesNotMatch(collection.sources[0].text, /273/);
  assert.match(collection.limitations.join(' '), /comment_tree_more|truncated/);
  assert.equal(collection.providerRuns![0].usageTotalUsd, 0.002);
  assert.equal(collection.providerRuns![0].status, 'SUCCEEDED');
  assert.equal(collection.error, undefined);
});

test('subreddit URLs collect about metadata plus newest posts', async () => {
  const requests: { path: string; auth?: string }[] = [];
  const collection = await collectWithRedditApis('https://www.reddit.com/r/WeddingPlanning/', {
    apiKey: 'test-key', maxPosts: 2,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ path: url.pathname + (url.search ? url.search : ''), auth: new Headers(init?.headers).get('Authorization') ?? undefined });
      if (url.pathname === '/api/reddit/sub/WeddingPlanning/about') return jsonResponse({
        display_name_prefixed: 'r/WeddingPlanning', title: 'Wedding Planning', public_description: 'Plan weddings.',
        subscribers: 1000, subreddit_type: 'public', url: '/r/WeddingPlanning/', created: '2010-01-01T00:00:00.000Z',
      });
      return jsonResponse({ posts: [{ title: 'Venue advice?', author: 'a', url: 'https://www.reddit.com/r/WeddingPlanning/comments/abc/', text: 'Where to start?', upvotes: 3, created: '2026-02-01T00:00:00.000Z' }] });
    }) as typeof fetch,
  });
  assert.deepEqual(requests.map((request) => request.path), ['/api/reddit/sub/WeddingPlanning/about', '/api/reddit/posts?subreddit=WeddingPlanning&sort=new&limit=2']);
  assert.ok(requests.every((request) => request.auth === 'Bearer test-key'));
  assert.equal(collection.sources.length, 2);
  assert.equal(collection.sources[0].kind, 'community_metadata');
  assert.match(collection.sources[0].text, /subscribers: 1000/);
  assert.equal(collection.sources[1].kind, 'posts');
  assert.match(collection.sources[1].text, /title: Venue advice\?/);
  assert.equal(collection.providerRuns![0].usageTotalUsd, 0.004);
});

test('missing API key and invalid targets degrade to limitations without throwing', async () => {
  const noKey = await collectWithRedditApis('https://reddit.com/r/Adulting/');
  assert.equal(noKey.sources.length, 0);
  assert.match(noKey.limitations.join(' '), /REDDITAPIS_API_KEY/);
  const badUrl = await collectWithRedditApis('https://example.com/r/Adulting/', { apiKey: 'test-key' });
  assert.equal(badUrl.sources.length, 0);
  assert.match(badUrl.limitations.join(' '), /Expected a reddit\.com URL/);
});

test('HTTP failures produce a failed trace and a collection error without leaking the key', async () => {
  const collection = await collectWithRedditApis('https://reddit.com/r/Adulting/', {
    apiKey: 'secret-key-value',
    fetch: (async () => jsonResponse({ error: 'HTTP_404' }, 404)) as typeof fetch,
  });
  assert.equal(collection.sources.length, 0);
  assert.equal(collection.error, 'RedditApis request failed (HTTP 404); no retries attempted.');
  assert.doesNotMatch(collection.limitations.join(' '), /secret-key-value/);
  assert.equal(collection.providerRuns![0].status, 'FAILED');
});

test('text helpers keep sources compact and readable', () => {
  const post = { title: 'T', author: 'a', subreddit: 'r', upvotes: 5, link_url: null };
  assert.match(postText(post), /upvotes: 5/);
  assert.doesNotMatch(postText(post), /link_url/);
  const text = commentsText(post, [{ kind: 't1', data: { body: 'x'.repeat(5000), author: 'b' } }]);
  assert.ok(text.length < 5000);
});
