import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { MarketingDatabase } from './database.ts';
import { enrichAndAssess } from './enrichment-pipeline.ts';

export async function runAssessmentCli(args: string[], dependencies: { database?: MarketingDatabase; model?: LanguageModel; processWork?: typeof enrichAndAssess; log?: (message: string) => void } = {}) {
  const { values } = parseArgs({ args, options: { 'result-id': { type: 'string' }, model: { type: 'string' }, force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  const log = dependencies.log ?? console.log;
  if (values.help) { log('Usage: pnpm assess --result-id 1 [--model MODEL] [--force] (saved sources only; no scraping)'); return; }
  const id = Number(values['result-id']);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('--result-id must be a positive integer.');
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = dependencies.model ?? (apiKey ? createOpenRouter({ apiKey })(values.model ?? process.env.GTM_ASSESSMENT_MODEL ?? process.env.GTM_VERIFICATION_MODEL ?? process.env.GTM_ENRICHMENT_MODEL ?? 'deepseek/deepseek-v4.1-flash') : undefined);
  if (!model) throw new Error('Set OPENROUTER_API_KEY for assessment.');
  const db = dependencies.database ?? new MarketingDatabase(undefined, { initializeSchema: false });
  try {
    const result = await (dependencies.processWork ?? enrichAndAssess)(id, db, { assessmentOnly: true, assessmentModel: model, force: values.force, abortSignal: AbortSignal.timeout(720000) });
    log(JSON.stringify(result.assessment, null, 2));
    if (result.status === 'failed') throw new Error('Assessment failed; enrichment is retained. Inspect the saved attempt and retry.');
    return result;
  } finally { if (!dependencies.database) db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAssessmentCli(process.argv.slice(2)).catch((cause: unknown) => { console.error(cause instanceof Error ? cause.message : String(cause)); process.exitCode = 1; });
}
