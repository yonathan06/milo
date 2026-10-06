import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { LinkRankingStore, rankLink, rankingModel, type Link } from '../../src/link-ranking.ts';
import type { LinkRankingJob, LinkRankingStatus } from '../link-ranking.ts';
import { logAction } from './action-log.ts';

// Process-local global queue. No schema initialization and no scraping/enrichment.
export function createLinkRankingService(options: { path?: string; apiKey?: string; model?: string; rank?: typeof rankLink } = {}) {
  let job: LinkRankingJob | null = null;
  const path = () => resolve(options.path ?? process.env.GTM_DATABASE_PATH ?? 'data/gtm-copilot.sqlite');
  const model = () => options.model ?? process.env.GTM_LINK_RANKING_MODEL ?? rankingModel;
  const pending = () => {
    if (!/^jev-\d+\.\d+\.\d+$/.test(model())) throw new Error('Use a pinned Jev model version.');
    const store = new LinkRankingStore(path(), true);
    try { return store.pending(model()); } finally { store.close(); }
  };
  const getStatus = (): LinkRankingStatus => {
    if (job?.finishedAt && Date.now() - Date.parse(job.finishedAt) > 3600000) job = null;
    if (job?.status === 'running') return { pendingCount: Math.max(0, job.total - job.processed), error: null, job: structuredClone(job) };
    try { return { pendingCount: pending().length, error: null, job: job ? structuredClone(job) : null }; }
    catch { return { pendingCount: 0, error: 'Initialize the ranking schema with db:init and check database access and the pinned Jev model setting.', job: job ? structuredClone(job) : null }; }
  };
  const start = (): { job: LinkRankingJob | null; error: string | null } => {
    if (job?.status === 'running') return { job: null, error: 'Link ranking is already running.' };
    const apiKey = (options.apiKey ?? process.env.TYPESAFE_API_KEY)?.trim();
    if (!apiKey) return { job: null, error: 'Set TYPESAFE_API_KEY in the server environment and restart the server.' };
    let links: Link[];
    try { links = pending(); }
    catch { return { job: null, error: 'Initialize the ranking schema with db:init and check database access and the pinned Jev model setting.' }; }
    if (!links.length) return { job: null, error: 'All saved results have current Jev rankings.' };
    const selectedModel = model();
    const dbPath = path();
    job = { id: randomUUID(), status: 'running', total: links.length, processed: 0, failed: 0, inputTokens: 0, finishedAt: null, error: null };
    logAction('link-ranking.started', { jobId: job.id, resultCount: links.length });
    void run(job, links, dbPath, apiKey, selectedModel);
    return { job: structuredClone(job), error: null };
  };
  async function run(current: LinkRankingJob, links: Link[], dbPath: string, apiKey: string, selectedModel: string) {
    let store: LinkRankingStore | undefined;
    try {
      store = new LinkRankingStore(dbPath);
      for (const selected of links) {
        const link = store.links(selected.id)[0];
        if (!link || store.current(link, selectedModel)) { current.processed++; continue; }
        try {
          const response = await (options.rank ?? rankLink)(link, { apiKey, model: selectedModel, abortSignal: AbortSignal.timeout(60000) });
          store.save(link, selectedModel, response, null);
          current.inputTokens += response.usage.input_tokens ?? 0;
          current.processed++;
        } catch (error) {
          store.save(link, selectedModel, null, error instanceof Error ? error.message : String(error));
          current.failed++; current.processed++;
          throw error; // Stop on provider errors; clicking again resumes only pending work.
        }
      }
      current.status = 'complete';
    } catch (error) {
      current.status = 'failed';
      current.error = 'Ranking stopped. Check server logs/provider settings, then retry; completed rankings are saved.';
      logAction('link-ranking.failed', { jobId: current.id }, error);
    } finally {
      store?.close(); current.finishedAt = new Date().toISOString();
      logAction('link-ranking.finished', { jobId: current.id, processed: current.processed, failedCount: current.failed });
    }
  }
  return { start, getStatus };
}
const service = createLinkRankingService();
export const startLinkRanking = service.start;
export const getLinkRankingStatus = service.getStatus;
