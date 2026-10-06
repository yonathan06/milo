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
