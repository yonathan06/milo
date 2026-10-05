import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { MarketingDatabase, type SearchResultInput } from './database.ts';

const braveResponseSchema = z.object({
  query: z.object({ more_results_available: z.boolean().optional() }).optional(),
  web: z.object({
    results: z.array(z.object({
      url: z.url(),
      title: z.string(),
      description: z.string().default(''),
    })),
  }).optional(),
});

export interface BraveSearchOptions {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  abortSignal?: AbortSignal;
  /** Delay before each request, including between queries. Default: 1100ms. */
  requestDelayMs?: number;
}

/** Read the first 50 web results (or fewer when Brave exhausts the search). */
export async function searchBrave(
  query: string,
  countryCode: string,
  options: BraveSearchOptions = {},
): Promise<SearchResultInput[]> {
  const apiKey = (options.apiKey ?? process.env.BRAVE_API_KEY)?.trim();
  if (!apiKey) throw new Error('Set BRAVE_API_KEY in the environment or apps/gtm-copilot/.env.');
  const requestDelayMs = options.requestDelayMs ?? 1100;
  if (!Number.isFinite(requestDelayMs) || requestDelayMs < 0) {
    throw new Error('requestDelayMs must be a nonnegative finite number.');
  }
  const fetch = options.fetch ?? globalThis.fetch;
  const results: SearchResultInput[] = [];
  for (let offset = 0; offset < 3; offset++) {
    // Brave offsets are page numbers, not result indices. Keep count fixed at 20
    // so page 3 starts at result 41; truncate that page to the remaining ten.
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('country', countryCode);
    url.searchParams.set('count', '20');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('result_filter', 'web');
    if (requestDelayMs > 0) await delay(requestDelayMs, undefined, { signal: options.abortSignal });
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal: options.abortSignal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Brave Search failed (HTTP ${response.status}, page ${offset + 1}).`);
    }
    const page = braveResponseSchema.parse(await response.json());
    const items = page.web?.results ?? [];
    for (const item of items.slice(0, 50 - results.length)) {
      results.push({ ...item, rank: results.length + 1 });
    }
    if (results.length === 50 || items.length === 0 || page.query?.more_results_available === false) break;
    // Older responses may omit the pagination flag.
    if (page.query?.more_results_available === undefined && items.length < 20) break;
  }
  return results;
}

/** Fetch all pages before writing anything, so a failed page cannot leave partial results. */
export async function runSearchQuery(
  queryId: number,
  database: MarketingDatabase,
  options: BraveSearchOptions = {},
) {
  if (!Number.isSafeInteger(queryId) || queryId < 1) throw new Error('queryId must be a positive integer.');
  const query = database.getQuery(queryId);
  if (!query) throw new Error(`Search query ${queryId} does not exist.`);
  const country = database.getCountry(query.marketing_segment_country_id);
  if (!country) throw new Error(`Country ${query.marketing_segment_country_id} does not exist.`);
  const results = await searchBrave(query.query, country.country_code, options);
  const savedResults = database.saveSearchResults(queryId, results);
  return { queryId, fetchedCount: results.length, savedResults };
}
