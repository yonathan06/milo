import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MarketingDatabase } from '../../src/database.ts';
import { enrichAndAssess } from '../../src/enrichment-pipeline.ts';
import { enrichmentRequestSchema, type EnrichmentJob, type EnrichmentRequest } from '../enrichment.ts';
import { openReadStore } from './store.ts';
import { logAction } from './action-log.ts';

// Both actions use the same sequential queue/lock. Factory isolates job tests from the live server.
export function createEnrichmentService(options: { path?: string; apiKey?: string; processWork?: typeof enrichAndAssess } = {}) {
  let job: EnrichmentJob | null = null;
  const path = () => resolve(options.path ?? process.env.GTM_DATABASE_PATH ?? 'data/gtm-copilot.sqlite');
  const getStatus = (): EnrichmentJob | null => {
    if (job?.finishedAt && Date.now() - Date.parse(job.finishedAt) > 3600000) job = null;
    return job ? structuredClone(job) : null;
  };
  const start = (input: EnrichmentRequest): { job: EnrichmentJob | null; error: string | null } => {
    const request = enrichmentRequestSchema.parse(input);
    getStatus();
    if (job?.status === 'running') return { job: null, error: 'Enrichment or assessment is already running. Wait for it to finish.' };
    const store = openReadStore(path());
    let results;
    try { results = request.segmentId === undefined ? store.results() : store.segment(request.segmentId)?.results; }
    finally { store.close(); }
    if (!results) return { job: null, error: 'This segment no longer exists.' };
    if (request.resultId !== undefined && !results.some((result) => result.id === request.resultId)) return { job: null, error: 'This result no longer exists in the requested scope.' };
    const pending = results.filter((result) => (request.resultId === undefined || result.id === request.resultId)
      && (request.mode !== 'assessment' || result.assessment_ready)
      && (request.force || result.assessment_status !== 'complete'));
    if (!pending.length) return { job: null, error: request.mode === 'assessment' ? 'No enriched results need assessment in this scope.' : 'All results in this scope are already enriched and assessed.' };
    const apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY)?.trim();
    if (!apiKey) return { job: null, error: 'Set OPENROUTER_API_KEY in the server environment and restart the server.' };
    const provider = createOpenRouter({ apiKey });
    const model = provider(process.env.GTM_ENRICHMENT_MODEL ?? 'deepseek/deepseek-v4.1-flash');
    const verificationModel = process.env.GTM_VERIFICATION_MODEL ? provider(process.env.GTM_VERIFICATION_MODEL) : model;
    const assessmentModel = process.env.GTM_ASSESSMENT_MODEL ? provider(process.env.GTM_ASSESSMENT_MODEL) : verificationModel;
    job = { id: randomUUID(), status: 'running', finishedAt: null, results: pending.map((result) => ({ resultId: result.id, status: 'queued', phase: null, error: null })) };
    logAction('enrichment.started', { jobId: job.id, mode: request.mode ?? 'enrichment', resultCount: pending.length });
    void run(job, path(), { model, verificationModel, assessmentModel, assessmentOnly: request.mode === 'assessment', force: request.force });
    return { job: structuredClone(job), error: null };
  };
  async function run(current: EnrichmentJob, dbPath: string, settings: Parameters<typeof enrichAndAssess>[2]) {
    try {
      for (const progress of current.results) {
        let db: MarketingDatabase | undefined;
        progress.status = 'running';
        const context = { jobId: current.id, resultId: progress.resultId };
        logAction('enrichment.result.started', context);
        try {
          db = new MarketingDatabase(dbPath, { initializeSchema: false });
          const result = await (options.processWork ?? enrichAndAssess)(progress.resultId, db, { ...settings, abortSignal: AbortSignal.timeout(720000), onPhase: (phase) => { progress.phase = phase; logAction('enrichment.result.phase', { ...context, phase }); } });
          progress.status = result.status;
          if (result.status === 'failed' || result.status === 'blocked') progress.error = progress.phase === 'assessment' ? 'Assessment failed. Enrichment is preserved; retry assessment without scraping.' : 'Collection/extraction failed or was blocked. Review result details before retrying.';
          logAction(`enrichment.result.${result.status}`, { ...context, phase: progress.phase },
            result.status === 'failed' || result.status === 'blocked' ? (result.assessment?.error ?? result.enrichment?.error ?? progress.error) : undefined);
        } catch (error) {
          logAction('enrichment.result.failed', { ...context, phase: progress.phase }, error);
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
