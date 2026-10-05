import type { Result } from './server/store';

export function permissionLabel(status: string | undefined): string {
  return status === 'allowed' ? 'Allowed · review required' : status === 'approval_required' ? 'Approval required' : status === 'prohibited' ? 'Prohibited' : 'Unknown';
}
export function matchLabel(result: Result): string {
  if (result.assessment_status === 'complete') return result.match_score == null ? 'Enriched · match unknown' : `${result.match_score}/100`;
  if (result.assessment_status === 'failed') return 'Assessment failed';
  if (result.assessment_status === 'stale') return 'Stale · reassess';
  return result.enriched ? 'Assessment pending' : 'Not enriched';
}
export function compareMatchResults(a: Pick<Result, 'match_score' | 'enriched'>, b: Pick<Result, 'match_score' | 'enriched'>, descending = true): number {
  const aKnown = a.match_score != null; const bKnown = b.match_score != null;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (aKnown && bKnown) return (a.match_score! - b.match_score!) * (descending ? -1 : 1);
  return Number(Boolean(b.enriched)) - Number(Boolean(a.enriched));
}
