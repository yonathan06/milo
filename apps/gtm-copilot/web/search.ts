import { z } from 'zod';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const startSearchSchema = z.object({
  segmentId: id,
  queryIds: z.array(id).min(1, 'Select at least one query.').max(10000).transform((ids) => [...new Set(ids)]),
});
export const searchStatusSchema = z.object({ segmentId: id });
export type SearchRequest = z.output<typeof startSearchSchema>;
export interface BulkSearchJob {
  id: string;
  status: 'running' | 'complete';
  finishedAt: string | null;
  queries: {
    queryId: number;
    segmentId: number;
    status: 'queued' | 'running' | 'complete' | 'failed' | 'skipped';
    resultCount: number;
    error: string | null;
  }[];
}

export interface SearchJob {
  id: string;
  segmentId: number;
  status: 'running' | 'complete';
  finishedAt: string | null;
  queries: {
    queryId: number;
    status: 'queued' | 'running' | 'complete' | 'failed';
    resultCount: number;
    error: string | null;
  }[];
}
