import { parseArgs } from 'node:util';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MarketingDatabase } from './database.ts';
import { enrichmentModels } from './enrichment-models.ts';
import { enrichAndAssess } from './enrichment-pipeline.ts';
import { collectors, type Collector } from './community-scraper.ts';

async function main() {
  const { values } = parseArgs({ options: {
    'result-id': { type: 'string' }, model: { type: 'string' }, collector: { type: 'string' },
    posts: { type: 'string' }, 'no-metadata': { type: 'boolean' }, 'verification-model': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Usage: pnpm enrich --result-id 1 [--collector auto|playwright|apify|firecrawl|native] [--posts 1..10] [--no-metadata] [--model MODEL] [--verification-model MODEL]');
    return;
  }
  const id = Number(values['result-id']);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('--result-id must be a positive integer.');
  if (values.collector !== undefined && !collectors.includes(values.collector as Collector)) {
    throw new Error('--collector must be auto, playwright, apify, firecrawl, or native.');
  }
  const maxPosts = values.posts === undefined ? undefined : Number(values.posts);
  if (maxPosts !== undefined && (!Number.isSafeInteger(maxPosts) || maxPosts < 1 || maxPosts > 10)) {
    throw new Error('--posts must be between 1 and 10.');
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const models = enrichmentModels(process.env, { extraction: values.model, verification: values['verification-model'] });
  const provider = apiKey ? createOpenRouter({ apiKey }) : undefined;
  const model = provider?.(models.extraction);
  const verificationModel = provider?.(models.verification);
  const assessmentModel = provider?.(models.assessment);
  const database = new MarketingDatabase();
  try {
    const attempt = await enrichAndAssess(id, database, {
      model, verificationModel, assessmentModel, collector: values.collector as Collector | undefined, maxPosts,
      supplementaryMetadata: !values['no-metadata'], abortSignal: AbortSignal.timeout(720000),
    });
    console.log(JSON.stringify(attempt, null, 2));
    if (attempt.status === 'failed') process.exitCode = 1;
  } finally { database.close(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
