import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MarketingDatabase } from './database.ts';
import { enrichmentModels } from './enrichment-models.ts';
import { enrichAndAssess } from './enrichment-pipeline.ts';
import { LinkRankingStore, rankingSettings, rankingModel } from './link-ranking.ts';
import { runLinkRankingQueue } from './link-ranking-queue.ts';

function numberOption(value: string | undefined, fallback: number, name: string, min: number, max: number, integer = false) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isSafeInteger(n))) throw new Error(`--${name} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.`);
  return n;
}
export async function runLinkRankingCli(args: string[]) {
  const { values } = parseArgs({ args, options: {
    enrich: { type: 'boolean' }, execute: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, all: { type: 'boolean' }, force: { type: 'boolean' },
    'result-id': { type: 'string' }, limit: { type: 'string' }, 'min-score': { type: 'string' }, 'min-confidence': { type: 'string' },
    model: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Rank: pnpm rank:links [--result-id ID | --limit 100 | --all] [--force] [--dry-run] [--model jev-1.13.0]\nEnrich: pnpm enrich:ranked --min-score 75 [--min-confidence 0.5] [--limit 100] [--execute]\nEnrichment defaults to preview. Ranking uses TypeSafe; enrichment uses existing scraper/OpenRouter settings.');
    return;
  }
  const model = values.model ?? process.env.GTM_LINK_RANKING_MODEL ?? rankingModel;
  if (!/^jev-\d+\.\d+\.\d+$/.test(model)) throw new Error('Use a pinned Jev model version, e.g. jev-1.13.0, so cached rankings stay comparable.');
  const limit = numberOption(values.limit, 100, 'limit', 1, Number.MAX_SAFE_INTEGER, true);
  const resultId = values['result-id'] === undefined ? undefined : numberOption(values['result-id'], 1, 'result-id', 1, Number.MAX_SAFE_INTEGER, true);
  const minScore = numberOption(values['min-score'], 75, 'min-score', 0, 100);
  const minConfidence = numberOption(values['min-confidence'], 0, 'min-confidence', 0, 1);
  if (values.all && (values.limit !== undefined || resultId !== undefined)) throw new Error('--all cannot be combined with --limit or --result-id.');
  if (values.enrich && (values.all || values.force || resultId !== undefined)) throw new Error('Enrichment accepts a bounded --limit, not --all, --force or --result-id.');
  if (!values.enrich && values.execute) throw new Error('--execute is only for ranked enrichment.');
  if (values.execute && values['dry-run']) throw new Error('--execute and --dry-run are mutually exclusive.');
  if (values.enrich && values.execute && !process.env.OPENROUTER_API_KEY?.trim()) throw new Error('Set OPENROUTER_API_KEY before enrichment.');
  if (!values.enrich && !values['dry-run'] && !process.env.TYPESAFE_API_KEY?.trim()) throw new Error('Set TYPESAFE_API_KEY before ranking.');
  const db = new MarketingDatabase(); // Explicit CLI migration only; web browsing remains read-only.
  const store = new LinkRankingStore(db.path);
  try {
    if (values.enrich) {
      const selected = store.selected(minScore, minConfidence, model, Number.MAX_SAFE_INTEGER)
        .filter((link) => db.getAssessmentSummary(link.id).assessment_status !== 'complete').slice(0, limit);
      console.log(JSON.stringify({ mode: 'ranked-enrichment', execute: Boolean(values.execute), model, minScore, minConfidence, count: selected.length,
        results: selected.map(({ id, url, score, confidence }) => ({ id, url, score, confidence })) }, null, 2));
      if (!values.execute) return;
      const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
      const models = enrichmentModels();
      const extraction = provider(models.extraction);
      const verification = provider(models.verification);
      const assessment = provider(models.assessment);
      for (const link of selected) {
        // Recheck the source immediately before spending on it.
        const fresh = db.getSearchResult(link.id);
        if (!fresh || !store.current(fresh, model)) continue;
        const result = await enrichAndAssess(link.id, db, { model: extraction, verificationModel: verification, assessmentModel: assessment, abortSignal: AbortSignal.timeout(720000) });
        console.log(JSON.stringify({ resultId: link.id, score: link.score, status: result.status }));
        if (result.status === 'failed') process.exitCode = 1;
      }
      return;
    }
    const settings = rankingSettings();
    const links = (values.force ? store.links(resultId) : store.pending(model, resultId)).slice(0, values.all ? undefined : limit);
    if (resultId !== undefined && !store.links(resultId).length) throw new Error(`Search result ${resultId} does not exist.`);
    console.log(JSON.stringify({ mode: 'link-ranking', model, count: links.length, ...settings, dryRun: Boolean(values['dry-run']) }));
    if (values['dry-run']) return;
    let inputTokens = 0; let processed = 0;
    await runLinkRankingQueue(links, store, { apiKey: process.env.TYPESAFE_API_KEY!, model, force: values.force,
      onProgress: (count, failed, tokens) => {
        inputTokens += tokens; processed += count;
        console.log(JSON.stringify({ processed, total: links.length, failed, inputTokens }));
      },
    });
    console.log(JSON.stringify({ inputTokens, estimatedCostUsd: inputTokens / 1_000_000 * 0.042, pricingNote: 'Jev published input-token rate; confirm current billing.' }));
  } finally { store.close(); db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLinkRankingCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  });
}
