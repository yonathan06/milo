# Offline benchmark and separately opt-in live pilot

## Offline comparison (2026-10-02)

Authored **synthetic** 24-community corpus, six per event segment, with 16 labeled relevant, negatives, sparse snippets, independent/member-network communities, blocked pages and named/unnamed operators. See [manual passage/label review and provenance](corpus-review.md). Deterministic provider responses drive the real pipeline; no automated check makes paid calls. Frozen baseline data comes from an offline execution of the previous stopped source snapshot on the same corpus/frozen originals; no legacy runtime remains in the app.

```sh
# Node 24, from repository root
pnpm --filter marketing-prospector benchmark
pnpm --filter marketing-prospector test
pnpm --filter marketing-prospector build
```

| Metric | Frozen previous pipeline | Community pipeline |
|---|---:|---:|
| Relevant-community recall | 8/16 = 50% | 16/16 = 100% |
| Top-ranked precision (up to 10 numeric-fit results per segment) | 12/12 = 100% | 16/16 = 100% |
| Correct parent deduplication | No; two Reddit threads/segment | Yes; one subreddit/segment |
| Unsupported verified leader/contact claims | 0 | 0 |
| Verified named leaders | 0 | 4 |
| Search requests | 28 | 36 |
| Shortlisted candidates | 12 | 20 |
| Inspected communities | 8 | 16 |
| Access-blocked communities | 4 | 4 |
| Numerically scored | 12 (includes duplicate threads) | 16 |
| Needs evidence / null fit | Not represented separately | 4 |
| Scoring failures in healthy corpus run | 0 | 0 |
| Simulated cost | $0.1444 | $0.1966 |

New funnel: 152 returned audit records, 52 duplicates, 80 explicit triage rejections, 20 shortlisted, 16 inspected, 4 blocked, 16 scored, 4 needs-evidence, 4 leader-enriched. Provider stubs: 36 searches, 36 triage batches, 20 classifications, 20 qualifications, 16 leader attempts. Extra duplicate/zero-yield fallback searches and broader community coverage cost more in this fixture; do **not** claim cost reduction. Recovery is avoided for already sufficient blocked snippets. Separate shared scenarios inject triage/scoring failures, 50-candidate saturation, 10-community recovery exhaustion, wall TTL/manual bypass and provider cooldown.

Acceptance: >=80% recall, >=80% top-ranked precision, correct parent deduplication, zero unsupported verified leader/contact claims. All thresholds pass on the synthetic corpus. Simulated inference costs are fixed evaluation proxies, not real model prices; production reads dynamic prices and reserves conservatively. These metrics test acquisition/state/evidence boundaries, not live search coverage, actual model judgment, multilingual quality, independent human review of real communities, access reliability or confirmed permissions. They do not establish live recall or promise matching live results.

The shared checks cover fresh/reset/rollback persistence, query and stage retry behavior, public-only privacy/SSRF/citation/spending/routing safeguards, and UI/cache integration. Obsolete creator/legacy migration/assessment compatibility tests were removed. Node 24 is required; implementation verification uses provisioned Node 24.21.0 where the harness defaults to Node 22. The model-spec/code discrepancy remains flagged, not resolved.

## Shell/ranking repair verification (2026-10-04, offline only)

Change: `fix-community-ranking-evidence`. Verified with provisioned **Node 24.21.0**, not the harness's default Node 22:

| Check | Result |
|---|---|
| `pnpm --filter marketing-prospector exec tsc --noEmit` | Pass |
| `pnpm --filter marketing-prospector test` | 18/18 Node shared scenarios pass, including Playwright UI; Vitest has no separate test files and exits successfully |
| `pnpm --filter marketing-prospector build` | Client and SSR builds pass |
| `pnpm --filter marketing-prospector benchmark` | Frozen 24-community corpus unchanged: recall 16/16 = 100%, top-ranked precision 16/16 = 100%, correct parent deduplication, zero unsupported verified leader/contact claims, four verified fixture leaders |
| Citation acceptance | Supported compact native output accepted; unknown classification/qualification excerpt IDs rejected without saving unsupported rankings |
| `openspec validate fix-community-ranking-evidence --strict` | Pass |
| Workspace isolation | Existing research/budget file hashes matched immediately after full release verification; research remained byte-identical on final recheck. Later budget hash changes were proven to affect only SQLite header counters (offsets 24–27 and 92–95): replacing those counters reproduced the original SHA-256, so all other bytes, including ledger records, remained identical. Neither database was opened by the checks |

Shared safety/pipeline scenarios now cover Facebook/Reddit title-only shells, empty extraction, specific sparse metadata, linked shells and explicit login/network-security walls. Empty catalogs make zero inference calls/reservations and defer without numeric fit; useful source snippets remain provisional, page unverified, confidence low, contactability/permission unknown, verified-leader work deferred. Shell extraction is not cached as an access wall.

The native scenarios inject **mocked OpenRouter model-catalog and completion HTTP responses**, with dummy credentials, into the production triage/classification/qualification, JSON parsing and citation validation path. Unmatched outbound endpoints fail; no real provider calls occur. Classification reserves its 1,000-token output ceiling; qualification/triage retain 2,000. Preflight also includes response-schema bytes. Provider-reported truncation, malformed JSON (including a malformed successful envelope), and invalid citations settle once without replay; omitted metadata remains unknown. Diagnostics contain no raw output/prompts/credentials. Existing ZDR/no-fallback, 429/cooldown, conservative timeout and cross-month unresolved-charge scenarios still pass.

A pre-existing local Vite server remained running throughout. Its unchanged `attachBudget` initialization writes `PRAGMA user_version` on connections, which can advance file-header counters without changing charges. Verification used read-only binary hashing to distinguish those bookkeeping changes; no live database was repaired, restored, queried through the app, or opened for verification.

Temporary persisted retry fixtures simulate an incomplete historical shell. Ordinary reopen changes nothing; explicit retry preserves identity aliases, review/source/observation/query audit and existing settled/unresolved charge records, rebuilds provisional input without discovery/recovery/page calls when saved snippets suffice, and repeats a completed recovery without extra inference, results or settlements. Genuine successful pages/completed results remain reusable. UI/cache scenarios verify refreshed unverified/provisional labels and safe errors; the credential-free browser server intentionally fails closed on incomplete inference. Historical `partial` status remains the original attempt's status.

**Limitations:** The healthy benchmark still uses authored synthetic pages and deterministic assessments. Native mocks additionally verify the real provider protocol/parser/reservation path, not actual model judgment, live platform access, or the probability that 1,000 tokens suffice in production. No historical parse error is retroactively diagnosed as truncation. No real provider calls, reported-run retry, live workspace reset/migration or production-process restart occurred during implementation verification; all research writes/settlements were in in-memory or temporary databases. Existing model/spec discrepancy remains unresolved. Live validation still requires separate user authorization.

## Scoped community quality verification (2026-10-04, offline only)

Change: `improve-community-ranking-quality`. Final release verification used **Node v24.21.0** installed alongside the harness runtime, without changing the current runtime symlink or restarting the production process.

| Command | Full result |
|---|---|
| `pnpm --filter marketing-prospector exec tsc --noEmit` | Pass, no diagnostics |
| `pnpm --filter marketing-prospector test` | 27/27 Node shared scenarios pass; zero failed/skipped/cancelled, including six native quality scenarios, four persisted scenarios and Playwright UI. Vitest exits 0 with no separate test files |
| `pnpm --filter marketing-prospector build` | Pass: 241 client modules and 167 SSR modules transformed; both production bundles built |
| `pnpm --filter marketing-prospector benchmark` | Pass: unchanged frozen 24-community corpus, 16 relevant; recall 16/16 = 100%, top-ranked precision 16/16 = 100%, parent deduplication correct, zero unsupported verified leader/contact claims, four verified fixture leaders |
| `openspec validate improve-community-ranking-quality --strict` | Pass |

Complete healthy benchmark funnel: 152 returned, 52 duplicate, 80 triage-rejected, 20 shortlisted, 16 inspected, four blocked, 16 numeric-scored, four needs-evidence, zero scoring-failed. Stub calls: 36 searches, 20 page fetches, 36 triage, 20 classification, 20 qualification and 16 leader attempts. Simulated cost remains **196,600 micros ($0.1966)**, not actual spending or a provider-price estimate. Frozen baseline remains [`offline-baseline.json`](offline-baseline.json), source SHA-256 `eef5b15059b84ce3a1f40f58dd19fc34a0d83e01ae266168ec539e89cd619581`; its 50% recall, 100% precision and $0.1444 simulated cost are unchanged. The existing >=80% recall/precision, deduplication and zero unsupported-leader/contact thresholds all pass.

Separate authored/sanitized quality regressions exercise the production native transport, parser and validators, not just prompts:

- Sparse specific descriptions remain citable; titles/headings stay isolated from member facts; platform boilerplate stays out of active support while exact normalized quotes/source URLs and original audit survive. Identity-linked references support only explicitly matched passages, not other paragraphs/communities.
- Ordinary planning forums and brides/grooms helping couples pass both provisional and inspected paths, including participation described separately from a forum title. Paired vendor/article/directory/name-only negatives have no qualification. Title/boilerplate-only and city-parent/thread cases have zero paid scoring requests and no numeric rank.
- Full provisional fit, explicit mismatch/low fit, planning-only 100 with 30% coverage, supported explicit community facts, and valid discussion-only planning support after community context pass. Unknown dimensions/signals stay empty. Real title/thread IDs, individual location, old activity, topical advice as demand, unknown-audience planning descriptions and unrelated community passages fail unsupported scope without saving a rank.
- Multi-candidate C1–C10 output accepts only the supplied candidate-local IDs; empty candidates stay ambiguous. Missing citations, string/extra-property/cardinality shape defects, unknown IDs and cross-candidate IDs fail closed. All five typed citation categories are exercised through known mocked responses. Invalid JSON and provider-reported truncation remain distinct. Requests retain 1,000/2,000-token ceilings and fully reserve schema/input/output bounds; each successful response settles once, with no automatic replay or raw-output/prompt/credential diagnostic retention. Existing timeout/cooldown/ZDR/no-fallback/unresolved-charge safeguards still pass.
- Temporary persisted retries rebuild only incomplete scoped metadata from saved fields/checkpoints, reuse ordinary community descriptions without recovery, preserve unresolved blockers and source/identity/review/billing records, and reuse completed historical scores with no new inference/results/settlements. Insufficient evidence remains within the existing 10-community/two-search recovery allowance. The UI/cache scenario confirms needs-community-evidence, provisional scope, partial coverage and safe rejection labels after mutation refresh, without inspected-source or outreach claims. Historical partial status remains the original attempt's boundary.

**Isolation and limitations:** Acquisition is stubbed and native OpenRouter catalog/completion endpoints are mocked with dummy credentials; unmatched native endpoints are rejected. All research writes and settlements occur in memory or temporary databases; the browser server explicitly uses its temporary data directory and blank credentials. Neither live run, historical completed assessment nor real durable billing database was opened or modified by verification. No real provider call, live retry/re-scoring, migration/reset or production-process restart occurred. Builds and authored UI screenshots were refreshed only. These scope recognizers deliberately defer unestablished facts; authored mocks do not establish real-model reliability, multilingual semantic accuracy, live access, human-reviewed precision/recall or authorization for another paid run. The fixed Gemma/main-spec model discrepancy remains unresolved. The historical live report below remains unchanged; its four citation failures cannot be retroactively assigned these new categories.

## Authorized live wedding check (2026-10-04)

After implementation, the user explicitly requested one real run and inspection of its data. A fresh run reused the previous wedding/consumer brief, default Facebook/Reddit/public-forum lanes and optional leader discovery through the normal UI. The old partial run was not retried. Current Brave storage terms and OpenRouter routing guidance were rechecked; the existing user-confirmed storage/target-site permission scope remained controlling. No model switch, access-wall bypass, outreach, or paid replay was performed.

**Run:** `1c21ed18-82b0-4e0a-ba20-e5ad35a96460` · started 07:45:37 UTC, completed 07:50:51 UTC · status **partial**.

| Observation | Actual result |
|---|---:|
| Search-result audit records | 83 |
| Searches | 8 original + 1 fallback + 20 recovery = 29 |
| Saved community rows | 20 |
| Classification complete | 20: 15 eligible, 5 excluded |
| Assessments | 11: 10 numeric + 1 null/needs-evidence |
| Qualification failures | 4 invalid-citation failures; finish reason `stop`, not reported truncation |
| Numeric scored / accepted eligible | 10/15; acceptance itself has errors, so not a ground-truth denominator |
| Triage state | 37 complete, 46 deferred; multiple invalid-citation batches |
| Page inspection | 3 readable inspected pages, 10 unusable shells, 7 access-blocked pages |
| Verified eligible pages / leaders / business routes / outreach-ready leads | 0 / 0 / 0 / 0 |
| Settled requests | 29 Brave, 45 OpenRouter |
| Settled cost | $0.145000 search + $0.008547 inference = **$0.153547** |
| Month total / remaining cap | $0.240200 / $9.759800 |
| Unresolved reservations | 0, including older months |

Read-only inspection checked every stored assessment reference against its input catalog, recalculated weighted scores/coverage, checked identity uniqueness and assessment/lead linkage, and checked SQLite integrity/foreign keys. All structural checks passed. All 11 assessments are snippet-mode, low-confidence, unverified, with unknown contactability/permission and no verified leaders/routes. Actual UI inspection confirmed refreshed provisional/low-confidence labels, no manual-draft action and the historical partial-status explanation. Shells were not promoted to inspected pages.

**Quality result: not yet acceptable.** Reviewed all ten numeric-ranked results and the excluded readable forums against saved evidence; this is an evidence audit, not independent ground-truth precision or live recall measurement:

1. **Score saturation / unsupported audience certainty:** every numeric result is 100/100 with full fit coverage. Several Facebook results (e.g. `weddingplanningclub`, `weddingplanningideas`, Philadelphia wedding-planning group) have only a community/post title plus generic Facebook discovery boilerplate. Those titles may suggest topical relevance, but do not establish a perfectly aligned engaged-couple membership. A similar weak-evidence lead correctly remained null, demonstrating inconsistent assessment semantics.
2. **Thread-to-community overgeneralization:** `reddit.com/r/perth` scores 100/100 based on a wedding-budget thread. That supports the thread's topic, not a claim that the broader city subreddit consists of the requested wedding-planning audience. `r/wedding`, `r/wedditnyc`, `r/DesiWeddings` and Wedding DIY UK have plausible topical peer evidence, but still remain provisional and cannot establish live member demographics/permission.
3. **False-negative public-forum gate:** WeddingWire's `/wedding-forums` and Wedding Ideas Guide's `/wedding-planning-forum.html` were excluded even though their classification rationales and cited passages describe wedding questions and advice from fellow members/brides/grooms. Offline replay of only the local eligibility predicate against their saved catalogs confirms it returns false even for an otherwise eligible `forum` response. The fixed phrase regex misses ordinary formulations such as “Planning Forum,” “fellow Community members,” and “help other brides.” Neither was qualified, so the leader path was not exercised on a valid inspected community.
4. **Native citation reliability:** five reported triage error groups plus four qualification failures prevent reliable throughput. Strict rejection protects saved rankings, but structured-output constraints did not eliminate citation errors. The safe retained diagnostic identifies invalid citations without raw output; it does not establish whether each failure was an unknown ID, wrong-candidate reference or a missing/invalid citation shape. No JSON/truncation failure was observed in these saved stage errors.
5. **No useful score discrimination / inefficient recovery:** ten 100-point ties cannot meaningfully rank community quality, and recovery exhausted the 10-community/two-search allowance ($0.10 of this run). Saved evidence also includes platform boilerplate and incidental personal details in search snippets, which should not become community-level audience, activity, location or demand claims. No such personal passages are reproduced in this report.

Follow-up should address community-versus-thread claim scope, generic snippet boilerplate and evidence sufficiency, precise safe citation-rejection categories, the public-forum gate, and unsupported full-coverage/perfect scores. Keep exact citations, public-only access, fixed model, no fallback/ZDR, charge preservation and explicit-only paid replay. **Do not present this run as successful quality acceptance or claim a precision/recall percentage.** No further paid run/retry was initiated after inspection.

## Authorized scoped-quality wedding check (2026-10-04)

The user explicitly requested one fresh run and inspection after implementing `improve-community-ranking-quality`. The normal UI created a new wedding/consumer run from the prior brief/settings, with Facebook/Reddit/public-forum lanes and optional leaders. Current Brave storage restrictions and OpenRouter structured-output/ZDR/no-fallback guidance were rechecked against the existing user-confirmed permission scope. No prior run was retried, no outreach prepared, and no model/provider/output-limit change or production restart performed.

**Run:** `ae194400-f095-413c-aaef-c2913a482a94` · 09:03:32–09:07:27 UTC · **partial**.

| Observation | Actual result |
|---|---:|
| Search-result audit records / saved unique communities | 80 / 46 |
| Searches | 8 originals + 20 recovery = 28; no fallback |
| Triage | 43 complete, 37 deferred; four paid batches failed `missing_citation` (finish reason stop, no reported truncation). Later classification updates six of those records to rejected without changing their original deferred triage state |
| Classification | Eight complete: two accepted eligible, six excluded; 38 deferred for insufficient canonical-community context |
| Qualification | Two attempts: one saved numeric assessment, one `unsupported_claim_scope` rejection; 38 deferred, six excluded/pending |
| Page stages | 11 inspected, nine blocked, 26 failed/unusable |
| Verified leaders / outreach-ready | 0 / 0 |
| Settled usage | 28 Brave + 19 OpenRouter requests |
| Run cost | $0.140000 search + $0.012011 inference = **$0.152011** |
| Month spending / remaining cap | **$0.392211 / $9.607789** |
| Unresolved reservations | Zero across all months |

Read-only inspection of all 46 saved communities found no duplicate canonical identities, invalid assessment-to-catalog references, weighted-score/coverage discrepancies, SQLite integrity errors or foreign-key failures. Hashes of the prior run's research records matched before/after; it was not replayed or re-scored. UI inspection confirmed the partial-original-attempt boundary, partial coverage, provisional/unverified labels, absent outreach actions and title-only needs-community-evidence presentation. No diagnostic replay followed any failure.

**What improved:** Title/boilerplate and thread-only sources no longer become full-coverage perfect community ranks. Thirty-eight leads, including `weddingplanningideas` and discussion-only Reddit parents, remain needs-community-evidence without scoring requests. Wedding Ideas Guide now passes community existence instead of the earlier fixed-phrase veto. Citation errors are precise and safely settled: this run establishes missing citations for the four triage batches and unsupported scope for the failed qualification, not an inferred historical diagnosis.

**Quality result: still not acceptable; low useful yield.**

1. Only `theweddingexpert.com/wedding-forum` received a score: **100 with 70% coverage**, low confidence, snippet evidence, page blocked/unverified, unknown demand/activity/location/size, no verified contact/permission. Its public metadata supports bride participation and wedding-planning ideas. The model left planning relevance null because it lacked specific threads/current activity, conflating the planning-fit dimension with activity verification. The stored normalization is correct, but this is not a fully supported perfect community assessment.
2. Wedding Ideas Guide passed existence but its qualification failed `unsupported_claim_scope`. The safe diagnostic does not identify the exact rejected dimension/signal; raw output was not retained, so no more precise claim is justified without an independently authorized future attempt.
3. WeddingWire remains excluded despite a classification reason describing actual peer discussions. Its selected passages carry unknown roles rather than participation-context roles; a stray generic community mention is marked context. Real page concatenation, vendor labels, and separate forum/participation wording still expose gaps in the scope recognizer and eligibility veto. Hitched and other readable forum pages also remain deferred. These need authored regressions based on structural patterns, not domain exceptions or invented citations.
4. Four of eight triage batches still lack required citations despite candidate-local schemas. Safe rejection works, but model protocol reliability is not established by the offline mocks. Qualification throughput fell to two attempts, not a reliable usable shortlist.
5. Recovery still consumed the full 10-community/two-search allowance and recovered little usable canonical-community context. Broad discovery also returned association-engagement articles/software rather than couples' communities. No cost-reduction claim is supported.
6. Read-only forum audit found individual discussion/member fragments in active unknown-role input despite the existing selector exclusions. They did not support the saved assessment, but the public-page extraction/privacy boundary needs review before another live probe. No member names or personal passages are reproduced here or added to regression fixtures.

This single run is an evidence/behavior audit, not independent ground-truth precision or recall. Keep its completed result, source audit and settled charges unchanged. Further implementation should address realistic page structure/role recognition, member-fragment exclusion, planning-versus-activity instructions and native citation reliability. No additional paid run or explicit retry was initiated after this inspection.

## Four-segment live pilot — not complete / further runs require a separate trigger

Implementation and automated tests do not start a paid pilot. A request to implement all tasks does not authorize live research. Existing provider/target-site permission confirmation must be rechecked for actual scope, retention and target sites before use.

After explicit separate user authorization:

1. Check current month spending and unresolved reservations in Diagnostics. Do not reset storage to gain allowance; reconcile uncertain charges authoritatively or conservatively. Keep the fixed shared $10 cap, no fallback/ZDR/structured-output/public-only safeguards, and Bright Data disabled.
2. In the UI, start one bounded run for **each of the four editable presets**, default Facebook/Reddit/public forums, leader discovery optional. Submit each run manually, one at a time; stop on budget blockers, provider failures or permission uncertainty. No scheduler/batch paid script is provided. Do not join/login/bypass walls to improve metrics.
3. Independently review the top 10 numeric-fit qualified communities per segment (report the actual denominator if fewer). Record relevance labels and citations, provisional evidence, exclusions, duplicate identities and unknowns. Count a leader only with inspected explicit role evidence, a business route only with independent named business evidence, and permission only from explicit inspected rules.
4. Record **precision@10**, scored fraction (numeric assessments / retained eligible community leads), verified leader yield, verified business-route yield, outreach-ready yield, cost per qualified community (settled run cost / reviewed relevant numeric-fit communities), discovery versus recovery usage, and stage/provider failure counts. Report zero-denominator metrics as N/A, not zero or fabricated success.
5. Record models/routing eligibility, date, selected settings/frozen plan, original/fallback/recovery usage, month cap/remaining balance, uncertainty reservations and reviewer notes. Never log credentials or private/member data. Unknown demand is not buying intent. No messages are sent.

| Segment | Run/date | Reviewed n | Precision@10 | Numeric scored/eligible | Role-backed leaders | Business routes | Outreach-ready | Settled cost / qualified community | Provider/stage failures |
|---|---|---|---|---|---|---|---|---|---|
| Wedding | `1c21ed18-82b0-4e0a-ba20-e5ad35a96460`, 2026-10-04 | 10 numeric ranks, plus excluded-forum audit | Not established; quality defects found | 10/15 accepted eligible (11 assessments, one null); acceptance has errors | 0 | 0 | 0 | $0.153547 total; per-qualified N/A | 4 qualification citation failures; triage deferrals; partial |
| Family event | Not run | — | — | — | — | — | — | — | — |
| Company event | Not run | — | — | — | — | — | — | — | — |
| Professional planner | Not run | — | — | — | — | — | — | — | — |

Live results belong here only after separate authorization and actual execution. No fixed live recall guarantee is claimed.
