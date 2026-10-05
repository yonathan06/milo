import { z } from 'zod';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const enrichmentRequestSchema = z.object({ segmentId: id.optional(), resultId: id.optional(), mode: z.enum(['enrichment', 'assessment']).optional(), force: z.boolean().optional() });
export type EnrichmentRequest = z.infer<typeof enrichmentRequestSchema>;
export interface EnrichmentJob {
  id: string;
  status: 'running' | 'complete';
  finishedAt: string | null;
  results: { resultId: number; status: 'queued' | 'running' | 'complete' | 'partial' | 'blocked' | 'failed' | 'skipped'; phase: 'enrichment' | 'assessment' | null; error: string | null }[];
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
