import { z } from 'zod';

export const linkRankingRequestSchema = z.object({ resultId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() });
export type LinkRankingRequest = z.infer<typeof linkRankingRequestSchema>;

export interface LinkRankingJob {
  id: string;
  status: 'running' | 'complete' | 'failed';
  total: number;
  processed: number;
  failed: number;
  inputTokens: number;
  finishedAt: string | null;
  error: string | null;
}
export interface LinkRankingStatus {
  pendingCount: number;
  error: string | null;
  job: LinkRankingJob | null;
}
