import { parseArgs } from 'node:util';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { planMarketingSegmentCountryQueries, countryQueryPlannerInputSchema } from './country-query-planner.ts';
import { MarketingDatabase } from './database.ts';

async function main() {
  const { values } = parseArgs({
    options: {
      'segment-country-id': { type: 'string' },
      languages: { type: 'string' },
      count: { type: 'string' },
      model: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('Usage: pnpm plan --segment-country-id 1 --languages en,de [--count 20] [--model deepseek/deepseek-v4.1-flash]');
    return;
  }
  const input = countryQueryPlannerInputSchema.parse({
    marketingSegmentCountryId: Number(values['segment-country-id']),
    languages: values.languages?.split(','),
    queriesPerLanguage: values.count === undefined ? undefined : Number(values.count),
  });
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error('Set OPENROUTER_API_KEY in the environment or apps/gtm-copilot/.env.');
  }
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const database = new MarketingDatabase();
  try {
    const plan = await planMarketingSegmentCountryQueries(input, {
      database,
      model: openrouter(values.model ?? process.env.GTM_PLANNER_MODEL ?? 'deepseek/deepseek-v4.1-flash'),
      abortSignal: AbortSignal.timeout(120_000),
    });
    console.log(JSON.stringify(plan, null, 2));
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
