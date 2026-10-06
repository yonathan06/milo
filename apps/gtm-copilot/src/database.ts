import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { searchQuerySchema, type SearchQuery } from './query-planner.ts';
import { assessmentRow, assessmentSummary } from './assessment-state.ts';
import type { AssessmentAttempt } from './result-assessment.ts';
import type { EnrichmentAttempt } from './community-enrichment.ts';
import { sourcesAreFresh, hasRecentActivity, type OutreachStatus } from './outreach-verification.ts';

export interface MarketingSegment {
  id: number;
  name: string;
  description: string;
  created_at: string;
}
export interface MarketingSegmentCountry {
  id: number;
  marketing_segment_id: number;
  country_code: string;
  created_at: string;
}
export interface MarketingSegmentCountryQuery extends SearchQuery {
  id: number;
  marketing_segment_country_id: number;
  language: string;
  created_at: string;
}

export interface SearchResultInput {
  url: string;
  title: string;
  description: string;
  rank: number;
}

export interface StoredSearchResult extends SearchResultInput {
  id: number;
  created_at: string;
  collected_at: string;
}

const searchResultSchema = z.object({
  url: z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Expected an HTTP(S) URL.'),
  title: z.string(),
  description: z.string(),
  rank: z.number().int().min(1).max(50),
});

const segmentSchema = z.object({
  name: z.string().trim().min(1).max(4000),
  description: z.string().trim().max(4000).default(''),
});
const countryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a two-letter country code, e.g. DE.');

export const defaultDatabasePath = fileURLToPath(new URL('../data/gtm-copilot.sqlite', import.meta.url));

/** Local SQLite store. Countries are explicit, never inferred from query languages. */
export class MarketingDatabase {
  private readonly db: DatabaseSync;
  readonly path: string;

  constructor(path = process.env.GTM_DATABASE_PATH ?? defaultDatabasePath, options: { initializeSchema?: boolean } = {}) {
    this.path = path === ':memory:' ? path : resolve(path);
    if (this.path !== ':memory:') {
      if (options.initializeSchema === false) {
        if (!existsSync(this.path)) throw new Error('Initialize the SQLite database with the CLI before generating queries.');
      } else mkdirSync(dirname(this.path), { recursive: true });
    }
    this.db = new DatabaseSync(this.path);
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
      // Web mutations use an already initialized database; only the CLI performs migrations.
      if (options.initializeSchema === false) return;
      this.db.exec('BEGIN IMMEDIATE;');
      this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
      // CREATE TABLE IF NOT EXISTS cannot evolve databases created by earlier versions.
      const columns = new Set(this.db.prepare('PRAGMA table_info(search_result_enrichments)').all().map((row) => String(row.name)));
      for (const [name, definition] of [
        ['scrape_metadata_json', "TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(scrape_metadata_json))"],
        ['verification_json', 'TEXT CHECK (verification_json IS NULL OR json_valid(verification_json))'],
        ['outreach_status', "TEXT NOT NULL DEFAULT 'needs_review' CHECK (outreach_status IN ('needs_review', 'do_not_contact', 'review_candidate', 'approved', 'rejected'))"],
      ]) {
        if (!columns.has(name!)) this.db.exec(`ALTER TABLE search_result_enrichments ADD COLUMN ${name} ${definition};`);
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS search_result_enrichments_outreach_status ON search_result_enrichments(outreach_status, result_id, id DESC);');
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  createSegment(input: { name: string; description?: string }): MarketingSegment {
    const { name, description } = segmentSchema.parse(input);
    return this.db.prepare('INSERT INTO marketing_segments (name, description) VALUES (?, ?) RETURNING *')
      .get(name, description) as unknown as MarketingSegment;
  }

  getSegment(id: number): MarketingSegment | undefined {
    return this.db.prepare('SELECT * FROM marketing_segments WHERE id = ?')
      .get(id) as unknown as MarketingSegment | undefined;
  }

  listSegments(): MarketingSegment[] {
    return this.db.prepare('SELECT * FROM marketing_segments ORDER BY id').all() as unknown as MarketingSegment[];
  }

  updateSegment(id: number, input: { name: string; description?: string }): MarketingSegment | undefined {
    const { name, description } = segmentSchema.parse(input);
    return this.db.prepare('UPDATE marketing_segments SET name = ?, description = ? WHERE id = ? RETURNING *')
      .get(name, description, id) as unknown as MarketingSegment | undefined;
  }

  addCountry(segmentId: number, countryCode: string): MarketingSegmentCountry {
    return this.db.prepare('INSERT INTO marketing_segment_countries (marketing_segment_id, country_code) VALUES (?, ?) RETURNING *')
      .get(segmentId, countryCodeSchema.parse(countryCode)) as unknown as MarketingSegmentCountry;
  }

  getCountry(id: number): MarketingSegmentCountry | undefined {
    return this.db.prepare('SELECT * FROM marketing_segment_countries WHERE id = ?')
      .get(id) as unknown as MarketingSegmentCountry | undefined;
  }

  listCountries(segmentId: number): MarketingSegmentCountry[] {
    return this.db.prepare('SELECT * FROM marketing_segment_countries WHERE marketing_segment_id = ? ORDER BY id')
      .all(segmentId) as unknown as MarketingSegmentCountry[];
  }

  addQuery(countryId: number, language: string, input: SearchQuery): MarketingSegmentCountryQuery {
    const query = searchQuerySchema.parse(input);
    const canonicalLanguage = Intl.getCanonicalLocales(language.trim())[0];
    if (!canonicalLanguage) throw new Error('A BCP 47 language tag is required.');
    return this.db.prepare(`INSERT INTO marketing_segment_country_queries
      (marketing_segment_country_id, language, query, platform, rationale)
      VALUES (?, ?, ?, ?, ?) RETURNING *`)
      .get(countryId, canonicalLanguage, query.query, query.platform, query.rationale) as unknown as MarketingSegmentCountryQuery;
  }

  /** Append a complete batch atomically; exact country/language/query matches retain their IDs. */
  saveQueries(countryId: number, inputs: (SearchQuery & { language: string })[]): MarketingSegmentCountryQuery[] {
    const queries = inputs.map((input) => {
      const language = Intl.getCanonicalLocales(input.language.trim())[0];
      if (!language) throw new Error('A BCP 47 language tag is required.');
      return { ...searchQuerySchema.parse(input), language };
    });
    const statement = this.db.prepare(`INSERT INTO marketing_segment_country_queries
      (marketing_segment_country_id, language, query, platform, rationale)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (marketing_segment_country_id, language, query)
      DO UPDATE SET platform = excluded.platform, rationale = excluded.rationale
      RETURNING *`);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const rows = queries.map((query) => statement.get(
        countryId, query.language, query.query, query.platform, query.rationale,
      ) as unknown as MarketingSegmentCountryQuery);
      this.db.exec('COMMIT;');
      return rows;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  getQuery(id: number): MarketingSegmentCountryQuery | undefined {
    return this.db.prepare('SELECT * FROM marketing_segment_country_queries WHERE id = ?')
      .get(id) as unknown as MarketingSegmentCountryQuery | undefined;
  }

  listQueries(countryId?: number): MarketingSegmentCountryQuery[] {
    if (countryId === undefined) {
      return this.db.prepare('SELECT * FROM marketing_segment_country_queries ORDER BY id')
        .all() as unknown as MarketingSegmentCountryQuery[];
    }
    return this.db.prepare('SELECT * FROM marketing_segment_country_queries WHERE marketing_segment_country_id = ? ORDER BY id')
      .all(countryId) as unknown as MarketingSegmentCountryQuery[];
  }

  hasQueryBeenSearched(queryId: number): boolean {
    return !!this.db.prepare(`SELECT 1 FROM search_query_completions WHERE query_id = ?
      UNION ALL SELECT 1 FROM search_query_results WHERE query_id = ? LIMIT 1`).get(queryId, queryId);
  }

  /** Append provenance atomically. Re-runs update metadata/rank without duplicating URLs or links. */
  saveSearchResults(queryId: number, inputs: SearchResultInput[]): StoredSearchResult[] {
    if (!this.getQuery(queryId)) throw new Error(`Search query ${queryId} does not exist.`);
    const results = z.array(searchResultSchema).max(50).parse(inputs);
    const upsertResult = this.db.prepare(`INSERT INTO search_results (url, title, description)
      VALUES (?, ?, ?) ON CONFLICT (url)
      DO UPDATE SET title = excluded.title, description = excluded.description RETURNING id`);
    const upsertLink = this.db.prepare(`INSERT INTO search_query_results (query_id, result_id, rank)
      VALUES (?, ?, ?) ON CONFLICT (query_id, result_id)
      DO UPDATE SET rank = excluded.rank, collected_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const seen = new Set<string>();
      for (const result of results) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        const row = upsertResult.get(result.url, result.title, result.description) as { id: number };
        upsertLink.run(queryId, row.id, result.rank);
      }
      this.db.prepare(`INSERT INTO search_query_completions (query_id) VALUES (?)
        ON CONFLICT (query_id) DO UPDATE SET searched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).run(queryId);
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
    return this.listSearchResults(queryId);
  }

  listSearchResults(queryId: number): StoredSearchResult[] {
    return this.db.prepare(`SELECT r.*, qr.rank, qr.collected_at FROM search_results r
      JOIN search_query_results qr ON qr.result_id = r.id
      WHERE qr.query_id = ? ORDER BY qr.rank, r.id`).all(queryId) as unknown as StoredSearchResult[];
  }

  getSearchResult(id: number): (Omit<StoredSearchResult, 'rank' | 'collected_at'>) | undefined {
    return this.db.prepare('SELECT * FROM search_results WHERE id = ?')
      .get(id) as unknown as Omit<StoredSearchResult, 'rank' | 'collected_at'> | undefined;
  }

  getResultMarketingContext(resultId: number) {
    return this.db.prepare(`SELECT q.id AS queryId, q.query, s.name AS segment, s.description AS segmentDescription,
      c.country_code AS countryCode, q.language FROM search_query_results qr
      JOIN marketing_segment_country_queries q ON q.id = qr.query_id
      JOIN marketing_segment_countries c ON c.id = q.marketing_segment_country_id
      JOIN marketing_segments s ON s.id = c.marketing_segment_id
      WHERE qr.result_id = ? ORDER BY q.id`).all(resultId) as unknown as {
        queryId: number; query: string; segment: string; segmentDescription: string; countryCode: string; language: string;
      }[];
  }

  saveEnrichment(attempt: EnrichmentAttempt) {
    const scrapedAt = attempt.scrapeMetadata?.scrapeCompletedAt ?? new Date().toISOString();
    const row = this.db.prepare(`INSERT INTO search_result_enrichments
      (result_id, platform, status, sources_json, data_json, limitations_json, error,
        scrape_metadata_json, verification_json, outreach_status, scraped_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, scraped_at`)
      .get(attempt.resultId, attempt.platform, attempt.status, JSON.stringify(attempt.sources),
        attempt.data === null ? null : JSON.stringify(attempt.data), JSON.stringify(attempt.limitations), attempt.error,
        JSON.stringify(attempt.scrapeMetadata ?? {}), attempt.verification ? JSON.stringify(attempt.verification) : null,
        attempt.outreachStatus ?? 'needs_review', scrapedAt) as unknown as { id: number; scraped_at: string };
    return { ...attempt, id: row.id, scrapedAt: row.scraped_at };
  }

  private enrichmentRow(row: Record<string, unknown>) {
    return {
      id: Number(row.id), resultId: Number(row.result_id), platform: String(row.platform),
      status: String(row.status), scrapedAt: String(row.scraped_at),
      sources: JSON.parse(String(row.sources_json)),
      data: row.data_json === null ? null : JSON.parse(String(row.data_json)),
      limitations: JSON.parse(String(row.limitations_json)), error: row.error,
      scrapeMetadata: JSON.parse(String(row.scrape_metadata_json)),
      verification: row.verification_json === null ? null : JSON.parse(String(row.verification_json)),
      outreachStatus: String(row.outreach_status) as OutreachStatus,
    };
  }

  saveAssessment(attempt: Omit<AssessmentAttempt, 'id' | 'assessedAt'>) {
    const row = this.db.prepare(`INSERT INTO search_result_assessments
      (enrichment_id, status, assessment_json, error, context_json, context_fingerprint, rubric_version, model_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(attempt.enrichmentId, attempt.status,
      attempt.assessment ? JSON.stringify(attempt.assessment) : null, attempt.error, JSON.stringify(attempt.context),
      attempt.contextFingerprint, attempt.rubricVersion, attempt.modelId)!;
    return assessmentRow(row);
  }

  listAssessments(resultId: number) {
    return this.db.prepare(`SELECT a.* FROM search_result_assessments a JOIN search_result_enrichments e ON e.id = a.enrichment_id
      WHERE e.result_id = ? ORDER BY a.id DESC`).all(resultId).map(assessmentRow);
  }

  getAssessmentSummary(resultId: number) {
    return assessmentSummary(this.listEnrichments(resultId)[0], this.listAssessments(resultId)[0], this.getResultMarketingContext(resultId));
  }

  getEnrichment(id: number) {
    const row = this.db.prepare('SELECT * FROM search_result_enrichments WHERE id = ?').get(id);
    return row ? this.enrichmentRow(row) : undefined;
  }

  listEnrichments(resultId: number) {
    return this.db.prepare('SELECT * FROM search_result_enrichments WHERE result_id = ? ORDER BY id DESC')
      .all(resultId).map((row) => this.enrichmentRow(row));
  }

  /** Only the newest attempt per URL: a failed/blocked refresh cannot silently revive old approvals. */
  listOutreachCandidates(status: OutreachStatus = 'review_candidate') {
    return this.db.prepare(`SELECT e.* FROM search_result_enrichments e
      WHERE e.outreach_status = ? AND e.data_json IS NOT NULL
      AND e.id = (SELECT max(newer.id) FROM search_result_enrichments newer WHERE newer.result_id = e.result_id)
      ORDER BY e.scraped_at DESC, e.id DESC`).all(status).map((row) => this.enrichmentRow(row))
      .filter((row) => status !== 'approved' || sourcesAreFresh(row.sources) && hasRecentActivity(row.data))
      .map((row) => ({ ...row, reviews: this.listOutreachReviews(row.id) }));
  }

  listOutreachReviews(enrichmentId: number) {
    return this.db.prepare('SELECT * FROM enrichment_outreach_reviews WHERE enrichment_id = ? ORDER BY id DESC').all(enrichmentId);
  }

  /** Explicit human sign-off for a specific channel; never auto-approve or send outreach. */
  recordOutreachReview(enrichmentId: number, input: {
    decision: 'approved' | 'rejected'; channel: 'communityPosting' | 'directContact';
    reviewer: string; notes: string; permissionConfirmed?: boolean;
  }) {
    const review = z.object({
      decision: z.enum(['approved', 'rejected']), channel: z.enum(['communityPosting', 'directContact']),
      reviewer: z.string().trim().min(1).max(500), notes: z.string().trim().min(1).max(4000),
      permissionConfirmed: z.boolean().default(false),
    }).parse(input);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const enrichment = this.getEnrichment(enrichmentId);
      if (!enrichment) throw new Error(`Enrichment ${enrichmentId} does not exist.`);
      if (review.decision === 'approved') {
        const verification = enrichment.verification;
        const newest = this.listEnrichments(enrichment.resultId)[0];
        if (newest?.id !== enrichmentId) throw new Error('Only the latest scrape can be approved; review the refreshed evidence.');
        if (!enrichment.data || !verification?.assessment || verification.error || !verification.checks.factsSupported
          || !verification.checks.quotesPresent || !verification.checks.anglesSupported || !hasRecentActivity(enrichment.data)
          || !sourcesAreFresh(enrichment.sources) || !['high', 'medium'].includes(verification.assessment.audienceFit.rating)
          || !verification.assessment.audienceFit.evidence.length || !enrichment.scrapeMetadata.marketingContext?.length) {
          throw new Error('Approval requires fresh, supported facts, activity and outreach angles with verified audience fit.');
        }
        if (verification.status === 'do_not_contact' || verification.channels[review.channel] === 'blocked') throw new Error('This outreach channel is prohibited or not a marketing fit.');
        if (!review.permissionConfirmed) throw new Error('Explicitly confirm channel-specific permission and describe its evidence in notes.');
        if (review.channel === 'directContact' && !verification.assessment.contactChecks.some((check: { ownershipExplicit: boolean; role: string; evidence: unknown[] }) => check.ownershipExplicit && check.role !== 'unknown' && check.evidence.length)) {
          throw new Error('Direct outreach needs an explicitly verified admin/business contact route.');
        }
      }
      const row = this.db.prepare(`INSERT INTO enrichment_outreach_reviews
        (enrichment_id, decision, channel, reviewer, notes, permission_confirmed) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`)
        .get(enrichmentId, review.decision, review.channel, review.reviewer, review.notes, review.permissionConfirmed ? 1 : 0);
      this.db.prepare('UPDATE search_result_enrichments SET outreach_status = ? WHERE id = ?').run(review.decision, enrichmentId);
      this.db.exec('COMMIT;');
      return row;
    } catch (error) { this.db.exec('ROLLBACK;'); throw error; }
  }

  listResultQueryIds(resultId: number): number[] {
    return this.db.prepare('SELECT query_id FROM search_query_results WHERE result_id = ? ORDER BY query_id')
      .all(resultId).map((row) => Number(row.query_id));
  }

  deleteSegment(id: number): boolean {
    return this.db.prepare('DELETE FROM marketing_segments WHERE id = ?').run(id).changes > 0;
  }

  deleteCountry(id: number): boolean {
    return this.db.prepare('DELETE FROM marketing_segment_countries WHERE id = ?').run(id).changes > 0;
  }

  deleteQuery(id: number): boolean {
    return this.db.prepare('DELETE FROM marketing_segment_country_queries WHERE id = ?').run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
