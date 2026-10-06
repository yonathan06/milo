import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MarketingDatabase } from '../src/database.ts';
import { LinkRankingStore, rankingModel, type RankingResponse } from '../src/link-ranking.ts';
import { createLinkRankingService } from '../web/server/link-ranking.ts';

const response: RankingResponse = { model: rankingModel, answers: { relevance: { type: 'score', score: 3, confidence: 1,
  probabilities: { '0': 0, '1': 0, '2': 0, '3': 1, '4': 0 }, legend: {} } }, usage: { input_tokens: 200 } };
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-rank-jobs-')); const path = join(dir, 'test.sqlite');
  const db = new MarketingDatabase(path); const sql = new DatabaseSync(path);
  sql.exec("INSERT INTO search_results(id,url,title,description) VALUES (1,'https://example.com/a','A',''),(2,'https://example.com/b','B','');");
  return { path, sql, close() { sql.close(); db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
async function finished(service: ReturnType<typeof createLinkRankingService>) {
  for (let i = 0; i < 100; i++) {
    if (service.getStatus().job?.status !== 'running') return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('Ranking job did not finish');
}

test('web ranking skips current rows, locks overlapping starts and saves only pending results', async () => {
  const f = fixture(); const store = new LinkRankingStore(f.path);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    store.save(store.links(1)[0]!, rankingModel, response, null);
    const calls: number[] = [];
    const service = createLinkRankingService({ path: f.path, apiKey: 'test', rank: async (link) => { calls.push(link.id); await gate; return response; } });
    assert.equal(service.getStatus().pendingCount, 1);
    assert.equal(service.start().job?.total, 1);
    assert.match(service.start().error!, /already running/);
    release(); await finished(service);
    assert.deepEqual(calls, [2]);
    assert.equal(service.getStatus().pendingCount, 0);
    assert.equal(service.getStatus().job?.inputTokens, 200);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM search_result_enrichments').get()!.n, 0);
    assert.match(service.start().error!, /current Jev rankings/);
  } finally { release(); store.close(); f.close(); }
});

test('single-result ranking validates scope, processes only that result, and shares the global lock', async () => {
  const f = fixture();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    const calls: number[] = [];
    const service = createLinkRankingService({ path: f.path, apiKey: 'test', rank: async (link) => { calls.push(link.id); await gate; return response; } });
    assert.throws(() => service.start({ resultId: -1 }));
    assert.throws(() => service.getStatus({ resultId: 1.5 }));
    assert.match(service.start({ resultId: 999 }).error!, /result exists/);
    assert.equal(service.getStatus({ resultId: 2 }).pendingCount, 1);
    assert.equal(service.start({ resultId: 2 }).job?.total, 1);
    assert.match(service.start().error!, /already running/);
    assert.match(service.start({ resultId: 1 }).error!, /already running/);
    release(); await finished(service);
    assert.deepEqual(calls, [2]);
    assert.equal(service.getStatus({ resultId: 2 }).pendingCount, 0);
    assert.equal(service.getStatus({ resultId: 1 }).pendingCount, 1);
    assert.match(service.start({ resultId: 2 }).error!, /already has a current/);
  } finally { release(); f.close(); }
});

test('provider failure stops queue and failed/unprocessed rows remain resumable', async () => {
  const f = fixture();
  try {
    let calls = 0;
    const service = createLinkRankingService({ path: f.path, apiKey: 'test', rank: async () => { calls++; if (calls === 1) throw new Error('HTTP 429'); return response; } });
    service.start(); await finished(service);
    assert.equal(service.getStatus().job?.status, 'failed');
    assert.equal(service.getStatus().pendingCount, 2);
    service.start(); await finished(service);
    assert.equal(service.getStatus().job?.status, 'complete');
    assert.equal(service.getStatus().pendingCount, 0);
  } finally { f.close(); }
});

test('status/start never migrate a missing ranking schema and reject missing API credentials', () => {
  const f = fixture();
  try {
    assert.match(createLinkRankingService({ path: f.path, apiKey: '' }).start().error!, /TYPESAFE_API_KEY/);
    f.sql.exec('DROP TABLE search_result_link_rankings');
    const service = createLinkRankingService({ path: f.path, apiKey: 'test' });
    assert.match(service.getStatus().error!, /db:init/);
    assert.match(service.start().error!, /db:init/);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='search_result_link_rankings'").get()!.n, 0);
  } finally { f.close(); }
});
