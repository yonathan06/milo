import type { AllResult } from './server/store';

export interface ResultFilters { countries: string[]; segments: number[]; search: string }

export function matchesResult(result: AllResult, filters: ResultFilters): boolean {
  // Both filters must match the same discovery, not unrelated country/segment pairs.
  const discoveryMatches = (!filters.countries.length && !filters.segments.length) || result.discoveries.some((item) =>
    (!filters.countries.length || filters.countries.includes(item.country_code)) &&
    (!filters.segments.length || filters.segments.includes(item.segment_id))
  );
  const text = `${result.title} ${result.url} ${result.description} ${result.discoveries.map((item) => item.query).join(' ')}`;
  return discoveryMatches && text.toLowerCase().includes(filters.search.trim().toLowerCase());
}
