import type { DatabaseSync } from 'node:sqlite'

// One row per identity, including prospects without an assessment.
// Scores belong to a brief: expose the latest run alongside its score.
export function readProspectDirectory(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT p.id, p.canonical_identity AS identity, p.canonical_url AS url,
      p.prospect_type AS type, p.platform,
      CASE WHEN c.verification_status = 'unverified' THEN NULL WHEN json_extract(c.enrichment_json, '$.evidenceMode') = 'snippet' THEN json_extract(c.enrichment_json, '$.country') ELSE p.country END AS country,
      c.verification_status = 'unverified' OR json_extract(c.enrichment_json, '$.evidenceMode') = 'snippet' AS countryProvisional, p.review_state AS reviewState,
      (SELECT json_group_array(json_object('query', q.query_text, 'lane', q.lane))
        FROM (SELECT DISTINCT query_id FROM observations WHERE prospect_id = p.id AND run_id = r.id
              UNION SELECT DISTINCT cs.query_id FROM community_sources cs JOIN communities cm ON cm.id = cs.community_id
                WHERE cm.prospect_id = p.id AND cm.run_id = r.id) linked
        JOIN queries q ON q.id = linked.query_id) AS linkedQueriesJson,
      a.score,a.coverage,a.signals_json AS signalsJson,a.evidence_refs_json AS evidenceRefsJson,a.dimensions_json AS dimensionsJson,a.rationale, COALESCE(a.source_mode, json_extract(c.evidence_json, '$.sourceMode')) AS evidenceMode, c.id AS communityId,
      c.page_state AS pageState,c.classification_state AS classificationState,c.scoring_state AS scoringState,c.leader_state AS leaderState,c.stage_errors_json AS stageErrorsJson,c.permission_status AS permissionStatus,c.permission_evidence_json AS permissionEvidenceJson,
      json_extract(c.enrichment_json, '$.rankingError') AS rankingError,
      COALESCE(a.confidence, 'unknown') AS confidence,
      COALESCE(a.contactability, 'unknown') AS contactability, r.id AS runId,
      COALESCE(c.verification_status, 'unknown') AS verificationStatus,
      c.verification_error AS verificationError, c.relevance AS discoveryRelevance,
      c.community_size AS communitySize, COALESCE(c.filter_status, 'unknown') AS filterStatus,
      r.brief, r.started_at AS runStartedAt,
      (SELECT count(*) FROM (
        SELECT run_id FROM assessments WHERE prospect_id = p.id
        UNION SELECT run_id FROM communities WHERE prospect_id = p.id
      )) AS runCount
    FROM prospects p
    LEFT JOIN runs r ON r.id = (
      SELECT lr.id FROM runs lr WHERE lr.id IN (
        SELECT run_id FROM assessments WHERE prospect_id = p.id
        UNION SELECT run_id FROM communities WHERE prospect_id = p.id
      ) ORDER BY lr.started_at DESC, lr.rowid DESC LIMIT 1
    )
    LEFT JOIN assessments a ON a.prospect_id = p.id AND a.run_id = r.id
    LEFT JOIN communities c ON c.id = (SELECT id FROM communities WHERE prospect_id = p.id AND run_id = r.id
      ORDER BY (filter_status = 'excluded'), (verification_status = 'unverified'), observed_at DESC, rowid DESC LIMIT 1)
    WHERE COALESCE(c.filter_status, 'match') != 'excluded'
    ORDER BY a.score DESC, p.created_at DESC, p.id
  `).all()
  return rows.map(row => ({ ...row,
    signals: JSON.parse(String(row.signalsJson ?? '{}')),stageErrors: JSON.parse(String(row.stageErrorsJson ?? '{}')),
    permissionEvidence: JSON.parse(String(row.permissionEvidenceJson ?? '[]')),
    leaders: db.prepare('SELECT name,role,profile_url AS profileUrl,business_route AS businessRoute,status,observed_at AS observedAt,role_evidence_json AS roleEvidenceJson,contact_evidence_json AS contactEvidenceJson FROM community_leaders WHERE community_id=?').all(row.communityId).map(l => ({ ...l,roleEvidence: JSON.parse(String(l.roleEvidenceJson)),contactEvidence: JSON.parse(String(l.contactEvidenceJson ?? '[]')) })),
  }))
}
