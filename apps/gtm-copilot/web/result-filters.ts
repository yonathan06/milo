import type { AllResult } from './server/store';

export interface ResultFilters {
  countries: string[]; segments: number[]; search: string;
  jevMin?: number; jevMax?: number;
  ranking?: 'all' | 'ranked' | 'unranked';
  enrichment?: 'all' | 'enriched' | 'not_enriched';
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
  return discoveryMatches && matchesResultState(result, filters) && text.toLowerCase().includes(filters.search.trim().toLowerCase());
}
