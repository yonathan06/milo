import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Collection, Source } from './community-scraper.ts';
import type { ProviderRun } from './scraping-metadata.ts';

export const apifyActors = {
  facebook: 'apify~facebook-groups-scraper', reddit: 'crawlerbros~reddit-scraper',
} as const;
export const apifyMetadataActors = {
  facebook: 'parsebird~facebook-group-profile-scraper', reddit: 'crawlerbros~reddit-community-scraper',
} as const;
const runSchema = z.object({ data: z.object({
  id: z.string().regex(/^[\w-]+$/), status: z.string(),
  defaultDatasetId: z.string().regex(/^[\w-]+$/).optional(), buildId: z.string().optional(),
  startedAt: z.string().optional(), finishedAt: z.string().nullable().optional(),
  usageTotalUsd: z.number().optional(),
}) });
const terminal = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);
type Platform = 'facebook' | 'reddit';
export interface ApifyOptions {
  apiKey?: string; maxPosts?: number; maxChargeUsd?: number; fetch?: typeof globalThis.fetch;
  abortSignal?: AbortSignal; pollDelayMs?: number; timeoutMs?: number;
}

export function apifyTarget(input: string, platform: Platform) {
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Apify requires a public HTTP(S) community URL without credentials or a custom port.');
  }
  const domain = platform === 'facebook' ? 'facebook.com' : 'reddit.com';
  if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) throw new Error(`Expected a ${domain} community URL; short links are not resolved.`);
  const name = url.pathname.match(platform === 'facebook' ? /^\/groups\/([a-z0-9._-]+)(?:\/|$)/i : /^\/r\/([a-z0-9_]+)(?:\/|$)/i)?.[1];
  if (!name || ['feed', 'discover', 'joins', 'create'].includes(name.toLowerCase())) throw new Error(`Expected a ${platform === 'facebook' ? '/groups/group' : '/r/subreddit'} URL.`);
  return { name, url: `https://www.${domain}/${platform === 'facebook' ? 'groups' : 'r'}/${name}/` };
}

function select(record: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.flatMap<[string, string | number | boolean]>((key) => {
    const value = record[key];
    if (typeof value === 'string') return [[key, value.slice(0, 12000)]];
    if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') return [[key, value]];
    return [];
  }));
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function rows(value: unknown, fields: string[], limit: number) {
  return Array.isArray(value) ? value.slice(0, limit).map((row) => select(object(row), fields)) : [];
}
export function apifyRecordText(record: Record<string, unknown>, platform: Platform) {
  const fields = platform === 'reddit' ? [
    'subreddit', 'subreddit_prefixed', 'subreddit_subscribers', 'subreddit_type', 'post_id', 'title', 'url',
    'permalink', 'content', 'created_at', 'created_utc', 'score', 'num_comments', 'link_flair', 'post_type', 'is_stickied',
  ] : ['groupName', 'groupTitle', 'groupDescription', 'groupUrl', 'groupId', 'membersCount',
    'postId', 'url', 'facebookUrl', 'text', 'time', 'timestamp', 'likesCount', 'commentsCount', 'sharesCount'];
  return Object.entries(select(record, fields)).map(([key, value]) => `${key}: ${value}`).join('\n').slice(0, 40000);
}

/** Public community profile only; exclude ordinary members, images, and unrelated personal profiles. */
export function apifyMetadataText(record: Record<string, unknown>, platform: Platform) {
  const profile = platform === 'reddit' ? {
    ...select(record, ['subreddit', 'title', 'url', 'description', 'public_description', 'submit_text', 'subscribers',
      'active_user_count', 'weekly_active_users', 'weekly_contributions', 'created_at', 'subreddit_type', 'lang',
      'restrict_posting', 'restrict_commenting', 'submission_type', 'allow_images', 'allow_videos', 'allow_videogifs', 'allow_galleries']),
    rules: rows(record.rules, ['short_name', 'description', 'kind', 'violation_reason'], 30),
    moderators: rows(record.moderators, ['name', 'moderator_since_at'], 20),
  } : {
    identity: select(object(record.identity), ['groupId', 'name', 'url', 'username']),
    ...select(record, ['description', 'administratorCount', 'moderatorCount']),
    history: select(object(record.history), ['createdAt', 'summary']),
    membership: {
      ...select(object(record.membership), ['memberCount', 'memberCountDisplay']),
      recentMemberGrowth: select(object(object(record.membership).recentMemberGrowth), ['display', 'period', 'count']),
    },
    postingActivity: select(object(record.postingActivity), ['postsPerDay', 'postsPerDayDisplay', 'postsPerMonth', 'postsPerMonthDisplay']),
    visibility: select(object(record.visibility), ['privacy', 'privacyDescription', 'discoverability']),
    administrators: rows(record.administrators, ['name', 'profileUrl'], 20),
    moderators: rows(record.moderators, ['name', 'profileUrl'], 20),
    rules: rows(record.rules, ['title', 'text'], 30),
    locations: Array.isArray(record.locations) ? record.locations.filter((value) => typeof value === 'string').slice(0, 10) : [],
  };
  // Readable scalar lines make exact quotes easier than escaped JSON strings.
  const lines: string[] = [];
  const flatten = (value: unknown, key: string) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') lines.push(`${key}: ${value}`);
    else if (value && typeof value === 'object') for (const [child, data] of Object.entries(value)) flatten(data, key ? `${key}.${child}` : child);
  };
  flatten(profile, '');
  return lines.join('\n').slice(0, 40000);
}

async function runActor(actorId: string, kind: ProviderRun['kind'], input: Record<string, unknown>, maxItems: number, options: ApifyOptions) {
  const apiKey = (options.apiKey ?? process.env.APIFY_KEY)?.trim();
  if (!apiKey) throw new Error('Set APIFY_KEY to collect public community data.');
  const maxChargeUsd = options.maxChargeUsd ?? Number(process.env.GTM_APIFY_MAX_CHARGE_USD ?? '0.5');
  if (!Number.isFinite(maxChargeUsd) || maxChargeUsd <= 0 || maxChargeUsd > 5) throw new Error('Apify maxChargeUsd must be greater than 0 and at most 5.');
  const trace: ProviderRun = { actorId, kind, status: 'NOT_STARTED', maxItems, maxChargeUsd };
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(options.timeoutMs ?? 200000)]) : AbortSignal.timeout(options.timeoutMs ?? 200000);
  const fetch = options.fetch ?? globalThis.fetch;
  let finished = false;
  let error: string | undefined;
  let items: Record<string, unknown>[] = [];
  const request = async (path: string, init: RequestInit = {}, abortSignal = signal): Promise<unknown> => {
    const response = await fetch(`https://api.apify.com/v2/${path}`, {
      ...init, redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([abortSignal, AbortSignal.timeout(30000)]),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Apify request failed (HTTP ${response.status}); no retries attempted.`); }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length; if (size > 2_000_000) throw new Error('Apify response exceeds 2 MB limit.');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const update = (run: z.infer<typeof runSchema>['data']) => Object.assign(trace, {
    runId: run.id, status: run.status, datasetId: run.defaultDatasetId, buildId: run.buildId,
    startedAt: run.startedAt, finishedAt: run.finishedAt ?? undefined, usageTotalUsd: run.usageTotalUsd,
  });
  try {
    const params = new URLSearchParams({ timeout: '180', maxItems: String(maxItems), maxTotalChargeUsd: String(maxChargeUsd) });
    let run = runSchema.parse(await request(`acts/${actorId}/runs?${params}`, { method: 'POST', body: JSON.stringify(input) })).data;
    update(run);
    while (!terminal.has(run.status)) {
      await delay(options.pollDelayMs ?? 1000, undefined, { signal });
      run = runSchema.parse(await request(`actor-runs/${trace.runId}?waitForFinish=10`)).data; update(run);
    }
    finished = true;
    if (run.status !== 'SUCCEEDED') throw new Error(`Apify run ${trace.runId} ended with ${run.status}.`);
    if (!trace.datasetId) throw new Error('Apify run has no default dataset.');
    items = z.array(z.record(z.string(), z.unknown())).parse(await request(`datasets/${trace.datasetId}/items?format=json&clean=true&limit=${maxItems}`)).slice(0, maxItems);
    trace.recordCount = items.length;
  } catch (cause) {
    error = cause instanceof Error ? cause.message.replaceAll(apiKey, '[redacted]') : 'Apify collection failed.';
    trace.error = error;
  } finally {
    if (trace.runId && !finished) {
      try { update(runSchema.parse(await request(`actor-runs/${trace.runId}/abort`, { method: 'POST' }, AbortSignal.timeout(10000))).data); }
      catch { trace.error = `${error ?? 'Cancelled'}. Remote cancellation unconfirmed; inspect run ${trace.runId}.`; }
    }
  }
  return { items, trace, error };
}

async function collect(input: string, platform: Platform, metadata: boolean, options: ApifyOptions): Promise<Collection> {
  const collection: Collection = { platform, sources: [], limitations: [], providerRuns: [] };
  if (!(options.apiKey ?? process.env.APIFY_KEY)?.trim()) {
    collection.limitations.push('Set APIFY_KEY to collect public community data. A provider token is not platform authorization.'); return collection;
  }
  const maxPosts = options.maxPosts ?? 10;
  if (!Number.isSafeInteger(maxPosts) || maxPosts < 1 || maxPosts > 10) throw new Error('Apify maxPosts must be between 1 and 10.');
  let target: ReturnType<typeof apifyTarget>;
  try { target = apifyTarget(input, platform); }
  catch (cause) { collection.limitations.push(cause instanceof Error ? cause.message : String(cause)); return collection; }
  const actorId = (metadata ? apifyMetadataActors : apifyActors)[platform];
  const actorInput = metadata ? platform === 'reddit' ? {
    subreddits: [target.name], includeRules: true, includeModerators: true, includeWeeklyStats: true,
    includePosts: false, includeWiki: false, includeNSFW: false,
  } : { findGroupsBy: 'url', groupUrls: [{ url: target.url }] }
    : platform === 'reddit' ? {
      subreddits: [target.name], maxPosts, maxItems: maxPosts, sort: 'new',
      includeComments: false, includeNSFW: false, fullSubreddit: false, excludeRemoved: true,
    } : { startUrls: [{ url: target.url }], resultsLimit: maxPosts, viewOption: 'CHRONOLOGICAL' };
  const { items, trace, error } = await runActor(actorId, metadata ? 'community_metadata' : 'posts', actorInput, metadata ? 1 : maxPosts, options);
  collection.providerRuns!.push(trace);
  collection.limitations.push(`Apify ${actorId}; run ${trace.runId ?? 'not started'}. Public information only; provider credentials do not grant platform authorization.`);
  if (error) { collection.error = error; collection.limitations.push(error); return collection; }
  for (const item of items) {
    if (item.error || item.errorDescription || item.dataType === 'comment' || item.removed_by_category) continue;
    if (platform === 'reddit' && item.subreddit_type && !['public', 'restricted'].includes(String(item.subreddit_type))) continue;
    if (platform === 'reddit' && typeof item.subreddit === 'string' && item.subreddit.toLowerCase() !== target.name.toLowerCase()) continue;
    const text = metadata ? apifyMetadataText(item, platform) : apifyRecordText(item, platform);
    const hasContent = metadata ? platform === 'reddit' ? Boolean(item.subreddit || item.title || item.description) : Boolean(object(item.identity).name || item.description)
      : platform === 'reddit' ? Boolean(item.title || item.content) : Boolean(item.text || item.groupName || item.groupTitle || item.groupDescription);
    if (!text || !hasContent) continue;
    let sourceUrl = target.url;
    const candidate = metadata && platform === 'facebook' ? object(item.identity).url : item.url ?? item.permalink ?? item.facebookUrl;
    if (typeof candidate === 'string') {
      try {
        const post = new URL(candidate, target.url);
        if (apifyTarget(post.href, platform).name.toLowerCase() !== target.name.toLowerCase()) continue;
        post.search = ''; post.hash = ''; sourceUrl = post.href;
      } catch { continue; }
    }
    const source: Source = {
      url: sourceUrl, text, fetchedAt: new Date().toISOString(), collector: 'apify',
      kind: metadata ? 'community_metadata' : 'posts',
      provider: { actorId, runId: trace.runId!, datasetId: trace.datasetId! },
    };
    collection.sources.push(source);
  }
  trace.usableSourceCount = collection.sources.length;
  if (!collection.sources.length) collection.limitations.push('No usable public records returned; community may be unavailable, private, empty or unsupported.');
  collection.limitations.push(metadata ? 'Public profile/admin/rules coverage may be incomplete; admin visibility is not consent to contact.' : `Observed at most ${maxPosts} posts; not a complete activity history.`);
  return collection;
}
export function collectWithApify(input: string, platform: Platform, options: ApifyOptions = {}) { return collect(input, platform, false, options); }
export function collectApifyMetadata(input: string, platform: Platform, options: ApifyOptions = {}) { return collect(input, platform, true, options); }
