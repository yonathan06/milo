import { openDatabase } from './db.ts'
import { runDiscovery } from './discovery.ts'
import { corpus, seedFixtureRun, offlineProviders } from './community-fixtures.mjs'
import { communityPresets } from '../community-presets.ts'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
const baseline = JSON.parse(readFileSync(new URL('../../docs/offline-baseline.json', import.meta.url), 'utf8'))

export async function runOfflineBenchmark() {
  const db = openDatabase(':memory:')
  try {
    const counters = { search: 0, page: 0, triage: 0, classification: 0, scoring: 0, leaders: 0 }
    for (const preset of communityPresets) {
      seedFixtureRun(db, preset)
      await runDiscovery(db, preset.segment, { ...offlineProviders(preset.segment, counters), fetcher: async () => { throw new Error('No external calls permitted in benchmark') } })
    }
    const relevant = corpus.filter(r => r.relevant), found = new Set(db.prepare('SELECT community_url FROM communities WHERE filter_status!=?').all('excluded').map(r => r.community_url))
    const recalled = relevant.filter(r => found.has(r.canonical)).length
    const top = communityPresets.flatMap(p => db.prepare('SELECT p.canonical_url,a.score FROM assessments a JOIN prospects p ON p.id=a.prospect_id JOIN communities c ON c.prospect_id=p.id AND c.run_id=a.run_id WHERE a.run_id=? AND a.score IS NOT NULL AND c.filter_status!=? ORDER BY a.score DESC,a.coverage DESC LIMIT 10').all(p.segment, 'excluded'))
    const precise = top.filter(r => relevant.some(c => c.canonical === r.canonical_url)).length
    const leaders = db.prepare('SELECT l.*,c.community_url FROM community_leaders l JOIN communities c ON c.id=l.community_id').all()
    const unsupported = leaders.filter(l => !corpus.some(c => c.named && c.canonical === l.community_url)
      || !JSON.parse(l.role_evidence_json).some(e => e.quote.includes(l.name) && e.quote.toLowerCase().includes(l.role))
      || (l.business_route && !JSON.parse(l.contact_evidence_json).some(e => e.quote.includes(l.name) && e.quote.includes(l.business_route.replace(/^mailto:/, ''))))).length
    const reddit = db.prepare("SELECT community_url FROM communities WHERE platform='reddit'").all()
    const correctlyDeduplicated = reddit.length === 4 && reddit.every(r => !r.community_url.includes('/comments/'))
    const report = {
      corpus: { total: corpus.length, relevant: relevant.length, synthetic: true }, recall: recalled / relevant.length, topRankedPrecision: top.length ? precise / top.length : 0,
      recalled, topRankedCount: top.length, unsupportedVerifiedLeaderContactClaims: unsupported, verifiedLeaders: leaders.length, correctParentDeduplication: correctlyDeduplicated,
      stages: { returned: Number(db.prepare('SELECT count(*) n FROM discovery_candidates').get().n), duplicates: Number(db.prepare("SELECT count(*) n FROM discovery_candidates WHERE inspection_state='duplicate'").get().n), triageRejected: Number(db.prepare("SELECT count(*) n FROM discovery_candidates WHERE triage_status='rejected'").get().n), shortlisted: Number(db.prepare('SELECT count(*) n FROM discovery_candidates WHERE shortlisted=1').get().n), inspected: Number(db.prepare("SELECT count(*) n FROM communities WHERE page_state='inspected'").get().n), blocked: Number(db.prepare("SELECT count(*) n FROM communities WHERE page_state='blocked'").get().n), scored: Number(db.prepare('SELECT count(*) n FROM assessments WHERE score IS NOT NULL').get().n), needsEvidence: Number(db.prepare('SELECT count(*) n FROM assessments WHERE score IS NULL').get().n), scoringFailed: Number(db.prepare("SELECT count(*) n FROM communities WHERE scoring_state='failed'").get().n) },
      baseline,
      providerCalls: counters, simulatedCostMicros: Number(db.prepare('SELECT sum(cost_micros) total FROM usage_ledger').get().total) + counters.triage * 150 + counters.classification * 100 + counters.scoring * 300 + counters.leaders * 200,
      limitations: 'Authored synthetic pages and deterministic model responses; tests acquisition, state, evidence validation and safety, not real-provider recall, language competence or live access reliability.',
    }
    return report
  } finally { db.close() }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await runOfflineBenchmark(), null, 2))
