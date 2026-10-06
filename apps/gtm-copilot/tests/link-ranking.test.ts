import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MarketingDatabase } from '../src/database.ts';
import { LinkRankingStore, rankLink, rankingModel, type RankingResponse } from '../src/link-ranking.ts';
import { runLinkRankingCli } from '../src/link-ranking-cli.ts';

const link = { id: 1, url: 'https://example.com/editors', title: 'Event video editors', description: 'A community for event videographers.' };
const response: RankingResponse = { model: rankingModel, answers: { relevance: { type: 'score', score: 3.2, confidence: 0.8,
  probabilities: { '0': 0, '1': 0, '2': 0, '3': 0.8, '4': 0.2 }, legend: { '0': 'None', '1': 'Weak', '2': 'General', '3': 'Strong', '4': 'Direct' } } }, usage: { input_tokens: 500, output_tokens: 30 } };

test('Jev uses saved snippets and typed Score; rejects HTTP failures and invalid outputs', async () => {
  const result = await rankLink(link, { apiKey: 'test-key', fetch: async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.questions.relevance.type, 'score');
    assert.equal(body.questions.relevance.criteria.length, 5);
    assert.equal(body.state.link.description, link.description);
    return new Response(JSON.stringify(response));
  } });
  assert.equal(result.answers.relevance.score * 25, 80);
  await assert.rejects(rankLink(link, { apiKey: 'test', fetch: async () => new Response('', { status: 429 }) }), /HTTP 429/);
  await assert.rejects(rankLink(link, { apiKey: 'test', fetch: async () => new Response(JSON.stringify({ ...response, answers: { relevance: { ...response.answers.relevance, score: 100 } } })) }));
});

test('rankings persist, resume, filter scores/confidence/model, invalidate edits, and failures never qualify', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-link-rank-')); const path = join(dir, 'test.sqlite');
  const db = new MarketingDatabase(path); const sql = new DatabaseSync(path); const store = new LinkRankingStore(path);
  try {
    sql.prepare('INSERT INTO search_results(id,url,title,description) VALUES(?,?,?,?)').run(link.id, link.url, link.title, link.description);
    sql.prepare('INSERT INTO search_results(id,url,title,description) VALUES(2,?,?,?)').run('https://example.com/shop', 'Shop', 'Unrelated');
    assert.equal(store.current(link, rankingModel), false);
    store.save(link, rankingModel, response, null);
    assert.equal(store.current(link, rankingModel), true);
    assert.equal(store.selected(75, 0.7, rankingModel, 100).length, 1);
    assert.equal(store.selected(90, 0, rankingModel, 100).length, 0);
    assert.equal(store.selected(75, 0.9, rankingModel, 100).length, 0);
    assert.equal(store.selected(75, 0, 'other-model', 100).length, 0);
    sql.prepare('UPDATE search_results SET description=? WHERE id=1').run('Edited');
    assert.equal(store.selected(75, 0, rankingModel, 100).length, 0);
    assert.equal(store.current({ ...link, description: 'Edited' }, rankingModel), false);
    store.save({ ...link, description: 'Edited' }, rankingModel, null, 'HTTP 429');
    assert.equal(store.selected(0, 0, rankingModel, 100).length, 0);
    assert.equal(sql.prepare('SELECT count(*) n FROM search_result_enrichments').get()!.n, 0);
  } finally { store.close(); sql.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('ranked enrichment is preview-only unless execute is explicit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gtm-link-preview-')); const path = join(dir, 'test.sqlite');
  const previous = process.env.GTM_DATABASE_PATH; process.env.GTM_DATABASE_PATH = path;
  const db = new MarketingDatabase(path); const sql = new DatabaseSync(path); const store = new LinkRankingStore(path);
  try {
    sql.prepare('INSERT INTO search_results(id,url,title,description) VALUES(?,?,?,?)').run(link.id, link.url, link.title, link.description);
    store.save(link, rankingModel, response, null);
    await runLinkRankingCli(['--enrich', '--min-score', '75']);
    assert.equal(sql.prepare('SELECT count(*) n FROM search_result_enrichments').get()!.n, 0);
    await assert.rejects(runLinkRankingCli(['--enrich', '--min-score', '101']), /min-score/);
    await assert.rejects(runLinkRankingCli(['--enrich', '--all']), /bounded/);
  } finally {
    store.close(); sql.close(); db.close(); rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.GTM_DATABASE_PATH; else process.env.GTM_DATABASE_PATH = previous;
  }
});
