import { containsSourceQuote } from './extraction-html.ts';
import type { CommunityEnrichment } from './community-enrichment.ts';
import type { Source } from './community-scraper.ts';

export interface ContentDate { value: string; startMs: number; endMs: number }
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Preserve partial precision; use period end to avoid penalizing an uncertain date too early. */
export function parseContentDate(value: string): ContentDate | null {
  const text = value.trim();
  const match = text.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/);
  if (!match || (match[4] && !match[3])) return null;
  const year = Number(match[1]); const month = Number(match[2] ?? 12); const day = Number(match[3] ?? new Date(Date.UTC(year, month, 0)).getUTCDate());
  if (year < 1800 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const endMs = match[4] ? Date.parse(text) : date.getTime() + 86400000 - 1;
  const startMs = match[4] ? endMs : Date.UTC(year, match[2] ? month - 1 : 0, match[3] ? day : 1);
  return Number.isFinite(endMs) ? { value: text, startMs, endMs } : null;
}

export function dateIsGrounded(value: string, quote: string): boolean {
  const target = parseContentDate(value);
  if (!target) return false;
  const candidates: string[] = quote.match(/\b\d{4}(?:-\d{2}(?:-\d{2})?)?(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?\b/g) ?? [];
  for (const month of months) {
    const name = `${month}|${month.slice(0, 3)}${month === 'september' ? '|sept' : ''}`;
    for (const match of quote.matchAll(new RegExp(`\\b(${name})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b`, 'gi'))) candidates.push(`${match[3]}-${String(months.indexOf(month) + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`);
    for (const match of quote.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${name})\\.?[,]?\\s+(\\d{4})\\b`, 'gi'))) candidates.push(`${match[3]}-${String(months.indexOf(month) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`);
    for (const match of quote.matchAll(new RegExp(`\\b(${name})\\.?\\s+(\\d{4})\\b`, 'gi'))) candidates.push(`${match[2]}-${String(months.indexOf(month) + 1).padStart(2, '0')}`);
  }
  // Apify can expose an explicit Unix publication timestamp rather than an ISO date.
  for (const match of quote.matchAll(/(?:created_utc|created_at|publishedAt|published_at|timestamp|time)\s*[":=]+\s*"?(\d{10}|\d{13})\b/g)) {
    const ms = Number(match[1]) * (match[1].length === 10 ? 1000 : 1);
    candidates.push(new Date(ms).toISOString());
  }
  const precision = value.includes('T') ? 'timestamp' : value.length === 4 ? 'year' : value.length === 7 ? 'month' : 'day';
  return candidates.some((candidate) => {
    const parsed = parseContentDate(candidate);
    if (!parsed) return false;
    if (precision === 'timestamp') return parsed.endMs === target.endMs;
    return parsed.value.slice(0, value.length) === value;
  });
}

export function contentRecency(data: CommunityEnrichment, sources: Source[], now = Date.now()) {
  const candidates = [
    ...(data.contentDates ?? []).map((date) => ({ value: date.value, evidence: date.evidence })),
    ...data.latestPosts.filter((post) => post.publishedAt).map((post) => ({ value: post.publishedAt!, evidence: post.publishedAtEvidence ?? post.evidence })),
  ].filter(({ value, evidence }) => dateIsGrounded(value, evidence.quote) && sources.some((source) => source.url === evidence.sourceUrl && containsSourceQuote(source, evidence.quote)));
  const valid = candidates.map((candidate) => ({ ...candidate, date: parseContentDate(candidate.value)! }))
    // Partial current month/year is usable, but explicitly future periods/days are not.
    .filter(({ date }) => date.startMs <= now)
    .sort((a, b) => b.date.endMs - a.date.endMs);
  const newest = valid[0];
  const ageDays = newest ? Math.max(0, Math.floor((now - newest.date.endMs) / 86400000)) : null;
  const scoreCap = ageDays === null || ageDays <= 90 ? null : ageDays > 365 ? 10 : ageDays > 180 ? 25 : 50;
  return { newest, ageDays, scoreCap };
}
