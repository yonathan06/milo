import { randomUUID } from 'node:crypto';
import type { BulkSearchJob } from '../search.ts';
import { logAction } from './action-log.ts';

type Candidate = { queryId: number; segmentId: number };
export function createBulkSearchService(deps: {
  candidates: () => Candidate[];
  isBusy: () => boolean;
  run: (query: Candidate) => Promise<number | null>;
}) {
  let job: BulkSearchJob | null = null;
  function getStatus() {
    if (job?.finishedAt && Date.now() - Date.parse(job.finishedAt) > 3600000) job = null;
    return job ? structuredClone(job) : null;
  }
  async function run(current: BulkSearchJob) {
    try {
      for (const query of current.queries) {
        query.status = 'running';
        const context = { jobId: current.id, segmentId: query.segmentId, queryId: query.queryId };
        logAction('bulk-search.query.started', context);
        try {
          const count = await deps.run(query);
          query.resultCount = count ?? 0;
          query.status = count === null ? 'skipped' : 'complete';
          logAction(`bulk-search.query.${query.status}`, { ...context, resultCount: query.resultCount });
        } catch (error) {
          logAction('bulk-search.query.failed', context, error);
          query.status = 'failed';
          query.error = 'Search failed. Check the Brave API key, quota, and database permissions, then retry.';
        }
      }
    } finally {
      current.status = 'complete';
      current.finishedAt = new Date().toISOString();
      logAction('bulk-search.finished', { jobId: current.id, failedCount: current.queries.filter((query) => query.status === 'failed').length });
    }
  }
  return {
    getStatus,
    start(): { job: BulkSearchJob | null; error: string | null } {
      if (getStatus()?.status === 'running' || deps.isBusy()) return { job: null, error: 'A search is already running. Wait for it to finish.' };
      const candidates = deps.candidates();
      if (!candidates.length) return { job: null, error: 'All queries have already been searched.' };
      job = { id: randomUUID(), status: 'running', finishedAt: null, queries: candidates.map((query) => ({ ...query, status: 'queued', resultCount: 0, error: null })) };
      logAction('bulk-search.started', { jobId: job.id, queryCount: job.queries.length });
      void run(job);
      return { job: structuredClone(job), error: null };
    },
  };
}
