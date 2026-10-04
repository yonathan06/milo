import { randomUUID } from 'node:crypto'
import { filterBrief, validateSearchFilters } from '../search-filters.ts'
import { decodeResearchRequest } from '../research-settings.ts'
import { communityPresets } from '../community-presets.ts'
import { createServerFn } from '@tanstack/react-start'
import { openDatabase as openResearchDatabase } from './db'
import type { ProspectType } from './identity'
import { createQueuedRun, generateResearchPlan, persistResearchPlan } from './rubric'
import { runDiscovery, enrichProspect, discoveryLimits } from './discovery'
import { getMonthlyUsage } from './usage'
import { createDraftForSelectedProspect } from './outreach'
import { readProspectDirectory } from './prospect-directory'
import { deleteRunProspects } from './delete-run-prospects'

const runtime = globalThis as typeof globalThis & { __prospectorActiveRuns?: Set<string> }
const activeRuns = runtime.__prospectorActiveRuns ??= new Set<string>()
function openDatabase() {
  const db = openResearchDatabase()
  // An interrupted process must not leave saved-stage retries locked forever.
  // No discovery is restarted and no reservation is released here.
  for (const row of db.prepare("SELECT id FROM runs WHERE status IN ('queued','planning','running')").all()) {
    if (!activeRuns.has(String(row.id))) db.prepare("UPDATE runs SET status='partial',error='Research interrupted; retry saved candidates or rerun explicitly. Spending reservations were retained.' WHERE id=?").run(row.id)
  }
  return db
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request data')
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`)
  return value.trim()
}

const validTypes = new Set<ProspectType>(['facebook_group', 'whatsapp_community', 'community'])
const validReviewStates = new Set(['pending', 'selected', 'rejected'])

function startDiscovery(runId: string): void {
  setImmediate(() => {
    const db = openDatabase()
    void runDiscovery(db, runId).catch((error) => {
      db.prepare("UPDATE runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?")
        .run(error instanceof Error ? error.message : 'Discovery failed', new Date().toISOString(), runId)
    }).finally(() => { db.close(); activeRuns.delete(runId) })
  })
}

export const submitBrief = createServerFn({ method: 'POST' })
  .validator((value: unknown) => {
    const data = record(value)
    return { brief: requiredString(data.brief, 'Audience brief'), researchSettings: decodeResearchRequest(data), ...validateSearchFilters(data) }
  })
  .handler(async ({ data }) => {
    const db = openDatabase()
    const id = randomUUID()
    activeRuns.add(id)
    let plan
    try {
      const brief = filterBrief(data.brief, data)
      createQueuedRun(db, id, brief, data.researchSettings)
      db.prepare('UPDATE runs SET filters_json = ? WHERE id = ?').run(JSON.stringify(validateSearchFilters(data)), id)
      plan = await generateResearchPlan(brief, db, id, data.researchSettings)
      persistResearchPlan(db, id, brief, plan)
    } catch (error) {
      activeRuns.delete(id)
      db.prepare("UPDATE runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?")
        .run(error instanceof Error ? error.message : 'Research plan generation failed', new Date().toISOString(), id)
      return { id, brief: data.brief, status: 'failed', error: error instanceof Error ? error.message : 'Research plan generation failed' }
    } finally {
      db.close()
    }
    startDiscovery(id)
    return { id, brief: data.brief, status: 'queued', highScoreThreshold: plan.highScoreThreshold }
  })

export const retryProspectEnrichment = createServerFn({ method: 'POST' })
  .validator((value: unknown) => {
    const data = record(value)
    return { communityId: requiredString(data.communityId, 'Community id') }
  })
  .handler(async ({ data }) => {
    const db = openDatabase()
    try {
      const row = db.prepare(`SELECT r.status FROM discovery_candidates c JOIN runs r ON r.id=c.run_id WHERE c.id=? OR c.community_id=? LIMIT 1`).get(data.communityId, data.communityId)
      if (!row) throw new Error('Saved candidate not found')
      if (['queued', 'planning', 'running'].includes(String(row.status))) throw new Error('Wait for discovery to finish before retrying unfinished stages')
      return await enrichProspect(db, data.communityId)
    } finally { db.close() }
  })

export const listPendingQueries = createServerFn({ method: 'GET' }).handler(() => {
  const db = openDatabase()
  try {
    for (const preset of communityPresets) db.prepare("INSERT OR IGNORE INTO pending_queries(id,title,brief,countries_json,research_settings_json,created_at,updated_at) VALUES(?,?,?,'[]',?,?,?)")
      .run(preset.segment, preset.title, preset.brief, JSON.stringify(preset.settings), new Date().toISOString(), new Date().toISOString())
    return db.prepare(`SELECT id, title, brief, countries_json AS countriesJson, research_settings_json AS settingsJson,
      CASE WHEN status = 'running' AND (SELECT status FROM runs WHERE id = run_id) = 'failed' THEN 'failed' ELSE status END AS status,
      run_id AS runId FROM pending_queries ORDER BY created_at`).all().map(row => ({
      id: String(row.id), title: String(row.title), brief: String(row.brief), status: String(row.status),
      runId: row.runId == null ? null : String(row.runId), countries: JSON.parse(String(row.countriesJson)) as string[], researchSettings: decodeResearchRequest({ researchSettings: JSON.parse(String(row.settingsJson)) }),
    }))
  } finally {
    db.close()
  }
})

export const markPendingQueryRun = createServerFn({ method: 'POST' })
  .validator((value: unknown) => ({
    id: requiredString(record(value).id, 'Query id'),
    runId: requiredString(record(value).runId, 'Run id'),
  }))
  .handler(({ data }) => {
    const db = openDatabase()
    try {
      db.prepare(`UPDATE pending_queries SET status = 'running', run_id = ?, updated_at = ? WHERE id = ?`)
        .run(data.runId, new Date().toISOString(), data.id)
      return { ok: true }
    } finally { db.close() }
  })

export const listRuns = createServerFn({ method: 'GET' }).handler(() => {
  const db = openDatabase()
  try {
    return db.prepare(`
      SELECT r.id, r.brief, r.status, r.error, r.started_at AS startedAt, r.completed_at AS completedAt,
        (SELECT count(*) FROM assessments a WHERE a.run_id = r.id) AS prospectCount,
        (SELECT count(*) FROM queries q WHERE q.run_id = r.id AND q.status = 'failed') AS failedQueryCount
      FROM runs r ORDER BY r.started_at DESC
    `).all()
  } finally {
    db.close()
  }
})

export const getRunProgress = createServerFn({ method: 'GET' })
  .validator((value: unknown) => ({ runId: requiredString(record(value).runId, 'Run id') }))
  .handler(({ data }) => {
    const db = openDatabase()
    try {
      const run = db.prepare(`
        SELECT id, brief, status, high_score_threshold AS highScoreThreshold, error,
          started_at AS startedAt, completed_at AS completedAt, filters_json AS filtersJson, research_settings_json AS settingsJson, cooldown_until AS cooldownUntil
        FROM runs WHERE id = ?
      `).get(data.runId)
      if (!run) throw new Error('Run not found')
      const rubricRow = db.prepare(`SELECT criteria_json, query_plan_json, frozen_at AS frozenAt FROM rubrics WHERE run_id = ?`).get(data.runId) as
        | { criteria_json: string; query_plan_json: string; frozenAt: string }
        | undefined
      const storedPlan = rubricRow ? JSON.parse(rubricRow.query_plan_json) : null
      const rubric = rubricRow ? {
        criteria: JSON.parse(rubricRow.criteria_json),
        plannedQueries: storedPlan?.queries ?? [],
        frozenAt: rubricRow.frozenAt,
      } : null
      const queries = db.prepare(`
        SELECT id, lane, stage, query_text AS query, provider, status, error, credits_reserved AS creditsReserved,
          credits_used AS creditsUsed, created_at AS createdAt, completed_at AS completedAt, diagnostics_json AS diagnosticsJson
        FROM queries WHERE run_id = ? ORDER BY created_at
      `).all(data.runId)
      const totals = db.prepare(`
        SELECT count(*) AS prospects,
          COALESCE(sum(CASE WHEN score >= (SELECT high_score_threshold FROM runs WHERE id = ?) THEN 1 ELSE 0 END), 0) AS highScoring
        FROM assessments WHERE run_id = ?
      `).get(data.runId, data.runId)
      const filters = JSON.parse(String((run as { filtersJson?: string }).filtersJson ?? '{}'))
      return { run, rubric, queries, totals, filters, settings: decodeResearchRequest({ researchSettings: JSON.parse(String(run.settingsJson)) }) }
    } finally {
      db.close()
    }
  })

export const deleteProspectsForRun = createServerFn({ method: 'POST' })
  .validator((value: unknown) => {
    const data = record(value)
    return { runId: requiredString(data.runId, 'Run id') }
  })
  .handler(({ data }) => {
    const db = openDatabase()
    try { return deleteRunProspects(db, data.runId) } finally { db.close() }
  })

export const listAllProspects = createServerFn({ method: 'GET' }).handler(() => {
  const db = openDatabase()
  try {
    return readProspectDirectory(db)
  } finally {
    db.close()
  }
})

export const listProspects = createServerFn({ method: 'GET' })
  .validator((value: unknown) => {
    const data = record(value)
    const runId = requiredString(data.runId, 'Run id')
    const type = data.type === undefined || data.type === '' ? undefined : String(data.type)
    if (type && !validTypes.has(type as ProspectType)) throw new Error('Invalid prospect type filter')
    const minScore = data.minScore === undefined || data.minScore === '' ? undefined : Number(data.minScore)
    const maxScore = data.maxScore === undefined || data.maxScore === '' ? undefined : Number(data.maxScore)
    if (minScore !== undefined && (!Number.isInteger(minScore) || minScore < 0 || minScore > 100)) throw new Error('Invalid minimum score')
    if (maxScore !== undefined && (!Number.isInteger(maxScore) || maxScore < 0 || maxScore > 100)) throw new Error('Invalid maximum score')
    return { runId, type, minScore, maxScore }
  })
  .handler(({ data }) => {
    const db = openDatabase()
    try {
      const rows = db.prepare(`
        SELECT p.id, p.prospect_type AS type, p.canonical_identity AS identity, p.canonical_url AS url,
          CASE WHEN c.verification_status = 'unverified' THEN NULL WHEN json_extract(c.enrichment_json, '$.evidenceMode') = 'snippet' THEN json_extract(c.enrichment_json, '$.country') ELSE p.country END AS country,
          c.verification_status = 'unverified' OR json_extract(c.enrichment_json, '$.evidenceMode') = 'snippet' AS countryProvisional,
          (SELECT json_group_array(json_object('query', q.query_text, 'lane', q.lane))
            FROM (SELECT DISTINCT query_id FROM observations WHERE prospect_id = p.id AND run_id = ?
                  UNION SELECT DISTINCT cs.query_id FROM community_sources cs JOIN communities cm ON cm.id = cs.community_id
                    WHERE cm.prospect_id = p.id AND cm.run_id = ?) linked
            JOIN queries q ON q.id = linked.query_id) AS linkedQueriesJson,
          p.review_state AS reviewState, p.reviewed_at AS reviewedAt,
          a.id AS assessmentId, a.score, a.coverage, a.signals_json AS signalsJson, COALESCE(a.source_mode, json_extract(c.evidence_json, '$.sourceMode')) AS evidenceMode, a.dimensions_json AS dimensionsJson, a.rationale,
          a.evidence_refs_json AS evidenceRefsJson, COALESCE(a.confidence, 'unknown') AS confidence,
          COALESCE(a.contactability, 'unknown') AS contactability,
          c.verification_status AS verificationStatus, c.verification_error AS verificationError,
          c.page_state AS pageState,c.classification_state AS classificationState,c.scoring_state AS scoringState,c.leader_state AS leaderState,c.stage_errors_json AS stageErrorsJson,c.permission_status AS permissionStatus,c.permission_evidence_json AS permissionEvidenceJson,
          p.community_type AS communityType, p.platform,
          c.id AS communityId, c.community_size AS communitySize,
          c.filter_status AS filterStatus, c.audience_size AS audienceSize, c.enrichment_json AS enrichmentJson,
          c.title AS inspectedTitle, c.description AS inspectedDescription,
          c.extracted_text AS inspectedText, c.contact_routes_json AS contactRoutesJson,
          c.relevance AS discoveryRelevance, c.relevance_reason AS discoveryReason,
          s.language, s.domain, s.message_angle AS messageAngle, s.verification_warning AS verificationWarning,
          d.id AS draftId, d.body AS draftBody, d.channel_guide AS channelGuide, d.blocker AS draftBlocker
        FROM prospects p
        LEFT JOIN assessments a ON a.prospect_id = p.id AND a.run_id = ?
        LEFT JOIN communities c ON c.id = (SELECT id FROM communities WHERE prospect_id = p.id AND run_id = ?
          ORDER BY (filter_status = 'excluded'), (verification_status = 'unverified'), observed_at DESC, rowid DESC LIMIT 1)
        LEFT JOIN suggestions s ON s.assessment_id = a.id
        LEFT JOIN drafts d ON d.id = (SELECT id FROM drafts WHERE assessment_id = a.id ORDER BY created_at DESC LIMIT 1)
        WHERE (a.id IS NOT NULL OR c.id IS NOT NULL) AND COALESCE(c.filter_status, 'match') != 'excluded'
          AND (? IS NULL OR p.prospect_type = ?)
          AND (? IS NULL OR a.score >= ?) AND (? IS NULL OR a.score <= ?)
        ORDER BY
          (a.score IS NULL), a.score DESC, a.coverage DESC, p.created_at DESC
      `).all(
        data.runId, data.runId, data.runId, data.runId,
        data.type ?? null, data.type ?? null,
        data.minScore ?? null, data.minScore ?? null,
        data.maxScore ?? null, data.maxScore ?? null,
      )
      return rows.map((row) => ({
        ...row, runId: data.runId,
        linkedQueries: JSON.parse(String(row.linkedQueriesJson ?? '[]')),
        dimensions: JSON.parse(String(row.dimensionsJson ?? '[]')),
        signals: JSON.parse(String(row.signalsJson ?? '{}')),
        stageErrors: JSON.parse(String(row.stageErrorsJson ?? '{}')),
        permissionEvidence: JSON.parse(String(row.permissionEvidenceJson ?? '[]')),
        leaders: db.prepare('SELECT name,role,profile_url AS profileUrl,business_route AS businessRoute,status,observed_at AS observedAt,role_evidence_json AS roleEvidenceJson,contact_evidence_json AS contactEvidenceJson FROM community_leaders WHERE community_id=?').all(row.communityId).map(leader => ({ ...leader, roleEvidence: JSON.parse(String(leader.roleEvidenceJson)), contactEvidence: JSON.parse(String(leader.contactEvidenceJson ?? '[]')) })),
        evidenceRefs: JSON.parse(String(row.evidenceRefsJson ?? '[]')),
        enrichment: JSON.parse(String(row.enrichmentJson ?? '{}')),
        aliases: db.prepare('SELECT url, evidence_url AS evidenceUrl FROM prospect_aliases WHERE prospect_id = ?').all(row.id),
        contactRoutes: [...new Set([
          ...db.prepare('SELECT contact_routes_json FROM communities WHERE prospect_id = ? AND run_id = ? AND filter_status != ?').all(row.id, data.runId, 'excluded').flatMap(item => JSON.parse(String(item.contact_routes_json)) as string[]),
          ...db.prepare("SELECT business_route FROM community_leaders WHERE community_id=? AND status='verified' AND business_route IS NOT NULL AND contact_evidence_json IS NOT NULL").all(row.communityId).map(l => String(l.business_route)),
        ])],
        unknownFields: [
          ...((row.contactRoutesJson && JSON.parse(String(row.contactRoutesJson)).length) || db.prepare("SELECT 1 FROM community_leaders WHERE community_id=? AND status='verified' AND business_route IS NOT NULL AND contact_evidence_json IS NOT NULL LIMIT 1").get(row.communityId) ? [] : ['No suitable public contact route was verified']),
          ...(row.inspectedTitle ? [] : ['Public page title not available']),
          ...(row.inspectedDescription ? [] : ['Public page description not available']),
          ...(row.language ? [] : ['Audience language is unknown']),
        ],
        sources: [
          ...db.prepare(`
            SELECT cs.source_url AS sourceUrl, cs.original_url AS originalUrl,
              'search_result' AS sourceKind,
              cs.observed_at AS observedAt, cs.snippet AS summary, q.query_text AS query
            FROM community_sources cs JOIN communities c ON c.id = cs.community_id
            LEFT JOIN queries q ON q.id = cs.query_id
            WHERE c.prospect_id = ? AND c.run_id = ? ORDER BY cs.observed_at DESC
          `).all(row.id, data.runId),
          ...db.prepare(`
            SELECT source_url AS sourceUrl, original_url AS originalUrl, source_kind AS sourceKind,
              observed_at AS observedAt, summary, facts_json AS factsJson
            FROM observations WHERE prospect_id = ? AND run_id = ? ORDER BY observed_at DESC
          `).all(row.id, data.runId).map((source) => ({
            ...source,
            facts: JSON.parse(String(source.factsJson)),
          })),
        ],
      }))
    } finally {
      db.close()
    }
  })

export const updateReviewState = createServerFn({ method: 'POST' })
  .validator((value: unknown) => {
    const data = record(value)
    const prospectId = requiredString(data.prospectId, 'Prospect id')
    const state = requiredString(data.state, 'Review state')
    if (!validReviewStates.has(state)) throw new Error('Invalid review state')
    return { prospectId, state }
  })
  .handler(({ data }) => {
    const db = openDatabase()
    try {
      const result = db.prepare(`
        UPDATE prospects SET review_state = ?, reviewed_at = ? WHERE id = ?
      `).run(data.state, new Date().toISOString(), data.prospectId)
      if (Number(result.changes) === 0) throw new Error('Prospect not found')
      return { prospectId: data.prospectId, state: data.state }
    } finally {
      db.close()
    }
  })

export const prepareOutreachDraft = createServerFn({ method: 'POST' })
  .validator((value: unknown) => ({ prospectId: requiredString(record(value).prospectId, 'Prospect id') }))
  .handler(async ({ data }) => {
    const db = openDatabase()
    try {
      return await createDraftForSelectedProspect(db, data.prospectId)
    } finally {
      db.close()
    }
  })

export const updateDraftBody = createServerFn({ method: 'POST' })
  .validator((value: unknown) => {
    const data = record(value)
    const draftId = requiredString(data.draftId, 'Draft id')
    if (typeof data.body !== 'string' || data.body.length > 2000) throw new Error('Draft body must be at most 2,000 characters')
    return { draftId, body: data.body }
  })
  .handler(({ data }) => {
    const db = openDatabase()
    try {
      const result = db.prepare('UPDATE drafts SET body = ?, updated_at = ? WHERE id = ?')
        .run(data.body, new Date().toISOString(), data.draftId)
      if (Number(result.changes) !== 1) throw new Error('Draft not found')
      return { draftId: data.draftId, saved: true }
    } finally {
      db.close()
    }
  })

export const getRunDiagnostics = createServerFn({ method: 'GET' })
  .validator((value: unknown) => ({ runId: requiredString(record(value).runId, 'Run id') }))
  .handler(({ data }) => {
    const db = openDatabase()
    try {
      const run = db.prepare('SELECT id, status, error FROM runs WHERE id = ?').get(data.runId)
      if (!run) throw new Error('Run not found')
      const queryFailures = db.prepare(`
        SELECT id, lane, provider, status, error, credits_reserved AS creditsReserved,
          credits_used AS creditsUsed, created_at AS createdAt, completed_at AS completedAt
        FROM queries WHERE run_id = ? AND (status IN ('failed','skipped') OR error IS NOT NULL)
        ORDER BY created_at
      `).all(data.runId)
      const usage = db.prepare(`
        SELECT provider, sum(credits) AS credits, sum(cost_micros) AS costMicros
        FROM usage_ledger WHERE run_id = ? AND status = 'settled' GROUP BY provider
      `).all(data.runId)
      const candidates = db.prepare('SELECT id,original_url AS originalUrl,canonical_url AS canonicalUrl,title,snippet,platform,triage_status AS triageStatus,triage_state AS triageState,triage_reason AS triageReason,inspection_state AS inspectionState,shortlisted,recovery_state AS recoveryState,error,community_id AS communityId FROM discovery_candidates WHERE run_id=? ORDER BY observed_at,rowid').all(data.runId)
      const stages = db.prepare(`SELECT count(*) AS retained,
        sum(page_state='inspected') AS inspected,sum(page_state='blocked') AS accessBlocked,
        sum(scoring_state='complete') AS qualified,sum(scoring_state='failed') AS scoringFailed,
        sum(leader_state='complete' AND EXISTS(SELECT 1 FROM community_leaders l WHERE l.community_id=communities.id)) AS leaderEnriched
        FROM communities WHERE run_id=?`).get(data.runId)
      const funnel = { returned: candidates.length, urlRejected: candidates.filter(c => c.triageStatus==='rejected' && c.canonicalUrl==null).length, duplicate: candidates.filter(c => c.inspectionState==='duplicate').length, triageRejected: candidates.filter(c => c.triageStatus==='rejected' && c.canonicalUrl!=null).length, ambiguous: candidates.filter(c => c.triageStatus==='ambiguous').length, shortlisted: candidates.filter(c => Number(c.shortlisted) === 1).length, ...stages, scored: Number(db.prepare('SELECT count(*) n FROM assessments WHERE run_id=? AND score IS NOT NULL').get(data.runId)?.n ?? 0) }
      const acquisition = db.prepare('SELECT stage,count(*) searches,sum(credits_used) credits FROM queries WHERE run_id=? GROUP BY stage').all(data.runId)
      return { run, queryFailures, usage, monthlyUsage: getMonthlyUsage(db), candidates, funnel, acquisition, limits: discoveryLimits }
    } finally {
      db.close()
    }
  })
