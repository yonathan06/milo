import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDatabase } from './db.ts'
import { runDiscovery, enrichProspect, balancePlatforms, discoveryLimits, searchBrave } from './discovery.ts'
import { communityPresets } from '../community-presets.ts'
import { fixturePlan, seedFixtureRun, offlineProviders, qualificationResponse, nativeOpenRouterFixture, corpus } from './community-fixtures.mjs'
import { validateGeneratedPlan } from './rubric.ts'
import { defaultCommunitySettings, researchLanes } from '../research-settings.ts'
import { runOfflineBenchmark } from './benchmark.mjs'

test('shared pipeline keeps sparse description separate from title and retains unfiltered source audit', async () => {
  const db = openDatabase(':memory:')
  try {
    seedFixtureRun(db, communityPresets[0], 'active-provenance')
    const description = 'Community for couples helping couples plan weddings. Discover popular groups on Facebook.'
    let seen = 0
    await runDiscovery(db, 'active-provenance', {
      search: async () => [{ url: 'https://facebook.com/groups/active-provenance', title: 'Wedding planning group', description }],
      fetchPage: async () => { throw new Error('Page requires login, CAPTCHA, membership') },
      triage: async ({ candidates, catalog }) => candidates.map(c => ({ id: c.id, status: 'likely_fit', reason: 'Explicit description', evidence: [{ id: catalog.find(e => e.candidateId === c.id && e.provenanceField === 'description').id }] })),
      classifyCandidate: async ({ catalog }) => {
        seen++
        assert.ok(catalog.some(e => e.role === 'title'))
        assert.ok(catalog.some(e => e.role === 'community_context' && e.provenanceField === 'description'))
        assert.ok(catalog.every(e => !e.inspected && !e.quote.includes('Discover popular groups')))
        return { eligible: false, communityType: 'reference_only', reason: 'Fixture stops before scoring', evidence: [{ id: catalog[0].id }] }
      },
    })
    assert.ok(seen > 0)
    assert.equal(db.prepare('SELECT snippet FROM community_sources LIMIT 1').get().snippet, description)
  } finally { db.close() }
})

test('shared pipeline/benchmark: four audiences, selected lanes, originals/fallbacks, community gates, parent provenance and auditable leaders', async () => {
  for (const preset of communityPresets) {
    const plan = fixturePlan(preset)
    assert.equal(plan.planVersion, 2)
    assert.deepEqual(plan.criteria.map(c => c.weight), [70, 30])
    assert.equal(plan.queries.length, 5)
    assert.ok(plan.queries.every(q => !['creator','discord_community','whatsapp_community'].includes(q.lane)))
    assert.ok(plan.queries.every(q => q.fallbacks.length === 2 && q.fallbacks.every(f => f !== q.query)))
    assert.doesNotMatch(preset.brief, /prioritize filmmakers|deprioritize.*planning/i)
    if (preset.segment === 'professional_planner') assert.match(preset.brief, /do not exclude planners/)
    assert.throws(() => validateGeneratedPlan({ queries: plan.queries.map(q => ({ ...q, lane: 'creator' })) }, preset.settings), /unselected lane/)
  }
  const optional = validateGeneratedPlan({ queries: researchLanes.map((lane, i) => ({ lane, query: `planning peers ${i}`, fallbacks: [`celebration community ${i}`, `consulting network ${i}`] })) }, { ...defaultCommunitySettings(), selectedLanes: [...researchLanes] })
  assert.ok(optional.queries.some(q => q.lane==='discord_community' && q.query.includes('site:discord.gg')))
  assert.ok(optional.queries.some(q => q.lane==='whatsapp_community' && q.query.includes('site:chat.whatsapp.com')))
  const db = openDatabase(':memory:')
  try {
    seedFixtureRun(db, communityPresets[0])
    const providers = offlineProviders('wedding')
    await runDiscovery(db, 'wedding', providers)
    const queries = db.prepare('SELECT stage FROM queries ORDER BY rowid').all().map(q => q.stage)
    assert.deepEqual(queries.slice(0, 5), Array(5).fill('original'))
    assert.equal(queries.filter(s => s === 'fallback').length, 4, 'all-duplicate originals trigger both saved fallbacks')
    assert.equal(db.prepare("SELECT count(*) n FROM communities WHERE platform='reddit'").get().n, 1)
    const originalThreads = db.prepare("SELECT original_url FROM community_sources WHERE original_url LIKE '%reddit.com%' AND query_id IS NOT NULL").all()
    assert.ok(originalThreads.some(s => s.original_url.includes('abc123')))
    assert.ok(originalThreads.some(s => s.original_url.includes('def456')))
    assert.equal(db.prepare("SELECT count(*) n FROM communities WHERE community_url='https://wedding.example/forum'").get().n, 1)
    assert.equal(db.prepare("SELECT count(*) n FROM prospects WHERE canonical_url LIKE 'https://reference.example/%'").get().n, 0)
    assert.equal(db.prepare("SELECT count(*) n FROM discovery_candidates WHERE triage_status='rejected'").get().n > 0, true)
    assert.equal(db.prepare("SELECT triage_status FROM discovery_candidates WHERE original_url='https://unclear.example/wedding/forum' LIMIT 1").get().triage_status, 'ambiguous')
    assert.equal(db.prepare('SELECT count(*) n FROM assessments WHERE score IS NULL').get().n, 1)
    assert.equal(db.prepare('SELECT count(*) n FROM community_leaders').get().n, 1)
    assert.equal(db.prepare("SELECT permission_status FROM communities WHERE community_url='https://wedding.example/forum'").get().permission_status, 'allowed')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    seedFixtureRun(db, communityPresets[0], 'zero-yield')
    await runDiscovery(db, 'zero-yield', { ...providers, search: async () => [] })
    const zero = db.prepare("SELECT stage,fallback_index FROM queries WHERE run_id='zero-yield' ORDER BY rowid").all()
    assert.equal(zero.length, 15)
    assert.deepEqual(zero.slice(0, 5).map(q => q.stage), Array(5).fill('original'))
    assert.equal(zero.filter(q => q.fallback_index===2).length, 5)
    seedFixtureRun(db, communityPresets[0], 'duplicate-results')
    await runDiscovery(db, 'duplicate-results', { ...providers, search: async input => (await providers.search(input)).slice(0,1).flatMap(result => [result, result]) })
    assert.equal(db.prepare("SELECT count(*) n FROM discovery_candidates WHERE run_id='duplicate-results'").get().n, db.prepare("SELECT sum(json_extract(diagnostics_json,'$.returned')) n FROM queries WHERE run_id='duplicate-results'").get().n, 'even identical URLs have durable per-result provenance')
    assert.equal(db.prepare("SELECT max(json_extract(search_metadata_json,'$.position')) n FROM discovery_candidates WHERE run_id='duplicate-results'").get().n, 1)
  } finally { db.close() }
  const report = await runOfflineBenchmark()
  assert.equal(report.corpus.total, 24)
  assert.ok(report.recall >= .8, JSON.stringify(report))
  assert.ok(report.topRankedPrecision >= .8, JSON.stringify(report))
  assert.equal(report.unsupportedVerifiedLeaderContactClaims, 0)
  assert.equal(report.correctParentDeduplication, true)
  assert.equal(report.verifiedLeaders, 4)
  console.log('OFFLINE BENCHMARK', JSON.stringify(report))
})

test('shared evidence pipeline: shells preserve provisional sources, empty catalogs defer without inference, linked shells do not erase pages', async () => {
  const db = openDatabase(':memory:')
  try {
    for (const mode of ['shell', 'empty', 'linked']) {
      seedFixtureRun(db, communityPresets[0], mode)
      let classification = 0, scoring = 0, leaders = 0, triage = 0
      const url = `https://www.facebook.com/groups/${mode}`
      const snippet = 'Public forum for wedding planners and engaged couples discussing ceremonies, consulting questions and detailed event planning advice.'
      await runDiscovery(db, mode, {
        search: async query => query.startsWith('"') ? [] : [{ url, title: mode === 'empty' ? '' : 'Wedding peer community', description: mode === 'empty' ? '' : snippet }],
        fetchPage: async target => mode === 'linked' && target === url ? `<title>Wedding planners forum</title><main>${snippet}</main><a href="/about">About</a>` : '<title>Facebook</title>',
        triage: async ({ candidates, catalog }) => { triage++; return candidates.map(c => ({ id: c.id, status: 'likely_fit', reason: 'Public wedding community', evidence: [{ id: catalog.find(e => e.field === c.id).id }] })) },
        classifyCandidate: async ({ catalog, sourceMode }) => { classification++; assert.equal(sourceMode, mode === 'linked' ? 'page' : 'snippet'); return { eligible: true, communityType: 'group', reason: 'Cited public community', evidence: [{ id: catalog.find(e => e.role === 'community_context').id }] } },
        assessCandidate: async ({ catalog }) => { scoring++; return qualificationResponse(catalog) },
        discoverLeaders: async () => { leaders++; return { leaders: [] } },
      })
      const community = db.prepare('SELECT * FROM communities WHERE run_id=?').get(mode)
      const evidence = JSON.parse(community.evidence_json)
      assert.equal(db.prepare('SELECT count(*) n FROM access_wall_cache WHERE canonical_url=?').get(url).n, 0)
      assert.ok(evidence.retainedSources.every(s => s.url === url))
      if (mode === 'empty') {
        assert.equal(classification + scoring + leaders + triage, 0)
        assert.equal(community.classification_state, 'deferred')
        assert.equal(community.scoring_state, 'deferred')
        assert.match(community.stage_errors_json, /needs-community-evidence/)
        assert.equal(db.prepare('SELECT count(*) n FROM assessments WHERE run_id=?').get(mode).n, 0)
        assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE run_id=? AND provider='openrouter'").get(mode).n, 0)
      } else {
        assert.equal(classification, 1, `${mode}: ${community.stage_errors_json}`); assert.equal(scoring, 1, `${mode}: ${community.stage_errors_json}`)
        assert.ok(evidence.retainedSources.some(s => s.description?.includes(snippet)))
        const assessment = db.prepare('SELECT * FROM assessments WHERE run_id=?').get(mode)
        assert.equal(assessment.score, 90)
        if (mode === 'shell') {
          assert.equal(assessment.confidence, 'low'); assert.equal(assessment.source_mode, 'snippet')
          assert.equal(community.verification_status, 'unverified'); assert.equal(community.leader_state, 'deferred')
          assert.equal(community.permission_status, 'unknown'); assert.equal(assessment.contactability, 'unknown')
          assert.deepEqual(JSON.parse(community.contact_routes_json), [])
          assert.equal(leaders, 0)
        } else {
          assert.equal(evidence.sourceMode, 'page')
          assert.ok(evidence.catalog.some(e => e.quote.includes('wedding planners')))
          assert.equal(evidence.enrichment.sources.length, 1)
        }
      }
    }
    assert.equal(db.prepare('SELECT count(*) n FROM community_leaders').get().n, 0)
  } finally { db.close() }
})

test('shared native pipeline: compact snippet-only ranking and strict safe output failures through mocked OpenRouter', async () => {
  const previousFetch = globalThis.fetch, previousKey = process.env.OPENROUTER_API_KEY
  let unmatched = 0
  globalThis.fetch = async () => { unmatched++; throw new Error('Unmocked outbound request forbidden') }
  process.env.OPENROUTER_API_KEY = 'offline-native-dummy-key'
  const db = openDatabase(':memory:')
  try {
    for (const defect of ['valid','classification-citation','qualification-citation','malformed','truncated']) {
      seedFixtureRun(db, communityPresets[0], `native-${defect}`)
      const native = nativeOpenRouterFixture(db, defect)
      const url = `https://www.facebook.com/groups/native-${defect}`
      await runDiscovery(db, `native-${defect}`, {
        fetcher: native.fetcher,
        search: async query => query.startsWith('"') ? [] : [{ url, title: 'Wedding planning peer community', description: 'Public forum for engaged couples and wedding planners discussing ceremonies, consulting questions and detailed event planning advice.' }],
        fetchPage: async () => '<title>Facebook</title>',
      })
      const community = db.prepare('SELECT * FROM communities WHERE run_id=?').get(`native-${defect}`)
      assert.equal(community.verification_status, 'unverified')
      assert.equal(community.permission_status, 'unknown')
      assert.equal(native.requests.filter(r => r.response_format.json_schema.name === 'community_eligibility').length, 1)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE run_id=? AND provider='openrouter' AND status='settled'").get(`native-${defect}`).n, native.requests.length)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE status='reserved'").get().n, 0)
      const assessment = db.prepare('SELECT * FROM assessments WHERE run_id=?').get(`native-${defect}`)
      if (defect === 'valid') {
        assert.ok(native.catalogCalls >= 1, 'catalog fetched through native transport')
        assert.equal(community.scoring_state, 'complete'); assert.equal(community.leader_state, 'deferred')
        assert.equal(assessment.score, 90); assert.equal(assessment.confidence, 'low'); assert.equal(assessment.source_mode, 'snippet')
        assert.equal(assessment.contactability, 'unknown')
        assert.ok(JSON.parse(assessment.evidence_refs_json).every(ref => ref.sourceUrl === url))
        assert.deepEqual(JSON.parse(community.contact_routes_json), [])
        assert.equal(native.requests.filter(r => r.response_format.json_schema.name === 'community_qualification').length, 1)
        const classificationSchema = native.requests.find(r => r.response_format.json_schema.name === 'community_eligibility').response_format.json_schema.schema
        assert.deepEqual(classificationSchema.properties.evidence.items.properties.id.enum, JSON.parse(community.evidence_json).catalog.map(e => e.id))
        assert.equal(classificationSchema.properties.reason.maxLength, 240)
        const qualificationSchema = native.requests.find(r => r.response_format.json_schema.name === 'community_qualification').response_format.json_schema.schema
        assert.equal(qualificationSchema.properties.rationale.maxLength, 500)
      } else {
        assert.equal(assessment, undefined, 'unsupported ranking never saved')
        assert.match(community.stage_errors_json, defect.endsWith('citation') ? /Invalid evidence citation/ : defect === 'truncated' ? /Truncated model output/ : /Invalid JSON model output/)
        if (defect === 'malformed') assert.match(community.stage_errors_json, /truncation=unknown/)
        if (defect === 'truncated') assert.match(community.stage_errors_json, /completion_limit=1000/)
        assert.ok(!community.stage_errors_json.includes(native.marker))
        assert.ok(!community.stage_errors_json.includes(process.env.OPENROUTER_API_KEY))
      }
      assert.equal(unmatched, 0)
    }
    assert.equal(db.prepare('SELECT count(*) n FROM community_leaders').get().n, 0)
  } finally {
    db.close(); globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey
  }
})

test('shared retry: inference outage retains inspected evidence; explicit retries are idempotent and never rediscover', async () => {
  const db = openDatabase(':memory:')
  try {
    seedFixtureRun(db, communityPresets[0], 'retry')
    const providers = offlineProviders('wedding')
    const scoring = providers.assessCandidate
    providers.assessCandidate = async () => { throw new Error('Injected scoring timeout') }
    await runDiscovery(db, 'retry', providers)
    const community = db.prepare("SELECT * FROM communities WHERE community_url='https://wedding.example/forum'").get()
    assert.equal(community.page_state, 'inspected')
    assert.equal(community.verification_status, 'verified')
    assert.equal(community.scoring_state, 'failed')
    assert.equal(db.prepare('SELECT count(*) n FROM access_wall_cache WHERE canonical_url=?').get('https://wedding.example/forum').n, 0, 'inference outages never cache page walls')
    assert.ok(JSON.parse(community.evidence_json).page.text)
    const before = { search: providers.counters.search, page: providers.counters.page }
    providers.assessCandidate = scoring
    await enrichProspect(db, community.id, providers)
    assert.equal(providers.counters.search, before.search)
    assert.equal(providers.counters.page, before.page)
    const counts = Object.fromEntries(['assessments','suggestions','observations','community_leaders','usage_ledger'].map(t => [t, db.prepare(`SELECT count(*) n FROM ${t}`).get().n]))
    await enrichProspect(db, community.id, providers)
    for (const [t, n] of Object.entries(counts)) assert.equal(db.prepare(`SELECT count(*) n FROM ${t}`).get().n, n)
    assert.equal(db.prepare('SELECT scoring_state FROM communities WHERE id=?').get(community.id).scoring_state, 'complete')
  } finally { db.close() }
})

test('shared acquisition bounds: triage outage, priority diversity, 50 shortlist, recovery cap, walls TTL/manual bypass and 10 results', async () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ platform: i % 2 ? 'facebook' : 'reddit', triage_status: i < 20 ? 'likely_fit' : 'ambiguous', id: i }))
  const shortlist = balancePlatforms(rows, 50)
  assert.equal(shortlist.length, 50)
  assert.ok(shortlist.slice(0, 20).every(r => r.triage_status === 'likely_fit'))
  assert.equal(balancePlatforms([{ platform: 'facebook', triage_status: 'likely_fit' }], 50).length, 1)
  const results = await searchBrave('planning', 'offline', async input => {
    assert.equal(new URL(input).searchParams.get('count'), '10')
    return new Response(JSON.stringify({ web: { results: Array.from({ length: 15 }, (_, i) => ({ url: `https://example.org/${i}` })) } }))
  })
  assert.equal(results.length, 10)
  const db = openDatabase(':memory:')
  try {
    seedFixtureRun(db, communityPresets[0], 'bounded')
    let searches = 0, fetches = 0
    const base = offlineProviders('wedding')
    const options = { ...base,
      search: async query => { searches++; if (query.startsWith('"')) return []; return Array.from({ length: 10 }, (_, i) => ({ url: query.includes('site:reddit') ? `https://reddit.com/r/event${searches}${i}` : query.includes('site:facebook') ? `https://facebook.com/groups/event${searches}${i}` : `https://forums.example/event${searches}${i}`, title: 'Planning community', description: 'A wedding planning discussion asks about venues.' })) },
      triage: async () => { throw new Error('Injected triage unavailable') },
      fetchPage: async () => { fetches++; throw new Error('Page requires login, CAPTCHA, membership, or access-control interaction; it was not accessed') },
      classifyCandidate: async ({ catalog }) => ({ eligible: true, communityType: 'forum', reason: 'Community evidence in snippet', evidence: [{ id: catalog[0].id }] }),
      assessCandidate: async () => { throw new Error('Injected incomplete scoring before manual wall retry') },
    }
    await runDiscovery(db, 'bounded', options)
    assert.equal(db.prepare('SELECT count(*) n FROM discovery_candidates WHERE shortlisted=1').get().n, 50)
    assert.equal(db.prepare("SELECT count(*) n FROM discovery_candidates WHERE triage_state='deferred'").get().n, 50)
    assert.equal(db.prepare("SELECT count(*) n FROM queries WHERE stage='recovery'").get().n, 20)
    assert.equal(db.prepare("SELECT count(*) n FROM discovery_candidates WHERE recovery_state='deferred'").get().n, 40)
    assert.equal(db.prepare('SELECT count(*) n FROM access_wall_cache').get().n, 50)
    const c = db.prepare('SELECT id FROM communities LIMIT 1').get()
    const before = fetches
    await enrichProspect(db, c.id, { ...options, assessCandidate: async ({ catalog }) => qualificationResponse(catalog, 'partial') })
    assert.equal(fetches, before + 1, 'explicit manual retry bypasses cached access wall')
    db.prepare('UPDATE access_wall_cache SET expires_at=?').run('2000-01-01T00:00:00.000Z')
    seedFixtureRun(db, communityPresets[0], 'expired')
    const one = { ...options, search: async query => query.startsWith('"') ? [] : [{ url: 'https://facebook.com/groups/event10', title: 'Planning community', description: 'A wedding planning discussion asks about venues.' }] }
    const expiredBefore = fetches
    await runDiscovery(db, 'expired', one)
    assert.ok(fetches > expiredBefore, 'expired walls are refetched automatically')
    assert.equal(discoveryLimits.automaticRecovery, 10)
  } finally { db.close() }
})
