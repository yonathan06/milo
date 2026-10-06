import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logAction, runAction } from '../web/server/action-log.ts';

test('action failures include context, stack, provider status and causes, but redact credentials', () => {
  const logs: string[] = [];
  const original = console.error;
  const oldKey = process.env.GTM_TEST_API_KEY;
  process.env.GTM_TEST_API_KEY = 'private-test-secret';
  console.error = (entry) => { logs.push(String(entry)); };
  try {
    const error = Object.assign(new Error('Provider failed with private-test-secret', { cause: new Error('HTTP 429 Bearer hidden-token') }), { statusCode: 429 });
    logAction('search.query.failed', { jobId: 'job', segmentId: 2, queryId: 3 }, error);
    const entry = JSON.parse(logs[0].replace('[gtm-copilot] ', ''));
    assert.equal(entry.queryId, 3);
    assert.equal(entry.error.statusCode, 429);
    assert.match(entry.error.stack, /Provider failed/);
    assert.match(entry.error.cause.message, /HTTP 429/);
    assert.ok(!logs[0].includes('private-test-secret'));
    assert.ok(!logs[0].includes('hidden-token'));
  } finally {
    console.error = original;
    if (oldKey === undefined) delete process.env.GTM_TEST_API_KEY;
    else process.env.GTM_TEST_API_KEY = oldKey;
  }
});

test('returned rejections and thrown startup errors are logged without changing action responses', () => {
  const logs: string[] = [];
  const info = console.info; const error = console.error;
  console.info = console.error = (entry) => { logs.push(String(entry)); };
  try {
    const response = { job: null, error: 'Missing Brave API key' };
    assert.equal(runAction('search', {}, () => response), response);
    assert.ok(logs.some((line) => line.includes('search.rejected') && line.includes(response.error)));
    const failure = new Error('Database unavailable');
    assert.throws(() => runAction('planning', { segmentId: 1 }, () => { throw failure; }), (caught) => caught === failure);
    assert.ok(logs.some((line) => line.includes('planning.failed') && line.includes(failure.message)));
  } finally { console.info = info; console.error = error; }
});
