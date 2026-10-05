import { parseArgs } from 'node:util';
import { MarketingDatabase } from './database.ts';
import { runSearchQuery } from './brave-search.ts';

async function main() {
  const { values } = parseArgs({
    options: {
      'query-id': { type: 'string' },
      'segment-country-id': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('Usage: pnpm run search [--query-id 1 | --segment-country-id 1]\nWith no filter, runs all stored queries.');
    return;
  }
  if (values['query-id'] !== undefined && values['segment-country-id'] !== undefined) {
    throw new Error('Use either --query-id or --segment-country-id, not both.');
  }
  const parseId = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('IDs must be positive integers.');
    return id;
  };
  const queryId = parseId(values['query-id']);
  const countryId = parseId(values['segment-country-id']);
  if (!process.env.BRAVE_API_KEY?.trim()) throw new Error('Set BRAVE_API_KEY in the environment or apps/gtm-copilot/.env.');
  const database = new MarketingDatabase();
  try {
    if (countryId !== undefined && !database.getCountry(countryId)) {
      throw new Error(`Country ${countryId} does not exist.`);
    }
    const queryIds = queryId === undefined ? database.listQueries(countryId).map((query) => query.id) : [queryId];
    // Sequential execution and request pacing respect low-rate Brave plans.
    // Completed queries remain committed if a later query fails.
    for (const id of queryIds) {
      const result = await runSearchQuery(id, database);
      console.log(JSON.stringify(result));
    }
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
