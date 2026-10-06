import { resultsPageSchema, type ResultsPageRequest } from './results-page.ts';

export const defaultResultsSearch = resultsPageSchema.parse({});

/** Invalid URL fields fall back independently so a malformed link still loads. */
export function parseResultsSearch(search: Record<string, unknown>): ResultsPageRequest {
  const normalized = { ...search };
  for (const key of ['page', 'pageSize', 'jevMin', 'jevMax'] as const) {
    if (typeof normalized[key] === 'string' && normalized[key] !== '') normalized[key] = Number(normalized[key]);
  }
  if (normalized.descending === 'true') normalized.descending = true;
  if (normalized.descending === 'false') normalized.descending = false;
  for (const key of ['countries', 'segments'] as const) {
    if (normalized[key] != null && !Array.isArray(normalized[key])) normalized[key] = [normalized[key]];
  }
  if (Array.isArray(normalized.segments)) normalized.segments = normalized.segments.map((id) => typeof id === 'string' ? Number(id) : id);
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(defaultResultsSearch) as (keyof ResultsPageRequest)[]) {
    const parsed = resultsPageSchema.shape[key].safeParse(normalized[key]);
    values[key] = parsed.success ? parsed.data : defaultResultsSearch[key];
  }
  if (Number(values.jevMin) > Number(values.jevMax)) {
    values.jevMin = defaultResultsSearch.jevMin;
    values.jevMax = defaultResultsSearch.jevMax;
  }
  return resultsPageSchema.parse(values);
}
