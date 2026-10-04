export const researchSchema = `
CREATE TABLE workspace_metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  budget_path TEXT NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  brief TEXT NOT NULL CHECK (length(trim(brief)) > 0),
  status TEXT NOT NULL CHECK (status IN ('queued','planning','running','partial','complete','failed')),
  high_score_threshold INTEGER NOT NULL DEFAULT 80 CHECK (high_score_threshold BETWEEN 0 AND 100),
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  filters_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(filters_json)),
  research_settings_json TEXT NOT NULL CHECK (
    json_valid(research_settings_json)
    AND COALESCE(json_extract(research_settings_json, '$.planVersion') = 2, 0)
    AND COALESCE(json_extract(research_settings_json, '$.researchMode') = 'community', 0)
  ),
  provider_failures INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT
);
CREATE TABLE rubrics (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  criteria_json TEXT NOT NULL CHECK (json_valid(criteria_json)),
  query_plan_json TEXT NOT NULL CHECK (json_valid(query_plan_json)),
  frozen_at TEXT NOT NULL
);
CREATE TRIGGER rubrics_frozen_update BEFORE UPDATE ON rubrics
BEGIN SELECT RAISE(ABORT, 'run rubric is frozen'); END;
CREATE TRIGGER settings_frozen_update BEFORE UPDATE OF research_settings_json ON runs
WHEN NEW.research_settings_json != OLD.research_settings_json AND EXISTS(SELECT 1 FROM rubrics WHERE run_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'run settings are frozen'); END;
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  lane TEXT NOT NULL CHECK (lane IN ('facebook_group','reddit_community','public_forum','discord_community','whatsapp_community')),
  query_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','complete','failed','skipped')),
  error TEXT,
  credits_reserved INTEGER NOT NULL DEFAULT 0 CHECK (credits_reserved >= 0),
  credits_used INTEGER CHECK (credits_used IS NULL OR credits_used >= 0),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  diagnostics_json TEXT CHECK (diagnostics_json IS NULL OR json_valid(diagnostics_json)),
  stage TEXT NOT NULL DEFAULT 'original' CHECK (stage IN ('original','fallback','recovery')),
  original_query_id TEXT REFERENCES queries(id) ON DELETE SET NULL,
  fallback_index INTEGER CHECK (fallback_index IS NULL OR fallback_index BETWEEN 1 AND 2)
);
CREATE INDEX queries_run_status ON queries(run_id, status);
CREATE TABLE prospects (
  id TEXT PRIMARY KEY,
  prospect_type TEXT NOT NULL CHECK (prospect_type IN ('facebook_group','whatsapp_community','community')),
  canonical_identity TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','selected','rejected')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  community_type TEXT NOT NULL DEFAULT 'community',
  platform TEXT NOT NULL DEFAULT 'custom_website',
  country TEXT,
  UNIQUE (prospect_type, canonical_identity)
);
CREATE INDEX prospects_platform_type ON prospects(platform, community_type);
CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  query_id TEXT REFERENCES queries(id) ON DELETE SET NULL,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  canonical_identity TEXT NOT NULL,
  community_url TEXT NOT NULL,
  community_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  extracted_text TEXT NOT NULL DEFAULT '',
  relevance REAL CHECK (relevance IS NULL OR relevance BETWEEN 0 AND 1),
  relevance_reason TEXT,
  observed_at TEXT NOT NULL,
  contact_routes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(contact_routes_json)),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified','unverified')),
  verification_error TEXT,
  community_size TEXT,
  enrichment_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(enrichment_json)),
  audience_size INTEGER,
  filter_status TEXT NOT NULL DEFAULT 'unknown' CHECK (filter_status IN ('match','unknown','excluded')),
  page_state TEXT NOT NULL DEFAULT 'pending' CHECK (page_state IN ('pending','inspected','blocked','failed')),
  classification_state TEXT NOT NULL DEFAULT 'pending' CHECK (classification_state IN ('pending','complete','failed','deferred')),
  scoring_state TEXT NOT NULL DEFAULT 'pending' CHECK (scoring_state IN ('pending','complete','failed','deferred')),
  leader_state TEXT NOT NULL DEFAULT 'pending' CHECK (leader_state IN ('pending','complete','failed','deferred','disabled')),
  stage_errors_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(stage_errors_json)),
  evidence_json TEXT CHECK (evidence_json IS NULL OR json_valid(evidence_json)),
  permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('allowed','prohibited','unknown')),
  permission_evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permission_evidence_json)),
  UNIQUE (run_id, canonical_identity)
);
CREATE INDEX communities_run_relevance ON communities(run_id, relevance DESC);
CREATE INDEX communities_platform_type ON communities(platform, community_type);
CREATE INDEX communities_prospect_run ON communities(prospect_id, run_id);
CREATE TABLE community_sources (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  query_id TEXT REFERENCES queries(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  snippet TEXT,
  observed_at TEXT NOT NULL,
  UNIQUE (community_id, query_id, original_url)
);
CREATE INDEX community_sources_query ON community_sources(query_id);
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  query_id TEXT REFERENCES queries(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  summary TEXT,
  facts_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(facts_json)),
  UNIQUE (prospect_id, run_id, source_url, original_url, source_kind)
);
CREATE INDEX observations_prospect_time ON observations(prospect_id, observed_at);
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  score REAL CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  coverage INTEGER NOT NULL CHECK (coverage BETWEEN 0 AND 100),
  dimensions_json TEXT NOT NULL CHECK (json_valid(dimensions_json)),
  signals_json TEXT NOT NULL CHECK (json_valid(signals_json)),
  rationale TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  contactability TEXT NOT NULL CHECK (contactability IN ('unknown','suitable','unsuitable')),
  source_mode TEXT NOT NULL CHECK (source_mode IN ('page','snippet')),
  UNIQUE (run_id, prospect_id)
);
CREATE INDEX assessments_run_score ON assessments(run_id, score DESC);
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  language TEXT,
  domain TEXT,
  message_angle TEXT NOT NULL,
  verification_warning TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  channel_guide TEXT NOT NULL,
  blocker TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE prospect_aliases (
  url TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  evidence_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX prospect_aliases_prospect ON prospect_aliases(prospect_id);
CREATE TABLE pending_queries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  countries_json TEXT NOT NULL CHECK (json_valid(countries_json)),
  research_settings_json TEXT NOT NULL CHECK (json_valid(research_settings_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX pending_queries_status ON pending_queries(status, created_at);
CREATE TABLE discovery_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  query_id TEXT NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  community_id TEXT REFERENCES communities(id) ON DELETE SET NULL,
  original_url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  snippet TEXT,
  platform TEXT,
  search_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(search_metadata_json)),
  triage_status TEXT NOT NULL DEFAULT 'ambiguous' CHECK (triage_status IN ('likely_fit','ambiguous','rejected')),
  triage_reason TEXT,
  triage_state TEXT NOT NULL DEFAULT 'pending' CHECK (triage_state IN ('pending','complete','deferred','failed')),
  evidence_mode TEXT NOT NULL DEFAULT 'snippet' CHECK (evidence_mode IN ('snippet','page')),
  inspection_state TEXT NOT NULL DEFAULT 'pending' CHECK (inspection_state IN ('pending','shortlisted','inspected','blocked','rejected','duplicate','deferred')),
  shortlisted INTEGER NOT NULL DEFAULT 0 CHECK (shortlisted IN (0,1)),
  recovery_state TEXT NOT NULL DEFAULT 'pending' CHECK (recovery_state IN ('pending','complete','failed','deferred','unneeded')),
  error TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX candidates_run_stage ON discovery_candidates(run_id, triage_status, inspection_state);
CREATE TABLE community_leaders (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL CHECK (length(trim(role)) > 0),
  profile_url TEXT,
  role_evidence_json TEXT NOT NULL CHECK (json_valid(role_evidence_json)),
  business_route TEXT,
  contact_evidence_json TEXT CHECK (contact_evidence_json IS NULL OR json_valid(contact_evidence_json)),
  status TEXT NOT NULL CHECK (status IN ('verified','unverified')),
  observed_at TEXT NOT NULL,
  UNIQUE (community_id, name, role)
);
CREATE TRIGGER community_leaders_limit BEFORE INSERT ON community_leaders
WHEN (SELECT count(*) FROM community_leaders WHERE community_id = NEW.community_id) >= 3
 AND NOT EXISTS (SELECT 1 FROM community_leaders WHERE community_id = NEW.community_id AND name = NEW.name AND role = NEW.role)
BEGIN SELECT RAISE(ABORT, 'at most three leaders per community'); END;
CREATE TABLE access_wall_cache (
  canonical_url TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`
