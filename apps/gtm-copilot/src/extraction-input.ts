import { compactExtractionHtml } from './extraction-html.ts';
import type { Source } from './community-scraper.ts';

export function extractionSettings(env: Record<string, string | undefined> = process.env) {
  const setting = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    return value;
  };
  return {
    maxSourceChars: setting('GTM_EXTRACTION_MAX_SOURCE_CHARS', 16000, 2000, 80000),
    maxOutputTokens: setting('GTM_EXTRACTION_MAX_OUTPUT_TOKENS', 4096, 1024, 8192),
  };
}

const datePattern = /article:(?:published|modified)_time|datePublished|dateModified|publishedAt|created_utc|created_at|\b(?:time|timestamp):|\b\d{4}-\d{2}-\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b.{0,20}\b\d{4}\b/i;
const policyPattern = /\b(?:rules?|admin(?:istrator)?s?|moderators?|permission|prohibited|promotion|solicitation|contact|private|visibility|members?|subscribers?)\b/i;
const relevancePattern = /\b(?:event|wedding|video|editing|editor|organizer|planner|videographer|community|description|groupTitle|subreddit)\b/i;

function excerpt(text: string, budget: number) {
  if (text.length <= budget) return text;
  const chunks: { start: number; end: number; score: number }[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + 700);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (boundary > start + 300) end = boundary;
    }
    const body = text.slice(start, end);
    chunks.push({ start, end, score: (start === 0 ? 100 : 0) + (datePattern.test(body) ? 50 : 0) + (policyPattern.test(body) ? 20 : 0) + (relevancePattern.test(body) ? 10 : 0) });
    start = end;
  }
  const selected: typeof chunks = [];
  let remaining = budget;
  for (const chunk of [...chunks].sort((a, b) => b.score - a.score || a.start - b.start)) {
    // Account for separators; keep exact contiguous raw slices for evidence validation.
    const available = remaining - (selected.length ? 2 : 0);
    if (available <= 0) break;
    const end = Math.min(chunk.end, chunk.start + available);
    selected.push({ ...chunk, end });
    remaining -= end - chunk.start + (selected.length > 1 ? 2 : 0);
  }
  return selected.sort((a, b) => a.start - b.start).map((chunk) => text.slice(chunk.start, chunk.end)).join('\n\n');
}

/** Fair per-document budgets preserve social post coverage; leftover space favors metadata. */
export function prepareExtractionSources(sources: Source[], maxChars: number) {
  const nonempty = sources.filter((source) => source.text.trim());
  const budgets = nonempty.map((source) => Math.min(source.text.length, Math.floor(maxChars / Math.max(1, nonempty.length))));
  let remaining = maxChars - budgets.reduce((sum, value) => sum + value, 0);
  const order = nonempty.map((source, index) => ({ source, index })).sort((a, b) => Number(b.source.kind === 'community_metadata') - Number(a.source.kind === 'community_metadata') || a.index - b.index);
  for (const { source, index } of order) {
    const extra = Math.min(remaining, source.text.length - budgets[index]);
    budgets[index] += extra; remaining -= extra;
  }
  const focused = nonempty.map((source, index) => ({ ...source, text: source.format === 'html' ? compactExtractionHtml(source.text, budgets[index]) : excerpt(source.text, budgets[index]) }));
  return { sources: focused, originalChars: nonempty.reduce((sum, source) => sum + source.text.length, 0), selectedChars: focused.reduce((sum, source) => sum + source.text.length, 0) };
}
