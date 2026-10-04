# Tasks

Verification policy: use a small set of shared offline integration/smoke scenarios and the fixture benchmark, not a unit test for every helper. Reuse those scenarios across tasks; inspect documentation and use a representative UI walkthrough. Remove obsolete compatibility tests. Keep critical public-only, citation, spending, and retry safeguards covered without live/paid calls.

Task 1.1 is reopened: its earlier implementation included legacy decoding, which the revised scope removes. No revised task is complete merely because part of its prior implementation exists.

## 1. Community settings and fresh persistence

- [x] 1.1 Replace shared settings validation/types with the single community plan format, event segment, audience kind, selected community lanes, and leader discovery; remove legacy/settings-less decoding and verify valid/invalid requests through the shared request/persistence smoke scenario.
- [x] 1.2 Replace historical SQLite migrations with transactional fresh-schema initialization for settings, query lanes/stages, candidate audit, processing/qualification metadata, and community-scoped leaders; clear authorized old research data only after preserving durable spending records and unresolved reservations, and verify initialization, reset budget continuity, and integrity/foreign-key checks in one persistence scenario.
- [x] 1.3 Update run deletion and identity reconciliation for the new records; verify the persistence scenario retains shared prospects and other runs while removing run-local candidate/leader evidence and leaving budget accounting intact.
- [x] 1.4 Document backup, authorized research reset, fresh-schema requirements, budget preservation, and previous-build restore in the app README; verify documented paths and commands by inspection against implementation.

## 2. Community planning and presets

- [x] 2.1 Add editable wedding, family-event, company-event, and professional-planner presets with separate consumer/professional audience semantics; verify representative plans in the shared pipeline fixture target planning/consulting rather than filmmakers and do not globally exclude planners.
- [x] 2.2 Replace legacy planning with audience-first plans only for selected community lanes, frozen 70/30 fit dimensions, and separate demand/activity signals; verify the shared pipeline scenario uses 5–10 original queries, no creator lane, and WhatsApp/Discord only when selected.
- [x] 2.3 Persist up to two audience-synonym fallback queries per original query, retaining lane targeting and optional geographic/language variants; verify a zero-yield/all-duplicate case in the shared pipeline scenario schedules meaningful fallbacks without appending country lists.
- [x] 2.4 Update query guidelines with presets, selected-lane behavior, and community eligibility examples; inspect examples against the plan contract and representative fixture output.

## 3. Eligibility and community identity

- [x] 3.1 Extend discovery eligibility/classification to public forum/association communities while excluding isolated vendor sites, generic directories, and articles; verify the shared corpus includes both evidenced member networks on unfamiliar domains and non-community distractors.
- [x] 3.2 Normalize supported Reddit threads to parent subreddits and derive custom-site parents only from explicit public navigation evidence; verify the shared pipeline scenario preserves original threads and separate communities sharing a domain.
- [x] 3.3 Reconcile equivalent identities transactionally on rediscovery within the new workspace using deduplication/aliases; verify the persistence scenario retains assessments, sources, selected state, and distinct leader identities without pre-reset data migration or mass recrawl.
- [x] 3.4 Maintain SSRF/access-control gates for custom sites, redirects, Discord/WhatsApp invites, and normalized threads; verify representative private-address, access-wall, and unsupported-shape cases in the shared safety scenario.
- [x] 3.5 Document eligible communities versus reference-only sites and parent identity behavior in query guidelines; inspect examples against the eligibility contract and shared fixtures.

## 4. Durable triage and bounded acquisition

- [x] 4.1 Persist search metadata/provenance before inference and add bounded schema-validated likely-fit/ambiguous/rejected snippet triage; verify the shared pipeline scenario retains sparse snippets/provider failures as ambiguous/deferred and records explicit rejections.
- [x] 4.2 Implement priority-first platform-balanced shortlisting and fallback scheduling after original queries; verify the shared pipeline scenario observes 10 results per search, 50 shortlisted candidates, two fallbacks per original, and no forced share for irrelevant platforms.
- [x] 4.3 Add sufficient-evidence checks and automatic recovery limits of 10 communities, two searches and two reference pages each; verify representative blocked candidates reuse evidence and remain manually retryable under the cap in the shared pipeline scenario.
- [x] 4.4 Cache genuine access walls for 24 hours with explicit manual bypass; verify an expiry/manual-retry case in the shared pipeline scenario without caching inference failures or weakening access safeguards.
- [x] 4.5 Document triage, recovery bounds, and manual retry; inspect diagnostics and guidelines for actual configured limits and source modes.

## 5. Evidence-aware qualification and resilient stages

- [x] 5.1 Replace legacy scoring with a single community qualification schema and exact excerpt-ID validation for supported/unknown fit, normalized supported-weight relevance, coverage, demand/activity, and confidence; verify representative partial/unscored/contradictory evidence and invalid citations in the shared pipeline/safety scenarios.
- [x] 5.2 Checkpoint inspected evidence before inference and store independent page/classification/scoring/enrichment states; verify an injected inference failure in the shared pipeline scenario leaves inspected evidence and page status intact.
- [x] 5.3 Resume incomplete stages from saved evidence on explicit retry with idempotent assessments/suggestions/observations; verify repeating the shared retry scenario avoids discovery repetition and duplicate records.
- [x] 5.4 Add run-level cooldown alongside bounded 429 backoff and conservative timeout settlement; verify a representative provider-failure scenario honors Retry-After and preserves unresolved-charge blockers, the shared $10 cap, and no-fallback/ZDR safeguards.
- [x] 5.5 Document fit, coverage, demand, and stage errors in README/query guidelines; inspect for no implied buying intent from unknown demand and flag the existing model-spec/code discrepancy without changing model selection.

## 6. Public leader and permission enrichment

- [x] 6.1 Add narrowly scoped public operator-section extraction and About/rules/team/contact link priority within the two-linked-page allowance; verify the shared safety fixture retains explicit roles without harvesting member lists, comments, private profiles, or personal phone numbers.
- [x] 6.2 Store at most three explicitly named leaders with role, observation date, validated role citation, optional profile, and independently evidenced business route; verify the shared corpus/benchmark contains only inspected role-backed leaders and no inferred or unsupported verified contact claims.
- [x] 6.3 Store promotion permission as allowed/prohibited/unknown with citations independently of contact availability; verify unknown and prohibited cases in the shared outreach/safety scenario.
- [x] 6.4 Integrate community-scoped leader business routes into selected/verified/manual outreach without auto-sending; verify the shared outreach scenario retains missing-route, unverified-page, and promotion-rule blockers.
- [x] 6.5 Document public leader boundaries and missing-leader behavior in provider-terms/query guidelines; inspect examples for public role evidence and business routes only.

## 7. Research and prospect UI

- [x] 7.1 Replace legacy form/action modes with community segment/audience/lane controls and optional leader discovery; verify the representative UI walkthrough saves/displays frozen settings and permits editing preset briefs.
- [x] 7.2 Update run/prospect projections and TanStack Query invalidation for stages, qualification, leaders, and permission; verify filters, review state, retries, and fetch behavior through the shared UI integration scenario.
- [x] 7.3 Show run funnel, stage-specific failures, discovery/recovery usage, rejection audit, and limits; verify the UI scenario distinguishes page blocks from scoring outages and accounts for retained candidates.
- [x] 7.4 Display fit/coverage/demand, optional leader role/contact citations, permission, and retry actions; verify the UI scenario separates unscored from low-fit leads and implies neither contact permission nor mandatory leaders.
- [x] 7.5 Update UI documentation/screenshots for new controls and labels; verify a representative walkthrough matches the delivered UI.

## 8. Evaluation and release integration

- [x] 8.1 Build a manually reviewed 24-community offline corpus spanning all four segments, distractor search results, and deterministic provider responses; inspect provenance and labels for negatives, sparse snippets, independent forums, blocked pages, and named/unnamed operators.
- [x] 8.2 Compare the new pipeline against a frozen offline baseline, reporting recall, top-ranked precision, deduplication, unsupported verified leader/contact claims, stage counts, and simulated costs; run the benchmark for at least 80% relevant-community recall, 80% top-ranked precision, and zero unsupported verified leader/contact claims without retaining a legacy runtime or making paid calls.
- [x] 8.3 Document a separately user-triggered four-segment live pilot with precision@10, scored fraction, leader/contact yield, cost per qualified community, and provider failures; inspect for opt-in execution under the shared cap and no automated paid runs, recording live results only when separately authorized.
- [x] 8.4 Run `pnpm --filter marketing-prospector test` and `pnpm --filter marketing-prospector build` with the minimal shared persistence, pipeline/retry, safety/budget, and UI scenarios; remove obsolete legacy compatibility checks and capture benchmark results and limitations in pilot documentation.
