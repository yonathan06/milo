# Marketing Prospector

Internal, local-only community research workspace. Requires **Node 24** and pnpm. Run commands from the repository root:

```sh
pnpm install
pnpm --filter marketing-prospector exec playwright install chromium
pnpm --filter marketing-prospector dev
# http://127.0.0.1:5173
pnpm --filter marketing-prospector test
pnpm --filter marketing-prospector build
pnpm --filter marketing-prospector start
# production preview: http://127.0.0.1:4173
```

Dev/preview bind to loopback. Mutating requests require the same allowed local Origin/Host. Do not expose this unauthenticated internal workspace to a network interface. Credentials belong only in server environment variables, never client code or logs:

```sh
export BRAVE_API_KEY=<your-brave-key>
export OPENROUTER_API_KEY=<your-openrouter-key>
```

## Community research and review

Select an editable wedding, family-celebration, company-event, or professional-planner preset (or custom brief). Choose consumer/professional/mixed **audience**, selected discovery lanes, and optional public leader discovery. Research is community-only: legacy mixed/creator modes and requests without explicit version-2 settings are rejected. Default lanes are Facebook, Reddit and public forums/association community sections; Discord and WhatsApp require selection. Leader discovery defaults on but never determines fit. Saved settings and the frozen plan are shown on each run.

The plan has 5–10 audience-first originals and up to two distinct saved audience-synonym fallbacks per original. All originals precede fallbacks; zero new eligible/ambiguous candidates (including all-duplicate/all-rejected results) triggers the bounded fallbacks. Country lists are not appended to searches. Optional language/geographic variants complement broad queries. Countries match any selected country; size bounds are inclusive. Known nonmatches are excluded; missing evidence stays unknown rather than a fabricated match.

Every search returns at most 10 results. Candidate provenance is durable before schema-validated triage. Explicit wrong audiences/types can be rejected; sparse snippets or model failures remain ambiguous/deferred. At most 50 unique candidates are shortlisted, likely-fit before ambiguous and round-robin across platforms within each priority; irrelevant platforms receive no forced share. Eligible independent communities are not rejected just for unfamiliar domains. Vendors, directories and articles without an actual community remain reference-only. Reddit/Facebook threads normalize to their explicit parent; custom parents require inspected navigation evidence. Distinct paths on the same domain remain distinct. Shared names/emails/domains never merge communities or leaders.

### Active evidence versus source audit

Active catalogs separate title, description and body/discussion provenance, exact normalized quotes, source URLs and canonical targets. Roles distinguish community context, discussion, identity-matched reference, title and unknown. Platform navigation/discovery text and global user counts are removed only from inference input; retained sources are unchanged. A sparse description such as “Community for couples helping couples plan weddings” remains usable. Titles, unrelated-community passages and individual statements cannot establish member composition. Search material remains provisional, never inspected merely because it appears in the catalog. Public-only, access-wall, SSRF and member/privacy exclusions are unchanged.

## Qualification, stages and retries

Qualification requires canonical-community context. Title/boilerplate-only input and a relevant wedding thread in a city parent remain **needs-community-evidence**, without a paid scoring request or numeric community rank. Existence uses hosted structure and peer participation, not a fixed phrase or known-domain exception: ordinary planning forums and brides/grooms helping couples are valid; vendor/article/directory and name-only negatives are not. Community existence is separate from member-audience fit.

Supported dimensions select a bounded evidence basis: community context, explicitly scoped community fact, or discussion (planning relevance only). Server scope checks reject title/thread member-composition claims, personal location, old activity as current volume, topical advice as service demand, and unrelated-community support. Provisional descriptions can score but never become inspected facts.

Fit is frozen at **70% member/audience alignment, 30% planning/consulting relevance**. Only supported weights contribute to normalized relevance. Supported-weight coverage is shown separately. A supported planning-only score of 100 with 30% coverage means strong planning relevance, **not perfect overall member-audience alignment**; the 70% audience dimension remains unknown. There are no arbitrary caps, missing-evidence penalties or forced score diversity. Unknown fit stays null (needs evidence), not zero; explicit contradictory evidence can support low fit. Partial or snippet-only evidence forces low confidence. Demand, activity, location, size, leadership and contact availability do not penalize audience fit. **Unknown demand is not buying intent.** All supported qualifications select exact server-built excerpt IDs; invented citations are rejected.

HTTP success is not page verification. Empty extraction and generic Facebook/Reddit titles are unusable; specific citable titles/descriptions remain usable even without body text. Original snippets and URLs survive inspection and linked enrichment. If inspection is unusable, retained snippets/identity-matched references may support **provisional ranking** only: low confidence, page unverified, no verified leader/contact/permission or outreach readiness. Empty citation catalogs defer classification and scoring as **needs evidence**, with no inference request or invented numeric score. An empty shell is an extraction failure, not an access-wall cache entry; explicit login, membership, CAPTCHA or network-security restrictions remain genuine walls and never trigger browser bypass.

Inspection is checkpointed before inference. Page, classification, scoring and leader states/errors are independent: an inspected page with a scoring outage remains inspected. Explicit **Enrich / retry** resumes incomplete saved stages without rediscovery, duplicate assessments/suggestions/observations, or another successful-page fetch. On explicit retry, incomplete stored inspections are rechecked for usability. A previously misverified shell is retained as audit-only observation and rebuilt from saved sources as provisional input. Sufficient saved snippets avoid page/recovery/search calls; identities, review state and billing survive. Completed historical results are reused unchanged, including old perfect scores and repeated successful recovery; their display does not imply validation under the new scope checks. Only new/incomplete processing rebuilds scoped catalogs from saved fields/checkpoints. Legacy concatenated catalogs are retained as audit, without promoting them to inspected facts. There is no schema migration, reset, ordinary-read repair or deployment replay. Saved linked evidence is reused; only incomplete linked pages are retried. An interrupted process leaves the run partial and saved candidates retryable; it never restarts paid work or releases reservations automatically.

Automatic recovery is limited to the top 10 potentially relevant blocked communities, at most two identity-specific searches and two public references each. Saved snippets are reused first; adequate community/audience evidence avoids recovery. Reference inspection requires an explicit link to the exact identity. Others remain visible and manually retryable under the shared budget. Genuine access walls are cached for 24 hours; explicit manual retry bypasses the cache. Inference failures are never cached as walls. Login, membership, CAPTCHA and private-address safeguards remain mandatory.

Public leader extraction uses only narrowly scoped operator About/rules/team/contact sections and shares the **two linked-page total**. At most three explicitly named operators per community have role citations, observation dates, optional published profile links and independently evidenced business routes. No member/comment lists, personal phones, private profiles, inferred operators or unrelated people searches. Missing leaders never reduce fit. Promotion permission is allowed/prohibited/unknown with independent citations; contact availability is not permission. Only selected, inspected, qualified, reachable prospects with allowed rules can prepare **editable manual drafts**. The app never sends messages or joins communities.

Run diagnostics show returned, URL-rejected, duplicate, triage-rejected, ambiguous, shortlisted, inspected, blocked, scored, scoring-failed and leader-enriched counts, retained candidate/rejection audit, stage errors, discovery/fallback/recovery search usage, and configured limits. Directory and detail views separate needs-evidence from low fit and display fit coverage, separate demand/activity, leaders and permission.

Ranking requests compact JSON with bounded text and allowed excerpt IDs. Classification reserves up to **1,000 completion tokens**; triage/qualification remain capped at **2,000**, within the 4,096 transport ceiling. Triage uses fixed request-local C1–C10 keys mapped to durable candidates, with each schema permitting only that candidate's IDs. Supported ranking claims require 1–3 IDs; unknown qualification claims require basis `unknown` and empty evidence. Server citation validation remains authoritative. Safe citation categories are `missing_citation`, `invalid_citation_shape` (including cardinality), `unknown_excerpt_id`, `cross_candidate_citation`, and `unsupported_claim_scope`. These categories describe new validated failures only; historical citation failures cannot be retroactively diagnosed. Stage errors distinguish invalid JSON, invalid citations and **provider-reported** output truncation. Safe diagnostics retain known finish reason, safe request ID, configured limit and reported token counts; missing values and unreported truncation remain unknown, separate from cost estimates. No prompts, raw model output or credentials are saved in these diagnostics. Successful HTTP usage is settled even when output is unusable. The historical incident's parse errors do **not** prove truncation.

Output failures do not trigger JSON repair, guessed citations, a model switch, output-budget escalation or automatic paid replay. Only an explicit Enrich / retry may resume failed work, under the normal spending/cooldown/unresolved-charge safeguards. Deployment and workspace reads start nothing; implementation verification does not retry the live run.

## Spending and provider routing

Brave, OpenRouter and the disabled Bright Data integration share the fixed **$10 calendar-month cap**. Requests reserve costs before execution. Unresolved reservations (including older months) block new requests until authoritative reconciliation or conservative settlement. Timeouts with possibly incurred charges settle at the reserved maximum and are not automatically retried. Bounded 429 retries honor Retry-After; long delays/repeated provider failures establish a run-level inference cooldown. Missing credentials, pricing or eligible routing fail closed.

The fixed model remains `google/gemma-4-31b-it`; `OPENROUTER_MODEL` is ignored. **Pre-existing discrepancy:** the main marketing-prospecting spec names `openai/gpt-4.1-mini`, while code and prior README name Gemma. This change flags, but does not resolve or switch, model selection. OpenRouter routing keeps `data_collection: deny`, ZDR, required structured-output parameters and provider fallback disabled. Current catalog pricing is required; conservative UTF-8/token bounds reserve a buffered upper cost. Do not submit private/sensitive briefs. Review [provider/target-site permissions](docs/provider-terms-review.md). Bright Data remains disabled; no new provider is enabled.

## Client caching and deletion

TanStack Query owns server data. A QueryClient per SSR request prefetches/hydrates without duplicate reads. Data is fresh for 30 seconds; only active runs poll (1.5 seconds, paused in background). Mutations invalidate affected run, directory, shared identity and spending projections without reloading navigation. Local sorting, search, expanded details, draft edits and pagination survive updates. Real navigation restores scroll; filters preserve it.

**Clear / Delete all prospects** removes run-local candidates, community/leader evidence, assessments, suggestions, drafts and observations, including filtered-out results. It retains shared prospects/other runs and immutable run/search/spending history. Deletion is transactional, idempotent, and blocked during research or manual enrichment.

## Fresh workspace, backup, authorized reset and previous-build restore

Schema 200 initializes transactionally. Old research schemas are rejected with reset instructions, never migrated or decoded. Default storage is `apps/marketing-prospector/.local/`; use an absolute `PROSPECTOR_DATA_DIR` for alternate storage. pnpm executes scripts from the app directory. `prospects.sqlite` owns research; the separate `budget.sqlite` owns durable spending and has no research-run foreign key. These local paths are Git-ignored.

**Stop ALL dev/preview processes before maintenance.** Save the previous source/build and back up both databases. Use consistent checkpointed backups, not a live main file without its WAL. Never delete the whole directory to reset research.

```sh
pnpm --filter marketing-prospector reset-research --confirm-research-reset
```

This creates consistent SQLite snapshots under `.local/backups/research-reset-<timestamp>/`, commits preserved spending into durable budget storage BEFORE clearing research, detaches old run references, and initializes the new research schema transactionally. Every month, settled charge, released record and unresolved reservation survives. Reset does not create allowance or release uncertain charges. Conflicting budget records fail closed without clearing research; missing/moved durable budget storage blocks an existing workspace instead of creating allowance.

For rollback, stop all builds and run the current maintenance tool **before** replacing the current source/build:

```sh
pnpm --filter marketing-prospector restore-previous-workspace \
  /absolute/path/to/pre-community-backup/prospects.sqlite --confirm-previous-build-restore
```

It saves a checkpointed copy of current research, copies the old snapshot, and replaces its ledger with CURRENT durable spending/reservations, with run references detached. Missing backup charges fail closed. Keep `budget.sqlite` untouched. Then restore the saved previous source/build and use that build: the new build deliberately rejects old schemas. Never blindly restore an earlier ledger or balance. If the previous build makes additional paid calls, retain its authoritative ledger and reconcile any conflicts before resetting again.

The local pre-reset source/build/database snapshot is `.local/backups/pre-community-20261002T170704Z/`. The authorized reset preserved all 689 ledger records unchanged; no paid pilot ran during implementation.

## Offline evaluation and opt-in pilot

[Query guidelines](docs/query-guidelines.md), [corpus review](docs/corpus-review.md), [UI walkthrough/screenshots](docs/community-ui.md), and [benchmark/live-pilot protocol](docs/pilot-run-results.md) describe usage and limitations.

```sh
pnpm --filter marketing-prospector benchmark
```

The 24-community authored synthetic corpus spans all four segments, negatives, sparse snippets, independent forums, blocked pages and named/unnamed operators. Deterministic provider stubs exercise the actual pipeline without paid calls. Compare against frozen offline baseline data, not a retained legacy runtime. Thresholds: 80% relevant-community recall, 80% top-ranked precision, correct parent deduplication, zero unsupported verified leader/contact claims. These fixture metrics are not real-model or live-discovery accuracy. A four-segment live pilot is separately user-triggered under the same shared cap; tests never initiate it.
