import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.PROSPECTOR_DATA_DIR ?? join(APP_DIR, 'data');
export const CACHE_DIR = join(DATA_DIR, 'cache');

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);

export function log(...args: unknown[]) {
  if (process.env.PROSPECTOR_QUIET) return;
  console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

export async function writeText(path: string, data: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

/** Disk cache so re-runs don't burn API quota. */
export async function cached<T>(ns: string, key: string, fn: () => Promise<T>, ttlHours = 24 * 7): Promise<T> {
  if (process.env.PROSPECTOR_NO_CACHE) return fn();
  const path = join(CACHE_DIR, ns, `${sha(key)}.json`);
  try {
    const entry = await readJson<{ at: number; value: T }>(path);
    if (Date.now() - entry.at < ttlHours * 3600_000) return entry.value;
  } catch { /* miss */ }
  const value = await fn();
  await writeJson(path, { at: Date.now(), key, value });
  return value;
}

/** Run tasks with bounded concurrency, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Simple serial rate limiter (min interval between calls). */
export function rateLimiter(perSecond: number) {
  const interval = 1000 / perSecond;
  let chain: Promise<void> = Promise.resolve();
  let last = 0;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = last + interval - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    chain = run.catch(() => {});
    return run.then(fn);
  };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}. Add it to apps/marketing-prospector/.local/.env`);
  return v;
}
