import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { APICallError } from 'ai';
import { MarketingDatabase } from '../../src/database.ts';
import { planMarketingSegmentCountryQueries } from '../../src/country-query-planner.ts';
import { countryLanguages, type PlanningJob, type PlanningRequest } from '../planning';
import { withReadStore } from './store';
import { createBulkPlanningService } from './bulk-planning';
import { logAction } from './action-log.ts';

// Single-process local workspace queue. Only one active job per segment, at most three globally.
// No keys, model instances, or mutable database handles are serialized to the browser.
const jobs = new Map<number, PlanningJob>();
const retentionMs = 60 * 60 * 1000;
const bulkPlanning = createBulkPlanningService({
  candidates: () => withReadStore((store) => store.segments()),
  request: (segmentId) => withReadStore((store) => {
    const detail = store.segment(segmentId);
    if (!detail || detail.queries.length) return null;
    return { segmentId, countryIds: detail.countries.map((country) => country.id), queriesPerLanguage: 20 };
  }),
  hasCapacity: () => [...jobs.values()].filter((job) => job.status === 'running').length < 3,
  start: startPlanning,
  status: getPlanningStatus,
});
export function startBulkPlanning() {
  if (!process.env.OPENROUTER_API_KEY?.trim()) return { job: null, error: 'Set OPENROUTER_API_KEY in the server environment or app .env, then restart the server.' };
  return bulkPlanning.start();
}
export const getBulkPlanningStatus = bulkPlanning.getStatus;
function prune() {
  for (const [segmentId, job] of jobs) {
    if (job.finishedAt && Date.now() - Date.parse(job.finishedAt) > retentionMs) jobs.delete(segmentId);
  }
}
export function getPlanningStatus(segmentId: number): PlanningJob | null {
  prune();
  const job = jobs.get(segmentId);
  return job ? structuredClone(job) : null;
}

export function startPlanning(request: PlanningRequest): { job: PlanningJob | null; error: string | null } {
  prune();
  if (jobs.get(request.segmentId)?.status === 'running') return { job: null, error: 'Query generation is already running for this segment. Wait for it to finish.' };
  if ([...jobs.values()].filter((job) => job.status === 'running').length >= 3) return { job: null, error: 'Three planning jobs are already running. Please try again later.' };
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return { job: null, error: 'Set OPENROUTER_API_KEY in the server environment or app .env, then restart the server.' };
  const detail = withReadStore((store) => store.segment(request.segmentId));
  if (!detail) return { job: null, error: 'This segment no longer exists.' };
  const countries = request.countryIds.map((id) => detail.countries.find((country) => country.id === id));
  if (countries.some((country) => !country)) return { job: null, error: 'Every selected country must belong to this segment.' };
  const progress = countries.map((country) => ({
    countryId: country!.id, countryCode: country!.country_code,
    languages: [...(request.languages ?? countryLanguages[country!.country_code] ?? [])],
    status: 'queued' as const, savedCount: 0, error: null,
  }));
  const missing = progress.find((country) => !country.languages.length);
  if (missing) return { job: null, error: `No language defaults for ${missing.countryCode}. Enter explicit language tags.` };
  const job: PlanningJob = {
    id: randomUUID(), segmentId: request.segmentId, status: 'running',
    queriesPerLanguage: request.queriesPerLanguage, startedAt: new Date().toISOString(), finishedAt: null,
    countries: progress,
  };
  const model = createOpenRouter({ apiKey: key })(process.env.GTM_PLANNER_MODEL ?? 'deepseek/deepseek-v4.1-flash');
  // Always pass a cwd-relative resolved path: database.ts's import.meta.url default is CLI-specific.
  const path = resolve(process.env.GTM_DATABASE_PATH ?? 'data/gtm-copilot.sqlite');
  jobs.set(job.segmentId, job);
  logAction('planning.started', { jobId: job.id, segmentId: job.segmentId, countryCount: job.countries.length });
  // Return immediately; polling avoids browser/proxy timeouts on multi-country generation.
  void runJob(job, path, model);
  return { job: structuredClone(job), error: null };
}

async function runJob(job: PlanningJob, path: string, model: Parameters<typeof planMarketingSegmentCountryQueries>[1]['model']) {
  try {
    for (const country of job.countries) {
      country.status = 'running';
      const context = { jobId: job.id, segmentId: job.segmentId, countryId: country.countryId, countryCode: country.countryCode };
      logAction('planning.country.started', context);
      let db: MarketingDatabase | undefined;
      const abortSignal = AbortSignal.timeout(120_000);
      try {
        db = new MarketingDatabase(path, { initializeSchema: false });
        // Recheck ownership before any provider call in case the DB changed while queued.
        if (db.getCountry(country.countryId)?.marketing_segment_id !== job.segmentId) throw new Error('Country no longer belongs to segment.');
        const plan = await planMarketingSegmentCountryQueries({
          marketingSegmentCountryId: country.countryId,
          languages: country.languages,
          queriesPerLanguage: job.queriesPerLanguage,
        }, { database: db, model, abortSignal });
        country.savedCount = plan.savedQueries.length;
        country.status = 'complete';
        logAction('planning.country.complete', { ...context, savedCount: country.savedCount });
      } catch (error) {
        country.status = 'failed';
        country.error = abortSignal.aborted ? 'Generation timed out after two minutes. Retry this country.' : publicPlanningError(error);
        logAction('planning.country.failed', { ...context, timedOut: abortSignal.aborted }, error);
      } finally { db?.close(); }
    }
  } catch (error) {
    logAction('planning.failed', { jobId: job.id, segmentId: job.segmentId }, error);
    for (const country of job.countries) {
      if (country.status === 'queued' || country.status === 'running') {
        country.status = 'failed';
        country.error = 'The planning job stopped unexpectedly. Retry this country.';
      }
    }
  } finally {
    job.status = 'complete';
    job.finishedAt = new Date().toISOString();
    logAction('planning.finished', { jobId: job.id, segmentId: job.segmentId, failedCount: job.countries.filter((country) => country.status === 'failed').length });
  }
}
function publicPlanningError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return 'OpenRouter rejected the request. Check the API key, model access, and account permissions.';
    if (error.statusCode === 402) return 'OpenRouter needs more credits. Check the account balance before retrying.';
    if (error.statusCode === 429) return 'OpenRouter rate limit reached. Please retry later.';
  }
  if (error instanceof Error && 'code' in error && error.code === 'ERR_SQLITE_ERROR') return 'Could not save queries. Check that the SQLite database is initialized and writable.';
  return 'Could not generate valid queries. Check the server configuration and retry this country.';
}
