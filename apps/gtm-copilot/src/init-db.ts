import { MarketingDatabase } from './database.ts';

try {
  const database = new MarketingDatabase();
  const path = database.path;
  database.close();
  console.log(`Initialized marketing database: ${path}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
