import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { MarketingDatabase } from '../../src/database.ts';
import { runSearchQuery } from '../../src/brave-search.ts';
import type { SearchJob, SearchRequest } from '../search.ts';
import { withReadStore } from './store.ts';
import { createBulkSearchService } from './bulk-search.ts';
import { logAction } from './action-log.ts';

// One active search job globally keeps Brave requests sequential across segments.
// Progress is local to this server process; saved results persist in SQLite.
const jobs = new Map<number, SearchJob>();
const bulkSearch = createBulkSearchService({
  candidates: () => withReadStore((store) => store.unsearchedQueries()),
  isBusy: () => [...jobs.values()].some((job) => job.status === 'running'),
  run: async ({ queryId, segmentId }) => {
    const db = new MarketingDatabase(resolve(process.env.GTM_DATABASE_PATH ?? 'data/gtm-copilot.sqlite'), { initializeSchema: false });
    try {
      const query = db.getQuery(queryId);
      if (!query || db.getCountry(query.marketing_segment_country_id)?.marketing_segment_id !== segmentId || db.hasQueryBeenSearched(queryId)) return null;
      return (await runSearchQuery(queryId, db, { abortSignal: AbortSignal.timeout(120_000) })).fetchedCount;
    } finally { db.close(); }
  },
});
export const getBulkSearchStatus = bulkSearch.getStatus;
export function startBulkSearch() {
  if (!process.env.BRAVE_API_KEY?.trim()) return { job: null, error: 'Set BRAVE_API_KEY in the server environment or app .env, then restart the server.' };
  return bulkSearch.start();
}
function prune() {
  for (const [id, job] of jobs) {
    if (job.finishedAt && Date.now() - Date.parse(job.finishedAt) > 60 * 60 * 1000) jobs.delete(id);
  }
}
export function getSearchStatus(segmentId: number): SearchJob | null {
  prune();
  const job = jobs.get(segmentId);
  return job ? structuredClone(job) : null;
}
export function startSearch(request: SearchRequest): { job: SearchJob | null; error: string | null } {
  prune();
  if (bulkSearch.getStatus()?.status === 'running' || [...jobs.values()].some((job) => job.status === 'running')) return { job: null, error: 'A search is already running. Please wait for it to finish before starting another.' };
  if (!process.env.BRAVE_API_KEY?.trim()) return { job: null, error: 'Set BRAVE_API_KEY in the server environment or app .env, then restart the server.' };
  const detail = withReadStore((store) => store.segment(request.segmentId));
  if (!detail) return { job: null, error: 'This segment no longer exists.' };
  const ids = new Set(detail.queries.map((query) => query.id));
  if (request.queryIds.some((id) => !ids.has(id))) return { job: null, error: 'Every selected query must belong to this segment. Refresh the page and try again.' };
  const job: SearchJob = {
    id: randomUUID(), segmentId: request.segmentId, status: 'running', finishedAt: null,
    queries: request.queryIds.map((queryId) => ({ queryId, status: 'queued', resultCount: 0, error: null })),
  };
  const path = resolve(process.env.GTM_DATABASE_PATH ?? 'data/gtm-copilot.sqlite');
  jobs.set(job.segmentId, job);
  logAction('search.started', { jobId: job.id, segmentId: job.segmentId, queryCount: job.queries.length });
  void runJob(job, path);
  return { job: structuredClone(job), error: null };
}
async function runJob(job: SearchJob, path: string) {
  try {
    for (const progress of job.queries) {
      progress.status = 'running';
      const context = { jobId: job.id, segmentId: job.segmentId, queryId: progress.queryId };
      logAction('search.query.started', context);
      let db: MarketingDatabase | undefined;
      const abortSignal = AbortSignal.timeout(120_000);
      try {
        db = new MarketingDatabase(path, { initializeSchema: false });
        const query = db.getQuery(progress.queryId);
        if (!query || db.getCountry(query.marketing_segment_country_id)?.marketing_segment_id !== job.segmentId) throw new Error('Query no longer belongs to segment.');
        const result = await runSearchQuery(progress.queryId, db, { abortSignal });
        progress.resultCount = result.fetchedCount;
        progress.status = 'complete';
        logAction('search.query.complete', { ...context, resultCount: progress.resultCount });
      } catch (error) {
        logAction('search.query.failed', { ...context, timedOut: abortSignal.aborted }, error);
        progress.status = 'failed';
        progress.error = abortSignal.aborted ? 'Search timed out. Select this query to retry.' : 'Search failed. Check the Brave API key, quota, and database permissions, then retry this query.';
      } finally { db?.close(); }
    }
  } catch (error) {
    logAction('search.failed', { jobId: job.id, segmentId: job.segmentId }, error);
    for (const progress of job.queries) {
      if (progress.status === 'queued' || progress.status === 'running') {
        progress.status = 'failed';
        progress.error = 'The search job stopped unexpectedly. Select this query to retry.';
      }
    }
  } finally {
    job.status = 'complete';
    job.finishedAt = new Date().toISOString();
    logAction('search.finished', { jobId: job.id, segmentId: job.segmentId, failedCount: job.queries.filter((query) => query.status === 'failed').length });
  }
}
