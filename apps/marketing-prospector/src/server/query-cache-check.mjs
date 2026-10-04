import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dehydrate, hydrate } from '@tanstack/react-query'
import { createQueryClient, invalidateProspectViews, invalidateRunResults, isActiveRun, queryKeys } from '../query-cache.ts'

test('query clients are isolated and fresh hydrated data does not issue a duplicate read', async () => {
  const first = createQueryClient(), second = createQueryClient(), browser = createQueryClient()
  try {
    let reads = 0
    const options = { queryKey: queryKeys.runs, queryFn: async () => { reads++; return [{ id: 'first' }] } }
    await Promise.all([first.fetchQuery(options), first.fetchQuery(options)])
    assert.equal(reads, 1, 'concurrent readers share the in-flight query')
    assert.equal(second.getQueryData(queryKeys.runs), undefined, 'no process-wide SSR cache')
    hydrate(browser, dehydrate(first))
    assert.deepEqual(await browser.fetchQuery(options), [{ id: 'first' }])
    assert.equal(reads, 1, 'fresh hydrated data is reused')
    await browser.invalidateQueries({ queryKey: queryKeys.runs })
    await browser.fetchQuery(options)
    assert.equal(reads, 2)
    assert.equal(first.getQueryState(queryKeys.runs).isInvalidated, false)
  } finally { first.clear(); second.clear(); browser.clear() }
})

test('run mutations invalidate only related run data and shared summary views', async () => {
  const client = createQueryClient()
  try {
    const affected = [queryKeys.progress('a'), [...queryKeys.prospects('a'), { type: '', minScore: '' }], [...queryKeys.prospects('a'), { type: 'creator', minScore: '80' }], queryKeys.diagnostics('a'), queryKeys.runs, queryKeys.directory]
    const untouched = [queryKeys.progress('b'), queryKeys.prospects('b'), queryKeys.diagnostics('b'), queryKeys.suggested]
    for (const key of [...affected, ...untouched]) client.setQueryData(key, [])
    await invalidateRunResults(client, 'a')
    for (const key of affected) assert.equal(client.getQueryState(key).isInvalidated, true)
    for (const key of untouched) assert.equal(client.getQueryState(key).isInvalidated, false)
    let projection = { pageState: 'inspected', verificationStatus: 'verified', scoringState: 'deferred', score: null, stageErrors: { scoring: 'needs-community-evidence: canonical context missing' } }
    let reads = 0
    const options = { queryKey: queryKeys.prospects('a'), queryFn: async () => { reads++; return [projection] } }
    client.removeQueries({ queryKey: queryKeys.prospects('a') })
    await client.fetchQuery(options)
    projection = { pageState: 'failed', verificationStatus: 'unverified', scoringState: 'complete', score: 100, coverage: 30, dimensions: [{ name: 'audience_alignment', score: null, basis: 'unknown' }, { name: 'planning_relevance', score: 100, basis: 'community_context' }], evidenceMode: 'snippet', confidence: 'low', permissionStatus: 'unknown' }
    await invalidateRunResults(client, 'a')
    await invalidateProspectViews(client)
    const refreshed = await client.fetchQuery(options)
    assert.deepEqual(refreshed, [projection], 'retry refresh replaces old misverified projections')
    assert.equal(reads, 2)
    assert.equal(refreshed[0].verificationStatus, 'unverified')
    assert.equal(refreshed[0].confidence, 'low')
    assert.equal(refreshed[0].permissionStatus, 'unknown')
    assert.equal(refreshed[0].coverage, 30)
    assert.equal(refreshed[0].dimensions[0].score, null)
    projection = { ...projection, score: null, scoringState: 'failed', stageErrors: { scoring: 'Invalid evidence citation; citation_category=unsupported_claim_scope; usage reconciled; explicit retry only' } }
    await invalidateRunResults(client, 'a')
    const failed = await client.fetchQuery(options)
    assert.match(failed[0].stageErrors.scoring, /unsupported_claim_scope/)
    assert.equal(failed[0].score, null)
  } finally { client.clear() }
})

test('identity review invalidates prospect views across runs, not progress or diagnostics', async () => {
  const client = createQueryClient()
  try {
    for (const key of [queryKeys.prospects('a'), queryKeys.prospects('b'), queryKeys.progress('a'), queryKeys.diagnostics('a'), queryKeys.directory, queryKeys.runs]) client.setQueryData(key, [])
    await invalidateProspectViews(client)
    for (const key of [queryKeys.prospects('a'), queryKeys.prospects('b'), queryKeys.directory]) assert.equal(client.getQueryState(key).isInvalidated, true)
    for (const key of [queryKeys.progress('a'), queryKeys.diagnostics('a'), queryKeys.runs]) assert.equal(client.getQueryState(key).isInvalidated, false)
    for (const status of ['complete', 'partial', 'failed', undefined]) assert.equal(isActiveRun(status), false)
    assert.equal(isActiveRun('running'), true)
    assert.equal(isActiveRun('queued'), true)
  } finally { client.clear() }
})
