# Tasks

Verification policy: extend the existing shared offline pipeline/retry, safety/provider, persistence and representative UI scenarios; do not add a unit test for every helper. Use authored platform-shell fixtures and mocked native OpenRouter transport, rejecting unmatched outbound requests. Never reset research or retry the reported live run during implementation verification.

## 1. Usable public evidence and provisional source preservation

- [x] 1.1 Add shared public-evidence usability checks for fetch/inspection paths that reject generic Facebook/Reddit shells without rejecting specific sparse metadata; extend the shared safety scenario to verify title-only, empty, sparse-description and explicit network/login-wall cases, including no wall-cache entry for a merely empty shell and no access-control bypass.
- [x] 1.2 Preserve original snippet/source evidence through page and linked enrichment, select page versus provisional catalogs without trust promotion, and gate citation-required inference on empty catalogs; extend the shared pipeline scenario to verify usable snippets survive shells, empty input makes zero inference calls/reservations, and provisional scores stay low-confidence with page unverified and no verified leader/contact/permission.
- [x] 1.3 Update README/query guidelines for evidence usability, provisional ranking and empty-input deferral; inspect documented behavior against the new shared scenarios, explicitly distinguishing unusable extraction from genuine access walls.

## 2. Native model-output validation and safe diagnostics

- [x] 2.1 Preserve safe completion metadata, diagnose provider-reported truncation separately from invalid JSON/unknown citations, and use compact bounded ranking outputs with fully reserved limits; extend the shared provider/safety scenario to verify malformed/truncated successful responses settle once, omitted metadata remains unknown, no raw prompt/output or credentials are saved, and ZDR/no-fallback/cooldown/unresolved-charge safeguards remain intact.
- [x] 2.2 Exercise actual classification/qualification and response parsing through mocked OpenRouter catalog/completion fetches rather than only injected assessment callbacks; verify valid compact output ranks a supported snippet-only lead, invalid excerpt IDs remain rejected, configured completion limits stay bounded, and any unmocked outbound request fails the offline scenario.
- [x] 2.3 Document model-output diagnostics and explicit retry boundaries in README/query guidelines; inspect for no assumption that historical parse errors prove truncation, no automatic paid replay, and no change to the fixed model or the flagged spec/code discrepancy.

## 3. Explicit saved-lead recovery and review projections

- [x] 3.1 Revalidate incomplete stored shell snapshots on explicit retry and rebuild from retained sources without discovery or workspace migration; extend shared retry/persistence scenarios to verify preserved identity/review/source/billing records, no fresh search/recovery calls when saved snippets suffice, reuse of genuine successful pages and valid completed results, and no duplicate inference/results/settlements on a repeated successful retry.
- [x] 3.2 Update existing stage/error/qualification projections and UI only as needed for unverified provisional rankings, needs-evidence deferral and safe output diagnostics; verify representative shared UI/cache behavior keeps retry updates visible without implying verified pages or outreach readiness, and update the UI walkthrough to describe these labels and the historical partial-run status boundary.

## 4. Release integration

- [x] 4.1 Run Node-24 TypeScript checking, `pnpm --filter marketing-prospector test`, `pnpm --filter marketing-prospector build`, the existing offline benchmark and OpenSpec validation; capture results and synthetic/native-mock limitations in pilot documentation, verify healthy-corpus recall/precision/deduplication/citation acceptance remains satisfied, and confirm no implementation verification changed the live run or durable billing or made real provider calls.
