# Tasks

## 1. Local Workspace and Constraints

- [x] 1.1 Add `apps/marketing-prospector` as a Node 24 TanStack Start (React) workspace app with documented local start/test commands; verify workspace install and loopback-only dev/production startup without changing landing-page routes.
- [x] 1.2 Keep app account-free and authentication-free; add ignored local configuration/data paths, server-only API-key handling, and origin checks on mutations. Verify local access has no sign-in, secrets are absent from browser bundles/responses/logs and `git status`, and remote machines/nonlocal origins cannot mutate state.
- [x] 1.3 Review Brave pricing/terms for planned query/result retention and OpenRouter model-catalog pricing, routing, and retention terms; record selected providers and current limits before live calls.

## 2. Durable Run and Prospect Model

- [x] 2.1 Create local SQLite schema for all durable prospecting data, including runs, frozen rubrics, queries, prospect identities, observations, assessments, review states, suggestions, drafts, and usage ledger; verify migrations and persistence across app restart with tests.
- [x] 2.4 Extend the SQLite schema to persist community findings with separate community type and extensible platform labels, including `custom_website`; migrate existing Facebook/WhatsApp findings without losing identity, sources, or assessments.
- [x] 2.2 Normalize supported public group, invite, and creator identifiers; deduplicate across queries and briefs without losing original links, observed dates, or per-brief assessments. Verified with a manual cross-run smoke check; automated tests omitted per user instruction.
- [x] 2.3 Add TanStack Start routes and server functions for brief submission, run progress, prospect list, score/type filtering, review/selection/rejection, and partial-run diagnostics; manually verified local SSR, progress, diagnostics, and persisted run across server restart. Browser tests omitted per user instruction.

## 3. Bounded Research

- [x] 3.1 Use hard-coded OpenRouter model `openai/gpt-4.1-mini` for lightweight rubric/query planning, classification, scoring, and selected-prospect drafting, with no model override. Verify current pricing and structured-output/ZDR eligibility and fail closed without credentials, an eligible route, or reserved inference budget; test that absent or conflicting model environment configuration cannot change the model. Preserve structured rubric/query-plan generation, validated output, and weighted criteria/high-score threshold frozen before discovery. Reopened for the approved fixed-model revision.
- [x] 3.2 Implement the community discovery pipeline: generate 5–10 queries; search with Brave/Serper for approximately 50 URLs; filter/deduplicate URLs and apply junk, domain, and platform rules; fetch pages with HTTP/Cheerio and Playwright fallback; extract title, description, text, platform, and community URL; classify relevance (0–1), reason, and community type; persist findings in SQLite. Fixture-test recognized platforms, custom websites, filtering, extraction, provider errors, and partial results.
- [x] 3.3 Enable paid calls without an opt-in flag or budget configuration while preserving the fixed shared $10 calendar-month cap, usage reservations, quota reconciliation, and displayed remaining usage. Test that eligible bounded calls proceed without opt-in, missing credentials/pricing/permissions or ineligible routing still block calls, the next unaffordable or unbounded call never executes, and partial results survive. Reopened for paid-call policy verification.
- [x] 3.4 Add page fetching with HTTP/Cheerio and Playwright fallback; verify public pages are extracted, failed pages produce diagnostics, and no login, joining, messaging, CAPTCHA/access-control bypass, or private/member extraction occurs.

## 4. Scoring and Suggestions

- [x] 4.1 Produce schema-validated, evidence-cited per-brief score breakdowns and rationales with separate confidence and contactability; verify snippet-only and missing-contact scenarios plus invalid-model-output errors in tests.
- [x] 4.2 Generate a language/domain landing-page suggestion for every prospect meeting its run's declared high-score threshold, including low-confidence warnings; verify every qualifying prospect gets one and no site files are created.
- [x] 4.3 Expose sources, unknown fields, scores, confidence, contact routes, and suggestions in prospect detail UI; verify reviewer can distinguish inferred claims from inspected facts in browser tests.

## 5. Manual Outreach Boundary

- [x] 5.1 Add selected-prospect-only draft generation using approved Milo positioning, public route, and visible rules; verify drafts do not assert pricing, referral terms, guaranteed delivery, or unverified personalization in tests.
- [x] 5.2 Add editable draft and manual channel guide, with explicit blocker when no appropriate public route exists or promotion is barred; verify no send/join/social-login endpoint exists and selection alone causes no outbound message.

## 6. End-to-End Validation

- [x] 6.1 Run three varied community briefs within the $10 monthly cap; assess automated results for relevance, platform/custom-website labeling, and credits consumed; record findings.
- [x] 6.2 Run TanStack Start workspace tests/build and public landing-page build; verify no login or hosted storage is needed, internal app is local-only, existing English/Hebrew routes remain unchanged, shared search/inference usage stays within the fixed $10 monthly cap, and docs explain setup, limits, privacy, and rollback. Update setup docs to state the hard-coded `openai/gpt-4.1-mini` model, no model override, and paid calls enabled without opt-in while retaining all preflight safeguards. Reopened for documentation and regression verification after the approved policy/model revision.
