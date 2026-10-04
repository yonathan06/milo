import type { DatabaseSync } from 'node:sqlite'
import { hasActiveEnrichment } from './discovery.ts'

// Clear run-local evidence, not the run or its immutable research/billing history.
export function deleteRunProspects(db: DatabaseSync, runId: string) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId)
    if (!run) throw new Error('Research run not found')
    if (['queued', 'planning', 'running'].includes(String(run.status))) throw new Error('Wait for research to finish before deleting prospects')
    const communities = db.prepare('SELECT id FROM communities WHERE run_id = ?').all(runId)
    if (hasActiveEnrichment([`run:${runId}`, ...communities.map(row => String(row.id))])) throw new Error('Wait for prospect enrichment to finish before deleting prospects')
    const affected = db.prepare(`SELECT prospect_id AS id FROM communities WHERE run_id = ? AND prospect_id IS NOT NULL
      UNION SELECT prospect_id FROM assessments WHERE run_id = ?
      UNION SELECT prospect_id FROM observations WHERE run_id = ?
      UNION SELECT prospect_id FROM discovery_candidates WHERE run_id = ? AND prospect_id IS NOT NULL`).all(runId, runId, runId, runId)

    // Cascades remove suggestions/drafts, community sources, and role evidence.
    // Remove candidate audit first rather than leaving dangling, retryable leads.
    db.prepare('DELETE FROM discovery_candidates WHERE run_id = ?').run(runId)
    db.prepare('DELETE FROM assessments WHERE run_id = ?').run(runId)
    db.prepare('DELETE FROM communities WHERE run_id = ?').run(runId)
    db.prepare('DELETE FROM observations WHERE run_id = ?').run(runId)
    const removeOrphan = db.prepare(`DELETE FROM prospects WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM communities WHERE prospect_id = prospects.id)
      AND NOT EXISTS (SELECT 1 FROM assessments WHERE prospect_id = prospects.id)
      AND NOT EXISTS (SELECT 1 FROM observations WHERE prospect_id = prospects.id)
      AND NOT EXISTS (SELECT 1 FROM discovery_candidates WHERE prospect_id = prospects.id)`)
    let removedIdentities = 0
    for (const row of affected) removedIdentities += Number(removeOrphan.run(row.id).changes)
    db.exec('COMMIT')
    return { deleted: affected.length, removedIdentities }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
