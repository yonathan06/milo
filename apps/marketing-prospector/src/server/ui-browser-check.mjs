import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { test } from 'node:test'
import { openDatabase } from './db.ts'
import { runDiscovery } from './discovery.ts'
import { seedFixtureRun, offlineProviders, nativeOpenRouterFixture } from './community-fixtures.mjs'
import { extractPage } from './public-pages.ts'
import { communityPresets } from '../community-presets.ts'

const appDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
test('shared UI integration: editable presets, frozen settings, funnel, stage outages, qualification/leaders, review/filter cache and cleanup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'community-ui-')), dataDir = join(directory, 'data')
  const db = openDatabase(join(dataDir, 'prospects.sqlite'))
  seedFixtureRun(db, communityPresets[0], 'ui-run')
  await runDiscovery(db, 'ui-run', offlineProviders('wedding'))
  db.prepare("UPDATE runs SET status='running' WHERE id='ui-run'").run()
  const queriesBeforeRetry = db.prepare("SELECT count(*) n FROM queries WHERE run_id='ui-run'").get().n
  const named = db.prepare("SELECT id FROM communities WHERE community_url='https://wedding.example/forum'").get()
  const reddit = db.prepare("SELECT id FROM communities WHERE platform='reddit'").get()
  db.prepare("UPDATE communities SET scoring_state='failed',stage_errors_json='{\"scoring\":\"Injected UI inference outage\"}' WHERE id=?").run(reddit.id)
  seedFixtureRun(db, communityPresets[0], 'ui-shell')
  const oldKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'offline-ui-dummy-key'
  try {
    const native = nativeOpenRouterFixture(db, 'truncated')
    await runDiscovery(db, 'ui-shell', {
      fetcher: native.fetcher,
      search: async query => query.startsWith('"') ? [] : [{ url: 'https://www.facebook.com/groups/ui-shell', title: 'Wedding peer community', description: 'Public forum for wedding planners and engaged couples sharing event planning and consulting advice.' }],
      fetchPage: async () => '<title>Facebook</title>',
    })
    seedFixtureRun(db, communityPresets[0], 'ui-scope')
    const scopedNative = nativeOpenRouterFixture(db, 'valid', (name, output, catalog) => {
      if (name === 'community_qualification' && catalog[0].sourceUrl.includes('ui-scope-partial')) {
        output.dimensions[0] = { ...output.dimensions[0], basis: 'unknown', score: null, evidence: [] }
        output.dimensions[1].score = 100
      }
      if (name === 'community_qualification' && catalog[0].sourceUrl.includes('ui-scope-failure')) output.signals.demand = { state: 'supported', basis: 'community_fact', rationale: 'PRIVATE_RAW_FIXTURE_OUTPUT', evidence: [{ id: catalog.find(e => e.role === 'community_context').id }] }
      return output
    })
    await runDiscovery(db, 'ui-scope', {
      fetcher: scopedNative.fetcher,
      search: async query => query.startsWith('"') ? [] : [
        { url: 'https://facebook.com/groups/ui-scope-needs', title: 'Wedding planning title', description: 'Discover popular groups on Facebook. Facebook has 3 billion users.' },
        { url: 'https://facebook.com/groups/ui-scope-partial', title: 'Planning forum', description: 'Planning forum where members share event planning advice.' },
        { url: 'https://facebook.com/groups/ui-scope-failure', title: 'Couples forum', description: 'Community for couples helping couples plan weddings.' },
      ],
      fetchPage: async () => '<title>Facebook</title>',
    })
    assert.equal(scopedNative.requests.filter(r => r.response_format.json_schema.name === 'community_qualification').length, 2)
  } finally { if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey }
  const shell = db.prepare("SELECT * FROM communities WHERE run_id='ui-shell'").get()
  db.prepare("UPDATE communities SET evidence_json=?,page_state='inspected',verification_status='verified' WHERE id=?")
    .run(JSON.stringify({ page: extractPage('<title>Facebook</title>'), catalog: [], sourceMode: 'page', linkedComplete: true }), shell.id)
  const shellQueries = db.prepare("SELECT count(*) n FROM queries WHERE run_id='ui-shell'").get().n
  const shellLedger = db.prepare("SELECT * FROM usage_ledger WHERE run_id='ui-shell' ORDER BY rowid").all()
  db.close()
  const shots = join(appDir, 'docs/screenshots'); mkdirSync(shots, { recursive: true })
  const port = 5197
  const server = spawn(process.execPath, [join(appDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: appDir, env: { ...process.env, PROSPECTOR_DATA_DIR: dataDir, BRAVE_API_KEY: '', OPENROUTER_API_KEY: '' }, stdio: ['ignore','pipe','pipe'],
  })
  let logs = ''; server.stdout.on('data', d => { logs += d }); server.stderr.on('data', d => { logs += d })
  let browser
  try {
    let ready = false
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(`Vite exited: ${logs}`)
      try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    assert.ok(ready, logs)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    let reads = 0; page.on('request', request => { if (['fetch','xhr'].includes(request.resourceType())) reads++ })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    assert.equal(await page.getByRole('heading', { name: 'New community research', exact: true }).count(), 1)
    await page.getByLabel('Event segment', { exact: true }).selectOption('professional_planner')
    assert.equal(await page.getByLabel('Audience kind', { exact: true }).inputValue(), 'professional')
    assert.match(await page.getByLabel('Audience brief', { exact: true }).inputValue(), /do not exclude planners/)
    await page.getByLabel('Audience brief', { exact: true }).fill('Edited professional planner peer community brief')
    assert.equal(await page.getByLabel('Audience brief', { exact: true }).inputValue(), 'Edited professional planner peer community brief')
    assert.equal(await page.getByRole('checkbox', { name: 'Discord (opt-in)', exact: true }).isChecked(), false)
    assert.equal(await page.getByRole('checkbox', { name: 'WhatsApp (opt-in)', exact: true }).isChecked(), false)
    assert.equal(await page.getByRole('checkbox', { name: 'Discover explicitly named public leaders (optional)', exact: true }).isChecked(), true)
    await page.screenshot({ path: join(shots, 'community-controls.png'), fullPage: true })
    await page.getByRole('checkbox', { name: 'Public forums / associations', exact: true }).uncheck()
    await page.getByRole('checkbox', { name: 'Facebook groups', exact: true }).uncheck()
    await page.getByRole('checkbox', { name: 'Reddit communities', exact: true }).uncheck()
    assert.equal(await page.getByRole('button', { name: 'Start research →', exact: true }).isDisabled(), true)
    await page.goto(`http://127.0.0.1:${port}/runs/ui-run`, { waitUntil: 'networkidle' })
    assert.match(await page.getByLabel('Frozen community settings').innerText(), /Segment: wedding.*Audience: consumer/)
    await page.getByText('Research strategy', { exact: true }).click()
    assert.match(await page.locator('body').innerText(), /audience_alignment \(70%\)/)
    assert.match(await page.locator('body').innerText(), /Saved fallbacks:/)
    const row = page.getByRole('table', { name: 'Prospects' }).getByRole('row').filter({ hasText: 'wedding.example/forum' })
    const beforeLocal = reads
    await row.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Casey Example — founder/)
    assert.match(await page.locator('body').innerText(), /Independently evidenced business route/)
    assert.match(await page.locator('body').innerText(), /Unknown demand is not buying intent/)
    assert.match(await page.locator('body').innerText(), /contact availability is not promotion permission/)
    assert.equal(reads, beforeLocal, 'expanding details reads cached data, not a new fetch')
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByRole('button', { name: 'Prepare manual outreach draft', exact: true }).waitFor()
    assert.ok(reads > beforeLocal, 'review mutation refreshes prospect projections')
    await page.getByRole('button', { name: 'Hide details', exact: true }).click()
    await page.getByRole('combobox').filter({ has: page.locator('option[value="facebook_group"]') }).selectOption('facebook_group')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await page.waitForURL(/type=facebook_group/)
    assert.match(await page.getByRole('table', { name: 'Prospects' }).innerText(), /Unverified — search only/)
    const readsBeforeSearch = reads
    await page.getByRole('searchbox', { name: 'Search prospects' }).fill('no-matching-result')
    await page.getByRole('heading', { name: 'No results', exact: true }).waitFor()
    assert.equal(reads, readsBeforeSearch, 'local table search does not fetch')
    await page.getByRole('searchbox', { name: 'Search prospects' }).fill('')
    await page.getByRole('link', { name: 'Clear filters', exact: true }).click()
    const scoringRow = page.getByRole('table', { name: 'Prospects' }).getByRole('row').filter({ hasText: 'reddit.com/r/wedding' })
    assert.match(await scoringRow.innerText(), /verified/)
    await scoringRow.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Page: inspected.*Scoring: failed/)
    assert.match(await page.locator('body').innerText(), /scoring: Injected UI inference outage/)
    assert.match(await page.locator('body').innerText(), /Research interrupted; retry saved candidates/)
    await scoringRow.getByRole('button', { name: 'Enrich / retry', exact: true }).click()
    await page.waitForFunction(() => document.body.innerText.includes('OPENROUTER_API_KEY'))
    const retryCheck = openDatabase(join(dataDir, 'prospects.sqlite'))
    assert.equal(retryCheck.prepare("SELECT count(*) n FROM queries WHERE run_id='ui-run'").get().n, queriesBeforeRetry, 'explicit retry never rediscovers')
    assert.equal(retryCheck.prepare("SELECT page_state FROM communities WHERE platform='reddit'").get().page_state, 'inspected')
    assert.equal(retryCheck.prepare("SELECT count(*) n FROM usage_ledger WHERE provider='openrouter' AND status='reserved'").get().n, 0)
    retryCheck.close()
    await page.getByRole('button', { name: 'Hide details', exact: true }).click()
    await page.getByText(/Diagnostics & service usage/).click()
    assert.match(await page.getByLabel('Candidate funnel').innerText(), /returned:/)
    assert.match(await page.locator('body').innerText(), /Discovery versus recovery usage/)
    await page.getByText('Retained candidates and rejection audit', { exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Explicit wrong audience or non-community type/)
    assert.match(await page.locator('body').innerText(), /triageBatch/)
    await page.screenshot({ path: join(shots, 'community-run.png'), fullPage: true })
    await page.goto(`http://127.0.0.1:${port}/runs/ui-shell`, { waitUntil: 'networkidle' })
    const shellRow = page.getByRole('table', { name: 'Prospects' }).getByRole('row').filter({ hasText: 'ui-shell' }).first()
    await shellRow.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Needs evidence — no supported numeric fit/)
    assert.match(await page.locator('body').innerText(), /Truncated model output.*completion_limit=1000/)
    assert.match(await page.locator('body').innerText(), /Partial describes the original research attempt/)
    await shellRow.getByRole('button', { name: 'Enrich / retry', exact: true }).click()
    await page.waitForFunction(() => document.body.innerText.includes('OPENROUTER_API_KEY'))
    await page.waitForFunction(() => document.body.innerText.includes('Provisional evidence — page unverified'))
    assert.match(await page.locator('body').innerText(), /Page: failed.*Classification: failed.*Scoring: pending.*Leaders: deferred/)
    assert.match(await shellRow.innerText(), /Unverified — search only/)
    assert.match(await page.locator('body').innerText(), /audit-only, not verified evidence/)
    assert.equal(await page.getByRole('button', { name: 'Prepare manual outreach draft', exact: true }).count(), 0)
    const shellCheck = openDatabase(join(dataDir, 'prospects.sqlite'))
    assert.equal(shellCheck.prepare("SELECT count(*) n FROM queries WHERE run_id='ui-shell'").get().n, shellQueries)
    assert.deepEqual(shellCheck.prepare("SELECT * FROM usage_ledger WHERE run_id='ui-shell' ORDER BY rowid").all(), shellLedger)
    assert.equal(shellCheck.prepare("SELECT status FROM runs WHERE id='ui-shell'").get().status, 'partial')
    shellCheck.close()
    await page.goto(`http://127.0.0.1:${port}/runs/ui-scope`, { waitUntil: 'networkidle' })
    const needsRow = page.getByRole('table', { name: 'Prospects' }).getByRole('row').filter({ hasText: 'ui-scope-needs' })
    await needsRow.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Needs community evidence — canonical community context is missing/)
    await page.getByRole('button', { name: 'Hide details', exact: true }).click()
    const partialRow = page.getByRole('table', { name: 'Prospects' }).getByRole('row').filter({ hasText: 'ui-scope-partial' })
    await partialRow.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Supported fit score 100\/100.*Supported fit weight: 30%/)
    assert.match(await page.locator('body').innerText(), /Partial supported fit, not full member-audience alignment/)
    assert.match(await page.locator('body').innerText(), /audience_alignment: unknown — not covered/)
    assert.match(await page.locator('body').innerText(), /provisional public source.*community_context \/ description/)
    assert.equal(await page.getByText('inspected source', { exact: true }).count(), 0)
    const beforeScopeMutation = reads
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.waitForFunction(() => document.body.innerText.includes('Review: selected'))
    assert.ok(reads > beforeScopeMutation)
    assert.equal(await page.getByRole('button', { name: 'Prepare manual outreach draft', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Hide details', exact: true }).click()
    const failureRow = page.getByRole('table', { name: 'Prospects' }).getByRole('row').filter({ hasText: 'ui-scope-failure' })
    await failureRow.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /citation_category=unsupported_claim_scope/)
    assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_RAW_FIXTURE_OUTPUT/)
    await page.goto(`http://127.0.0.1:${port}/prospects`, { waitUntil: 'networkidle' })
    assert.match(await page.locator('body').innerText(), /Not assessed/)
    const directoryRow = page.getByRole('table', { name: 'All prospects' }).getByRole('row').filter({ hasText: 'wedding.example/forum' })
    assert.match(await directoryRow.innerText(), /selected/)
    await directoryRow.getByRole('button', { name: 'Review details', exact: true }).click()
    assert.match(await page.locator('body').innerText(), /Casey Example — founder/)
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    await page.goto(`http://127.0.0.1:${port}/runs/ui-run`, { waitUntil: 'networkidle' })
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Delete all prospects', exact: true }).click()
    await page.getByText('Removed 5 prospect(s) from this run.', { exact: true }).waitFor()
    const check = openDatabase(join(dataDir, 'prospects.sqlite'))
    assert.equal(check.prepare("SELECT count(*) n FROM discovery_candidates WHERE run_id='ui-run'").get().n, 0)
    assert.equal(check.prepare('SELECT count(*) n FROM community_leaders').get().n, 0)
    assert.equal(check.prepare('SELECT count(*) n FROM runs').get().n, 3)
    assert.ok(check.prepare('SELECT count(*) n FROM usage_ledger').get().n > 0)
    check.close()
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    if (server.exitCode === null && server.signalCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exit }
    rmSync(directory, { recursive: true, force: true })
  }
})
