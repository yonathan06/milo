// Authored synthetic public-page corpus: reserved .example domains, not live or
// harvested member data. Labels and source passages are reviewed in corpus-review.md.
import { communityPresets } from '../community-presets.ts'
import { createQueuedRun, persistResearchPlan, validateGeneratedPlan } from './rubric.ts'
import { normalizeCommunityUrl } from './identity.ts'
export const corpus = communityPresets.flatMap(preset => {
  const segment = preset.segment, topic = { wedding: 'engaged couples planning weddings', family_event: 'families planning birthdays and reunions', company_event: 'office managers and executive assistants planning company events', professional_planner: 'professional event planners and consultants' }[segment]
  const rows = [
    { kind: 'facebook', url: `https://www.facebook.com/groups/${segment.replaceAll('_', '-')}-planning`, relevant: true, blocked: true, named: false, sparse: false, title: `${segment} planning community`, text: `Facebook group: public peer community for ${topic}. Members discuss event planning questions and shared guest experiences. Public audience details only.` },
    { kind: 'reddit', url: `https://reddit.com/r/${segment}/comments/abc123/planning/`, relevant: true, blocked: false, named: false, sparse: false, title: `${segment} planning forum`, text: `Public discussion forum for ${topic}. Members share event-planning advice and celebration experiences. Activity and commercial demand are not published.` },
    { kind: 'forum', url: `https://${segment.replaceAll('_', '-')}.example/forum/topics/first`, relevant: true, blocked: false, named: true, sparse: false, title: `${segment} peer forum`, text: `Public forum and peer community for ${topic}. Members discuss planning advice. 2K members. United States. Commercial promotions permitted through partnership inquiries.` },
    { kind: 'association', url: `https://association.example/${segment}/community`, relevant: true, blocked: false, named: false, sparse: false, title: `${segment} association member network`, text: `Explicit public member network: members connect and share planning experiences with ${topic}. Association community section, not a general association homepage.` },
    { kind: 'wrong_audience', url: `https://home.example/${segment}/forum`, relevant: false, blocked: false, named: false, sparse: false, title: 'House construction forum', text: 'Public forum for homeowners discussing house-building and building contractors. This community does not discuss weddings, family celebrations, company events or professional event consulting.' },
    { kind: 'unknown', url: `https://unclear.example/${segment}/forum`, relevant: false, blocked: false, named: false, sparse: true, title: 'Discussion space', text: 'Public forum for members. Our audience and discussion topics are not described in public. No event-planning information is available.' },
  ]
  return rows.map((row, i) => ({ ...row, id: `${segment}-${i}`, segment, canonical: row.kind === 'forum' ? `https://${segment.replaceAll('_', '-')}.example/forum` : normalizeCommunityUrl(row.url).url, snippet: row.sparse ? '' : row.text, provenance: `synthetic:${segment}:${i}; authored public metadata fixture, no real persons`, expectedFit: row.relevant ? 90 : row.kind === 'unknown' ? null : 0 }))
})
export const distractors = ['vendor portfolio','generic directory','article about events','marriage counseling'].map((title, i) => ({ url: `https://reference.example/${i}`, title, description: `${title}: no peer or member community is operated here.` }))
export function fixtureHtml(row, url = row.url) {
  if (row.blocked) return '<main>Log in to view this group</main>'
  const breadcrumb = row.kind === 'forum' ? `<nav aria-label="breadcrumb"><a href="${row.canonical}">Public forum</a></nav>` : ''
  const role = row.named ? '<section data-public-operator><h2>Our team</h2><p>Casey Example is the founder. Casey Example handles business partnerships at partners@community.example.</p></section>' : ''
  return `<html><title>${row.title}</title><body>${breadcrumb}<main><h1>${row.title}</h1><p>${row.text}</p>${role}<section><h2>Rules</h2><p>${row.named ? 'Commercial promotions permitted through partnership inquiries.' : 'Promotion permission is not stated.'}</p></section><div class="member-list">Alex Member ordinary member secret@member.example +1 202 555 0101</div><div class="comment">Taylor Commenter moderator? not an operator +1 202 555 0199</div></main></body></html>`
}
export function fixturePlan(preset, overrides = {}) {
  const lanes = ['facebook_group','reddit_community','public_forum','public_forum','facebook_group']
  const queries = lanes.map((lane, i) => ({ lane, query: `${preset.segment} planning audience ${i}`, fallbacks: [`${preset.segment} celebration peers ${i}`, `${preset.segment} event consulting network ${i}`] }))
  return validateGeneratedPlan({ queries }, { ...preset.settings, ...overrides })
}
export function seedFixtureRun(db, preset, id = preset.segment) {
  const plan = fixturePlan(preset)
  createQueuedRun(db, id, preset.brief, plan.settings)
  persistResearchPlan(db, id, preset.brief, plan)
  return plan
}
export function qualificationResponse(catalog, mode = 'full') {
  const ref = catalog.find(e => e.role === 'community_context') ?? catalog.find(e => /peer community|public forum|member network|Facebook group|discussion forum/i.test(e.quote)) ?? catalog[0]
  const unknown = mode === 'unknown'
  const mismatch = mode === 'mismatch'
  return {
    dimensions: [
      { name: 'audience_alignment', basis: unknown || mode === 'partial' ? 'unknown' : 'community_context', score: unknown || mode === 'partial' ? null : mismatch ? 0 : 90, rationale: unknown || mode === 'partial' ? 'Member audience unknown' : mismatch ? 'Explicit wrong audience' : 'Explicit audience is named', evidence: unknown || mode === 'partial' ? [] : [{ id: ref.id }] },
      { name: 'planning_relevance', basis: unknown ? 'unknown' : 'community_context', score: unknown ? null : mismatch ? 0 : 90, rationale: unknown ? 'Topic unknown' : mismatch ? 'House construction, not event planning' : 'Explicit planning discussions', evidence: unknown ? [] : [{ id: ref.id }] },
    ],
    signals: Object.fromEntries(['demand','activity','location','size'].map(name => [name, { state: 'unknown', basis: 'unknown', rationale: 'Not established by this fixture response', evidence: [] }])),
    rationale: unknown ? 'Public evidence does not establish fit; needs evidence.' : 'Audience fit is supported; demand and activity remain unknown.',
  }
}
// Native protocol fixture: production prompts, schemas, completion parsing and
// citation validation still run. Unknown endpoints fail, never reach a provider.
export function nativeOpenRouterFixture(db, defect = 'valid', transform = (_name, output) => output) {
  const requests = []
  let catalogCalls = 0
  const marker = 'PRIVATE_RAW_FIXTURE_OUTPUT'
  const fetcher = async (input, init) => {
    const url = String(input)
    if (url === 'https://openrouter.ai/api/v1/models') {
      catalogCalls++
      return new Response(JSON.stringify({ data: [{ id: 'google/gemma-4-31b-it', pricing: { prompt: '0.000001', completion: '0.000002', request: '0' } }] }))
    }
    assertFixture(url === 'https://openrouter.ai/api/v1/chat/completions', `Unmatched outbound request: ${url}`)
    const request = JSON.parse(init.body)
    const name = request.response_format.json_schema.name
    assertFixture(request.model === 'google/gemma-4-31b-it', 'Fixed model changed')
    assertFixture(JSON.stringify(request.provider) === JSON.stringify({ data_collection: 'deny', zdr: true, allow_fallbacks: false, require_parameters: true }), 'Unsafe provider routing')
    const reservation = db.prepare("SELECT cost_micros FROM usage_ledger WHERE status='reserved'").get()
    const expectedLimit = name === 'community_eligibility' ? 1000 : 2000
    assertFixture(request.max_completion_tokens === expectedLimit && expectedLimit <= 4096, 'Unexpected completion limit')
    const upper = Buffer.byteLength(JSON.stringify(request.messages), 'utf8') + Buffer.byteLength(JSON.stringify(request.response_format), 'utf8') + 2048
    assertFixture(reservation.cost_micros >= Math.ceil((upper + expectedLimit * 2) * 1.25 + 1000), 'Incomplete preflight reservation')
    requests.push(request)
    const prompt = request.messages[0].content
    const catalogLabel = name === 'snippet_triage' ? '\nCatalog fields identify candidate IDs: ' : name === 'community_eligibility' ? '\nEvidence: ' : '\nCatalog: '
    const catalog = JSON.parse(prompt.slice(prompt.lastIndexOf(catalogLabel) + catalogLabel.length))
    let output
    if (name === 'snippet_triage') {
      output = Object.fromEntries(Object.entries(request.response_format.json_schema.schema.properties).map(([key, shape]) => {
        const id = shape.properties.evidence.items.properties.id.enum?.[0]
        return [key, { status: id ? 'likely_fit' : 'ambiguous', reason: id ? 'Cited wedding peer community' : 'No evidence supplied', evidence: id ? [{ id }] : [] }]
      }))
    } else if (name === 'community_eligibility') {
      output = { eligible: true, communityType: 'group', reason: 'Public wedding peer community', evidence: [{ id: defect === 'classification-citation' ? 'E99999' : (catalog.find(e => e.role === 'community_context') ?? catalog[0]).id }] }
    } else if (name === 'community_qualification') {
      output = qualificationResponse(catalog)
      if (defect === 'qualification-citation') output.dimensions[0].evidence = [{ id: 'E99999' }]
    } else throw new Error(`Unmatched native schema: ${name}`)
    output = transform(name, output, catalog, request)
    const failOutput = name === 'community_eligibility' && ['malformed','truncated'].includes(defect)
    return new Response(JSON.stringify({
      ...(defect === 'malformed' && failOutput ? {} : { id: `gen-offline-${requests.length}` }),
      choices: [{ ...(defect === 'malformed' && failOutput ? {} : { finish_reason: failOutput ? 'length' : 'stop' }), message: { content: failOutput ? `{${marker}` : JSON.stringify(output) } }],
      usage: defect === 'malformed' && failOutput ? { cost: .00001 } : { prompt_tokens: 10, completion_tokens: failOutput ? expectedLimit : 100, cost: .00021 },
    }))
  }
  return { fetcher, requests, marker, get catalogCalls() { return catalogCalls } }
}
function assertFixture(condition, message) { if (!condition) throw new Error(message) }

export function offlineProviders(segment, counters = { search: 0, page: 0, classification: 0, scoring: 0, leaders: 0 }) {
  const rows = corpus.filter(r => r.segment === segment)
  const findRow = url => rows.find(r => r.url === url || r.canonical === url)
  return {
    counters,
    search: async query => {
      counters.search++
      const platformRows = query.includes('site:facebook') ? rows.filter(r => r.kind === 'facebook') : query.includes('site:reddit') ? rows.filter(r => r.kind === 'reddit') : rows.filter(r => !['facebook','reddit'].includes(r.kind))
      const results = platformRows.map(r => ({ url: r.url, title: r.title, description: r.snippet }))
      if (query.includes('site:reddit')) results.push({ ...results[0], url: `https://reddit.com/r/${segment}/comments/def456/other/` })
      if (!query.includes('site:')) results.push(...distractors)
      return results
    },
    fetchPage: async url => {
      counters.page++
      const row = findRow(url) ?? (url.includes(`reddit.com/r/${segment}`) ? rows.find(r => r.kind === 'reddit') : undefined)
      if (!row) return '<title>Reference</title><main>Vendor directory without a community.</main>'
      return fixtureHtml(row, url)
    },
    triage: async ({ candidates, catalog }) => { counters.triage = (counters.triage ?? 0) + 1; return candidates.map(c => {
      const reject = /house construction|vendor portfolio|generic directory|article about events|marriage counseling/i.test(c.title)
      const ref = catalog.find(e => e.field === c.id)
      return { id: c.id, status: reject ? 'rejected' : c.snippet ? 'likely_fit' : 'ambiguous', reason: reject ? 'Explicit wrong audience or non-community type' : c.snippet ? 'Explicit peer community audience' : 'Missing snippet; defer audience judgment', evidence: ref ? [{ id: ref.id }] : [] }
    }) },
    classifyCandidate: async ({ catalog }) => { counters.classification++; const ref = catalog.find(e => e.role === 'community_context') ?? catalog.find(e => /forum|peer community|member network|Facebook group/i.test(e.quote)) ?? catalog[0]; return { eligible: true, communityType: 'forum', reason: 'Explicit public community is evidenced', evidence: [{ id: ref.id }] } },
    assessCandidate: async ({ catalog }) => { counters.scoring++; return qualificationResponse(catalog, catalog.some(e => /audience and discussion topics are not described/i.test(e.quote)) ? 'unknown' : 'full') },
    discoverLeaders: async ({ catalog }) => { counters.leaders++; return { leaders: catalog.length ? [{ name: 'Casey Example', role: 'founder', profileUrl: null, roleEvidence: [{ id: catalog[0].id }], businessRoute: 'mailto:partners@community.example', contactEvidence: [{ id: catalog[0].id }] }] : [] } },
  }
}
