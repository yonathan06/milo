import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { load } from 'cheerio';
import { createRequire } from 'node:module';
import { diagnosticStep, type DiagnosticObserver } from './work-diagnostics.ts';
import { scrapeWithFirecrawl } from './firecrawl.ts';
import { renderWebHtml } from './rendered-web.ts';
import { cleanExtractionHtml, compactExtractionHtml } from './extraction-html.ts';
import { collectWithApify } from './apify.ts';
import { collectWithRedditApis } from './redditapis.ts';
import type { ProviderRun } from './scraping-metadata.ts';
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, text: string) => {
  isAllowed(url: string, userAgent: string): boolean | undefined;
  getCrawlDelay(userAgent: string): number | undefined;
};

export const collectors = ['auto', 'native', 'redditapis', 'playwright', 'firecrawl', 'apify'] as const;
export type Collector = typeof collectors[number];
export interface Source {
  url: string; fetchedAt: string; text: string; collector?: 'native' | 'redditapis' | 'playwright' | 'firecrawl' | 'apify'; format?: 'text' | 'html';
  provider?: { actorId: string; runId: string; datasetId: string };
  kind?: 'posts' | 'community_metadata' | 'web_page';
}
export interface Collection {
  platform: string; sources: Source[]; limitations: string[]; error?: string;
  providerRuns?: ProviderRun[];
}
const userAgent = 'GtmCopilot/1.0';
const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  blocked.addSubnet(ip, prefix, 'ipv4');
}

export async function assertPublicUrl(url: URL) {
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || (url.port && !['80', '443'].includes(url.port))) throw new Error('Only public HTTP(S) URLs on standard ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => {
    if (isIP(address) === 4) return blocked.check(address, 'ipv4');
    // Only global IPv6 unicast; reject mapped IPv4, local, multicast and transition ranges.
    return !/^[23]/i.test(address) || /^(2001:|2002:)/i.test(address);
  })) throw new Error('Refusing a non-public network destination.');
}

export function contentDateMetadata(html: string): string[] {
  const $ = load(html);
  const dates = $('meta[property="article:published_time"], meta[property="article:modified_time"], meta[name="date"], meta[name="pubdate"], meta[itemprop="datePublished"], meta[itemprop="dateModified"], time[datetime], [itemprop="datePublished"], [itemprop="dateModified"]').map((_, el) => {
    const node = $(el);
    return `${node.attr('property') ?? node.attr('name') ?? node.attr('itemprop') ?? 'time datetime'}: ${node.attr('content') ?? node.attr('datetime') ?? node.text().trim()}`;
  }).get();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['datePublished', 'dateModified', 'uploadDate'].includes(key) && typeof child === 'string') dates.push(`${key}: ${child}`);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => { try { visit(JSON.parse($(el).text())); } catch { /* Ignore malformed structured metadata. */ } });
  return [...new Set(dates)].slice(0, 30);
}

export function htmlDocument(html: string, url: string): string {
  const $ = load(html);
  const metadata = $('meta[property^="og:"], meta[name="description"], meta[name="generator"]').map((_, el) =>
    `${$(el).attr('property') ?? $(el).attr('name')}: ${$(el).attr('content') ?? ''}`).get();
  const structured = $('script[type="application/ld+json"]').map((_, el) => $(el).text().slice(0, 8000)).get();
  $('script, style, noscript, svg').remove();
  const links = $('a[href]').slice(0, 150).map((_, el) => {
    try {
      const link = new URL($(el).attr('href')!, url);
      return ['https:', 'http:', 'mailto:'].includes(link.protocol) ? `${$(el).text().trim()} ${link.href}` : '';
    } catch { return ''; }
  }).get();
  return [`Title: ${$('title').text()}`, ...contentDateMetadata(html), ...metadata, ...structured,
    $('body').text().replace(/\s+/g, ' ').trim(), 'Public links:', ...links].join('\n').slice(0, 40000);
}

export async function collectCommunitySources(input: string, options: {
  fetch?: typeof globalThis.fetch;
  abortSignal?: AbortSignal;
  redditToken?: string;
  redditApiKey?: string;
  collector?: Collector;
  onDiagnostic?: DiagnosticObserver;
  firecrawlApiKey?: string;
  apifyApiKey?: string;
  maxPosts?: number;
  apifyMaxChargeUsd?: number;
  requestDelayMs?: number;
  validateUrl?: (url: URL) => Promise<void>;
} = {}): Promise<Collection> {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  const belongsTo = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  const platform = belongsTo('facebook.com') || belongsTo('fb.com') ? 'facebook'
    : belongsTo('reddit.com') || belongsTo('redd.it') ? 'reddit' : 'web';
  const collection: Collection = { platform, sources: [], limitations: [] };
  const selected = options.collector ?? process.env.GTM_SCRAPE_COLLECTOR ?? 'auto';
  if (!collectors.includes(selected as Collector)) throw new Error('Collector must be auto, native, redditapis, playwright, firecrawl, or apify.');
  const apifyApiKey = (options.apifyApiKey ?? process.env.APIFY_KEY)?.trim() ?? '';
  const redditToken = (options.redditToken ?? process.env.REDDIT_ACCESS_TOKEN)?.trim();
  const redditApiKey = (options.redditApiKey ?? process.env.REDDITAPIS_API_KEY)?.trim() ?? '';
  if (platform === 'reddit' && (selected === 'redditapis' || selected === 'auto')) {
    return collectWithRedditApis(input, {
      apiKey: redditApiKey, maxPosts: options.maxPosts, fetch: options.fetch, abortSignal: options.abortSignal, onDiagnostic: options.onDiagnostic,
    });
  }
  if (selected === 'redditapis' && platform !== 'reddit') throw new Error('The RedditApis collector supports Reddit community and post URLs only.');
  if (selected === 'apify' && platform !== 'facebook') throw new Error('The Apify collector supports Facebook group URLs only. Use redditapis for Reddit.');
  if (platform === 'facebook' && (selected === 'apify' || selected === 'auto' && apifyApiKey)) {
    return collectWithApify(input, platform, {
      apiKey: apifyApiKey, maxPosts: options.maxPosts, maxChargeUsd: options.apifyMaxChargeUsd,
      fetch: options.fetch, abortSignal: options.abortSignal, onDiagnostic: options.onDiagnostic,
    });
  }
  if (platform === 'facebook') {
    collection.limitations.push('Facebook collection needs APIFY_KEY for the public-groups Actor, or an authorized integration/admin export. No login/captcha bypass is attempted; review platform authorization requirements.');
    return collection;
  }
  const fetch = options.fetch ?? globalThis.fetch;
  const validate = options.validateUrl ?? assertPublicUrl;
  let allowed: ((target: URL) => boolean) | undefined;
  let crawlDelayMs = 0;
  const read = async (target: URL, headers: Record<string, string> = {}, redirects = 0): Promise<{ text: string; url: string; type: string }> => diagnosticStep(options.onDiagnostic, 'collection.http', { hostname: target.hostname, path: target.pathname, redirects, timeoutMs: 20000 }, async () => {
    await validate(target);
    if (allowed && !allowed(target)) throw new Error(`robots.txt disallows ${target.href}`);
    await delay(Math.max(options.requestDelayMs ?? 1100, crawlDelayMs), undefined, { signal: options.abortSignal });
    const response = await fetch(target, {
      redirect: 'manual', headers: { 'User-Agent': userAgent, ...headers },
      signal: options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects >= 3) throw new Error('Invalid or excessive redirects.');
      const next = new URL(location, target);
      // Do not forward credentials or evade the original site's robots policy.
      if (next.origin !== target.origin) throw new Error('Cross-origin redirect requires a separately reviewed URL.');
      return read(next, headers, redirects + 1);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} at ${target.href}`);
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
          if (size > 2_000_000) throw new Error('Page exceeds 2 MB limit.');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
    }
    return { text: Buffer.concat(chunks).toString('utf8'), url: target.href, type: response.headers.get('content-type') ?? '' };
  }, (page) => ({ characters: page.text.length, contentType: page.type }));
  const add = (url: string, text: string, collector: 'native' | 'playwright' | 'firecrawl' = 'native', kind: Source['kind'] = 'web_page', format: Source['format'] = 'text') => collection.sources.push({
    url, text: format === 'html' ? compactExtractionHtml(text, 40000) : text.slice(0, 40000), fetchedAt: new Date().toISOString(), collector, kind, format,
  });
  if (platform === 'reddit') {
    const token = redditToken;
    const subreddit = url.pathname.match(/^\/r\/([a-z0-9_]+)(?:\/|$)/i)?.[1];
    if (!token || !subreddit) {
      collection.limitations.push('Reddit native collection requires a /r/subreddit URL and approved OAuth access with REDDIT_ACCESS_TOKEN. Use the default redditapis integration with REDDITAPIS_API_KEY for community and post URLs. Review platform terms and commercial-use permissions.');
      return collection;
    }
    for (const path of ['about', 'new?limit=10', 'about/moderators']) {
      const target = new URL(`https://oauth.reddit.com/r/${subreddit}/${path}`);
      try {
        const page = await read(target, { Authorization: `Bearer ${token}`, Accept: 'application/json' });
        const json = JSON.parse(page.text);
        // Limit retention to community metadata/posts and explicitly listed moderators.
        const compact = path === 'about' ? {
          name: json.data?.display_name, title: json.data?.title, description: json.data?.public_description,
          rulesAndDescription: json.data?.description, subscribers: json.data?.subscribers,
        } : path.startsWith('new') ? json.data?.children?.slice(0, 10).map(({ data }: any) => ({
          title: data.title, text: data.selftext?.slice(0, 3000), url: `https://www.reddit.com${data.permalink}`,
          publishedAt: new Date(data.created_utc * 1000).toISOString(), comments: data.num_comments,
        })) : json.data?.children?.map((data: any) => ({ moderator: data.name }));
        add(page.url, JSON.stringify(compact ?? {}), 'native', path.startsWith('new') ? 'posts' : 'community_metadata');
      } catch (error) { collection.limitations.push(String(error)); }
    }
    collection.limitations.push('Reddit coverage is limited to community metadata, ten newest posts and visible moderators. Respect approved retention/deletion requirements.');
    return collection;
  }
  const firecrawlApiKey = (options.firecrawlApiKey ?? process.env.FIRECRAWL_API_KEY)?.trim() ?? '';
  const usePlaywright = selected === 'playwright' || selected === 'auto';
  const useFirecrawl = selected === 'firecrawl';
  if (useFirecrawl && !firecrawlApiKey) throw new Error('Set FIRECRAWL_API_KEY to use the Firecrawl collector.');
  // Fail closed when robots cannot be fetched, except an explicit 404 (no policy).
  const robotsUrl = new URL('/robots.txt', url);
  let robotsText: string;
  try { robotsText = (await read(robotsUrl)).text; }
  catch (error) {
    if (String(error).includes('HTTP 404 ')) robotsText = '';
    else { collection.limitations.push(`Cannot establish robots policy: ${String(error)}`); return collection; }
  }
  const robots = robotsParser(robotsUrl.href, robotsText);
  allowed = (target) => robots.isAllowed(target.href, userAgent) !== false;
  const crawlDelay = robots.getCrawlDelay(userAgent);
  crawlDelayMs = (crawlDelay ?? 0) * 1000;
  if (crawlDelay && crawlDelay > 60) {
    collection.limitations.push('Site crawl delay exceeds this interactive scraper budget.');
    return collection;
  }
  const fetchPage = async (target: URL, json = false) => {
    if (robots.isAllowed(target.href, userAgent) === false) throw new Error(`robots.txt disallows ${target.href}`);
    // Discourse's public JSON endpoints remain native; render only HTML community pages.
    if (usePlaywright && !json) {
      await delay(Math.max(options.requestDelayMs ?? 1100, crawlDelayMs), undefined, { signal: options.abortSignal });
      const rendered = await renderWebHtml(target, { validateUrl: validate, isAllowed: (next) => allowed!(next), abortSignal: options.abortSignal, onDiagnostic: options.onDiagnostic });
      const cleaned = cleanExtractionHtml(rendered.html, rendered.url, contentDateMetadata(rendered.html));
      add(rendered.url, cleaned, 'playwright', 'web_page', 'html');
      collection.limitations.push(...rendered.limitations);
      return rendered.html;
    }
    if (useFirecrawl && !json) {
      await delay(Math.max(options.requestDelayMs ?? 1100, crawlDelayMs), undefined, { signal: options.abortSignal });
      const page = await diagnosticStep(options.onDiagnostic, 'collection.firecrawl', { hostname: target.hostname, path: target.pathname }, () => scrapeWithFirecrawl(target, {
        apiKey: firecrawlApiKey, fetch, abortSignal: options.abortSignal, validateUrl: validate,
        isAllowed: (next) => allowed!(next) && robots.isAllowed(next.href, 'FirecrawlAgent') !== false,
      }), (page) => ({ characters: page.text.length }));
      if (page.html) add(page.url, cleanExtractionHtml(page.html, page.url, contentDateMetadata(page.html)), 'firecrawl', 'web_page', 'html');
      else add(page.url, page.text, 'firecrawl');
      if (page.warning) collection.limitations.push(`Firecrawl warning: ${page.warning.slice(0, 1000)}`);
      return page.html;
    }
    const page = await read(target);
    // Redirect destinations also need permission.
    if (robots.isAllowed(page.url, userAgent) === false) throw new Error('robots.txt disallows redirected page.');
    if (json) { JSON.parse(page.text); add(page.url, page.text); }
    else {
      if (!/text\/html|application\/xhtml\+xml/i.test(page.type)) throw new Error('Expected an HTML community page.');
      if (/captcha|verify you are human|log in to continue/i.test(page.text)) throw new Error('Login or bot challenge; no bypass attempted.');
      add(page.url, cleanExtractionHtml(page.text, page.url, contentDateMetadata(page.text)), 'native', 'web_page', 'html');
    }
    return page.text;
  };
  try {
    const html = await fetchPage(url);
    const $ = load(html);
    if (/discourse/i.test($('meta[name="generator"]').attr('content') ?? '')) {
      collection.platform = 'discourse';
      for (const path of ['/about.json', '/latest.json']) {
        try { await fetchPage(new URL(path, url), true); }
        catch (error) { collection.limitations.push(String(error)); }
      }
    } else {
      // Follow only clearly labelled public community/contact/rules pages on the same origin.
      const links = new Set<string>();
      const baseUrl = new URL(collection.sources[0]?.url ?? url.href);
      $('a[href]').each((_, element) => {
        const label = $(element).text().trim();
        if (!/^(about(?: us| the community)?|contact(?: us)?|community rules|rules|guidelines|team|staff)$/i.test(label)) return;
        try {
          const next = new URL($(element).attr('href')!, baseUrl);
          next.hash = '';
          if (next.origin === url.origin && next.href !== url.href && !next.search) links.add(next.href);
        } catch { /* Ignore malformed links. */ }
      });
      for (const link of [...links].slice(0, 2)) {
        try { await fetchPage(new URL(link)); }
        catch (error) {
          collection.limitations.push(String(error));
          if (useFirecrawl) break; // Do not keep spending credits after a provider/access failure.
        }
      }
      collection.limitations.push(useFirecrawl || usePlaywright
        ? 'Coverage is limited to the rendered landing page and at most two public about/contact/rules pages; private content and complete activity history are unavailable.'
        : 'Coverage is limited to the landing page and at most two public about/contact/rules pages; dynamic/private content and complete activity history are unavailable.');
    }
  } catch (error) {
    collection.limitations.push(String(error));
    if ((useFirecrawl || usePlaywright) && !collection.sources.length) {
      collection.error = error instanceof Error ? error.message : String(error);
    }
  }
  return collection;
}
