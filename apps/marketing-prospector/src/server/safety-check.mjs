import assert from 'node:assert/strict'
import { createActiveCatalog, sufficientCommunityContext, supportsClaim } from './community-evidence.ts'
import { scopedFixtures, scopedTarget } from './scoped-fixtures.mjs'
import { test } from 'node:test'
import { openDatabase } from './db.ts'
import { normalizeCommunityUrl } from './identity.ts'
import { fetchPublicHtml, fetchPageWithFallback, hasUsablePublicEvidence, extractPage, assertNotRestricted, explicitParent } from './public-pages.ts'
import { enrichPage, operatorLinks } from './enrichment.ts'
import { createEvidenceCatalog, selectedEvidence, validateQualification } from './assessment.ts'
import { operatorCatalog, validateLeaders, promotionPermission } from './leaders.ts'
import { callOpenRouter, parseCompletion, ModelOutputError, configuredOpenRouterModel } from './openrouter.ts'
import { reserveUsageRequest, settleUsageRequest, getMonthlyUsage } from './usage.ts'
import { runDiscovery } from './discovery.ts'
import { createDraftForSelectedProspect } from './outreach.ts'
import { communityPresets } from '../community-presets.ts'
import { seedFixtureRun, offlineProviders, qualificationResponse } from './community-fixtures.mjs'

test('shared scoped active evidence preserves provenance, sparse descriptions and exact quotes without promoting titles or unrelated passages', () => {
  for (const fixture of scopedFixtures) {
    const source = { url: fixture.url ?? scopedTarget, ...fixture }
    const catalog = createActiveCatalog([source], scopedTarget)
    assert.equal(sufficientCommunityContext(catalog), fixture.sufficient, fixture.name)
    for (const excerpt of catalog) {
      assert.equal(excerpt.sourceUrl, source.url)
      assert.equal(excerpt.inspected, false)
      assert.ok(excerpt.provenanceField)
      if (!fixture.sufficient) assert.equal(supportsClaim(excerpt, 'audience_alignment', 'community_context'), false, fixture.name)
    }
    if (fixture.name === 'sparse') assert.equal(catalog[0].quote, fixture.description)
    if (fixture.name === 'title-boilerplate') assert.equal(catalog.length, 1)
  }
  const quote = `${scopedTarget} is a community for couples helping couples plan weddings.`
  const references = createActiveCatalog([{ url: 'https://reference.example/guide', targetUrl: scopedTarget, description: `${quote} Another community helps couples plan weddings. A forum for homeowners discussing renovations.` }], scopedTarget)
  assert.equal(references[0].quote, quote)
  assert.equal(references[0].sourceUrl, 'https://reference.example/guide')
  assert.equal(supportsClaim(references[0], 'audience_alignment', 'community_context'), true)
  assert.ok(references.slice(1).every(e => !supportsClaim(e, 'audience_alignment', 'community_context')))
  const headingPage = extractPage('<title>Community page</title><main><h1>Wedding planners forum</h1><p>Members share planning advice.</p></main>')
  const headingCatalog = createActiveCatalog([{ url: scopedTarget, ...headingPage, text: headingPage.contextText }], scopedTarget)
  assert.equal(sufficientCommunityContext(headingCatalog), true)
  assert.ok(headingCatalog.some(e => e.quote === 'Wedding planners forum' && e.role === 'title'))
  assert.ok(headingCatalog.every(e => !supportsClaim(e, 'audience_alignment', 'community_context')))
  for (const path of ['/posts/123','/permalink/123']) {
    const thread = `https://facebook.com/groups/scoped${path}`
    const catalog = createActiveCatalog([{ url: thread, description: 'Community for couples helping couples plan weddings.' }], 'https://www.facebook.com/groups/scoped')
    assert.equal(sufficientCommunityContext(catalog), false)
    assert.equal(catalog[0].role, 'discussion')
  }
})

test('shared public-only safety: unsupported shapes, redirects/access walls, privacy/operator sections, bounded linked pages and exact citations', async () => {
  for (const url of ['http://127.0.0.1/forum','http://[::1]/','http://[::ffff:7f00:1]/','http://10.0.0.1/forum','https://user:password@example.org/forum','https://example.org:8443/forum','https://reddit.com/user/member','https://discord.com/channels/private','https://chat.whatsapp.com/token/extra','https://facebook.com/groups/foo/members','https://example.org.onion/forum']) assert.throws(() => normalizeCommunityUrl(url))
  assert.equal(normalizeCommunityUrl('https://old.reddit.com/r/weddings/comments/abc123/title/').url, 'https://reddit.com/r/weddings')
  assert.equal(normalizeCommunityUrl('https://discord.gg/publicToken').url, 'https://discord.gg/publicToken')
  assert.equal(normalizeCommunityUrl('https://chat.whatsapp.com/PublicToken').url, 'https://chat.whatsapp.com/PublicToken')
  let fetches = 0
  await assert.rejects(fetchPublicHtml('https://8.8.8.8/', async () => { fetches++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }) }), /public HTTP/)
  assert.equal(fetches, 1)
  await assert.rejects(fetchPublicHtml('https://8.8.8.8/', async () => new Response('<main>Log in to view</main>', { headers: { 'content-type': 'text/html' } })), /requires login/)
  assert.doesNotThrow(() => assertNotRestricted('<main>Public preview <button>Join group</button></main>'))
  for (const html of ['<main>Members only</main>','<input type="password">','<main>Verify you are human</main>']) assert.throws(() => assertNotRestricted(html), /requires login/)
  const html = `<title>Event forum</title><body><main>Public forum for event planners.</main><section data-public-operator><h2>Our team</h2><p>Casey Example is the founder. Casey Example handles business partnerships at partners@community.example.</p></section><div class="member-list">Member Person founder of another company private@member.example +1 202 555 0101</div><div class="comment">Popular Member moderator of something else</div><a href="/contact">Contact</a><a href="/rules">Rules</a><a href="/about">About</a><a href="/third">Business third link</a></body>`
  for (const shell of ['<title>Facebook</title>', '<title>Reddit - Dive into anything</title>', '<html><body></body></html>']) {
    assert.equal(hasUsablePublicEvidence(extractPage(shell)), false)
  }
  const sparse = '<title>Facebook</title><meta name="description" content="Wedding planners peer community">'
  assert.equal(hasUsablePublicEvidence(extractPage(sparse)), true)
  assert.equal(hasUsablePublicEvidence(extractPage('<title>Wedding planners forum</title>')), true)
  let renders = 0
  const render = async () => { renders++; return sparse }
  const response = body => async () => new Response(body, { headers: { 'content-type': 'text/html' } })
  await fetchPageWithFallback('https://example.org/forum', response('<title>Facebook</title>'), render)
  assert.equal(renders, 1, 'ordinary public rendering is allowed for a shell')
  await fetchPageWithFallback('https://example.org/forum', response(sparse), render)
  assert.equal(renders, 1, 'sparse specific metadata needs no browser fallback')
  for (const wall of ['Log in to view', 'Blocked by network security', 'Members only', 'Verify you are human']) {
    await assert.rejects(fetchPageWithFallback('https://example.org/forum', response(`<body>${wall}</body>`), render), /access-control/)
  }
  assert.equal(renders, 1, 'explicit restrictions never escalate to browser interaction')
  await assert.rejects(fetchPageWithFallback('https://example.org/forum', response(''), async () => ''), /No usable public evidence/)
  const page = extractPage(html, 'https://events.example/forum')
  assert.doesNotMatch(page.text, /Member Person|Popular Member|private@|202 555/)
  assert.equal(page.operatorSections.length, 1)
  assert.match(page.operatorSections[0].text, /Casey Example/)
  assert.equal(explicitParent('<a href="/">Website</a>', 'https://events.example/forum/topic'), undefined)
  assert.equal(explicitParent('<nav aria-label="breadcrumb"><a href="/forum">Public forum</a></nav>', 'https://events.example/forum/topic').parentUrl, 'https://events.example/forum')
  const links = operatorLinks(html, 'https://events.example/forum')
  assert.deepEqual(links, ['https://events.example/rules','https://events.example/about'])
  const calls = []
  const enriched = await enrichPage({ url: 'https://events.example/forum', links, page, fetchPage: async url => { calls.push(url); return '<title>Rules</title><main>No commercial promotions allowed.</main>' }, extractPage, assertPublic: assertNotRestricted })
  assert.equal(calls.length, 2)
  const operators = operatorCatalog(enriched.operatorSections)
  const leader = { name: 'Casey Example', role: 'founder', profileUrl: null, roleEvidence: [{ id: operators[0].id }], businessRoute: 'mailto:partners@community.example', contactEvidence: [{ id: operators[0].id }] }
  assert.equal(validateLeaders({ leaders: [leader] }, operators)[0].businessRoute, leader.businessRoute)
  assert.throws(() => validateLeaders({ leaders: [{ ...leader, name: 'Popular Member' }] }, operators), /Role citation/)
  assert.throws(() => validateLeaders({ leaders: [{ ...leader, businessRoute: 'mailto:unsupported@example.org' }] }, operators), /independent named/)
  assert.throws(() => validateLeaders({ leaders: [leader,leader,leader,leader] }, operators), /three/)
  const catalog = createEvidenceCatalog({ text: 'Public forum for event planners discussing consulting questions.' }, 'https://events.example/forum')
  const scopedCatalog = createActiveCatalog([{ url: 'https://events.example/forum', description: 'Public forum for event planners discussing consulting questions.' }], 'https://events.example/forum')
  const partial = validateQualification(qualificationResponse(scopedCatalog, 'partial'), scopedCatalog, 'page')
  assert.equal(partial.score, 90); assert.equal(partial.coverage, 30); assert.equal(partial.confidence, 'low')
  const unknown = validateQualification(qualificationResponse(scopedCatalog, 'unknown'), scopedCatalog, 'page')
  assert.equal(unknown.score, null); assert.equal(unknown.coverage, 0)
  assert.equal(validateQualification(qualificationResponse(scopedCatalog, 'mismatch'), scopedCatalog, 'page').score, 0)
  assert.equal(validateQualification(qualificationResponse(scopedCatalog), scopedCatalog, 'snippet').confidence, 'low')
  const invalid = qualificationResponse(scopedCatalog); invalid.dimensions[0].evidence = [{ id: 'invented' }]
  assert.throws(() => validateQualification(invalid, scopedCatalog, 'page'), /unknown excerpt/)
  assert.equal(promotionPermission(createEvidenceCatalog({ rules: 'Commercial promotions permitted. No commercial promotions allowed.' }, 'https://events.example/rules')).status, 'prohibited')
  assert.equal(promotionPermission(createEvidenceCatalog({ text: 'Casey Example is our founder; business contact partners@example.org.' }, 'https://events.example/about')).status, 'unknown')
  const shellDb = openDatabase(':memory:')
  try {
    seedFixtureRun(shellDb, communityPresets[0], 'shell-safety')
    await runDiscovery(shellDb, 'shell-safety', {
      search: async () => [{ url: 'https://facebook.com/groups/shell-safety', title: 'Wedding peer community', description: 'Public forum for wedding planners discussing ceremonies and sharing detailed event planning advice with engaged couples.' }],
      fetchPage: async () => '<title>Facebook</title>',
      triage: async ({ candidates, catalog }) => candidates.map(c => ({ id: c.id, status: 'likely_fit', reason: 'Public wedding community', evidence: [{ id: catalog.find(e => e.field === c.id).id }] })),
      classifyCandidate: async ({ catalog }) => ({ eligible: false, communityType: 'reference_only', reason: 'Fixture stops before scoring', evidence: [{ id: catalog[0].id }] }),
    })
    assert.equal(shellDb.prepare('SELECT count(*) n FROM access_wall_cache').get().n, 0, 'a shell is not an observed access wall')
    assert.equal(shellDb.prepare('SELECT verification_status FROM communities LIMIT 1').get().verification_status, 'unverified')
  } finally { shellDb.close() }
})

test('shared provider/budget safety: routing, Retry-After, cooldown, timeout settlement and cross-month unresolved blockers', async () => {
  const oldKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'offline-fixture'
  const db = openDatabase(':memory:')
  try {
    seedFixtureRun(db, communityPresets[0], 'provider')
    let calls = 0
    const catalog = () => new Response(JSON.stringify({ data: [{ id: configuredOpenRouterModel(), pricing: { prompt: '0.000001', completion: '0.000002', request: '0' } }] }))
    const success = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: .000003 } }))
    const fetcher = async (input, init) => {
      if (String(input).endsWith('/models')) return catalog()
      calls++
      const request = JSON.parse(init.body)
      assert.deepEqual(request.provider, { data_collection: 'deny', zdr: true, allow_fallbacks: false, require_parameters: true })
      assert.equal(request.model, 'google/gemma-4-31b-it')
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE status='reserved'").get().n, 1)
      return calls === 1 ? new Response('rate limited', { status: 429, headers: { 'retry-after': '0.01' } }) : success()
    }
    const options = { db, runId: 'provider', messages: [{ role: 'user', content: 'offline fixture' }], maxCompletionTokens: 100, fetcher }
    await callOpenRouter(options)
    assert.equal(calls, 2)
    assert.equal(getMonthlyUsage(db).committedMicros, 3)
    const privateMarker = 'RAW_OUTPUT_MUST_NOT_BE_SAVED'
    const evidenceCatalog = createEvidenceCatalog({ text: 'Public wedding planning community' }, 'https://example.org/forum')
    for (const scenario of ['truncated', 'malformed', 'citation', 'envelope']) {
      let completions = 0
      const ledgerBefore = db.prepare('SELECT count(*) n FROM usage_ledger').get().n
      const outputFetcher = async (input, init) => {
        if (String(input) === 'https://openrouter.ai/api/v1/models') return catalog()
        assert.equal(String(input), 'https://openrouter.ai/api/v1/chat/completions', 'unmatched outbound request')
        completions++
        const request = JSON.parse(init.body)
        assert.equal(request.max_completion_tokens, 100)
        const reservation = db.prepare("SELECT cost_micros FROM usage_ledger WHERE status='reserved'").get()
        assert.ok(reservation.cost_micros >= 100 * 2, 'fully reserves completion limit')
        if (scenario === 'envelope') return new Response(privateMarker)
        return new Response(JSON.stringify({
          ...(scenario === 'malformed' ? {} : { id: 'gen-offline-123' }),
          choices: [{ ...(scenario === 'truncated' ? { finish_reason: 'length' } : {}), message: { content: scenario === 'citation' ? '{"evidence":[{"id":"NOT_SUPPLIED"}]}' : `{${privateMarker}` } }],
          usage: scenario === 'truncated' ? { prompt_tokens: 10, completion_tokens: 100, cost: .00021 } : { cost: .00001 },
        }))
      }
      await assert.rejects(async () => {
        const result = await callOpenRouter({ ...options, fetcher: outputFetcher })
        parseCompletion(result, row => selectedEvidence(row.evidence, evidenceCatalog))
      }, error => {
        assert.ok(error instanceof ModelOutputError)
        assert.equal(error.code, { truncated: 'truncated_output', malformed: 'invalid_json', citation: 'invalid_citation', envelope: 'invalid_json' }[scenario])
        assert.equal(error.metadata.completionLimit, 100)
        assert.equal(error.metadata.finishReason, scenario === 'truncated' ? 'length' : null)
        assert.equal(error.metadata.reportedCompletionTokens, scenario === 'truncated' ? 100 : null)
        if (scenario === 'malformed') {
          assert.equal(error.metadata.requestId, null)
          assert.match(error.message, /truncation=unknown/)
        }
        const saved = JSON.stringify({ message: error.message, ...error })
        assert.ok(!saved.includes(privateMarker))
        assert.ok(!saved.includes(process.env.OPENROUTER_API_KEY))
        db.prepare("UPDATE communities SET stage_errors_json='{}' WHERE run_id='provider'").run()
        return true
      })
      assert.equal(completions, 1, 'invalid successful response is not replayed')
      assert.equal(db.prepare('SELECT count(*) n FROM usage_ledger').get().n, ledgerBefore + 1)
      assert.equal(db.prepare("SELECT count(*) n FROM usage_ledger WHERE status='reserved'").get().n, 0)
      assert.equal(db.prepare("SELECT status FROM usage_ledger ORDER BY rowid DESC LIMIT 1").get().status, 'settled')
      assert.ok(!JSON.stringify(db.prepare('SELECT * FROM usage_ledger').all()).includes(privateMarker))
    }
    const before = calls
    await assert.rejects(callOpenRouter({ ...options, fetcher: async input => { if (String(input).endsWith('/models')) return catalog(); calls++; throw new Error('Injected timeout') } }), /conservatively reconciled/)
    assert.equal(calls, before + 1, 'uncertain request is not retried automatically')
    assert.equal(getMonthlyUsage(db).unresolvedCount, 0)
    await assert.rejects(callOpenRouter({ ...options, fetcher: async input => String(input).endsWith('/models') ? catalog() : new Response('rate limited', { status: 429, headers: { 'retry-after': '120' } }) }), /HTTP 429/)
    const until = db.prepare('SELECT cooldown_until FROM runs WHERE id=?').get('provider').cooldown_until
    assert.ok(Date.parse(until) >= Date.now() + 119_000)
    await assert.rejects(callOpenRouter(options), /cooldown/)
    assert.equal(calls, before + 1, 'cooldown makes no new provider call')
    const reservation = reserveUsageRequest(db, 'openrouter', 'provider', 100, new Date('2025-01-01'))
    assert.throws(() => reserveUsageRequest(db, 'brave', 'provider', 5000), /unresolved/)
    settleUsageRequest(db, reservation, 100)
    const remaining = getMonthlyUsage(db).remainingMicros
    assert.throws(() => reserveUsageRequest(db, 'brave', 'provider', remaining + 1), /budget exhausted/)
  } finally { db.close(); if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey }
})

test('shared outreach safety: selected verified manual-only routes and independent permission blockers', async () => {
  const db = openDatabase(':memory:')
  try {
    seedFixtureRun(db, communityPresets[0], 'outreach')
    await runDiscovery(db, 'outreach', offlineProviders('wedding'))
    const community = db.prepare("SELECT * FROM communities WHERE community_url='https://wedding.example/forum'").get()
    let generated = 0
    const generator = async () => { generated++; return { body: 'A manually edited partnership introduction, never automatically sent.', personalizationQuote: '' } }
    await assert.rejects(async () => createDraftForSelectedProspect(db, community.prospect_id, generator), /Select/)
    db.prepare("UPDATE prospects SET review_state='selected' WHERE id=?").run(community.prospect_id)
    const draft = await createDraftForSelectedProspect(db, community.prospect_id, generator)
    assert.equal(draft.blocker, null); assert.match(draft.channelGuide, /Manual only/); assert.equal(generated, 1)
    db.prepare("UPDATE communities SET permission_status='unknown' WHERE id=?").run(community.id)
    const unknown = await createDraftForSelectedProspect(db, community.prospect_id, generator)
    assert.match(unknown.blocker, /permission is unknown/); assert.equal(generated, 1)
    db.prepare("UPDATE communities SET permission_status='prohibited' WHERE id=?").run(community.id)
    assert.ok((await createDraftForSelectedProspect(db, community.prospect_id, generator)).blocker)
    db.prepare("UPDATE communities SET permission_status='allowed',contact_routes_json='[]' WHERE id=?").run(community.id)
    db.prepare('UPDATE community_leaders SET business_route=NULL,contact_evidence_json=NULL WHERE community_id=?').run(community.id)
    assert.match((await createDraftForSelectedProspect(db, community.prospect_id, generator)).blocker, /No appropriate public contact route/)
    db.prepare("UPDATE communities SET filter_status='excluded' WHERE id=?").run(community.id)
    await assert.rejects(async () => createDraftForSelectedProspect(db, community.prospect_id, generator), /excluded/)
    db.prepare("UPDATE communities SET filter_status='match' WHERE id=?").run(community.id)
    db.prepare('UPDATE assessments SET score=NULL,coverage=0 WHERE prospect_id=?').run(community.prospect_id)
    await assert.rejects(async () => createDraftForSelectedProspect(db, community.prospect_id, generator), /supported fit evidence/)
    db.prepare("UPDATE communities SET verification_status='unverified',page_state='blocked' WHERE id=?").run(community.id)
    await assert.rejects(async () => createDraftForSelectedProspect(db, community.prospect_id, generator), /Verify this search-only/)
  } finally { db.close() }
})
