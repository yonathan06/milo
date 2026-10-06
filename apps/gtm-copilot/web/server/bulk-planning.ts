import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { BulkPlanningJob, PlanningJob, PlanningRequest } from '../planning.ts';
import { logAction } from './action-log.ts';

interface Dependencies {
  candidates: () => { id: number; name: string; query_count: number }[];
  request: (segmentId: number) => PlanningRequest | null;
  hasCapacity: () => boolean;
  start: (request: PlanningRequest) => { job: PlanningJob | null; error: string | null };
  status: (segmentId: number) => PlanningJob | null;
  wait?: () => Promise<unknown>;
}

/** Server-owned queue: leaving the page never interrupts planning. */
export function createBulkPlanningService(deps: Dependencies) {
  let job: BulkPlanningJob | null = null;
  const wait = deps.wait ?? (() => delay(1000));
  function getStatus() {
    if (job?.finishedAt && Date.now() - Date.parse(job.finishedAt) > 60 * 60 * 1000) job = null;
    return job ? structuredClone(job) : null;
  }
  function start() {
    if (job?.status === 'running') return { job: null, error: 'Bulk query planning is already running.' };
    const segments = deps.candidates().filter((segment) => segment.query_count === 0);
    if (!segments.length) return { job: null, error: 'All segments already have queries.' };
    job = {
      id: randomUUID(), status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
      segments: segments.map((segment) => ({ segmentId: segment.id, name: segment.name, status: 'queued', savedCount: 0, error: null })),
    };
    logAction('bulk-planning.started', { jobId: job.id, segmentCount: job.segments.length });
    void run(job);
    return { job: structuredClone(job), error: null };
  }
  async function run(batch: BulkPlanningJob) {
    try {
      for (const segment of batch.segments) {
        try {
          while (!deps.hasCapacity()) await wait();
          // Recheck immediately before starting: another planner/CLI may have saved queries.
          const request = deps.request(segment.segmentId);
          if (!request || deps.status(segment.segmentId)?.status === 'running') {
            segment.status = 'skipped';
            continue;
          }
          if (!request.countryIds.length) throw new Error('No countries assigned. Assign countries before planning queries.');
          const response = deps.start(request);
          if (response.error || !response.job) throw new Error(response.error ?? 'Could not start query planning.');
          segment.status = 'running';
          let progress: PlanningJob | null = response.job;
          while (progress?.status === 'running') {
            segment.savedCount = progress.countries.reduce((total, country) => total + country.savedCount, 0);
            await wait();
            progress = deps.status(segment.segmentId);
          }
          if (!progress) throw new Error('Planning status was lost. Check this segment before retrying.');
          segment.savedCount = progress.countries.reduce((total, country) => total + country.savedCount, 0);
          const failures = progress.countries.filter((country) => country.status === 'failed');
          segment.status = failures.length ? 'failed' : 'complete';
          segment.error = failures.length ? failures.map((country) => `${country.countryCode}: ${country.error}`).join(' · ') : null;
        } catch (error) {
          logAction('bulk-planning.segment.failed', { jobId: batch.id, segmentId: segment.segmentId }, error);
          segment.status = 'failed';
          segment.error = error instanceof Error ? error.message : 'Could not plan queries for this segment.';
        }
      }
    } finally {
      batch.status = 'complete';
      batch.finishedAt = new Date().toISOString();
      logAction('bulk-planning.finished', { jobId: batch.id, failedCount: batch.segments.filter((segment) => segment.status === 'failed').length });
    }
  }
  return { start, getStatus };
}
