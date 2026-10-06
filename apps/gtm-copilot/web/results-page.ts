import { z } from 'zod';
import { matchesResult } from './result-filters.ts';
import { compareMatchResults } from './assessment-display.ts';
import type { AllResult } from './server/store';

export const resultsPageSchema = z.object({
  page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
  sort: z.enum(['fit', 'posting', 'adminContact', 'result', 'countries', 'segments', 'collected']).default('fit'),
  descending: z.boolean().default(true),
  search: z.string().max(500).default(''),
  countries: z.array(z.string().max(10)).max(250).default([]),
  segments: z.array(z.number().int().positive()).max(1000).default([]),
});
export type ResultsPageRequest = z.infer<typeof resultsPageSchema>;

/** Rank and filter the complete scope on the server; serialize only the requested page. */
export function paginateResults(results: AllResult[], request: ResultsPageRequest) {
  const value = (result: AllResult): string => {
    switch (request.sort) {
      case 'posting': return result.posting_permission ?? 'unknown';
      case 'adminContact': return result.admin_contact_permission ?? 'unknown';
      case 'result': return result.title || result.url;
      case 'countries': return [...new Set(result.discoveries.map((item) => item.country_code))].sort().join(', ');
      case 'segments': return [...new Set(result.discoveries.map((item) => item.segment_name))].sort().join(', ');
      case 'collected': return result.discoveries[0]?.collected_at ?? '';
      default: return '';
    }
  };
  const filtered = results.filter((result) => matchesResult(result, request)).sort((a, b) => {
    const compared = request.sort === 'fit' ? compareMatchResults(a, b, request.descending)
      : value(a).localeCompare(value(b), undefined, { numeric: true, sensitivity: 'base' }) * (request.descending ? -1 : 1);
    return compared || b.created_at.localeCompare(a.created_at) || b.id - a.id;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / request.pageSize));
  const page = Math.min(request.page, pageCount);
  return {
    results: filtered.slice((page - 1) * request.pageSize, page * request.pageSize),
    page, pageCount, matchedCount: filtered.length, totalCount: results.length,
    enrichedCount: results.filter((result) => result.enriched).length,
    pendingCount: results.filter((result) => result.assessment_status !== 'complete').length,
    pendingAssessmentCount: results.filter((result) => result.assessment_ready && result.assessment_status !== 'complete').length,
    countries: [...new Set(results.flatMap((result) => result.discoveries.map((item) => item.country_code)))].sort(),
    segments: [...new Map(results.flatMap((result) => result.discoveries.map((item) => [item.segment_id, item.segment_name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1])),
  };
}
