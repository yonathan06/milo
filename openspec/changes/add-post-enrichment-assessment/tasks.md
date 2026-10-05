# Tasks

## 1. Assessment contracts and rubric

- [x] 1.1 Add provider-compatible assessment schemas, context fingerprinting, and deterministic versioned score aggregation in `src/result-assessment.ts`; verify tests for bounded scores, valid zero, unknown components, relevance prerequisite, coverage/confidence, and context changes.
- [x] 1.2 Implement evidence validation and separate posting/admin-contact policy outcomes with verification constraints; verify tests for invented quotes, high match with prohibited posting, approval-required channels, visible admin without consent, missing admin ownership, stale sources, and failed verification.
- [x] 1.3 Implement the bounded assessment model call using saved sources, extraction, verification, and context; verify mock-model tests for delivered evidence, one corrective pass, invalid/empty output, timeout, and configurable model selection.
- [x] 1.4 Document the initial rubric, unknown handling, result-level context scope, and permission-versus-authorization distinction in the app README; verify examples agree with unit fixtures.

## 2. Persistence and migration

- [x] 2.1 Add append-only assessment table/indexes through `src/schema.sql` and CLI initialization, without web migration side effects; verify migration tests preserve existing enrichment and human review data and repeated initialization is safe.
- [x] 2.2 Add save/list/current-assessment database APIs with enrichment/context/rubric provenance and latest-attempt rules; verify tests for retries, historical outcomes, cascading deletion, stale context, failed refresh, and no revived permissions.
- [x] 2.3 Document CLI migration/setup and rollback guidance; verify a copied initialized database can migrate and older records display assessment pending rather than fabricated scores.

## 3. Pipeline and explicit actions

- [x] 3.1 Add shared post-enrichment orchestration that persists enrichment before assessment and preserves it on assessment failure; verify pipeline tests for successful phase ordering, blocked extraction skip, failed assessment, and unchanged verification/review behavior.
- [x] 3.2 Extend the web enrichment queue with distinct phases and eligibility for already-enriched results needing assessment; verify job tests prove no collector invocation for assessment-only work and no duplicate provider work across overlapping starts.
- [x] 3.3 Add the assessment-only server POST action and CLI command with validated result/segment scope, timeout, and `GTM_ASSESSMENT_MODEL`; verify rejection tests and a mock CLI invocation reuse saved sources without scraping.
- [x] 3.4 Update environment examples and README action/CLI/progress documentation; verify request examples and phase descriptions match tested contracts.

## 4. Read model and research UI

- [x] 4.1 Project current assessment status, numeric match/confidence, and separate permission fields in `web/server/store.ts`; verify read-store tests for legacy results, zero versus unknown, stale evidence, failed reassessment, and query-only behavior.
- [x] 4.2 Add match, posting permission, and admin-contact permission columns to both results tables with explicit unknown sorting; verify tests for both directions and scored/enriched-unscored/pending default order, including pagination.
- [x] 4.3 Add detail-page assessment cards, evidence, component/confidence breakdown, context provenance, historical attempts, and assessment-only retry controls; verify display tests for all permission states, pending/failed/stale results, and safe text/link rendering.
- [x] 4.4 Update action controls, progress polling, and query invalidation to reflect assessment eligibility and phase completion; verify previously enriched results can be assessed, current assessments are skipped, and navigation does not leave stale labels.
- [x] 4.5 Document the score and permission columns and assessment-only UI flow; verify screenshots and actual labels agree with the documentation.

## 5. Integration verification

- [x] 5.1 Run app typecheck and all app tests, reporting any pre-existing Vite plugin type failure separately from new code errors; verify assessment, persistence, job, and UI regressions pass together.
- [x] 5.2 Explicitly initialize the main database with the CLI, then use Playwright CLI to assess the already-enriched result #2 on the main server without launching a bulk scrape; verify one new persisted assessment and no new scrape/enrichment attempt.
- [x] 5.3 Use Playwright CLI to inspect the resulting score, each permission explanation/evidence, both tables' sort controls, detail-page retry/skip state, and desktop/mobile layout; verify screenshots and browser console show usable rendering without errors.
