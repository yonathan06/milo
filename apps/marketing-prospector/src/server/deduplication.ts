import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { CanonicalProspect } from './identity.ts'
import { aliasUrl } from './enrichment.ts'

// Only inspected, explicit parent navigation can establish an equivalent URL.
// Shared names, business routes, hostnames, and reciprocal operator links cannot.
export interface ParentIdentityEvidence {
  childUrl: string
  parentUrl: string
  sourceUrl: string
  excerpt: string
  kind: 'breadcrumb' | 'navigation'
}

function mergeProspect(db: DatabaseSync, keep: string, remove: string): void {
  const conflicts = db.prepare(`SELECT old.* FROM assessments old JOIN assessments current
    ON current.run_id = old.run_id AND current.prospect_id = ? WHERE old.prospect_id = ?`).all(keep, remove)
  for (const assessment of conflicts) {
    const current = db.prepare('SELECT * FROM assessments WHERE prospect_id = ? AND run_id = ?').get(keep, assessment.run_id)!
    // Prefer evidence coverage, then relevance. A null score is not a zero-fit finding.
    const better = Number(assessment.coverage) > Number(current.coverage)
      || (Number(assessment.coverage) === Number(current.coverage) && Number(assessment.score ?? -1) > Number(current.score ?? -1))
    const winner = better ? assessment : current
    const loser = better ? current : assessment
    const suggestion = db.prepare('SELECT * FROM suggestions WHERE assessment_id = ?').get(loser.id)
    db.prepare(`INSERT OR IGNORE INTO observations (id, prospect_id, run_id, source_url, original_url, source_kind, observed_at, summary, facts_json)
      VALUES (?, ?, ?, '', '', ?, ?, ?, ?)`).run(randomUUID(), keep, loser.run_id, `merged_assessment:${loser.id}`, new Date().toISOString(), 'Assessment and suggestion retained during identity reconciliation', JSON.stringify({ assessment: loser, suggestion }))
    db.prepare('UPDATE drafts SET assessment_id = ? WHERE assessment_id = ?').run(winner.id, loser.id)
    db.prepare('DELETE FROM assessments WHERE id = ?').run(loser.id)
  }
  db.prepare('UPDATE assessments SET prospect_id = ? WHERE prospect_id = ?').run(keep, remove)
  // Preserve both observations even when canonical source keys collide.
  for (const observation of db.prepare('SELECT * FROM observations WHERE prospect_id = ?').all(remove)) {
    const duplicate = db.prepare(`SELECT id FROM observations WHERE prospect_id = ? AND run_id = ? AND source_url = ? AND original_url = ? AND source_kind = ?`)
      .get(keep, observation.run_id, observation.source_url, observation.original_url, observation.source_kind)
    if (duplicate) db.prepare('UPDATE observations SET source_kind = ? WHERE id = ?').run(`merged_observation:${observation.id}`, observation.id)
  }
  for (const table of ['observations', 'communities', 'prospect_aliases', 'discovery_candidates']) {
    db.prepare(`UPDATE ${table} SET prospect_id = ? WHERE prospect_id = ?`).run(keep, remove)
  }
  // Community evidence/leader identities remain scoped to their original run
  // records. Never combine leaders by name, profile, business route, or domain.
  const previous = db.prepare('SELECT * FROM prospects WHERE id = ?').get(remove)!
  db.prepare(`UPDATE prospects SET country = COALESCE(country, ?),
    review_state = CASE WHEN review_state = 'selected' OR ? = 'selected' THEN 'selected' WHEN review_state = 'pending' THEN ? ELSE review_state END,
    reviewed_at = COALESCE(reviewed_at, ?) WHERE id = ?`).run(previous.country, previous.review_state, previous.review_state, previous.reviewed_at, keep)
  db.prepare('DELETE FROM prospects WHERE id = ?').run(remove)
}

export function resolveProspect(db: DatabaseSync, input: {
  identity: CanonicalProspect; reciprocalUrls?: string[]; parentEvidence?: ParentIdentityEvidence
  platform: string; communityType: string
}): { id: string } {
  const ownUrl = aliasUrl(input.identity.url)
  if (!ownUrl || !['community','facebook_group','whatsapp_community'].includes(input.identity.type)) throw new Error('Expected a community identity')
  const urls = [ownUrl]
  const evidence = input.parentEvidence
  if (evidence) {
    const childUrl = aliasUrl(evidence.childUrl)
    if (!childUrl || aliasUrl(evidence.parentUrl) !== ownUrl || aliasUrl(evidence.sourceUrl) !== childUrl
      || !['breadcrumb', 'navigation'].includes(evidence.kind) || !evidence.excerpt.trim()
      || aliasUrl(input.identity.originalUrl) !== childUrl) throw new Error('Invalid inspected parent-identity evidence')
    urls.push(childUrl)
  }
  db.exec('SAVEPOINT reconcile_identity')
  try {
    const existing = new Map<string, { id: string; created_at: string }>()
    const exact = db.prepare('SELECT id, created_at FROM prospects WHERE prospect_type = ? AND canonical_identity = ?').get(input.identity.type, input.identity.identity) as { id: string; created_at: string } | undefined
    if (exact) existing.set(exact.id, exact)
    for (const url of new Set(urls)) {
      for (const row of db.prepare(`SELECT p.id, p.created_at FROM prospects p LEFT JOIN prospect_aliases a ON a.prospect_id = p.id
        WHERE a.url = ? OR p.canonical_url = ?`).all(url, url)) {
        existing.set(String(row.id), { id: String(row.id), created_at: String(row.created_at) })
      }
      // URL spelling aliases are safe; path/domain/name similarity is not.
      for (const row of db.prepare('SELECT id,canonical_url,created_at FROM prospects').all()) {
        if (aliasUrl(String(row.canonical_url)) === url) existing.set(String(row.id), { id: String(row.id), created_at: String(row.created_at) })
      }
    }
    const matches = [...existing.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const id = matches[0]?.id ?? randomUUID()
    const now = new Date().toISOString()
    if (!matches.length) db.prepare(`INSERT INTO prospects (id, prospect_type, canonical_identity, canonical_url, community_type, platform, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, input.identity.type, input.identity.identity, input.identity.url, input.communityType, input.platform, now)
    for (const match of matches.slice(1)) mergeProspect(db, id, match.id)
    if (evidence) db.prepare('UPDATE prospects SET prospect_type=?,canonical_identity=?,canonical_url=?,community_type=?,platform=? WHERE id=?')
      .run(input.identity.type, input.identity.identity, input.identity.url, input.communityType, input.platform, id)
    for (const url of new Set(urls)) db.prepare('INSERT OR IGNORE INTO prospect_aliases (url, prospect_id, evidence_url, created_at) VALUES (?, ?, ?, ?)')
      .run(url, id, evidence?.sourceUrl ?? input.identity.url, now)
    db.exec('RELEASE reconcile_identity')
    return { id }
  } catch (error) {
    db.exec('ROLLBACK TO reconcile_identity; RELEASE reconcile_identity')
    throw error
  }
}
