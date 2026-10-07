import { setTimeout as delay } from 'node:timers/promises';
import { diagnosticStep, type DiagnosticObserver } from './work-diagnostics.ts';
import type { Collection, Source } from './community-scraper.ts';
import type { ProviderRun } from './scraping-metadata.ts';

export const redditapisReadPriceUsd = 0.002;
const maxResponseBytes = 2_000_000;
const textLimit = 12_000;

export interface RedditApisOptions {
  apiKey?: string;
  maxPosts?: number;
  fetch?: typeof globalThis.fetch;
  abortSignal?: AbortSignal;
  onDiagnostic?: DiagnosticObserver;
  requestDelayMs?: number;
}

export interface RedditTarget {
  name: string;
  postId?: string;
  url: string;
}

export function redditTarget(input: string): RedditTarget {
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('RedditApis requires a public HTTP(S) Reddit URL without credentials or a custom port.');
  }
  if (url.hostname !== 'reddit.com' && !url.hostname.endsWith('.reddit.com')) {
    throw new Error('Expected a reddit.com URL; short links are not resolved.');
  }
  const name = url.pathname.match(/^\/r\/([a-z0-9_]+)(?:\/|$)/i)?.[1];
  if (!name || ['feed', 'discover', 'joins', 'create'].includes(name.toLowerCase())) {
    throw new Error('Expected an /r/subreddit or /r/subreddit/comments/id URL.');
  }
  const postId = url.pathname.match(/\/comments\/([a-z0-9]{1,16})(?:\/|$)/i)?.[1]?.toLowerCase();
  return { name, postId, url: `https://www.reddit.com/r/${name}/` };
}

/** Reddit's native comment tree: t1 nodes are comments, 'more' stubs stand in for unfetched replies. */
interface CommentNode {
  kind: string;
  data?: { body?: unknown; author?: unknown; score?: unknown; created_utc?: unknown; created?: unknown; replies?: unknown };
}
interface RedditPost {
  title?: unknown; author?: unknown; permalink?: unknown; url?: unknown; link_url?: unknown; text?: unknown;
  subreddit?: unknown; upvotes?: unknown; comments?: unknown; upvote_ratio?: unknown; created_utc?: unknown; created?: unknown;
}

const scalar = (value: unknown, limit = textLimit): string | number | boolean | null => {
  if (typeof value === 'string') return value.slice(0, limit);
  if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') return value;
  return null;
};
const lines = (record: Record<string, unknown>) => Object.entries(record)
  .filter(([, value]) => value !== null && value !== undefined && value !== '')
  .map(([key, value]) => `${key}: ${value}`);

export function postText(post: RedditPost): string {
  return lines({
    subreddit: scalar(post.subreddit), title: scalar(post.title), author: scalar(post.author),
    url: scalar(post.url), external_link: scalar(post.link_url), text: scalar(post.text, 8000),
    upvotes: scalar(post.upvotes), comments: scalar(post.comments), upvote_ratio: scalar(post.upvote_ratio),
    publishedAt: scalar(post.created),
  }).join('\n');
}

function collectComments(nodes: CommentNode[], depth = 0, budget = { remaining: 20 }): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (budget.remaining <= 0) break;
    if (node.kind !== 't1' || !node.data || typeof node.data.body !== 'string') continue;
    budget.remaining -= 1;
    const body = scalar(node.data.body, 3000);
    if (body) result.push(lines({
      comment_author: scalar(node.data.author),
      comment: body,
      comment_score: scalar(node.data.score),
      comment_publishedAt: scalar(node.data.created),
    }).join('\n'));
    const replies = node.data.replies;
    if (depth < 2 && replies && typeof replies === 'object') {
      const children = (replies as { data?: { children?: CommentNode[] } }).data?.children;
      if (Array.isArray(children)) result.push(...collectComments(children, depth + 1, budget));
    }
  }
  return result;
}

export function commentsText(post: RedditPost, comments: CommentNode[]): string {
  return [postText(post), ...collectComments(comments)].join('\n').slice(0, 40000);
}

/** Read-only provider calls: one GET, bearer auth, transient 429/503 retried per Retry-After. */
async function createRead(options: RedditApisOptions, apiKey: string, onCall: () => void) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return async (path: string, query: Record<string, string> = {}): Promise<unknown> => {
    for (let attempt = 0; ; attempt += 1) {
      onCall();
      let response: Response;
      try {
        const targetUrl = new URL(`https://api.redditapis.com${path}`);
        for (const [key, value] of Object.entries(query)) targetUrl.searchParams.set(key, value);
        response = await diagnosticStep(options.onDiagnostic, 'redditapis.http', { path }, () => fetchImpl(targetUrl, {
          redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        }), () => ({}));
      } catch (cause) {
        if (attempt < 2 && !options.abortSignal?.aborted) {
          await delay(1000 * 2 ** attempt, undefined, { signal: options.abortSignal });
          continue;
        }
        throw cause;
      }
      if (response.status === 429 || response.status === 503) {
        await response.body?.cancel();
        if (attempt >= 2) throw new Error(`RedditApis request failed (HTTP ${response.status}) after retries; not billed.`);
        const retryAfter = Number(response.headers.get('retry-after')) || 2;
        await delay(Math.min(retryAfter, 10) * 1000, undefined, { signal: options.abortSignal });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`RedditApis request failed (HTTP ${response.status}); no retries attempted.`);
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > maxResponseBytes) throw new Error('RedditApis response exceeds 2 MB limit.');
            chunks.push(value);
          }
        } finally { await reader.cancel(); }
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function collectWithRedditApis(input: string, options: RedditApisOptions = {}): Promise<Collection> {
  const collection: Collection = { platform: 'reddit', sources: [], limitations: [], providerRuns: [] };
  const apiKey = (options.apiKey ?? process.env.REDDITAPIS_API_KEY)?.trim();
  if (!apiKey) {
    collection.limitations.push('Set REDDITAPIS_API_KEY to collect Reddit data via redditapis.com. A provider token is not platform authorization.');
    return collection;
  }
  const maxPosts = options.maxPosts ?? 10;
  if (!Number.isSafeInteger(maxPosts) || maxPosts < 1 || maxPosts > 10) throw new Error('RedditApis maxPosts must be between 1 and 10.');
  let target: RedditTarget;
  try { target = redditTarget(input); }
  catch (cause) { collection.limitations.push(cause instanceof Error ? cause.message : String(cause)); return collection; }

  let calls = 0;
  const read = await createRead(options, apiKey, () => { calls += 1; });
  const trace: ProviderRun = {
    actorId: 'redditapis', kind: target.postId ? 'posts' : 'community_metadata', status: 'NOT_STARTED',
    maxItems: target.postId ? 1 : maxPosts, maxChargeUsd: redditapisReadPriceUsd * (target.postId ? 1 : 2),
  };
  collection.providerRuns!.push(trace);
  const add = (url: string, text: string, kind: Source['kind'], urlNote?: string) => collection.sources.push({
    url, text, fetchedAt: new Date().toISOString(), collector: 'redditapis', kind,
  });
  const finished = (error?: string) => {
    trace.status = error ? 'FAILED' : 'SUCCEEDED';
    trace.usageTotalUsd = Number((calls * redditapisReadPriceUsd).toFixed(6));
    trace.recordCount = collection.sources.length;
    if (error) { collection.error = error; collection.limitations.push(error); }
    trace.usableSourceCount = collection.sources.length;
    collection.limitations.push(`redditapis.com read-only collector; ${calls} billed read(s) at $${redditapisReadPriceUsd} per call. Public information only; provider credentials do not grant platform authorization.`);
    return collection;
  };

  try {
    if (target.postId) {
      const payload = record(await read(`/api/reddit/post/${target.postId}/comments`));
      const post = record(payload.post) as RedditPost;
      const comments = Array.isArray(payload.comments) ? payload.comments as CommentNode[] : [];
      const text = commentsText(post, comments);
      if (!text.trim()) { collection.limitations.push('No usable post record returned; the post may be deleted, removed, or private.'); return finished(); }
      const permalink = typeof post.permalink === 'string' ? new URL(post.permalink, 'https://www.reddit.com').href : target.url;
      add(permalink, text, 'posts');
      const status = typeof payload.listing_status === 'string' ? payload.listing_status : 'unknown';
      if (payload.exhausted_reason === 'comment_tree_more') collection.limitations.push('Comment tree was truncated by Reddit (more comments exist behind "more" nodes); at most 100 comments are observed.');
      else if (status !== 'complete') collection.limitations.push(`Comment tree completeness is ${status}; not all comments may be observed.`);
      collection.limitations.push('Observed one post with its top comments; not a complete activity history of the community.');
      return finished();
    }
    const about = record(await read(`/api/reddit/sub/${encodeURIComponent(target.name)}/about`));
    const aboutLines = lines({
      subreddit: scalar(about.display_name_prefixed ?? `r/${target.name}`), title: scalar(about.title),
      description: scalar(about.description), public_description: scalar(about.public_description),
      subscribers: scalar(about.subscribers), active_user_count: scalar(about.active_user_count),
      created: scalar(about.created), subreddit_type: scalar(about.subreddit_type), lang: scalar(about.lang),
      url: scalar(about.url),
    }).join('\n');
    if (!aboutLines) { collection.limitations.push('Subreddit metadata unavailable; the community may not exist or is private.'); return finished(); }
    add(target.url, aboutLines, 'community_metadata');
    if (about.subreddit_type && !['public', 'restricted'].includes(String(about.subreddit_type))) {
      collection.limitations.push(`Subreddit type is ${String(about.subreddit_type)}; posts were not collected.`);
      return finished();
    }
    await delay(Math.max(options.requestDelayMs ?? 250, 0), undefined, { signal: options.abortSignal });
    const listing = record(await read('/api/reddit/posts', { subreddit: target.name, sort: 'new', limit: String(maxPosts) }));
    const posts = Array.isArray(listing.posts) ? listing.posts as RedditPost[] : [];
    const postLines = posts.slice(0, maxPosts).map((post) => lines({
      title: scalar(post.title), author: scalar(post.author), url: scalar(post.url), text: scalar(post.text, 3000),
      upvotes: scalar(post.upvotes), comments: scalar(post.comments), publishedAt: scalar(post.created),
    }).join('\n')).filter(Boolean).join('\n---\n');
    if (postLines) add(`https://www.reddit.com/r/${target.name}/new/`, postLines.slice(0, 40000), 'posts');
    else collection.limitations.push('No posts returned; the community may be empty or unavailable.');
    collection.limitations.push(`Observed at most ${maxPosts} newest posts; not a complete activity history.`);
    return finished();
  } catch (cause) {
    return finished(cause instanceof Error ? cause.message.replaceAll(apiKey, '[redacted]') : 'RedditApis collection failed.');
  }
}

/** Community profile only (about); used as supplementary metadata instead of the paid Apify metadata Actor. */
export function collectRedditApisMetadata(input: string, options: RedditApisOptions = {}): Promise<Collection> {
  return collectWithRedditApis(input, { ...options, maxPosts: options.maxPosts ?? 10 });
}
