import { contextFingerprint, rubricVersion, type AssessmentAttempt, type AssessmentContext, type Permission } from './result-assessment.ts';
import { hasEnrichmentData } from './enrichment-data.ts';
import { sourcesAreFresh } from './outreach-verification.ts';
import type { Source } from './community-scraper.ts';

export interface AssessmentSummary {
  assessment_status: 'not_enriched' | 'pending' | 'complete' | 'failed' | 'stale';
  match_score: number | null; match_confidence: string | null; posting_permission: Permission['status']; admin_contact_permission: Permission['status'];
  assessment_ready: boolean;
}
export function assessmentSummary(enrichment: { id: number; status: string; data: unknown; sources: Source[] } | undefined, attempt: AssessmentAttempt | undefined, context: AssessmentContext, now = Date.now()): AssessmentSummary {
  const ready = Boolean(enrichment && ['complete', 'partial'].includes(enrichment.status) && hasEnrichmentData(enrichment.data));
  const base: AssessmentSummary = { assessment_status: ready ? 'pending' : 'not_enriched', match_score: null, match_confidence: null, posting_permission: 'unknown', admin_contact_permission: 'unknown', assessment_ready: ready };
  if (!attempt) return base;
  if (!ready || attempt.enrichmentId !== enrichment!.id || attempt.contextFingerprint !== contextFingerprint(context) || attempt.rubricVersion !== rubricVersion || !sourcesAreFresh(enrichment!.sources, now)) return { ...base, assessment_status: 'stale' };
  if (attempt.status === 'failed' || !attempt.assessment) return { ...base, assessment_status: 'failed' };
  return { ...base, assessment_status: 'complete', match_score: attempt.assessment.score, match_confidence: attempt.assessment.confidence, posting_permission: attempt.assessment.posting.status, admin_contact_permission: attempt.assessment.adminContact.status };
}
export function assessmentRow(row: Record<string, unknown>): AssessmentAttempt {
  return { id: Number(row.id), enrichmentId: Number(row.enrichment_id), status: String(row.status) as AssessmentAttempt['status'],
    assessment: row.assessment_json == null ? null : JSON.parse(String(row.assessment_json)), error: row.error == null ? null : String(row.error),
    context: JSON.parse(String(row.context_json)), contextFingerprint: String(row.context_fingerprint), rubricVersion: String(row.rubric_version), modelId: row.model_id == null ? null : String(row.model_id), assessedAt: String(row.assessed_at) };
}
