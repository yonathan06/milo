import { parseArgs } from 'node:util';
import { MarketingDatabase } from './database.ts';

function main() {
  const { values } = parseArgs({ options: {
    'enrichment-id': { type: 'string' }, decision: { type: 'string' }, channel: { type: 'string' },
    reviewer: { type: 'string' }, notes: { type: 'string' }, 'permission-confirmed': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Usage: pnpm review:outreach --enrichment-id 1 --decision approved|rejected --channel communityPosting|directContact --reviewer NAME --notes REASON [--permission-confirmed]');
    return;
  }
  const id = Number(values['enrichment-id']);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('--enrichment-id must be a positive integer.');
  if (!['approved', 'rejected'].includes(values.decision ?? '')) throw new Error('--decision must be approved or rejected.');
  if (!['communityPosting', 'directContact'].includes(values.channel ?? '')) throw new Error('--channel must be communityPosting or directContact.');
  const db = new MarketingDatabase();
  try {
    const row = db.recordOutreachReview(id, {
      decision: values.decision as 'approved' | 'rejected', channel: values.channel as 'communityPosting' | 'directContact',
      reviewer: values.reviewer ?? '', notes: values.notes ?? '', permissionConfirmed: values['permission-confirmed'],
    });
    console.log(JSON.stringify(row, null, 2));
  } finally { db.close(); }
}
try { main(); } catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause)); process.exitCode = 1;
}
