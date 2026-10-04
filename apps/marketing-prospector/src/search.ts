import type { SearchHit } from './types.ts';
import { cached, log, rateLimiter, requireEnv, sleep, stripTags } from './util.ts';

const limit = rateLimiter(Number(process.env.BRAVE_RPS ?? 1));

const LANG_TO_COUNTRY: Record<string, string> = { en: 'US', de: 'DE', he: 'IL', fr: 'FR', es: 'ES', it: 'IT', nl: 'NL', pt: 'BR' };
const GEO_TO_COUNTRY: Record<string, string> = {
  us: 'US', usa: 'US', 'united states': 'US', uk: 'GB', 'united kingdom': 'GB', germany: 'DE', de: 'DE',
  israel: 'IL', il: 'IL', austria: 'AT', switzerland: 'CH', canada: 'CA', australia: 'AU', france: 'FR', spain: 'ES',
};

export interface SearchOpts { language?: string; geo?: string; count?: number }

export function countryFor(opts: SearchOpts): string | undefined {
  if (opts.geo) {
    const c = GEO_TO_COUNTRY[opts.geo.toLowerCase()];
    if (c) return c;
    if (/^[a-z]{2}$/i.test(opts.geo)) return opts.geo.toUpperCase();
  }
  return opts.language ? LANG_TO_COUNTRY[opts.language] : undefined;
}

/** Brave Web Search. Returns normalized hits. */
export async function webSearch(q: string, opts: SearchOpts = {}): Promise<SearchHit[]> {
  const country = countryFor(opts);
  const params = new URLSearchParams({ q, count: String(opts.count ?? 20), extra_snippets: 'true', safesearch: 'moderate' });
  if (country) params.set('country', country);
  if (opts.language) params.set('search_lang', opts.language === 'he' ? 'he' : opts.language);

  return cached('brave', params.toString(), async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await limit(() => fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { 'X-Subscription-Token': requireEnv('BRAVE_API_KEY'), Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      }));
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (res.status === 422 && params.has('search_lang')) { params.delete('search_lang'); continue; }
      if (!res.ok) { log(`brave ${res.status} for "${q}": ${(await res.text()).slice(0, 150)}`); return []; }
      const body = await res.json() as {
        web?: { results?: { url: string; title: string; description?: string; extra_snippets?: string[]; age?: string }[] };
        discussions?: { results?: { url: string; title: string; description?: string; age?: string }[] };
      };
      const items = [...(body.web?.results ?? []), ...(body.discussions?.results ?? [])];
      return items.map((r) => ({
        url: r.url,
        title: stripTags(r.title ?? ''),
        description: stripTags(r.description ?? ''),
        extraSnippets: ('extra_snippets' in r ? (r.extra_snippets ?? []) : []).map(stripTags),
        query: q,
        age: r.age,
      }));
    }
    return [];
  });
}
