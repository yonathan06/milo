import { z } from 'zod';
import { resultsFilterSchema } from './results-page.ts';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const enrichmentRequestSchema = z.object({ segmentId: id.optional(), resultId: id.optional(), filters: resultsFilterSchema.optional(), mode: z.enum(['enrichment', 'extraction', 'assessment', 'scrape']).optional(), force: z.boolean().optional() })
  .refine((request) => !request.filters || (request.segmentId === undefined && request.resultId === undefined), { message: 'Filtered scope cannot be combined with a segment or result scope', path: ['filters'] });
export type EnrichmentRequest = z.infer<typeof enrichmentRequestSchema>;
export interface EnrichmentJob {
  id: string;
  status: 'running' | 'complete';
  finishedAt: string | null;
  results: { resultId: number; status: 'queued' | 'running' | 'complete' | 'partial' | 'blocked' | 'failed' | 'skipped'; phase: 'enrichment' | 'extraction' | 'assessment' | 'scrape' | null; error: string | null; step?: string; stepStatus?: string; stepElapsedMs?: number; outputChars?: number; lastActivityAt?: string }[];
}
export function rankingLabel(rating: string | null | undefined, enriched?: boolean): string {
  const score = audienceFitScore(rating);
  return score ? `${score}/3 · ${rating}` : enriched ? 'Enriched · fit unknown' : 'Not enriched';
}
/** Unknown fit is unranked, but successful enrichment sorts above results awaiting extraction. */
export function rankingSortValue(rating: string | null | undefined, enriched?: boolean): number {
  return enriched ? audienceFitScore(rating) : -1;
}
export function audienceFitScore(rating: string | null | undefined): number {
  return rating === 'high' ? 3 : rating === 'medium' ? 2 : rating === 'low' ? 1 : 0;
}
