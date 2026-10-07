import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MarketingDatabase } from '../../src/database.ts';
import type { AssessmentSummary } from '../../src/assessment-state.ts';
import { enrichmentModels } from '../../src/enrichment-models.ts';
import { enrichAndAssess } from '../../src/enrichment-pipeline.ts';
import { enrichSearchResult } from '../../src/community-enrichment.ts';
import { enrichmentRequestSchema, type EnrichmentJob, type EnrichmentRequest } from '../enrichment.ts';
import { openReadStore } from './store.ts';
import { logAction } from './action-log.ts';

// Scraping, enrichment and assessment use the same sequential queue/lock. Factory isolates job tests from the live server.
export function createEnrichmentService(options: { path?: string; apiKey?: string; processWork?: typeof enrichAndAssess; scrapeWork?: typeof enrichSearchResult } = {}) {
  let job: EnrichmentJob | null = null;
  const path = () => resolve(options.path ?? process.env.GTM_DATABASE_PATH ?? 'data/gtm-copilot.sqlite');
  const getStatus = (): EnrichmentJob | null => {
    if (job?.finishedAt && Date.now() - Date.parse(job.finishedAt) > 3600000) job = null;
    return job ? structuredClone(job) : null;
  };
  const start = (input: EnrichmentRequest): { job: EnrichmentJob | null; error: string | null } => {
    const request = enrichmentRequestSchema.parse(input);
    getStatus();
    if (job?.status === 'running') return { job: null, error: 'Scraping, enrichment or assessment is already running. Wait for it to finish.' };
    const scopeStarted = Date.now();
    logAction('enrichment.scope.started', { mode: request.mode ?? 'enrichment', filtered: Boolean(request.filters), segmentId: request.segmentId, resultId: request.resultId });
    const store = openReadStore(path());
    let results: { id: number; assessment_status: AssessmentSummary['assessment_status']; assessment_ready: boolean; scraped?: boolean }[] | undefined;
    try { results = request.filters ? store.filteredEnrichmentResults(request.filters) : request.segmentId === undefined ? store.results() : store.segment(request.segmentId)?.results; }
    finally { store.close(); }
    logAction('enrichment.scope.completed', { elapsedMs: Date.now() - scopeStarted, matchedCount: results?.length ?? 0 });
    if (!results) return { job: null, error: 'This segment no longer exists.' };
    if (request.filters && !results.length) return { job: null, error: 'No results match the current filters.' };
    if (request.resultId !== undefined && !results.some((result) => result.id === request.resultId)) return { job: null, error: 'This result no longer exists in the requested scope.' };
    const pending = results.filter((result) => (request.resultId === undefined || result.id === request.resultId)
      && (request.mode !== 'assessment' || result.assessment_ready)
      && (request.mode !== 'extraction' || result.scraped && !result.assessment_ready)
      // Scrape jobs only queue results without saved scrape sources; other modes reprocess on force or pending assessment.
      && (request.mode !== 'scrape' || !result.scraped)
      && (request.mode === 'scrape' || request.force || result.assessment_status !== 'complete'));
    if (!pending.length) return { job: null, error: request.mode === 'assessment' ? 'No enriched results need assessment in this scope.'
      : request.mode === 'extraction' ? 'No scraped results need extraction in this scope.'
      : request.mode === 'scrape' ? 'All results in this scope have already been scraped.'
      : 'All results in this scope are already enriched and assessed.' };
    const apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY)?.trim();
    if (!apiKey && request.mode !== 'scrape') return { job: null, error: 'Set OPENROUTER_API_KEY in the server environment and restart the server.' };
    const provider = request.mode === 'scrape' ? undefined : createOpenRouter({ apiKey: apiKey! });
    const models = enrichmentModels();
    const model = provider?.(models.extraction);
    const verificationModel = provider?.(models.verification);
    const assessmentModel = provider?.(models.assessment);
    job = { id: randomUUID(), status: 'running', finishedAt: null, results: pending.map((result) => ({ resultId: result.id, status: 'queued', phase: null, error: null })) };
    logAction('enrichment.started', { jobId: job.id, mode: request.mode ?? 'enrichment', resultCount: pending.length, filters: request.filters ? JSON.stringify(request.filters) : undefined });
    void run(job, path(), { model, verificationModel, assessmentModel, assessmentOnly: request.mode === 'assessment', force: request.force }, request.mode === 'scrape', request.mode === 'extraction');
    return { job: structuredClone(job), error: null };
  };
  async function run(current: EnrichmentJob, dbPath: string, settings: Parameters<typeof enrichAndAssess>[2], scrapeOnly: boolean, extractionOnly: boolean) {
    try {
      for (const progress of current.results) {
        let db: MarketingDatabase | undefined;
        progress.status = 'running';
        const context = { jobId: current.id, resultId: progress.resultId };
        const startedAt = Date.now();
        logAction('enrichment.result.started', { ...context, queuedRemaining: current.results.filter((result) => result.status === 'queued').length, timeoutMs: 720000 });
        try {
          logAction('enrichment.database.opening', context);
          db = new MarketingDatabase(dbPath, { initializeSchema: false });
          logAction('enrichment.database.opened', { ...context, elapsedMs: Date.now() - startedAt });
          const workOptions: NonNullable<Parameters<typeof enrichAndAssess>[2]> = { ...settings, abortSignal: AbortSignal.timeout(720000),
            onPhase: (phase) => { progress.phase = phase; logAction('enrichment.result.phase', { ...context, phase, elapsedMs: Date.now() - startedAt }); },
            onDiagnostic: (event) => {
              if (progress.step !== event.step) progress.outputChars = undefined;
              progress.step = event.step; progress.stepStatus = event.status; progress.stepElapsedMs = event.elapsedMs; progress.lastActivityAt = new Date().toISOString();
              if (typeof event.fields?.outputChars === 'number') progress.outputChars = event.fields.outputChars;
              logAction(`enrichment.step.${event.status}`, { ...event.fields, ...context, phase: progress.phase, step: event.step, elapsedMs: event.elapsedMs, resultElapsedMs: Date.now() - startedAt }, event.error);
            },
          };
          if (scrapeOnly || extractionOnly) progress.phase = scrapeOnly ? 'scrape' : 'extraction';
          const result = scrapeOnly || extractionOnly
            ? await (options.scrapeWork ?? enrichSearchResult)(progress.resultId, db, { ...workOptions, collectionOnly: scrapeOnly, extractionOnly })
              .then((enrichment) => ({ status: enrichment.status, enrichment, assessment: null }))
            : await (options.processWork ?? enrichAndAssess)(progress.resultId, db, workOptions);
          progress.status = result.status;
          if (result.status === 'failed' || result.status === 'blocked') progress.error = progress.phase === 'assessment' ? 'Assessment failed. Enrichment is preserved; retry assessment without scraping.' : progress.phase === 'scrape' ? 'Scraping failed or was blocked. Review result details before retrying.' : 'Collection/extraction failed or was blocked. Review result details before retrying.';
          logAction(`enrichment.result.${result.status}`, { ...context, phase: progress.phase, elapsedMs: Date.now() - startedAt },
            result.status === 'failed' || result.status === 'blocked' ? (result.assessment?.error ?? result.enrichment?.error ?? progress.error) : undefined);
        } catch (error) {
          logAction('enrichment.result.failed', { ...context, phase: progress.phase, step: progress.step, elapsedMs: Date.now() - startedAt }, error);
          progress.status = 'failed';
          progress.error = 'Could not process this result. Check initialized schema, provider settings, and latest enrichment.';
        } finally { db?.close(); }
      }
    } finally {
      current.status = 'complete'; current.finishedAt = new Date().toISOString();
      logAction('enrichment.finished', { jobId: current.id, failedCount: current.results.filter((result) => result.status === 'failed' || result.status === 'blocked').length });
    }
  }
  return { start, getStatus };
}
const service = createEnrichmentService();
export const getEnrichmentStatus = service.getStatus;
export const startEnrichment = service.start;
