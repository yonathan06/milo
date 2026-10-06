import { reportDiagnostic } from './work-diagnostics.ts';
import { enrichSearchResult } from './community-enrichment.ts';
import { assessSavedResult } from './result-assessment.ts';
import type { LanguageModel } from 'ai';
import type { MarketingDatabase } from './database.ts';

export type ResultPhase = 'enrichment' | 'assessment';
export async function enrichAndAssess(resultId: number, db: MarketingDatabase, options: NonNullable<Parameters<typeof enrichSearchResult>[2]> & {
  assessmentModel?: LanguageModel; assessmentOnly?: boolean; force?: boolean; onPhase?: (phase: ResultPhase) => void;
  enrich?: typeof enrichSearchResult; assess?: typeof assessSavedResult;
} = {}) {
  const summary = db.getAssessmentSummary(resultId);
  if (summary.assessment_status === 'complete' && !options.force) {
    reportDiagnostic(options.onDiagnostic, { step: 'assessment', status: 'skipped', elapsedMs: 0, fields: { reason: 'Current assessment already exists' } });
    return { status: 'skipped' as const, enrichment: db.listEnrichments(resultId)[0], assessment: db.listAssessments(resultId)[0] };
  }
  let enrichment: ReturnType<MarketingDatabase['listEnrichments']>[number] | Awaited<ReturnType<typeof enrichSearchResult>> | undefined = db.listEnrichments(resultId)[0];
  if (!summary.assessment_ready) {
    if (options.assessmentOnly) throw new Error('The latest enrichment must contain evidenced facts before assessment.');
    options.onPhase?.('enrichment');
    enrichment = await (options.enrich ?? enrichSearchResult)(resultId, db, options);
    if (!['complete', 'partial'].includes(enrichment.status)) return { status: enrichment.status as 'failed' | 'blocked', enrichment, assessment: null };
  }
  if (summary.assessment_ready) reportDiagnostic(options.onDiagnostic, { step: 'collection', status: 'skipped', elapsedMs: 0, fields: { reason: 'Reusing meaningful saved enrichment' } });
  options.onPhase?.('assessment');
  const assessment = await (options.assess ?? assessSavedResult)(resultId, db, { model: options.assessmentModel ?? options.verificationModel ?? options.model, abortSignal: options.abortSignal, onDiagnostic: options.onDiagnostic });
  return { status: assessment.status, enrichment, assessment };
}
