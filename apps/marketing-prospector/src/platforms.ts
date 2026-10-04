import type { Evidence, Platform } from './types.ts';
import { cached, htmlToText, log, truncate } from './util.ts';

export interface Canonical { key: string; platform: Platform; url: string; handle: string }

const MEETUP_RESERVED = new Set(['find', 'topics', 'cities', 'lp', 'apps', 'about', 'pro', 'help', 'login', 'register', 'blog', 'en-us', 'de-de', 'he-il']);
const FB_RESERVED = new Set(['discover', 'feed', 'joins', 'search', 'create', 'category']);
const REDDIT_RESERVED = new Set(['all', 'popular', 'random', 'search']);

/**
 * Map a URL to the community it belongs to (a Reddit post -> its subreddit,
 * a Facebook group post -> the group, etc.). Returns null for non-community URLs.
 */
export function canonicalize(raw: string): Canonical | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|mbasic|old|new|web|de|he|il|business)\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const p0 = parts[0]?.toLowerCase();

  if (host === 'reddit.com' && p0 === 'r' && parts[1] && !REDDIT_RESERVED.has(parts[1].toLowerCase())) {
    const h = parts[1].toLowerCase();
    return { key: `reddit:r/${h}`, platform: 'reddit', url: `https://www.reddit.com/r/${parts[1]}/`, handle: parts[1] };
  }
  if ((host === 'facebook.com' || host === 'fb.com') && p0 === 'groups' && parts[1] && !FB_RESERVED.has(parts[1].toLowerCase())) {
    const h = parts[1].toLowerCase();
    return { key: `facebook:groups/${h}`, platform: 'facebook', url: `https://www.facebook.com/groups/${parts[1]}/`, handle: parts[1] };
  }
  if (host === 'discord.gg' && p0) return discord(parts[0]);
  if ((host === 'discord.com' || host === 'discordapp.com') && p0 === 'invite' && parts[1]) return discord(parts[1]);
  if (host === 'disboard.org' && p0 === 'server' && parts[1]) {
    const id = parts[1] === 'join' ? parts[2] : parts[1];
    if (id) return { key: `discord:disboard/${id}`, platform: 'discord', url: `https://disboard.org/server/${id}`, handle: id };
  }
  if ((host === 't.me' || host === 'telegram.me') && p0) {
    const h = p0 === 's' && parts[1] ? parts[1] : parts[0];
    if (['joinchat', 'addstickers', 'share', 'proxy'].includes(h.toLowerCase())) {
      if (h.toLowerCase() === 'joinchat' && parts[1]) return { key: `telegram:+${parts[1]}`, platform: 'telegram', url: raw, handle: parts[1] };
      return null;
    }
    return { key: `telegram:${h.toLowerCase()}`, platform: 'telegram', url: `https://t.me/${h}`, handle: h };
  }
  if (host === 'chat.whatsapp.com' && p0) {
    return { key: `whatsapp:${parts[0]}`, platform: 'whatsapp', url: `https://chat.whatsapp.com/${parts[0]}`, handle: parts[0] };
  }
  if (host === 'whatsapp.com' && p0 === 'channel' && parts[1]) {
    return { key: `whatsapp:channel/${parts[1]}`, platform: 'whatsapp', url: `https://whatsapp.com/channel/${parts[1]}`, handle: parts[1] };
  }
  if (host === 'meetup.com' && p0 && !MEETUP_RESERVED.has(p0)) {
    return { key: `meetup:${p0}`, platform: 'meetup', url: `https://www.meetup.com/${parts[0]}/`, handle: parts[0] };
  }
  if (host === 'linkedin.com' && p0 === 'groups' && parts[1]) {
    return { key: `linkedin:groups/${parts[1]}`, platform: 'linkedin', url: `https://www.linkedin.com/groups/${parts[1]}/`, handle: parts[1] };
  }
  if (host === 'join.slack.com' && p0 === 't' && parts[1]) {
    return { key: `slack:${parts[1].toLowerCase()}`, platform: 'slack', url: `https://join.slack.com/t/${parts[1]}`, handle: parts[1] };
  }
  if (host === 'skool.com' && p0 && !['discovery', 'signup', 'login', 'pricing'].includes(p0)) {
    return { key: `skool:${p0}`, platform: 'skool', url: `https://www.skool.com/${parts[0]}`, handle: parts[0] };
  }
  if (host.endsWith('.circle.so')) {
    const sub = host.split('.')[0];
    return { key: `circle:${sub}`, platform: 'circle', url: `https://${host}/`, handle: sub };
  }
  if (host.endsWith('.mn.co')) {
    const sub = host.split('.')[0];
    return { key: `mighty:${sub}`, platform: 'mighty', url: `https://${host}/`, handle: sub };
  }
  return null;
}

function discord(code: string): Canonical {
  return { key: `discord:${code}`, platform: 'discord', url: `https://discord.gg/${code}`, handle: code };
}

/** Canonical key for a generic forum (when the LLM says a page is a community). */
export function forumCanonical(raw: string): Canonical | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const first = u.pathname.split('/').filter(Boolean)[0];
    const looksForum = first && /forum|communit|board|discuss|talk|groups?$/i.test(first);
    const path = looksForum ? `/${first}` : '';
    return { key: `forum:${host}${path.toLowerCase()}`, platform: 'forum', url: `https://${host}${path}/`, handle: host };
  } catch { return null; }
}

/** Extract all community links found in a blob of HTML/text. */
export function extractCommunityLinks(html: string): Canonical[] {
  const urls = html.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
  const seen = new Map<string, Canonical>();
  for (const url of urls) {
    const c = canonicalize(url.replace(/[.,;]+$/, ''));
    if (c && !seen.has(c.key)) seen.set(c.key, c);
  }
  return [...seen.values()];
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** Fetch a page as text. Uses Bright Data Web Unlocker when BRIGHTDATA_ZONE is set, else direct, then Jina reader. */
export async function fetchPage(url: string, { maxChars = 12000 } = {}): Promise<{ text: string; html: string } | null> {
  return cached('page', url, async () => {
    const attempts: (() => Promise<string | null>)[] = [];
    if (process.env.BRIGHTDATA_API_TOKEN && process.env.BRIGHTDATA_ZONE) attempts.push(() => brightData(url));
    attempts.push(() => direct(url));
    if (process.env.PROSPECTOR_USE_JINA !== '0') attempts.push(() => jina(url));
    for (const attempt of attempts) {
      try {
        const html = await attempt();
        if (html && !isBlocked(html)) {
          const text = /<html|<body|<div/i.test(html) ? htmlToText(html) : html;
          return { text: truncate(text, maxChars), html: html.slice(0, 400_000) };
        }
      } catch (err) { log(`fetch ${url}: ${(err as Error).message.slice(0, 120)}`); }
    }
    return null;
  }, 24 * 3);
}

function isBlocked(body: string) {
  const head = body.slice(0, 4000);
  return /blocked by network security|Log into Facebook|Just a moment\.\.\.|Access denied|captcha|Please enable JS|Target URL returned error 40[13]/i.test(head) && body.length < 60_000;
}

async function direct(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  return res.ok ? res.text() : null;
}

async function jina(url: string) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { ...(process.env.JINA_API_KEY && { Authorization: `Bearer ${process.env.JINA_API_KEY}` }), 'X-Return-Format': 'markdown' },
    signal: AbortSignal.timeout(45_000),
  });
  return res.ok ? res.text() : null;
}

async function brightData(url: string) {
  const res = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: process.env.BRIGHTDATA_ZONE, url, format: 'raw' }),
    signal: AbortSignal.timeout(90_000),
  });
  return res.ok ? res.text() : null;
}

/** Platform-specific structured probes (public endpoints that don't need auth). */
export async function probePlatform(c: Canonical): Promise<Evidence[]> {
  try {
    switch (c.platform) {
      case 'discord': return await probeDiscord(c);
      case 'telegram': return await probeTelegram(c);
      case 'reddit': return await probeReddit(c);
      default: {
        // Facebook/LinkedIn/WhatsApp require login; others are often public.
        if (['facebook', 'linkedin', 'whatsapp', 'slack'].includes(c.platform) && !process.env.BRIGHTDATA_ZONE) return [];
        const page = await fetchPage(c.url);
        return page ? [{ source: 'page', url: c.url, text: page.text }] : [];
      }
    }
  } catch (err) {
    log(`probe ${c.key} failed: ${(err as Error).message.slice(0, 120)}`);
    return [];
  }
}

async function probeDiscord(c: Canonical): Promise<Evidence[]> {
  if (c.url.includes('disboard.org')) {
    const page = await fetchPage(c.url);
    return page ? [{ source: 'page', url: c.url, text: page.text }] : [];
  }
  const data = await cached('discord', c.handle, async () => {
    const res = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(c.handle)}?with_counts=true`, { signal: AbortSignal.timeout(15_000) });
    return res.ok ? res.json() : null;
  }) as null | { guild?: { name?: string; description?: string }; approximate_member_count?: number; approximate_presence_count?: number; inviter?: { username?: string } };
  if (!data) return [{ source: 'platform_api', url: c.url, text: 'Discord invite is invalid or expired.' }];
  return [{
    source: 'platform_api', url: c.url,
    text: `Discord server "${data.guild?.name}". Description: ${data.guild?.description ?? 'n/a'}. Members: ${data.approximate_member_count}. Online now: ${data.approximate_presence_count}. Invite created by: ${data.inviter?.username ?? 'unknown'}.`,
  }];
}

async function probeTelegram(c: Canonical): Promise<Evidence[]> {
  const page = await fetchPage(`https://t.me/${c.handle}`);
  if (!page) return [];
  const extra = page.html.match(/tgme_page_extra">([^<]+)/)?.[1]?.trim();
  const title = page.html.match(/tgme_page_title"[^>]*>\s*<span[^>]*>([^<]+)/)?.[1]?.trim();
  const desc = page.html.match(/tgme_page_description[^>]*>([\s\S]*?)<\/div>/)?.[1];
  const preview = await fetchPage(`https://t.me/s/${c.handle}`, { maxChars: 4000 });
  return [{
    source: 'platform_api', url: c.url,
    text: `Telegram "${title ?? c.handle}". ${extra ?? ''}. Description: ${desc ? htmlToText(desc) : 'n/a'}.` +
      (preview ? `\nRecent public posts (excerpt):\n${preview.text}` : ''),
  }];
}

async function probeReddit(c: Canonical): Promise<Evidence[]> {
  // Reddit blocks most anonymous datacenter traffic; try JSON, ignore failures.
  const about = await cached('reddit', c.handle, async () => {
    const res = await fetch(`https://www.reddit.com/r/${c.handle}/about.json`, { headers: { 'User-Agent': 'milo-prospector/0.1' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const rules = await fetch(`https://www.reddit.com/r/${c.handle}/about/rules.json`, { headers: { 'User-Agent': 'milo-prospector/0.1' }, signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return { about: await res.json(), rules };
  }) as null | { about: { data?: Record<string, unknown> }; rules: { rules?: { short_name: string; description: string }[] } | null };
  if (!about?.about?.data) return [];
  const d = about.about.data;
  const rules = (about.rules?.rules ?? []).map((r) => `- ${r.short_name}: ${truncate(r.description, 200)}`).join('\n');
  return [{
    source: 'platform_api', url: c.url,
    text: `Subreddit r/${c.handle}: "${d.title}". Subscribers: ${d.subscribers}. Active: ${d.active_user_count ?? d.accounts_active}. Description: ${truncate(String(d.public_description ?? ''), 500)}\nRules:\n${rules}\nModmail: https://www.reddit.com/message/compose?to=r/${c.handle}`,
  }];
}
