CREATE TABLE IF NOT EXISTS marketing_segments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS marketing_segment_countries (
  id INTEGER PRIMARY KEY,
  marketing_segment_id INTEGER NOT NULL REFERENCES marketing_segments(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL CHECK (country_code GLOB '[A-Z][A-Z]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (marketing_segment_id, country_code)
) STRICT;

CREATE TABLE IF NOT EXISTS marketing_segment_country_queries (
  id INTEGER PRIMARY KEY,
  marketing_segment_country_id INTEGER NOT NULL REFERENCES marketing_segment_countries(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (length(trim(language)) > 0),
  query TEXT NOT NULL CHECK (length(trim(query)) > 0),
  platform TEXT NOT NULL CHECK (platform IN ('web', 'reddit', 'facebook', 'linkedin', 'discord', 'slack', 'telegram', 'meetup', 'forum')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (marketing_segment_country_id, language, query)
) STRICT;

-- Successful searches are recorded even when the provider returns no URLs.
CREATE TABLE IF NOT EXISTS search_query_completions (
  query_id INTEGER PRIMARY KEY REFERENCES marketing_segment_country_queries(id) ON DELETE CASCADE,
  searched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- URLs are shared across queries; provenance belongs in the junction table.
CREATE TABLE IF NOT EXISTS search_results (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE CHECK (length(trim(url)) > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS search_query_results (
  query_id INTEGER NOT NULL REFERENCES marketing_segment_country_queries(id) ON DELETE CASCADE,
  result_id INTEGER NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 50),
  collected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (query_id, result_id)
) STRICT;

CREATE INDEX IF NOT EXISTS search_query_results_result_id ON search_query_results(result_id);

-- Each scrape is an immutable attempt; failures never overwrite successful enrichment.
CREATE TABLE IF NOT EXISTS search_result_enrichments (
  id INTEGER PRIMARY KEY,
  result_id INTEGER NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'blocked', 'failed')),
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json)),
  data_json TEXT CHECK (data_json IS NULL OR json_valid(data_json)),
  limitations_json TEXT NOT NULL CHECK (json_valid(limitations_json)),
  error TEXT,
  scrape_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(scrape_metadata_json)),
  verification_json TEXT CHECK (verification_json IS NULL OR json_valid(verification_json)),
  outreach_status TEXT NOT NULL DEFAULT 'needs_review' CHECK (outreach_status IN ('needs_review', 'do_not_contact', 'review_candidate', 'approved', 'rejected')),
  scraped_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS search_result_enrichments_result_id ON search_result_enrichments(result_id, id DESC);

-- Assessment-only retries never mutate extraction, verification, or human reviews.
CREATE TABLE IF NOT EXISTS search_result_assessments (
  id INTEGER PRIMARY KEY,
  enrichment_id INTEGER NOT NULL REFERENCES search_result_enrichments(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed')),
  assessment_json TEXT CHECK (assessment_json IS NULL OR json_valid(assessment_json)),
  error TEXT,
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  context_fingerprint TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  model_id TEXT,
  assessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS search_result_assessments_enrichment_id ON search_result_assessments(enrichment_id, id DESC);

-- Cheap snippet-based screening, separate from evidence-backed assessments and permission.
CREATE TABLE IF NOT EXISTS search_result_link_rankings (
  result_id INTEGER PRIMARY KEY REFERENCES search_results(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed')),
  score REAL CHECK (score BETWEEN 0 AND 100),
  confidence REAL CHECK (confidence BETWEEN 0 AND 1),
  model_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  error TEXT,
  ranked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS search_result_link_rankings_score ON search_result_link_rankings(status, score DESC);

-- Human decisions never overwrite the automated evidence/verification record.
CREATE TABLE IF NOT EXISTS enrichment_outreach_reviews (
  id INTEGER PRIMARY KEY,
  enrichment_id INTEGER NOT NULL REFERENCES search_result_enrichments(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  channel TEXT NOT NULL CHECK (channel IN ('communityPosting', 'directContact')),
  reviewer TEXT NOT NULL CHECK (length(trim(reviewer)) > 0),
  notes TEXT NOT NULL CHECK (length(trim(notes)) > 0),
  permission_confirmed INTEGER NOT NULL CHECK (permission_confirmed IN (0, 1)),
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS enrichment_outreach_reviews_enrichment_id ON enrichment_outreach_reviews(enrichment_id, id DESC);

-- The UNIQUE indexes also cover lookups by each parent foreign key.
