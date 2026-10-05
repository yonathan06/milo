# Design

## Context

See proposal.md for motivation. The current pipeline collects sources, extracts evidenced data, invokes `verifyOutreach`, and stores an immutable enrichment attempt. Verification already distinguishes posting from direct contact, but its channel eligibility combines audience fit, freshness, factual support, and permission; it is not a standalone permission display or numeric match score. Tables currently derive ranking from a four-value audience-fit rating.

`web/server/enrichment.ts` skips any result with meaningful successful extraction. That skip must be split into enrichment eligibility and assessment eligibility. Browsing uses read-only SQLite, and only CLI initialization performs migrations. Existing outreach approval checks operate on verification and explicit human review; they must not be replaced by an assessment score.

## Goals / Non-Goals

**Goals:** Isolate failures and retries for the new post-enrichment step; reuse collected evidence; persist independently versioned assessments; expose numeric match separately from conservative channel policy assessments.

**Non-Goals:** Automated outreach, obtaining admin approval, treating administrator identity as consent, changing human-review authorization gates, per-segment numeric scoring in this first version, or treating stored search snippets as current factual evidence.

## Decisions

### 1. Independent assessment module and append-only persistence

Create `src/result-assessment.ts` with structured model output and deterministic validation. Add `search_result_assessments`, linked to an enrichment with cascading deletion, including status (`complete` or `failed`), assessment JSON, error, assessed timestamp, model ID, rubric version, and context fingerprint/snapshot. Match and two permission outcomes live inside a versioned JSON object. Add database save/list/current-assessment helpers and read-store projections.

Persist meaningful enrichment before calling assessment, with no SQLite transaction spanning a network call. Integrate orchestration into both the CLI enrichment path and the web enrichment job using shared helpers. Preserve `enrichSearchResult`'s stored extraction/verification semantics for existing callers. Rejected assessment output is saved as a separate failed attempt, not as successful enrichment or an invented score.

Alternative: add fields to immutable enrichment JSON. Rejected because reassessment would require mutation or duplicate scraping attempts and would obscure independent failures.

### 2. Versioned rubric with unknown components

Initial rubric `event-video-match-v1` uses audience relevance (40%), event/video workflow relevance (30%), observed geography alignment (15%), recent observed activity (10%), and community scale (5%). Model output supplies 0–100 or null for each component, explanation, quoted source evidence, and an overall explanatory summary. Known values require evidence; explicit contrary evidence can support zero. Missing evidence remains null.

Compute the total deterministically as the rounded weighted mean over known components, only when at least one of audience relevance or event/video relevance is evidenced. Record available-weight coverage, with confidence capped by evidence coverage (low below 50%, medium 50–79%, high at least 80%). Confidence cannot be high when verification reports unsupported facts. Relevance components use anchored values: 0 = explicit mismatch, 25 = weak adjacent relevance, 50 = general relevant discussion, 75 = repeated relevant organizer/workflow evidence, 100 = direct demonstrated event-video editing need. Activity uses the newest evidenced post: 100 within 7 days, 75 within 30, 50 within 90, 25 within 365, otherwise 0; missing valid dates remain null. Scale uses an evidenced member/subscriber count: 25 below 100, 50 below 1,000, 75 below 10,000, otherwise 100; unknown count remains null. Geography is 100 for observed alignment to a target country, 50 for explicitly global coverage, 0 for explicit incompatible coverage, otherwise null. These first-version rubric assumptions are reviewable planning defaults. Never use raw query snippets as score evidence; quoted creation dates are not activity dates.

First-version scoring is one result-level assessment over a canonical snapshot of all actual saved query/segment/country context. Explanations must identify supported segments and contextual conflicts; the UI must not call this a segment-specific score. Query country/language alone never proves community geography. Snapshot/fingerprint changes make an assessment stale. Per-segment scoring is deferred rather than silently taking the best segment score.

Alternative: map high/medium/low to 100/50/0. Rejected because it implies precision without a rubric and cannot distinguish missing evidence from mismatch.

### 3. Separate policy assessments, not outreach authorization

Each channel has its own status, explanation, and evidence. Require explicit quoted authorization for `allowed` and quoted restrictions for `approval_required`/`prohibited`; absence of rules is `unknown`. Validate every quote against the corresponding retained source. For admin contact, public routes must be explicitly owned by an admin and evidence must authorize the requested commercial contact; a business or ordinary member route is not automatically an admin contact.

Use the existing verification as a semantic critic and conservative constraint. Model assessment cannot override verified prohibitions. Failed verification, unsupported facts, or stale sources prevent positive `allowed` displays. Prohibitions remain visible with their provenance, while stale positive permission becomes unknown/current-review-needed. Keep reported policy distinct from `review_candidate`, human approval, and executable eligibility; retain the existing review API and its gates unchanged. Display “Human review required” even for an allowed policy assessment.

Alternative: derive permission from the existing `channels` eligibility flags. Rejected because low match currently affects eligibility even when posting rules allow a channel, and because permission requires its own explanation/evidence.

### 4. Retry and job orchestration

Extend the shared request/status definitions and global sequential job to expose enrichment and assessment phases separately. A bulk or single-result enrichment request processes results with either missing meaningful enrichment or missing/stale/failed assessment. For already-enriched results, reuse the newest meaningful enrichment and saved sources without invoking collectors; do not silently fall back to older evidence when the newest refresh failed.

Add an explicit assessment-only POST action with server-validated result/segment scope, plus a CLI assessment command. Assessments are current only for the selected enrichment, matching context fingerprint and rubric version; source freshness is reevaluated on read. A latest failed assessment refresh leaves older outcomes inspectable as historical, but does not restore current permissions. One global lock coordinates both actions. Configure `GTM_ASSESSMENT_MODEL`, defaulting to the configured verification/extraction model, with bounded timeout and at most one correction pass; do not add automatic paid provider fallback.

### 5. Read models and UI

Expose assessment status, match score/confidence, and separate posting/admin-contact policy statuses via `web/server/store.ts`. Retain old audience-fit verification for history and compatibility, but never convert it into a new numeric score. Table sorting uses explicit numeric/null handling: scored results first by default, then enriched unscored results, then pending enrichment; a real zero remains a scored value. Both sort directions put unknown scores after numeric scores.

Add dedicated assessment cards to result details, with separate per-channel evidence/explanations, score components, context snapshot, history, stale/failure messages, and assessment-only retry. Invalidate results, segment, and result queries on phase completion; refresh statuses when returning to a running job. Treat all stored/model text as untrusted and keep safe external-link rendering.

## Risks / Trade-offs

- [Additional model latency/cost] → Reuse sources, skip current assessments, serialize jobs, bound correction and timeout, and expose assessment-only execution.
- [Invented scores or permissions] → Evidence validation, explicit unknowns, deterministic aggregation, independent verification constraints, and human review.
- [Result-level context mixes segments] → Persist the exact context snapshot and explain conflicts; do not claim per-segment numeric accuracy.
- [Old successful permissions appear current after a failure] → Latest-attempt and freshness rules with clearly historical displays.
- [Existing model/schema variability] → Require provider-compatible output schemas, preserve runtime URL validation, and test invalid/empty responses with mock models.

## Migration Plan

1. Extend `schema.sql` and CLI initialization with the new table/indexes; verify migration on existing data without altering enrichments/reviews.
2. Require explicit `db:init` before deploying web assessment reads/writes; missing migrations produce setup guidance, not web-side schema creation.
3. Deploy assessment module, orchestration/actions, then read/UI projections. Existing enriched records show assessment pending and can be assessed without scraping.
4. Validate one already-enriched main-server result through the assessment-only UI with Playwright CLI; inspect persisted score/permissions and provider provenance.
5. Roll back application code if necessary; leaving the append-only table in place is safe for older application versions. Do not delete existing evidence/review history.
