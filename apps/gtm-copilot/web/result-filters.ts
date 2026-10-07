import type { AllResult } from './server/store';

export interface ResultFilters {
  countries: string[]; segments: number[]; search: string;
  host?: 'all' | 'reddit' | 'facebook' | 'x' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok' | 'custom';
  customHost?: string;
  jevMin?: number; jevMax?: number;
  ranking?: 'all' | 'ranked' | 'unranked';
  enrichment?: 'all' | 'enriched' | 'not_enriched';
}

const hostDomains = {
  reddit: ['reddit.com', 'redd.it'], facebook: ['facebook.com', 'fb.com', 'fb.watch'],
  x: ['x.com', 'twitter.com', 't.co'], instagram: ['instagram.com'], linkedin: ['linkedin.com', 'lnkd.in'],
  youtube: ['youtube.com', 'youtu.be'], tiktok: ['tiktok.com'],
} as const;

/** Match parsed hostnames, never URL text or lookalike domains. Includes subdomains. */
export function matchesResultHost(url: string, filters: Pick<ResultFilters, 'host' | 'customHost'>): boolean {
  if (!filters.host || filters.host === 'all') return true;
  const domains = filters.host === 'custom' ? [filters.customHost?.trim().toLowerCase().replace(/^www\./, '') ?? ''] : hostDomains[filters.host];
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return domains.some(domain => Boolean(domain) && (hostname === domain || hostname.endsWith(`.${domain}`)));
  } catch { return false; }
}

/** Use current display scores only: missing, failed and stale rankings are unranked. */
export function matchesResultState(result: Pick<AllResult, 'jev_score' | 'enriched'>, filters: ResultFilters): boolean {
  const ranked = result.jev_score != null;
  if ((filters.ranking === 'ranked' && !ranked) || (filters.ranking === 'unranked' && ranked)) return false;
  const min = filters.jevMin ?? 0;
  const max = filters.jevMax ?? 100;
  if ((min > 0 || max < 100) && (!ranked || result.jev_score! < min || result.jev_score! > max)) return false;
  if ((filters.enrichment === 'enriched' && !result.enriched) || (filters.enrichment === 'not_enriched' && result.enriched)) return false;
  return true;
}

export function matchesResult(result: AllResult, filters: ResultFilters): boolean {
  // Both filters must match the same discovery, not unrelated country/segment pairs.
  const discoveryMatches = (!filters.countries.length && !filters.segments.length) || result.discoveries.some((item) =>
    (!filters.countries.length || filters.countries.includes(item.country_code)) &&
    (!filters.segments.length || filters.segments.includes(item.segment_id))
  );
  const text = `${result.title} ${result.url} ${result.description} ${result.discoveries.map((item) => item.query).join(' ')}`;
  return discoveryMatches && matchesResultHost(result.url, filters) && matchesResultState(result, filters) && text.toLowerCase().includes(filters.search.trim().toLowerCase());
}
