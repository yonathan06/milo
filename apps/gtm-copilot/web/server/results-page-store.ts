import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { assessmentRow, assessmentSummary, type AssessmentSummary } from '../../src/assessment-state.ts';
import type { AssessmentContext } from '../../src/result-assessment.ts';
import type { AllResult, AllResultDiscovery, Result } from './store.ts';
import type { ResultsPageRequest } from '../results-page.ts';

/** Only enriched/assessed URLs need freshness and context checks. Batch these instead of
 * issuing three projection queries for every saved URL (including un-enriched URLs). */
function summaries(db: DatabaseSync) {
  const rows = db.prepare(`SELECT e.*,
    EXISTS (SELECT 1 FROM search_result_enrichments old WHERE old.result_id = e.result_id
      AND old.status IN ('complete', 'partial') AND has_enrichment_data(old.data_json) = 1) AS enriched,
    (SELECT json_extract(old.verification_json, '$.assessment.audienceFit.rating') FROM search_result_enrichments old
      WHERE old.result_id = e.result_id AND old.status IN ('complete', 'partial') AND has_enrichment_data(old.data_json) = 1
      ORDER BY old.id DESC LIMIT 1) AS audience_fit
    FROM search_result_enrichments e JOIN search_results r ON r.id = e.result_id
    WHERE e.id = (SELECT max(latest.id) FROM search_result_enrichments latest WHERE latest.result_id = e.result_id)`)
    .all() as Record<string, unknown>[];
  if (!rows.length) return new Map<number, AssessmentSummary & Pick<Result, 'enriched' | 'audience_fit'>>();
  const attempts = db.prepare(`SELECT a.*, e.result_id FROM search_result_assessments a
    JOIN search_result_enrichments e ON e.id = a.enrichment_id
    WHERE a.id = (SELECT max(other.id) FROM search_result_assessments other
      JOIN search_result_enrichments oe ON oe.id = other.enrichment_id WHERE oe.result_id = e.result_id)`).all() as Record<string, unknown>[];
  const byResult = new Map(attempts.map((row) => [Number(row.result_id), assessmentRow(row)]));
  const contexts = new Map<number, AssessmentContext>();
  // Context is only needed when checking an existing assessment.
  if (attempts.length) {
    const contextRows = db.prepare(`SELECT qr.result_id, q.id AS queryId, q.query, s.name AS segment, s.description AS segmentDescription,
      c.country_code AS countryCode, q.language FROM search_query_results qr
      JOIN marketing_segment_country_queries q ON q.id = qr.query_id
      JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
      JOIN marketing_segments s ON s.id = c.marketing_segment_id
      WHERE qr.result_id IN (SELECT value FROM json_each(?)) ORDER BY q.id`).all(JSON.stringify([...byResult.keys()]));
    for (const row of contextRows) {
      const { result_id, ...context } = row;
      const id = Number(result_id);
      if (!contexts.has(id)) contexts.set(id, []);
      contexts.get(id)!.push(context as unknown as AssessmentContext[number]);
    }
  }
  return new Map(rows.map((row) => {
    const id = Number(row.result_id);
    const summary = assessmentSummary({ id: Number(row.id), status: String(row.status),
      data: row.data_json == null ? null : JSON.parse(String(row.data_json)), sources: JSON.parse(String(row.sources_json)) },
    byResult.get(id), contexts.get(id) ?? []);
    return [id, { ...summary, enriched: Boolean(row.enriched), audience_fit: row.audience_fit as string | null }] as const;
  }));
}

export function readResultsPage(db: DatabaseSync, request: ResultsPageRequest) {
  const states = summaries(db);
  const params: SQLInputValue[] = [];
  const where: string[] = [];
  const discoveryFrom = `FROM search_query_results qr
    JOIN marketing_segment_country_queries q ON q.id = qr.query_id
    JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
    JOIN marketing_segments s ON s.id = c.marketing_segment_id`;
  if (request.countries.length || request.segments.length) {
    const conditions = ['qr.result_id = r.id'];
    if (request.countries.length) { conditions.push('c.country_code IN (SELECT value FROM json_each(?))'); params.push(JSON.stringify(request.countries)); }
    if (request.segments.length) { conditions.push('s.id IN (SELECT value FROM json_each(?))'); params.push(JSON.stringify(request.segments)); }
    where.push(`EXISTS (SELECT 1 ${discoveryFrom} WHERE ${conditions.join(' AND ')})`);
  }
  const search = request.search.trim().toLowerCase();
  if (search) {
    // A JS-backed scalar preserves Unicode case folding and literal substring semantics.
    db.function('matches_result_text', { deterministic: true }, (text) => String(text).toLowerCase().includes(search) ? 1 : 0);
    where.push(`matches_result_text(r.title || ' ' || r.url || ' ' || r.description || ' ' ||
      coalesce((SELECT group_concat(discovery_query, ' ') FROM (SELECT q.query AS discovery_query ${discoveryFrom}
        WHERE qr.result_id = r.id ORDER BY qr.collected_at DESC, qr.rank, q.id)), '')) = 1`);
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalCount = Number(db.prepare('SELECT count(*) AS n FROM search_results').get()!.n);
  const matchedCount = where.length ? Number(db.prepare(`SELECT count(*) AS n FROM search_results r ${filter}`).get(...params)!.n) : totalCount;
  const pageCount = Math.max(1, Math.ceil(matchedCount / request.pageSize));
  const page = Math.min(request.page, pageCount);
  const direction = request.descending ? 'DESC' : 'ASC';
  const score = "json_extract(summary.value, '$.match_score')";
  const textSort: Record<Exclude<ResultsPageRequest['sort'], 'fit'>, string> = {
    posting: "coalesce(json_extract(summary.value, '$.posting_permission'), 'unknown')",
    adminContact: "coalesce(json_extract(summary.value, '$.admin_contact_permission'), 'unknown')",
    result: "coalesce(nullif(r.title, ''), r.url)",
    countries: `(SELECT group_concat(country_code, ', ') FROM (SELECT DISTINCT c.country_code ${discoveryFrom} WHERE qr.result_id = r.id ORDER BY c.country_code))`,
    segments: `(SELECT group_concat(name, ', ') FROM (SELECT DISTINCT s.name ${discoveryFrom} WHERE qr.result_id = r.id ORDER BY s.name))`,
    collected: "coalesce((SELECT max(qr.collected_at) FROM search_query_results qr WHERE qr.result_id = r.id), '')",
  };
  // SQLite cannot register JS collations. Natural text order uses a compact key for numeric runs.
  db.function('result_sort_key', { deterministic: true }, (value) => String(value ?? '').toLowerCase().replace(/\d+/g, (digits) => digits.padStart(20, '0')));
  const order = request.sort === 'fit'
    ? `${score} IS NULL ASC, ${score} ${direction}, CASE WHEN ${score} IS NULL THEN coalesce(json_extract(summary.value, '$.enriched'), 0) ELSE 0 END DESC`
    : `result_sort_key(${textSort[request.sort]}) ${direction}`;
  const rows = db.prepare(`WITH summary_rows AS MATERIALIZED (SELECT CAST(key AS INTEGER) AS result_id, value FROM json_each(?))
    SELECT r.* FROM search_results r LEFT JOIN summary_rows summary ON summary.result_id = r.id
    ${filter} ORDER BY ${order}, r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`)
    .all(JSON.stringify(Object.fromEntries(states)), ...params, request.pageSize, (page - 1) * request.pageSize) as unknown as Result[];
  const discoveries = rows.length ? db.prepare(`SELECT qr.result_id, qr.query_id, q.query, c.country_code, q.language,
    qr.rank, qr.collected_at, s.id AS segment_id, s.name AS segment_name ${discoveryFrom}
    WHERE qr.result_id IN (SELECT value FROM json_each(?)) ORDER BY qr.collected_at DESC, qr.rank, q.id`)
    .all(JSON.stringify(rows.map((row) => row.id))) as unknown as (AllResultDiscovery & { result_id: number })[] : [];
  const byId = new Map<number, AllResult>(rows.map((row) => [row.id, { ...row, ...(states.get(row.id) ?? {
    ...assessmentSummary(undefined, undefined, []), enriched: false, audience_fit: null,
  }), discoveries: [] }]));
  for (const { result_id, ...discovery } of discoveries) byId.get(result_id)!.discoveries.push(discovery);
  const countries = db.prepare(`SELECT DISTINCT c.country_code ${discoveryFrom} ORDER BY c.country_code`).all().map((row) => String(row.country_code));
  const segments = db.prepare(`SELECT DISTINCT s.id, s.name ${discoveryFrom} ORDER BY s.name COLLATE NOCASE, s.id`).all().map((row) => [Number(row.id), String(row.name)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  return { results: [...byId.values()], page, pageCount, matchedCount, totalCount,
    enrichedCount: [...states.values()].filter((state) => state.enriched).length,
    pendingCount: totalCount - [...states.values()].filter((state) => state.assessment_status === 'complete').length,
    pendingAssessmentCount: [...states.values()].filter((state) => state.assessment_ready && state.assessment_status !== 'complete').length,
    countries, segments };
}
