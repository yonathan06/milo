import type { DatabaseSync } from 'node:sqlite';
import { linkFingerprint, rankingModel, rankingRubric, type Link } from '../../src/link-ranking.ts';

export interface LinkRankingDisplay { jev_score: number; jev_confidence: number }
/** Browsing older databases is safe; only current snippet/model/rubric scores are displayed. */
export function readLinkRankingDisplay(db: DatabaseSync) {
  const rankings = new Map<number, LinkRankingDisplay>();
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='search_result_link_rankings'").get()) return rankings;
  const rows = db.prepare(`SELECT r.id,r.url,r.title,r.description,j.score,j.confidence,j.input_fingerprint
    FROM search_result_link_rankings j JOIN search_results r ON r.id=j.result_id
    WHERE j.status='complete' AND j.model_id=? AND j.rubric_version=? AND j.score IS NOT NULL AND j.confidence IS NOT NULL`)
    .all(process.env.GTM_LINK_RANKING_MODEL ?? rankingModel, rankingRubric) as (Link & {score:number; confidence:number; input_fingerprint:string})[];
  for (const row of rows) if (linkFingerprint(row) === row.input_fingerprint) rankings.set(row.id, { jev_score: row.score, jev_confidence: row.confidence });
  return rankings;
}
