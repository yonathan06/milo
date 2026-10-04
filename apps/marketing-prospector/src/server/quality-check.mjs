import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDatabase } from './db.ts'
import { modelTriage, runDiscovery, classificationQualifies } from './discovery.ts'
import { createActiveCatalog } from './community-evidence.ts'
import { communityPresets } from '../community-presets.ts'
import { seedFixtureRun, nativeOpenRouterFixture } from './community-fixtures.mjs'
import { scopedFixtures } from './scoped-fixtures.mjs'
import { assessCandidate } from './assessment.ts'

function withDummyKey(action) {
  const previous = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'offline-quality-dummy'
  return Promise.resolve().then(action).finally(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previous
  })
}
test('shared native multi-candidate contract rejects citation failures, settles once and does not replay', () => withDummyKey(async () => {
  const db = openDatabase(':memory:')
  try {
    const candidates = ['one','two','empty'].map(id => ({ id, canonical_url: `https://reddit.com/r/${id}`, original_url: `https://reddit.com/r/${id}` }))
    const catalog = candidates.slice(0, 2).flatMap(c => createActiveCatalog([{ url: c.original_url, description: 'Community for couples helping couples plan weddings.', candidateId: c.id }], c.canonical_url)).map((e, i) => ({ ...e, id: `E${i + 1}` }))
    for (const defect of ['valid','missing_citation','invalid_citation_shape','citation-string','citation-object','unknown_excerpt_id','cross_candidate_citation']) {
      seedFixtureRun(db, communityPresets[0], defect)
      const native = nativeOpenRouterFixture(db, 'valid', (name, output) => {
        assert.equal(name, 'snippet_triage')
        if (defect === 'missing_citation') delete output.C1.evidence
        if (defect === 'invalid_citation_shape') output.C1.evidence = [{ id: 'E1' },{ id: 'E1' },{ id: 'E1' },{ id: 'E1' }]
        if (defect === 'citation-string') output.C1.evidence = 'E1'
        if (defect === 'citation-object') output.C1.evidence = [{ id: 'E1', quote: 'PRIVATE_RAW_FIXTURE_OUTPUT' }]
        if (defect === 'unknown_excerpt_id') output.C1.evidence = [{ id: 'E99999' }]
        if (defect === 'cross_candidate_citation') output.C1.evidence = [{ id: 'E2' }]
        return output
      })
      const action = () => modelTriage({ db, runId: defect, brief: communityPresets[0].brief, candidates, catalog, fetcher: native.fetcher })
      if (defect === 'valid') {
        const rows = await action()
        assert.deepEqual(rows.map(r => r.id), ['one','two','empty'])
        assert.equal(rows[2].status, 'ambiguous'); assert.deepEqual(rows[2].evidence, [])
        const shapes = native.requests[0].response_format.json_schema.schema.properties
        assert.deepEqual(shapes.C1.properties.evidence.items.properties.id.enum, ['E1'])
        assert.deepEqual(shapes.C2.properties.evidence.items.properties.id.enum, ['E2'])
      } else await assert.rejects(action, error => {
        // Missing property is a citation failure, not a generic shape failure.
        assert.equal(error.citationCategory, defect.startsWith('citation-') ? 'invalid_citation_shape' : defect)
        assert.ok(!error.message.includes('offline-quality-dummy'))
        assert.ok(!error.message.includes('E99999'))
        return true
      })
      assert.equal(native.requests.length, 1)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE run_id=? AND provider='openrouter' AND status='settled'").get(defect).n, 1)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE status='reserved'").get().n, 0)
      assert.equal(db.prepare('SELECT count(*) n FROM assessments').get().n, 0)
    }
  } finally { db.close() }
}))

test('shared native community quality matrix: eligibility, insufficient context, provisional full/partial fit and mismatch', () => withDummyKey(async () => {
  const db = openDatabase(':memory:')
  try {
    for (const fixture of scopedFixtures) {
      seedFixtureRun(db, communityPresets[0], fixture.name)
      const url = fixture.url ?? (fixture.sufficient || ['vendor','directory','name-only'].includes(fixture.name) ? `https://quality.example/${fixture.name}/forum` : `https://facebook.com/groups/${fixture.name}`)
      const native = nativeOpenRouterFixture(db, 'valid', (name, output) => {
        if (name === 'community_qualification') {
          if (['partial','ordinary-forum'].includes(fixture.name)) {
            output.dimensions[0] = { ...output.dimensions[0], basis: 'unknown', score: null, evidence: [] }
            output.dimensions[1].score = 100
          }
          if (fixture.name === 'mismatch') for (const dimension of output.dimensions) dimension.score = 0
        }
        return output
      })
      await runDiscovery(db, fixture.name, {
        fetcher: native.fetcher,
        search: async query => query.startsWith('"') ? [] : [{ url, title: fixture.title ?? 'Planning forum', description: fixture.description ?? '' }],
        fetchPage: async () => { throw new Error('Page requires login, CAPTCHA, membership') },
      })
      const assessment = db.prepare('SELECT * FROM assessments WHERE run_id=?').get(fixture.name)
      const scoringCalls = native.requests.filter(r => r.response_format.json_schema.name === 'community_qualification')
      assert.equal(scoringCalls.length, fixture.sufficient ? 1 : 0, fixture.name)
      if (fixture.sufficient) {
        assert.ok(assessment, fixture.name)
        assert.equal(assessment.score, ['partial','ordinary-forum'].includes(fixture.name) ? 100 : fixture.name === 'mismatch' ? 0 : 90)
        assert.equal(assessment.coverage, ['partial','ordinary-forum'].includes(fixture.name) ? 30 : 100)
        assert.equal(assessment.confidence, 'low')
        assert.equal(assessment.contactability, 'unknown')
        const community = db.prepare('SELECT * FROM communities WHERE run_id=?').get(fixture.name)
        assert.equal(community.verification_status, 'unverified')
        assert.equal(community.permission_status, 'unknown')
        assert.deepEqual(JSON.parse(community.contact_routes_json), [])
        assert.equal(db.prepare("SELECT count(*) n FROM queries WHERE run_id=? AND stage='recovery'").get(fixture.name).n, 0)
      } else assert.equal(assessment, undefined, fixture.name)
      const catalog = createActiveCatalog([{ url, description: fixture.description, title: fixture.title }], url)
      if (catalog.length && !fixture.sufficient) assert.equal(classificationQualifies({ eligible: true, communityType: 'forum', evidence: [{ id: catalog[0].id }] }, 'custom_website', catalog), false, fixture.name)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE run_id=? AND provider='openrouter' AND status='settled'").get(fixture.name).n, native.requests.length)
    }
  } finally { db.close() }
}))

test('shared native inspected public forums recognize ordinary peer wording on unfamiliar domains', () => withDummyKey(async () => {
  const db = openDatabase(':memory:')
  try {
    for (const fixture of scopedFixtures.filter(f => ['ordinary-forum','brides-grooms','split-brides-grooms','vendor','directory','name-only'].includes(f.name))) {
      const runId = `inspected-${fixture.name}`
      seedFixtureRun(db, communityPresets[0], runId)
      const url = `https://unfamiliar.example/${fixture.name}/forum`
      const native = nativeOpenRouterFixture(db, 'valid', (name, output) => {
        if (name === 'community_qualification' && fixture.name === 'ordinary-forum') output.dimensions[0] = { ...output.dimensions[0], basis: 'unknown', score: null, evidence: [] }
        return output
      })
      await runDiscovery(db, runId, {
        fetcher: native.fetcher,
        search: async () => [{ url, title: fixture.title ?? 'Wedding forum', description: fixture.description ?? '' }],
        fetchPage: async target => { assert.equal(target, url); return `<title>${fixture.title ?? 'Wedding forum'}</title><main>${fixture.description ?? ''}</main>` },
        discoverLeaders: async () => ({ leaders: [] }),
      })
      const assessment = db.prepare('SELECT * FROM assessments WHERE run_id=?').get(runId)
      assert.equal(Boolean(assessment), fixture.sufficient, fixture.name)
      if (fixture.sufficient) assert.equal(db.prepare('SELECT verification_status FROM communities WHERE run_id=?').get(runId).verification_status, 'verified')
    }
  } finally { db.close() }
}))

test('shared native discussion can support planning only after community context, never parent member composition', () => withDummyKey(async () => {
  const db = openDatabase(':memory:')
  try {
    const target = 'https://reddit.com/r/examplecity'
    const catalog = createActiveCatalog([
      { url: target, description: 'Community for local residents sharing city questions.' },
      { url: `${target}/comments/abc/wedding_budget`, description: 'A wedding planning question asks about venues.' },
    ], target)
    const discussion = catalog.find(e => e.role === 'discussion')
    for (const memberClaim of [false, true]) {
      const runId = `discussion-${memberClaim}`
      seedFixtureRun(db, communityPresets[0], runId)
      const native = nativeOpenRouterFixture(db, 'valid', (name, output) => {
        assert.equal(name, 'community_qualification')
        output.dimensions[0] = { ...output.dimensions[0], score: memberClaim ? 100 : null, basis: memberClaim ? 'community_context' : 'unknown', evidence: memberClaim ? [{ id: discussion.id }] : [] }
        output.dimensions[1] = { ...output.dimensions[1], score: 100, basis: 'discussion', evidence: [{ id: discussion.id }] }
        return output
      })
      const action = () => assessCandidate({ db, runId, brief: communityPresets[0].brief, catalog, sourceMode: 'snippet', fetcher: native.fetcher })
      if (memberClaim) await assert.rejects(action, e => e.citationCategory === 'unsupported_claim_scope')
      else { const result = await action(); assert.equal(result.score, 100); assert.equal(result.coverage, 30); assert.equal(result.dimensions[0].score, null) }
      assert.equal(native.requests.length, 1)
    }
  } finally { db.close() }
}))

test('shared native explicit community facts support signals; unknown claims cannot carry citations', () => withDummyKey(async () => {
  const db = openDatabase(':memory:')
  try {
    const url = 'https://facebook.com/groups/scoped-facts'
    const facts = { demand: 'Our community members seek a guest video service.', activity: 'Our community currently has 12 posts per week.', location: 'Our community members are based in Canada.', size: 'Our community has 200 members.' }
    const catalog = createActiveCatalog([{ url, description: `Community for couples helping couples plan weddings. ${Object.values(facts).join(' ')}` }], url)
    for (const invalidUnknown of [false, true]) {
      const runId = `facts-${invalidUnknown}`
      seedFixtureRun(db, communityPresets[0], runId)
      const native = nativeOpenRouterFixture(db, 'valid', (_name, output) => {
        for (const [name, quote] of Object.entries(facts)) {
          const ref = catalog.find(e => e.quote === quote)
          output.signals[name] = { state: 'supported', basis: 'community_fact', rationale: 'Explicit community fact', evidence: [{ id: ref.id }] }
        }
        if (invalidUnknown) output.signals.demand.state = 'unknown'
        return output
      })
      const action = () => assessCandidate({ db, runId, brief: communityPresets[0].brief, catalog, sourceMode: 'snippet', fetcher: native.fetcher })
      if (invalidUnknown) await assert.rejects(action, error => error.citationCategory === 'invalid_citation_shape')
      else {
        const result = await action()
        assert.equal(result.coverage, 100)
        assert.ok(Object.values(result.signals).every(signal => signal.state === 'supported' && signal.basis === 'community_fact'))
      }
      assert.equal(native.requests.length, 1)
    }
  } finally { db.close() }
}))

test('shared native scope failures reject real IDs for titles, individuals, old activity, topical demand and unrelated communities without saving output', () => withDummyKey(async () => {
  const db = openDatabase(':memory:')
  try {
    const cases = [
      { name: 'title-scope', text: 'Wedding planning group', claim: 'audience_alignment', basis: 'community_context', field: 'title' },
      { name: 'individual-location', text: 'One participant lives in Canada.', claim: 'location', basis: 'community_fact' },
      { name: 'old-activity', text: 'Our community shared 8 posts per week in 2018.', claim: 'activity', basis: 'community_fact' },
      { name: 'topical-demand', text: 'Our community members share wedding planning tips.', claim: 'demand', basis: 'community_fact' },
      { name: 'planning-only-audience', text: 'Planning forum where members share event planning advice.', claim: 'audience_alignment', basis: 'community_context' },
      { name: 'unrelated-scope', text: 'Another community helps couples plan weddings.', claim: 'audience_alignment', basis: 'community_context' },
    ]
    for (const scenario of cases) {
      seedFixtureRun(db, communityPresets[0], scenario.name)
      const url = `https://facebook.com/groups/${scenario.name}`
      const native = nativeOpenRouterFixture(db, 'valid', (name, output, catalog) => {
        if (name === 'community_qualification') {
          const ref = catalog.find(e => scenario.field === 'title' ? e.provenanceField === 'title' : e.quote === scenario.text)
          assert.ok(ref, scenario.name)
          if (scenario.claim === 'audience_alignment') output.dimensions[0] = { ...output.dimensions[0], basis: scenario.basis, evidence: [{ id: ref.id }] }
          else output.signals[scenario.claim] = { state: 'supported', basis: scenario.basis, rationale: 'PRIVATE_RAW_FIXTURE_OUTPUT', evidence: [{ id: ref.id }] }
        }
        return output
      })
      await runDiscovery(db, scenario.name, {
        fetcher: native.fetcher,
        search: async query => query.startsWith('"') ? [] : [{ url, title: 'Wedding planning group', description: `Community for couples helping couples plan weddings. ${scenario.field ? '' : scenario.text}` }],
        fetchPage: async () => { throw new Error('Page requires login, CAPTCHA, membership') },
      })
      const community = db.prepare('SELECT * FROM communities WHERE run_id=?').get(scenario.name)
      assert.equal(community.scoring_state, 'failed', scenario.name)
      assert.match(community.stage_errors_json, /citation_category=unsupported_claim_scope/)
      assert.ok(!community.stage_errors_json.includes('PRIVATE_RAW_FIXTURE_OUTPUT'))
      assert.equal(db.prepare('SELECT count(*) n FROM assessments WHERE run_id=?').get(scenario.name).n, 0)
      assert.equal(native.requests.filter(r => r.response_format.json_schema.name === 'community_qualification').length, 1)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE run_id=? AND provider='openrouter' AND status='settled'").get(scenario.name).n, native.requests.length)
    }
  } finally { db.close() }
}))
