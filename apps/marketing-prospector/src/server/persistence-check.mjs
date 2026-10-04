import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, resetResearchWorkspace, RESEARCH_SCHEMA_VERSION, getBudgetPath } from './db.ts'
import { defaultCommunitySettings, decodeResearchRequest } from '../research-settings.ts'
import { getMonthlyUsage, reserveUsageRequest, settleUsageRequest } from './usage.ts'
import { deleteRunProspects } from './delete-run-prospects.ts'
import { resolveProspect } from './deduplication.ts'
import { restorePreviousWorkspace } from './restore-workspace.ts'
import { runDiscovery, enrichProspect } from './discovery.ts'
import { extractPage } from './public-pages.ts'
import { readProspectDirectory } from './prospect-directory.ts'
import { communityPresets } from '../community-presets.ts'
import { seedFixtureRun, nativeOpenRouterFixture } from './community-fixtures.mjs'

function seedRun(db, id = 'run') {
  const settings = decodeResearchRequest({ researchSettings: defaultCommunitySettings() })
  db.prepare("INSERT INTO runs(id,brief,status,started_at,research_settings_json) VALUES(?,'event planning','complete','now',?)")
    .run(id, JSON.stringify(settings))
  return settings
}

function assertIntegrity(db) {
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.equal(db.prepare('PRAGMA budget.integrity_check').get().integrity_check, 'ok')
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
}

test('shared persistence: fresh schema, explicit requests, old research reset, durable budget and unresolved blockers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'community-persistence-'))
  const path = join(directory, 'prospects.sqlite')
  const month = new Date().toISOString().slice(0, 7)
  try {
    // A minimal old workspace is operational reset input, not a migration fixture.
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY, status TEXT); INSERT INTO runs VALUES('old','complete');
      CREATE TABLE usage_ledger(id TEXT PRIMARY KEY,month TEXT,provider TEXT,run_id TEXT,operation TEXT,credits INTEGER,cost_micros INTEGER,status TEXT,created_at TEXT);
      PRAGMA user_version = 18;`)
    old.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?,?,?)').run('spent', month, 'brave', 'old', 'reconcile', 1, 2_000_000, 'settled', 'now')
    old.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?,?,?)').run('uncertain', month, 'openrouter', 'old', 'reserve', 1, 500_000, 'reserved', 'now')
    old.close()
    assert.throws(() => openDatabase(path), /Unsupported research schema.*reset-research/)
    assert.throws(() => resetResearchWorkspace(path, { confirmed: false, backupDirectory: join(directory, 'unconfirmed') }), /confirmation/)
    const reset = resetResearchWorkspace(path, { confirmed: true, backupDirectory: join(directory, 'backup') })
    assert.equal(reset.preservedRecords, 2)
    const backup = new DatabaseSync(join(reset.backupDirectory, 'prospects.sqlite'), { readOnly: true })
    assert.equal(backup.prepare('SELECT count(*) n FROM runs').get().n, 1)
    backup.close()
    let db = openDatabase(path)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, RESEARCH_SCHEMA_VERSION)
    assert.equal(db.prepare('SELECT count(*) n FROM runs').get().n, 0)
    assert.equal(db.prepare("SELECT count(*) n FROM main.sqlite_schema WHERE name='usage_ledger'").get().n, 0)
    assert.equal(getMonthlyUsage(db).committedMicros, 2_500_000)
    assert.equal(getMonthlyUsage(db).remainingMicros, 7_500_000)
    assert.equal(db.prepare("SELECT status,run_id FROM usage_ledger WHERE id='uncertain'").get().status, 'reserved')
    assert.equal(db.prepare("SELECT run_id FROM usage_ledger WHERE id='uncertain'").get().run_id, null)
    const settings = seedRun(db)
    assert.deepEqual(decodeResearchRequest({ researchSettings: JSON.parse(db.prepare('SELECT research_settings_json s FROM runs').get().s) }), settings)
    for (const invalid of [undefined, { ...settings, planVersion: 1 }, { ...settings, researchMode: 'mixed' }, { ...settings, selectedLanes: ['creator'] }]) {
      assert.throws(() => decodeResearchRequest({ researchSettings: invalid }))
    }
    assert.throws(() => reserveUsageRequest(db, 'brave', 'run', 5000), /unresolved/)
    settleUsageRequest(db, 'uncertain', 500_000)
    assert.throws(() => reserveUsageRequest(db, 'brave', 'run', 7_500_001), /budget exhausted/)
    db.prepare("INSERT INTO queries(id,run_id,lane,query_text,provider,status,created_at) VALUES('q','run','public_forum','planning forum','brave','complete','now')").run()
    assert.throws(() => db.prepare("UPDATE queries SET lane='creator'").run(), /CHECK/)
    db.prepare("INSERT INTO discovery_candidates(id,run_id,query_id,original_url,observed_at) VALUES('candidate','run','q','https://example.org/forum','now')").run()
    db.prepare(`INSERT INTO communities(id,run_id,canonical_identity,community_url,community_type,platform,source_url,original_url,observed_at)
      VALUES('c','run','https://example.org/forum','https://example.org/forum','forum','custom_website','https://example.org/forum','https://example.org/forum','now')`).run()
    for (let i = 0; i < 3; i++) db.prepare("INSERT INTO community_leaders(id,community_id,name,role,role_evidence_json,status,observed_at) VALUES(?,'c',?,'founder','[]','verified','now')").run(`leader-${i}`, `Name ${i}`)
    assert.throws(() => db.prepare("INSERT INTO community_leaders(id,community_id,name,role,role_evidence_json,status,observed_at) VALUES('four','c','Fourth','founder','[]','verified','now')").run(), /three leaders/)
    assertIntegrity(db)
    db.close()
    db = openDatabase(path)
    assert.equal(db.prepare('SELECT count(*) n FROM discovery_candidates').get().n, 1)
    assertIntegrity(db)
    db.close()
    // A second reset preserves charges; deleting research alone also preserves them.
    resetResearchWorkspace(path, { confirmed: true, backupDirectory: join(directory, 'second-backup') })
    db = openDatabase(path)
    assert.equal(getMonthlyUsage(db).committedMicros, 2_500_000)
    assert.equal(db.prepare('SELECT count(*) n FROM runs').get().n, 0)
    seedRun(db, 'post-reset')
    const postResetCharge = reserveUsageRequest(db, 'openrouter', 'post-reset', 10_000)
    const currentLedger = db.prepare('SELECT * FROM usage_ledger ORDER BY id').all().map(row => ({ ...row, run_id: null }))
    db.close()
    const restored = restorePreviousWorkspace(path, join(reset.backupDirectory, 'prospects.sqlite'), true)
    const previousBuild = new DatabaseSync(path)
    assert.deepEqual(previousBuild.prepare('SELECT * FROM usage_ledger ORDER BY id').all().map(row => ({ ...row })), currentLedger)
    assert.equal(previousBuild.prepare('SELECT status FROM usage_ledger WHERE id=?').get(postResetCharge).status, 'reserved')
    previousBuild.close()
    assert.throws(() => openDatabase(path), /Unsupported research schema/)
    const savedCurrent = new DatabaseSync(restored.savedCurrentPath, { readOnly: true })
    assert.equal(savedCurrent.prepare('PRAGMA user_version').get().user_version, RESEARCH_SCHEMA_VERSION)
    savedCurrent.close()
    resetResearchWorkspace(path, { confirmed: true, backupDirectory: join(directory, 'after-rollback') })
    unlinkSync(path)
    db = openDatabase(path)
    assert.equal(getMonthlyUsage(db).committedMicros, 2_510_000)
    assert.throws(() => reserveUsageRequest(db, 'brave', 'any', 5000), /unresolved/)
    assertIntegrity(db)
    db.close()
    unlinkSync(getBudgetPath(path))
    assert.throws(() => openDatabase(path), /Durable budget storage is missing/)
    const memory = openDatabase(':memory:')
    assert.equal(getMonthlyUsage(memory).capMicros, 10_000_000)
    assertIntegrity(memory)
    memory.close()
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('shared persisted scoped retry rebuilds only incomplete catalogs and preserves historical completed scores, review, sources and charges', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'community-scoped-retry-'))
  const path = join(directory, 'prospects.sqlite')
  const previousKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'offline-scoped-retry-dummy'
  let db
  try {
    db = openDatabase(path)
    seedFixtureRun(db, communityPresets[0], 'scoped-retry')
    const url = 'https://ordinary.example/planning/forum'
    await runDiscovery(db, 'scoped-retry', {
      search: async () => [{ url, title: 'Planning forum', description: 'Planning forum with questions and advice from fellow community members.' }],
      fetchPage: async () => '<title>Facebook</title>',
      triage: async ({ candidates, catalog }) => candidates.map(c => ({ id: c.id, status: 'ambiguous', reason: 'Audience unknown', evidence: [{ id: catalog.find(e => e.field === c.id).id }] })),
      classifyCandidate: async ({ catalog }) => ({ eligible: true, communityType: 'forum', reason: 'Hosted participation', evidence: [{ id: catalog.find(e => e.role === 'community_context').id }] }),
      assessCandidate: async () => { throw new Error('Injected incomplete scoring') },
    })
    const community = db.prepare('SELECT * FROM communities LIMIT 1').get()
    const saved = JSON.parse(community.evidence_json)
    saved.catalog = saved.catalog.map(({ id, sourceUrl, field, quote }) => ({ id, sourceUrl, field, quote }))
    saved.retainedSources = [{ url, text: 'Planning forum Planning forum with questions and advice from fellow community members.' }]
    db.prepare('UPDATE communities SET evidence_json=? WHERE id=?').run(JSON.stringify(saved), community.id)
    db.prepare("UPDATE prospects SET review_state='selected' WHERE id=?").run(community.prospect_id)
    const unresolved = reserveUsageRequest(db, 'openrouter', 'scoped-retry', 100, new Date('2025-01-01'))
    db.close(); db = openDatabase(path)
    let searches = 0
    const native = nativeOpenRouterFixture(db, 'valid', (_name, output) => {
      output.dimensions[0] = { ...output.dimensions[0], basis: 'unknown', score: null, evidence: [] }
      output.dimensions[1].score = 100
      return output
    })
    const options = { fetcher: native.fetcher, search: async () => { searches++; throw new Error('Unexpected recovery search') }, fetchPage: async () => '<title>Facebook</title>' }
    const blocked = await enrichProspect(db, community.id, options)
    assert.equal(blocked.status, 'failed'); assert.match(blocked.error, /unresolved/i)
    assert.equal(native.requests.length, 0); assert.equal(searches, 0)
    assert.equal(db.prepare('SELECT status FROM usage_ledger WHERE id=?').get(unresolved).status, 'reserved')
    const rebuilt = JSON.parse(db.prepare('SELECT evidence_json FROM communities WHERE id=?').get(community.id).evidence_json)
    assert.ok(rebuilt.catalog.some(e => e.role === 'community_context' && e.provenanceField === 'description'))
    assert.ok(rebuilt.catalogAudit.length > 0)
    settleUsageRequest(db, unresolved, 100)
    const result = await enrichProspect(db, community.id, options)
    assert.equal(result.score, 100); assert.equal(searches, 0); assert.equal(native.requests.length, 1)
    assert.equal(db.prepare('SELECT coverage FROM assessments LIMIT 1').get().coverage, 30)
    // Authored historical result: no real live run is used or rewritten.
    db.prepare('UPDATE assessments SET score=100,coverage=100').run()
    const complete = JSON.parse(db.prepare('SELECT evidence_json FROM communities WHERE id=?').get(community.id).evidence_json)
    complete.catalog = saved.catalog
    db.prepare('UPDATE communities SET evidence_json=? WHERE id=?').run(JSON.stringify(complete), community.id)
    const tables = ['communities','assessments','prospects','prospect_aliases','community_sources','observations','queries','discovery_candidates','usage_ledger','suggestions']
    const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]))
    const historical = snapshot()
    db.close(); db = openDatabase(path)
    readProspectDirectory(db, {})
    const repeated = await enrichProspect(db, community.id, options)
    assert.equal(repeated.score, 100)
    assert.deepEqual(snapshot(), historical)
    assert.equal(native.requests.length, 1); assert.equal(searches, 0)
    assert.equal(db.prepare('SELECT review_state FROM prospects LIMIT 1').get().review_state, 'selected')
    assertIntegrity(db)
  } finally {
    db?.close(); rmSync(directory, { recursive: true, force: true })
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previousKey
  }
})

test('shared persisted retry: legacy shell repair is explicit, preserves audit/review/billing and reuses completed native results', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'community-shell-retry-'))
  const path = join(directory, 'prospects.sqlite')
  const oldKey = process.env.OPENROUTER_API_KEY, oldFetch = globalThis.fetch
  process.env.OPENROUTER_API_KEY = 'offline-persistence-dummy-key'
  globalThis.fetch = async () => { throw new Error('Unmocked outbound request forbidden') }
  let db
  try {
    db = openDatabase(path)
    seedFixtureRun(db, communityPresets[0], 'legacy-shell')
    const url = 'https://www.facebook.com/groups/stored-shell'
    await runDiscovery(db, 'legacy-shell', {
      search: async query => query.startsWith('"') ? [] : [{ url, title: 'Wedding peer community', description: 'Public forum for wedding planners and engaged couples sharing event planning and consulting advice.' }],
      fetchPage: async () => '<title>Facebook</title>',
      triage: async ({ candidates, catalog }) => candidates.map(c => ({ id: c.id, status: 'likely_fit', reason: 'Wedding community', evidence: [{ id: catalog.find(e => e.field === c.id).id }] })),
      classifyCandidate: async () => { throw new Error('Injected historical parse failure') },
    })
    const community = db.prepare('SELECT * FROM communities LIMIT 1').get()
    const shell = extractPage('<title>Facebook</title>', url)
    const legacy = { page: shell, catalog: [], sourceMode: 'page', linkedComplete: true }
    db.prepare("UPDATE communities SET evidence_json=?,page_state='inspected',verification_status='verified',scoring_state='pending' WHERE id=?").run(JSON.stringify(legacy), community.id)
    db.prepare("UPDATE prospects SET review_state='selected' WHERE id=?").run(community.prospect_id)
    const settled = reserveUsageRequest(db, 'openrouter', 'legacy-shell', 50)
    settleUsageRequest(db, settled, 30)
    const unresolved = reserveUsageRequest(db, 'openrouter', 'legacy-shell', 100, new Date('2025-01-01'))
    const snapshot = () => Object.fromEntries(['prospects','prospect_aliases','community_sources','discovery_candidates','observations','queries','usage_ledger'].map(t => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]))
    const before = snapshot()
    db.close(); db = openDatabase(path)
    assert.deepEqual(snapshot(), before, 'ordinary reopen performs no repair or replay')
    assert.equal(JSON.parse(db.prepare('SELECT evidence_json FROM communities WHERE id=?').get(community.id).evidence_json).sourceMode, 'page')
    let searches = 0, pages = 0
    const native = nativeOpenRouterFixture(db)
    const retryOptions = { fetcher: native.fetcher,
      search: async () => { searches++; throw new Error('Repair must not search') },
      fetchPage: async () => { pages++; throw new Error('Repair must reuse saved snippets') },
    }
    const blocked = await enrichProspect(db, community.id, retryOptions)
    assert.equal(blocked.status, 'failed'); assert.match(blocked.error, /unresolved/)
    assert.equal(native.requests.length, 0)
    assert.deepEqual(db.prepare('SELECT * FROM usage_ledger ORDER BY rowid').all(), before.usage_ledger)
    assert.equal(db.prepare('SELECT status FROM usage_ledger WHERE id=?').get(unresolved).status, 'reserved')
    // Only this synthetic reservation is explicitly reconciled by the test.
    settleUsageRequest(db, unresolved, 100)
    const paidBefore = db.prepare('SELECT * FROM usage_ledger WHERE id IN (?,?) ORDER BY id').all(settled, unresolved)
    const result = await enrichProspect(db, community.id, retryOptions)
    assert.equal(result.status, 'complete'); assert.equal(result.score, 90); assert.equal(result.evidenceMode, 'snippet')
    assert.equal(searches, 0); assert.equal(pages, 0)
    assert.equal(native.requests.length, 2, 'only missing classification and qualification')
    const current = db.prepare('SELECT * FROM communities WHERE id=?').get(community.id)
    const repaired = JSON.parse(current.evidence_json)
    assert.deepEqual(repaired.unusableInspection.page, shell)
    assert.equal(repaired.page, undefined); assert.equal(current.verification_status, 'unverified')
    assert.equal(current.permission_status, 'unknown'); assert.equal(current.leader_state, 'deferred')
    const projected = readProspectDirectory(db).find(row => row.communityId === community.id)
    assert.equal(projected.evidenceMode, 'snippet'); assert.equal(projected.verificationStatus, 'unverified')
    assert.equal(projected.confidence, 'low'); assert.equal(projected.contactability, 'unknown')
    assert.equal(projected.permissionStatus, 'unknown'); assert.equal(projected.country, null)
    assert.equal(current.prospect_id, community.prospect_id)
    assert.equal(db.prepare('SELECT review_state FROM prospects WHERE id=?').get(community.prospect_id).review_state, 'selected')
    for (const table of ['community_sources','observations','queries']) assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), before[table])
    assert.deepEqual(db.prepare('SELECT * FROM prospect_aliases ORDER BY rowid').all(), before.prospect_aliases)
    assert.deepEqual(db.prepare('SELECT * FROM usage_ledger WHERE id IN (?,?) ORDER BY id').all(settled, unresolved), paidBefore)
    const counts = Object.fromEntries(['assessments','suggestions','observations','usage_ledger'].map(t => [t, db.prepare(`SELECT count(*) n FROM ${t}`).get().n]))
    const ledger = db.prepare('SELECT * FROM usage_ledger ORDER BY rowid').all()
    const savedEvidence = current.evidence_json
    db.close(); db = openDatabase(path)
    await enrichProspect(db, community.id, retryOptions)
    assert.equal(native.requests.length, 2); assert.equal(searches, 0); assert.equal(pages, 0)
    for (const [table, count] of Object.entries(counts)) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, count)
    assert.deepEqual(db.prepare('SELECT * FROM usage_ledger ORDER BY rowid').all(), ledger)
    assert.equal(db.prepare('SELECT evidence_json FROM communities WHERE id=?').get(community.id).evidence_json, savedEvidence)
    assertIntegrity(db)
  } finally {
    db?.close(); rmSync(directory, { recursive: true, force: true }); globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey
  }
})

test('shared persistence: transactional parent reconciliation and run-local deletion retain other evidence and billing', () => {
  const db = openDatabase(':memory:')
  const child = 'https://events.example/forums/weddings/topic/1'
  const parent = 'https://events.example/forums/weddings'
  const separate = 'https://events.example/forums/company'
  const identity = url => ({ type: 'community', identity: url, url, originalUrl: url })
  const resolve = (url, extra = {}) => resolveProspect(db, { identity: identity(url), platform: 'custom_website', communityType: 'forum', ...extra })
  try {
    for (const run of ['target', 'other']) {
      seedRun(db, run)
      db.prepare("INSERT INTO rubrics VALUES(?,'[]','{}','now')").run(run)
      db.prepare("INSERT INTO queries(id,run_id,lane,query_text,provider,status,created_at) VALUES(?,?,'public_forum','event forum','brave','complete','now')").run(`q-${run}`, run)
    }
    const a = resolve(child).id
    const b = resolve(parent).id
    const c = resolve(separate, { reciprocalUrls: [parent] }).id
    assert.notEqual(c, b, 'shared domain and reciprocal operator links do not merge communities')
    db.prepare("UPDATE prospects SET review_state='selected' WHERE id=?").run(a)
    for (const [community, run, prospect, url, score, coverage] of [
      ['child', 'target', a, child, 90, 70], ['parent', 'target', b, parent, 75, 100], ['other', 'other', b, parent, 80, 100],
    ]) {
      db.prepare(`INSERT INTO communities(id,run_id,query_id,canonical_identity,community_url,community_type,platform,source_url,original_url,observed_at,prospect_id)
        VALUES(?,?,?,?,?,'forum','custom_website',?,?,'now',?)`).run(community, run, `q-${run}`, url, url, url, url, prospect)
      db.prepare("INSERT INTO assessments(id,run_id,prospect_id,score,coverage,dimensions_json,signals_json,rationale,evidence_refs_json,confidence,contactability,source_mode) VALUES(?,?,?,?,?,'[]','{}','saved','[]','low','unknown','page')").run(community, run, prospect, score, coverage)
      db.prepare("INSERT INTO suggestions(id,assessment_id,message_angle,created_at) VALUES(?,?,'saved','now')").run(community, community)
      db.prepare("INSERT INTO drafts(id,assessment_id,body,channel_guide,created_at,updated_at) VALUES(?,?,'manual','manual','now','now')").run(community, community)
      db.prepare("INSERT INTO observations(id,prospect_id,run_id,source_url,original_url,source_kind,observed_at) VALUES(?,?,?,'https://events.example/evidence','https://events.example/evidence','page','now')").run(community, prospect, run)
      db.prepare("INSERT INTO community_sources(id,community_id,query_id,source_url,original_url,observed_at) VALUES(?,?,?,?,?,'now')").run(community, community, `q-${run}`, url, url)
      db.prepare("INSERT INTO discovery_candidates(id,run_id,query_id,prospect_id,community_id,original_url,observed_at) VALUES(?,?,?,?,?,?,'now')").run(community, run, `q-${run}`, prospect, community, url)
      // Identical displayed names are separate evidence-backed observations.
      db.prepare("INSERT INTO community_leaders(id,community_id,name,role,role_evidence_json,status,observed_at) VALUES(?,?,'Alex Example','founder','[]','verified','now')").run(`leader-${community}`, community)
    }
    const reservation = reserveUsageRequest(db, 'brave', 'target', 5000)
    const beforeBudget = db.prepare('SELECT * FROM usage_ledger').all()
    const mergeInput = {
      identity: { ...identity(parent), originalUrl: child },
      parentEvidence: { childUrl: child, parentUrl: parent, sourceUrl: child, excerpt: 'Wedding forum breadcrumb', kind: 'breadcrumb' },
    }
    assert.throws(() => resolve(parent, { ...mergeInput, parentEvidence: { ...mergeInput.parentEvidence, sourceUrl: separate } }), /parent-identity evidence/)
    // Force a database failure to check savepoint rollback before success.
    db.exec("CREATE TRIGGER reject_merge BEFORE DELETE ON prospects BEGIN SELECT RAISE(ABORT,'merge blocked'); END")
    assert.throws(() => resolve(parent, mergeInput), /merge blocked/)
    assert.equal(db.prepare('SELECT count(*) n FROM assessments').get().n, 3)
    assert.equal(db.prepare('SELECT count(*) n FROM community_leaders').get().n, 3)
    db.exec('DROP TRIGGER reject_merge')
    const merged = resolve(parent, mergeInput).id
    assert.equal(resolve(child).id, merged)
    assert.equal(resolve(parent).id, merged)
    assert.equal(db.prepare('SELECT review_state FROM prospects WHERE id=?').get(merged).review_state, 'selected')
    assert.equal(db.prepare("SELECT coverage FROM assessments WHERE run_id='target'").get().coverage, 100)
    assert.equal(db.prepare("SELECT count(*) n FROM observations WHERE source_kind LIKE 'merged_assessment:%'").get().n, 1)
    assert.equal(db.prepare('SELECT count(*) n FROM observations').get().n, 4)
    assert.equal(db.prepare('SELECT count(*) n FROM drafts').get().n, 3)
    assert.equal(db.prepare('SELECT count(*) n FROM community_leaders').get().n, 3)
    assert.notEqual(resolve(separate).id, merged)
    assertIntegrity(db)
    for (const status of ['queued', 'planning', 'running']) {
      db.prepare("UPDATE runs SET status=? WHERE id='target'").run(status)
      assert.throws(() => deleteRunProspects(db, 'target'), /Wait for research/)
    }
    db.prepare("UPDATE runs SET status='complete' WHERE id='target'").run()
    db.exec("CREATE TRIGGER reject_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT,'delete blocked'); END")
    assert.throws(() => deleteRunProspects(db, 'target'), /delete blocked/)
    assert.equal(db.prepare('SELECT count(*) n FROM discovery_candidates').get().n, 3)
    db.exec('DROP TRIGGER reject_delete')
    deleteRunProspects(db, 'target')
    for (const table of ['communities', 'assessments', 'observations', 'discovery_candidates']) {
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE run_id='target'`).get().n, 0)
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE run_id='other'`).get().n, 1)
    }
    assert.equal(db.prepare('SELECT count(*) n FROM community_leaders').get().n, 1)
    assert.equal(db.prepare('SELECT count(*) n FROM community_sources').get().n, 1)
    assert.equal(db.prepare('SELECT count(*) n FROM prospects WHERE id=?').get(merged).n, 1)
    assert.equal(db.prepare('SELECT count(*) n FROM queries').get().n, 2)
    assert.equal(db.prepare('SELECT count(*) n FROM rubrics').get().n, 2)
    assert.deepEqual(db.prepare('SELECT * FROM usage_ledger').all(), beforeBudget)
    assert.throws(() => reserveUsageRequest(db, 'brave', 'other', 5000), /unresolved/)
    assert.equal(db.prepare('SELECT status FROM usage_ledger WHERE id=?').get(reservation).status, 'reserved')
    assert.deepEqual(deleteRunProspects(db, 'target'), { deleted: 0, removedIdentities: 0 })
    assertIntegrity(db)
  } finally { db.close() }
})
