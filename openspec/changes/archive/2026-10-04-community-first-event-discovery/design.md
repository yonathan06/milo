# Design

## Context

See proposal.md for motivation. The application uses TanStack Start/Query, Node 24 SQLite, Brave, Cheerio/Playwright public fetching, and OpenRouter. `rubric.ts` requires all three existing lanes; `queries.lane` has a matching SQLite CHECK. `discovery.ts` rejects custom websites and normalizes Facebook threads but not Reddit threads. Broadening usually only removes quotes, so many unquoted zero-yield searches cannot retry meaningfully. `enrichment.ts` inspects two linked pages and strips member/comment blocks; leader extraction must not undo those privacy protections.

The September 30 run had 80 discovery results, 26 unique accepted URLs, 20 saved communities, 40 recovery searches, and four assessments. Historical errors mix access walls with inference timeout/429 failures. Current `openrouter.ts` already retries 429s and conservatively settles timeout reservations: preserve this behavior instead of assuming the historical code is current or adding blind retries. The main model requirement and current model constant disagree; model selection is outside this design.

## Goals / Non-Goals

**Goals:** Improve relevant-community yield before increasing crawl volume; retain recoverable evidence at every processing stage; make leadership and permission evidence auditable; start fresh without legacy compatibility while retaining strict public-only/budget safeguards.

**Non-Goals:** No general business-directory crawler, separate people-search product, model switch, legacy mixed/creator mode, old request/plan/assessment decoding, historical schema migrations, or unlimited link traversal. Removing legacy compatibility does not remove bounded query fallbacks or blocked-page recovery.

## Decisions

### 1. Versioned, explicit community research settings

Use a single community plan format with `planVersion: 2`, `researchMode: community`, `segment` (`wedding`, `family_event`, `company_event`, `professional_planner`, or `custom`), `audienceKind` (`consumer`, `professional`, or `mixed`), selected discovery lanes, and `discoverLeaders`. The UI defaults to Facebook, Reddit, and public forum/association lanes; leader discovery defaults on. Discord and WhatsApp are opt-in. Requests must supply valid settings; settings-less or legacy mixed/creator requests are rejected rather than decoded into an old mode. Audience kind `mixed` still describes an audience and is not a legacy research mode.

Provide four editable brief presets; consumer and professional audience exclusions are preset-specific, never globally exclude planners. Corporate presets include executive assistants, office managers, employee experience, and event consultants. Countries/size retain existing match/unknown/excluded behavior. Optional geographic/local-language query variants complement broad audience searches; do not require every indexed page to spell out a country or stack country lists.

Alternative: infer everything from free text. Rejected because it recreates hidden lane allocation and mixes incompatible audiences.

### 2. Community eligibility and identities, not a broader business allowlist

Define lane validation and query CHECK values for `facebook_group`, `reddit_community`, `public_forum`, `discord_community`, and optional `whatsapp_community`. Remove the creator discovery lane. Enforce site targeting for structured lanes and community URL shape validation.

Unknown public HTML sites enter a community-evidence gate: qualify forums, explicitly described peer/member networks, or association community sections. Generic articles/directories may serve as bounded references but never become prospects without evidence of an actual community. Do not treat every association homepage as a community.

Normalize Reddit `/r/<name>/comments/...` to `/r/<name>`; retain the original post URL and excerpt. Preserve independent site paths: derive a parent community only from explicit breadcrumbs/navigation/links, not by collapsing everything to a host root. Never merge unrelated forums or leaders by matching names, email, or domain alone. Within the new database, newly established equivalent identities reconcile transactionally on rediscovery, preserving aliases, assessments, selection, and provenance. No reconciliation of pre-reset historical data or automatic historical crawl is required.

Alternative: accept all websites and let scoring clean up. Rejected due to wasted calls and business/community ambiguity.

### 3. Durable candidate staging with conservative triage

Pipeline:

```text
Frozen audience plan --> Search --> Candidate audit + identity normalization
                                     |
                              snippet triage
                         reject / ambiguous / likely-fit
                                     |
                           bounded diverse shortlist
                                     |
                           public page inspection
                                     |
                    qualification + optional leader enrichment
```

Add a run-scoped candidate table including query/source references, canonical identity if established, original title/snippet, triage outcome/reason/evidence mode, and inspection state. URL safety/junk rejection is deterministic. Use one or more bounded, schema-validated snippet batches for audience triage; all inference uses existing paid-call safeguards. Reject only explicit wrong audience/type. Sparse, ambiguous, or missing snippets remain ambiguous; an unavailable triage model defers them rather than rejecting or inventing fit. Persist audit records before paid triage.

Keep 5–10 original queries, 10 results per search, and at most 50 shortlisted candidates. Order by triage priority and use round-robin platform diversity within that priority. Run original queries before fallbacks. Allow up to two planned audience-synonym simplifications per query when it yields no new relevant/ambiguous candidate, including all-duplicate or explicitly rejected results. Synonyms are saved in the plan, enabling meaningful fallback for unquoted queries.

Limit automatic recovery to the top 10 potentially relevant blocked communities per run, at most two identity-specific searches and two reference pages each. Reuse saved snippets first; skip recovery when sufficient evidence exists. Others remain visible and manually retryable. Cache access-wall outcomes for 24 hours by canonical URL/access failure only; explicit manual retry bypasses the cache. Never cache an inference failure as a page wall. Shared monthly reservations remain the overriding limit.

Alternative: retain unconditional two-search recovery for every blocked result. Rejected because historical runs spend most searches recovering poor matches.

### 4. Separate community fit from demand and evidence coverage

For version-2 community plans, use two frozen audience dimensions: member/audience alignment (70%) and event-planning/consulting relevance (30%). Demand for editing, activity, location, size, leadership, and contact availability are separate supported/contradicted/unknown signals, with citations, not compulsory score penalties.

Each fit dimension stores a supported numeric score or unknown. Compute relevance over supported dimension weights; show supported-weight coverage and cap confidence at low if any fit dimension is unknown. With no supported fit dimensions, relevance is null and status is needs-evidence, never fabricated zero. Contradictory evidence is a scored nonmatch, not unknown. Display demand evidence independently; do not claim buying intent from topical fit. Remove legacy weighted-assessment paths.

Use a single qualification representation with nullable relevance, supported-weight coverage, fit dimensions, and separate signals. Assessment persistence and projections may be redesigned directly; no legacy integer-score assessment mirror or decoder is required. Reuse exact excerpt-ID catalogs and server citation validation. Both triage and scoring treat web content as untrusted evidence, never instructions.

Alternative: keep demand/activity weights in total score. Rejected because access walls turn unavailable evidence into apparent audience mismatch.

### 5. Leaders are community-scoped evidence, not harvested members

Extend enrichment with up to three explicitly named leaders per community: name, role, optional public profile, role source URL/excerpt, observed date, explicit public business contact evidence, and status. Collect only public About/rules/team/contact content explicitly identifying administrators, moderators, founders, or community managers. Do not scan member lists, commenters, personal telephone numbers, or private profiles. Store named leaders only from inspected public role evidence; snippet suggestions remain unverified hints, not verified leaders.

Reuse the existing two-linked-page total per inspected candidate, prioritizing About/rules/team/contact links for this mode; leader discovery does not introduce another crawl allowance. Add a narrowly scoped extraction representation for role-bearing public operator sections instead of globally removing privacy selectors. Explicit leadership is necessary but not sufficient for contact permission. Store promotion/partnership rules as allowed/prohibited/unknown with citations. Missing leaders never reduce fit. A linked leader profile is not merged with its community identity.

Alternative: collect public member/admin lists or use name-search enrichment. Rejected due to privacy, ambiguity, and access constraints.

### 6. Checkpoint evidence and distinguish processing failures

Persist inspected page evidence before classification/scoring. Store page accessibility, classification state, scoring state, and leader-enrichment state separately. A successful fetch followed by inference timeout remains an inspected page with scoring pending/failed, not an unverified page. Manual retry resumes incomplete stages from saved evidence without rediscovering.

Reuse bounded existing 429 backoff, honor Retry-After, and add run-level service cooldown after repeated provider failures to avoid repeating long retry cycles for every candidate. On timeout with possible charge, conservatively settle at the reserved upper bound; never retry that uncertain request automatically. An unresolved reservation remains a visible blocker until authoritative reconciliation or conservative settlement, never an unexplained release, including after the research database is reset. Prevent duplicate assessments, suggestions, evidence rows, and spending events on resume.

Alternative: switch model/provider or treat exceptions as low-fit. Rejected as unsafe, misleading, and outside scope.

### 7. Expose stage metrics and validate yield

UI shows selected audience/mode/lanes, candidate funnel, discovery versus recovery usage, accessibility versus inference failures, and shortlist/recovery limits. Prospect detail shows community fit, supported coverage, demand/activity signals, leader evidence, and promotion rules. Only selected, verified, reachable prospects can prepare manual drafts; leader contact follows existing outreach blockers. Rejected triage records remain accessible in diagnostics but do not pollute the prospect directory.

Create a 24-community manually reviewed fixture set: six per segment, including negatives, ambiguous snippets, custom forums, blocked Facebook pages, and named/unnamed leaders. Include a distractor result corpus and deterministic provider responses. Acceptance: at least 80% recall of known relevant fixture communities, at least 80% precision among top-ranked qualified communities, zero unsupported verified leader/contact claims, correct parent deduplication, and all safety/spending invariants. Compare the new pipeline against a frozen offline baseline on the same saved search corpus and report stage counts and simulated costs; the baseline is evaluation data, not a retained legacy runtime. A separate user-triggered live pilot reports precision@10 per segment, scored fraction, leader/contact yield, and cost per qualified community without promising a fixed live recall or causing paid calls during tests.

### 8. Fresh schema and minimal verification

Initialize the new research schema directly and transactionally; reject unsupported pre-reset schemas with a reset instruction rather than migrating them. The user has authorized clearing research data. Before clearing an existing database, stop the application, back it up, and retain all spending-ledger entries and unresolved reservations in durable budget storage. If a ledger references removed run IDs, preserve the charges and reservation states while detaching those foreign keys. A reset must neither release reservations nor create a fresh monthly allowance. Backup/restore is an operational safeguard, not a requirement to read old schemas in the new application.

Use a small set of representative offline integration/smoke scenarios covering fresh persistence/reset, pipeline/retry behavior, critical privacy/security/spending invariants, and the UI. Reuse fixtures across features rather than adding a unit test for each helper or edge case. Keep the four-segment fixture benchmark and its yield thresholds; no live or paid calls run in automated checks. Remove obsolete compatibility tests. Verify documentation by inspection and walkthrough, not dedicated tests per paragraph.

Alternative: maintain historical migrations and exhaustive per-function tests. Rejected because the user has authorized a clean start and requested minimal testing.

## Risks / Trade-offs

- [Sparse snippets hide relevant communities] -> Keep ambiguity in the shortlist; include negative and missing evidence in the shared pipeline fixture.
- [Fit-only score appears overly optimistic] -> Prominent coverage/confidence/demand labels and separate outreach readiness; no draft solely because of a high score.
- [Custom forums have unreliable parent identities] -> Keep path-specific identities unless explicit parent evidence exists.
- [Leader extraction exposes personal data] -> Limit role-bearing operator sections, business routes, and source citations; include member/comment exclusion in the shared safety check.
- [Research reset loses spending history] -> Preserve durable ledger entries and unresolved reservations before clearing research records; verify the shared cap survives reset.
- [Fresh schema has inconsistent relationships] -> Initialize transactionally and include integrity/foreign-key checks in the persistence smoke scenario.
- [Cached walls become stale] -> 24-hour TTL and manual bypass; public-only safeguards remain mandatory.
- [Provider outages persist] -> Durable evidence, stage-specific retries and cooldown; preserve no-fallback routing.

## Migration Plan

1. Stop the application and back up its databases. Preserve spending-ledger entries and unresolved reservations in durable budget storage before clearing the authorized research data.
2. Replace historical migrations with direct initialization of the fresh community-only schema. Remove legacy request, plan, assessment, creator-mode, and UI compatibility paths. Do not migrate old research records.
3. Run the minimal persistence, pipeline, safety/budget, and UI integration/smoke scenarios and the offline fixture benchmark, then document the separately user-triggered live pilot.
4. Rollback, if needed, by stopping the app and restoring the backup with the previous build; retain post-reset spending and reservations so rollback also cannot reset the shared cap. Old and new builds need not read one another's research schema.
