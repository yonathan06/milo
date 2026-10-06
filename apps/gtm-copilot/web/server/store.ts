import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { assessmentRow, assessmentSummary, type AssessmentSummary } from '../../src/assessment-state.ts';
import type { AssessmentAttempt, AssessmentContext } from '../../src/result-assessment.ts';
import { hasEnrichmentData } from '../../src/enrichment-data.ts';
import { readResultsPage } from './results-page-store.ts';
import { readLinkRankingDisplay } from './link-ranking-display.ts';
import type { ResultsPageRequest } from '../results-page.ts';

export interface Segment { id: number; name: string; description: string; created_at: string; country_count: number; query_count: number; result_count: number; unsearched_query_count: number }
export interface Country { id: number; country_code: string }
export interface Query { id: number; query: string; language: string; platform: string; rationale: string; created_at: string; country_code: string; segment_id: number; segment_name: string; result_count: number }
export interface Result extends Partial<AssessmentSummary> { id: number; url: string; title: string; description: string; created_at: string; enriched?: boolean; audience_fit?: string | null; jev_score?: number; jev_confidence?: number }
export interface RankedResult extends Result { rank: number; collected_at: string }
export interface ResultDiscovery { query_id: number; query: string; country_code: string; language: string; rank: number; collected_at: string }
export interface SegmentResult extends Result { discoveries: ResultDiscovery[] }
export interface AllResultDiscovery extends ResultDiscovery { segment_id: number; segment_name: string }
export interface AllResult extends Result { discoveries: AllResultDiscovery[] }
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Review { id: number; decision: string; channel: string; reviewer: string; notes: string; permission_confirmed: number; reviewed_at: string }
export interface Enrichment { id: number; platform: string; status: string; outreach_status: string; scraped_at: string; error: string | null; data: Json; sources: Json; limitations: Json; scrapeMetadata: Json; verification: Json; reviews: Review[] }

const enrichmentSelect = `(EXISTS (SELECT 1 FROM search_result_enrichments e WHERE e.result_id = r.id AND e.status IN ('complete', 'partial') AND has_enrichment_data(e.data_json) = 1)) AS enriched,
  (SELECT json_extract(e.verification_json, '$.assessment.audienceFit.rating') FROM search_result_enrichments e WHERE e.result_id = r.id AND e.status IN ('complete', 'partial') AND has_enrichment_data(e.data_json) = 1 ORDER BY e.id DESC LIMIT 1) AS audience_fit`;

const querySelect = `SELECT q.*, c.country_code, s.id AS segment_id, s.name AS segment_name,
  (SELECT count(*) FROM search_query_results qr WHERE qr.query_id = q.id) AS result_count
  FROM marketing_segment_country_queries q
  JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
  JOIN marketing_segments s ON s.id = c.marketing_segment_id`;

/** Never initializes or migrates the CLI database. A missing file is an error, not an empty new DB. */
export function openReadStore(path = process.env.GTM_DATABASE_PATH ?? resolve('data/gtm-copilot.sqlite')) {
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
  db.function('has_enrichment_data', { deterministic: true }, (value) => {
    try { return hasEnrichmentData(JSON.parse(String(value))) ? 1 : 0; } catch { return 0; }
  });
  const all = <T>(sql: string, ...params: number[]) => db.prepare(sql).all(...params) as unknown as T[];
  const get = <T>(sql: string, id: number) => db.prepare(sql).get(id) as unknown as T | undefined;
  const context = (id: number) => all<AssessmentContext[number]>(`SELECT q.id AS queryId, q.query, s.name AS segment, s.description AS segmentDescription,
    c.country_code AS countryCode, q.language FROM search_query_results qr
    JOIN marketing_segment_country_queries q ON q.id = qr.query_id JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
    JOIN marketing_segments s ON s.id = c.marketing_segment_id WHERE qr.result_id = ? ORDER BY q.id`, id);
  const assessments = (id: number): AssessmentAttempt[] => all<Record<string, unknown>>(`SELECT a.* FROM search_result_assessments a
    JOIN search_result_enrichments e ON e.id = a.enrichment_id WHERE e.result_id = ? ORDER BY a.id DESC`, id).map(assessmentRow);
  let linkRankings: ReturnType<typeof readLinkRankingDisplay> | undefined;
  const project = <T extends Result>(result: T): T & AssessmentSummary => {
    const row = get<Record<string, unknown>>('SELECT * FROM search_result_enrichments WHERE result_id = ? ORDER BY id DESC LIMIT 1', result.id);
    const enrichment = row ? { id: Number(row.id), status: String(row.status), data: row.data_json == null ? null : JSON.parse(String(row.data_json)), sources: JSON.parse(String(row.sources_json)) } : undefined;
    linkRankings ??= readLinkRankingDisplay(db);
    return { ...result, ...linkRankings.get(result.id), ...assessmentSummary(enrichment, assessments(result.id)[0], context(result.id)) };
  };
  const hasSearchTracking = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_query_completions'").get();
  const unsearched = `NOT EXISTS (SELECT 1 FROM search_query_results qr WHERE qr.query_id = q.id)${hasSearchTracking ? ' AND NOT EXISTS (SELECT 1 FROM search_query_completions sc WHERE sc.query_id = q.id)' : ''}`;
  const segments = () => all<Segment>(`SELECT s.*,
    (SELECT count(*) FROM marketing_segment_countries c WHERE c.marketing_segment_id = s.id) AS country_count,
    (SELECT count(*) FROM marketing_segment_country_queries q JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id WHERE c.marketing_segment_id = s.id) AS query_count,
    (SELECT count(*) FROM marketing_segment_country_queries q JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id WHERE c.marketing_segment_id = s.id AND ${unsearched}) AS unsearched_query_count,
    (SELECT count(DISTINCT qr.result_id) FROM search_query_results qr JOIN marketing_segment_country_queries q ON q.id = qr.query_id JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id WHERE c.marketing_segment_id = s.id) AS result_count
    FROM marketing_segments s ORDER BY s.name COLLATE NOCASE, s.id`);
  return {
    segments,
    unsearchedQueries() {
      if (!hasSearchTracking) throw new Error('Initialize search tracking with db:init.');
      return all<{ queryId: number; segmentId: number }>(`SELECT q.id AS queryId, c.marketing_segment_id AS segmentId
        FROM marketing_segment_country_queries q JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
        WHERE ${unsearched} ORDER BY c.marketing_segment_id, q.id`);
    },
    resultsPage(request: ResultsPageRequest) {
      return readResultsPage(db, request);
    },
    results() {
      // Keep unlinked results too: deleting a query does not delete its saved URLs.
      const results = all<Result>(`SELECT r.*, ${enrichmentSelect} FROM search_results r ORDER BY created_at DESC, id DESC`);
      const discoveries = all<AllResultDiscovery & { result_id: number }>(`SELECT qr.result_id, qr.query_id, q.query,
        c.country_code, q.language, qr.rank, qr.collected_at, s.id AS segment_id, s.name AS segment_name
        FROM search_query_results qr
        JOIN marketing_segment_country_queries q ON q.id = qr.query_id
        JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
        JOIN marketing_segments s ON s.id = c.marketing_segment_id
        ORDER BY qr.collected_at DESC, qr.rank, q.id`);
      const byId = new Map<number, AllResult>(results.map((result) => [result.id, { ...result, discoveries: [] }]));
      for (const { result_id, ...discovery } of discoveries) byId.get(result_id)?.discoveries.push(discovery);
      return [...byId.values()].map(project);
    },
    segment(id: number) {
      const segment = get<Omit<Segment, 'country_count' | 'query_count' | 'result_count'>>('SELECT * FROM marketing_segments WHERE id = ?', id);
      if (!segment) return null;
      const rows = all<Result & ResultDiscovery>(`SELECT r.*, ${enrichmentSelect}, qr.query_id, q.query, c.country_code, q.language, qr.rank, qr.collected_at
        FROM search_results r
        JOIN search_query_results qr ON qr.result_id = r.id
        JOIN marketing_segment_country_queries q ON q.id = qr.query_id
        JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
        WHERE c.marketing_segment_id = ?
        ORDER BY qr.collected_at DESC, r.id DESC, qr.rank, q.id`, id);
      const results = new Map<number, SegmentResult>();
      for (const row of rows) {
        if (!results.has(row.id)) results.set(row.id, { id: row.id, url: row.url, title: row.title, description: row.description, created_at: row.created_at, enriched: row.enriched, audience_fit: row.audience_fit, discoveries: [] });
        results.get(row.id)!.discoveries.push({ query_id: row.query_id, query: row.query, country_code: row.country_code, language: row.language, rank: row.rank, collected_at: row.collected_at });
      }
      return { segment, countries: all<Country>('SELECT id, country_code FROM marketing_segment_countries WHERE marketing_segment_id = ? ORDER BY country_code', id), queries: all<Query>(`${querySelect} WHERE s.id = ? ORDER BY c.country_code, q.language, q.id`, id), results: [...results.values()].map(project) };
    },
    query(id: number) {
      const query = get<Query>(`${querySelect} WHERE q.id = ?`, id);
      if (!query) return null;
      return { query, results: all<RankedResult>(`SELECT r.*, qr.rank, qr.collected_at FROM search_results r JOIN search_query_results qr ON qr.result_id = r.id WHERE qr.query_id = ? ORDER BY qr.rank, r.id`, id) };
    },
    result(id: number) {
      const result = get<Result>(`SELECT r.*, ${enrichmentSelect} FROM search_results r WHERE r.id = ?`, id);
      if (!result) return null;
      const enrichments = all<Record<string, string | number | null>>('SELECT * FROM search_result_enrichments WHERE result_id = ? ORDER BY id DESC', id).map((row): Enrichment => {
        const json = (key: string): Json => row[key] == null ? null : JSON.parse(String(row[key]));
        return { id: Number(row.id), platform: String(row.platform), status: String(row.status), outreach_status: String(row.outreach_status), scraped_at: String(row.scraped_at), error: row.error == null ? null : String(row.error), data: json('data_json'), sources: json('sources_json'), limitations: json('limitations_json'), scrapeMetadata: json('scrape_metadata_json'), verification: json('verification_json'), reviews: all<Review>('SELECT * FROM enrichment_outreach_reviews WHERE enrichment_id = ? ORDER BY id DESC', Number(row.id)) };
      });
      return { result: project(result), assessments: assessments(id), queries: all<Query>(`${querySelect} JOIN search_query_results qr ON qr.query_id = q.id WHERE qr.result_id = ? ORDER BY q.id`, id), enrichments };
    },
    close: () => db.close(),
  };
}

export function withReadStore<T>(read: (store: ReturnType<typeof openReadStore>) => T): T {
  const store = openReadStore();
  try { return read(store); } finally { store.close(); }
}
