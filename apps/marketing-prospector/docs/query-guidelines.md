# Community query guidelines

## Choose an editable audience preset

- **Wedding / consumer:** engaged couples helping couples plan weddings. Distinguish professional-only networks; do not redirect to filmmakers.
- **Family event / consumer:** birthdays, anniversaries, reunions, graduations and other family celebrations; peer planning advice.
- **Company event / professional:** executive assistants, office managers, employee-experience teams and event consultants organizing company celebrations/conferences.
- **Professional planner / professional:** event planners and consultants helping peers, including wedding/corporate planners and association member communities. Never globally exclude planners as vendors.
- **Custom:** describe members, planning/consulting topics and consumer/professional/mixed audience explicitly. “Mixed” is an audience, not a legacy research mode.

Edit the brief after choosing a preset. Select only wanted lanes: defaults are Facebook groups, Reddit and public forums/association sections. Discord and WhatsApp are opt-in, not mandatory. Leader discovery is optional and never changes audience fit. Settings must explicitly specify version 2 and community mode; settings-less, creator and legacy mode requests are invalid.

## Audience-first frozen plans

5–10 originals, each retrieving at most 10 results. Example wedding plan with Facebook/Reddit/public forum lanes:

| Lane | Original | Saved fallback examples |
|---|---|---|
| Facebook | `site:facebook.com/groups/ engaged couples wedding planning` | `site:facebook.com/groups/ couples celebration advice`; `site:facebook.com/groups/ wedding preparation peers` |
| Reddit | `site:reddit.com/r/ couples wedding planning` | `site:reddit.com/r/ engagement celebration advice`; `site:reddit.com/r/ wedding preparation questions` |
| Public forum | `engaged couples wedding discussion forum` | `couples celebration peer network`; `wedding preparation member community` |
| Public forum | `wedding planning association member community` | `wedding preparation discussion board`; `marriage celebration planning peers` |
| Facebook | `site:facebook.com/groups/ wedding guest experience community` | `site:facebook.com/groups/ celebration guest advice`; `site:facebook.com/groups/ couples event memories` |

These are examples, not fixed mandatory queries. Server targeting removes conflicting site operators for structured lanes. Discord uses public invite shapes only; WhatsApp uses `site:chat.whatsapp.com` only when selected. Original searches precede all fallback attempts. Zero new likely-fit/ambiguous candidates, all duplicates, or all explicit rejections can trigger up to two saved audience-synonym attempts. Broadening must change audience phrasing, not merely strip quotes or stack country lists. Optional geographic/local-language variants can complement broad searches (e.g. a separate Spanish couples-planning query); they are not required on every indexed community page.

Countries match **any** selected country. Country/size evidence is inspected after discovery. Missing evidence is unknown; explicit country/size contradiction is excluded. A search snippet is never a verified demographic fact. Avoid exact-phrase stacks, product-only queries, contact/name searches and assumptions that footage demand exists merely because members plan events.

## Eligible community versus reference-only website

Eligible: a public discussion forum, explicitly described peer/member network, or an association section that actually hosts/operates a community. Unfamiliar domains are labeled custom_website, not discarded merely for being unfamiliar. Examples: “members connect and share event-planning experiences,” a discussion forum with public community description, and an association's `/members/community` section explicitly described as a peer network.

Not sufficient: a planner's vendor portfolio, generic directory, event listing, article or association homepage with no community evidence. Such pages can be bounded identity-linked references, not qualified community prospects. A marriage-counseling community is an explicit wrong audience for wedding-event planning; an ordinary filmmaker network is not an event-planning network.

Facebook posts/permalinks and supported Reddit `/r/name/comments/...` threads normalize to parent group/subreddit identities while preserving original threads/snippets as provenance. Custom `/forum/topic/123` derives `/forum` only from explicit inspected breadcrumb/community navigation. Never collapse all paths to a domain root, or merge `/weddings/community` with `/company/community` because the host/email/operator name is shared. Explicit identity reconciliation is transactional and retains sources, assessments/audit history, selection and separately scoped leaders; there is no historical mass recrawl or pre-reset identity migration.

## Triage, shortlist and recovery

Search metadata and query/source provenance are persisted before paid inference. Bounded batches (10 candidates) return likely-fit, ambiguous or explicitly rejected with reasons and exact evidence IDs. Reject only explicit wrong audience/type. Missing snippets or unavailable inference remain ambiguous/deferred, not invented nonmatches.

Shortlisting prioritizes likely-fit, then ambiguous; round-robin platform diversity applies inside each priority, with no reserved share for irrelevant platforms. At most 50 unique candidates receive automatic inspection. All retained/rejected/duplicate/deferred records remain available in the candidate audit, separate from the qualified prospect directory.

Usable inspection requires specific citable public metadata/text, not HTTP success or a generic Facebook/Reddit title. A sparse specific description or community title is sufficient; no minimum body-length rule applies. Original snippets and source URLs survive page/linked enrichment. Unusable inspection leaves the page unverified and can use retained snippets or exact-identity references only provisionally, with low confidence and no verified operators, business contact, promotion permission or outreach readiness. An empty catalog defers citation-required classification/scoring without paid inference, fabricated fit or audience rejection. Generic/empty extraction alone is not a cached access wall; explicit login/membership/CAPTCHA/network-security blocks remain walls and cannot be bypassed.

Before blocked-page recovery, reuse saved snippets. Sufficient citable community/audience evidence avoids new searches. Automatic recovery covers only the top 10 potentially relevant blocked communities, at most two identity-specific searches and two reference pages each. A reference must explicitly link to the exact community identity; shared names are insufficient. Other retained candidates remain manually retryable. A genuine login/membership/CAPTCHA/access-denied wall caches for 24 hours; explicit manual retry bypasses the cache. Inference failures never become access-wall cache entries. Retry resumes saved incomplete stages without discovery repetition or duplicate billing/assessment/suggestion/observation rows; successful inspected evidence is reused. Explicit retry revalidates an incomplete stored inspection; a generic shell becomes audit-only, not verified evidence. Retained snippets rebuild provisional input without a reset/migration or discovery; sufficient saved audience/community evidence avoids fresh page and recovery calls. Repeating a successful recovery reuses completed results and settlements. Ordinary reads and deployment perform no repair. Scoped catalogs are rebuilt only while processing new/incomplete stages from saved candidate fields and structured page checkpoints; legacy concatenated inputs remain audit, not newly inspected facts. Completed historical assessments—including old 100/100 scores—are reused unchanged and are not evidence that the new scope checks passed. No migration, backfill, automatic reassessment or paid historical replay occurs. Linked-page failures may retry the same incomplete URLs, never introduce another two-page allowance.

### Active scope and retained audit

Catalog excerpts keep separate title/description/body provenance, canonical-target scope, source URL and exact normalized quote. Community-context, discussion, identity-reference, title and unknown roles are not interchangeable. Active inference excludes popular-groups/navigation/login text and platform-wide counts while the original source audit remains intact. A sparse specific description remains useful; a topical title or a suggested different community does not support parent membership. Search/reference metadata is provisional, not inspected evidence. The shared authored sparse, title-boilerplate, city-thread and unrelated-community fixtures verify these boundaries. No member harvesting, private access, access-wall bypass or SSRF relaxation is introduced.

## Fit, coverage, demand and processing errors

Community qualification first requires citable canonical-community context. A topical title plus platform boilerplate, or a wedding thread in a city subreddit without parent context, stays `needs-community-evidence`: no paid scoring request and no numeric rank. A specific provisional community description can qualify with low confidence and unverified-page boundaries. Ordinary planning-forum or brides/grooms-helping-couples wording establishes participation without a fixed phrase; a forum name, vendor, article or directory alone does not.

Supported output selects `community_context`, `community_fact`, or `discussion` (planning relevance only); unknown output selects `unknown` with no citations. Server checks enforce source role and canonical target: individual location is not community geography, old examples are not current activity volume, topical questions are not demand for Milo, and unrelated community passages cannot support parent claims.

Frozen fit weights are audience alignment 70%, planning/consulting relevance 30%. Supported dimensions have citation-backed 0–100 values; unknown dimensions have null and no support claim. Relevance normalizes over supported weights. Coverage displays the supported-weight sum; partial coverage or search-only evidence forces low confidence. With no supported dimensions, relevance is absent (needs evidence), not a fabricated zero. Explicit contradictory audience evidence can support a low score. A planning-only 100 with 30% coverage is a normalized planning score, not perfect overall audience alignment: the 70% member-audience dimension remains null. No arbitrary score cap, missing-evidence penalty or forced diversity changes this math.

Demand/activity/location/size are separate supported/contradicted/unknown signals. Missing leaders, contact, activity or demand never reduce audience fit. **Unknown demand is not buying intent.** A high relevance score is not outreach permission.

Page/classification/scoring/leader states and errors are separate. An inference timeout after inspection remains a verified inspected page with a failed scoring stage. Run-level provider cooldown and unresolved-charge blockers remain visible; manual retry does not release charges or weaken no-fallback/ZDR/public-only safeguards. Interrupted runs retain evidence and become partial rather than restarting external calls.

Native ranking requests compact bounded JSON: classification has a fully reserved 1,000-token ceiling, triage/qualification 2,000, below the unchanged 4,096 maximum. Triage uses request-local C1–C10 keys mapped to durable candidates and candidate-specific allowed-ID schemas. Supported ranking claims select 1–3 exact IDs; unknown qualification claims select basis `unknown` and evidence:[]. Empty triage candidates can only be ambiguous with empty evidence. Concise rationales and allowed-ID schemas complement, never replace, server citation validation. Safe citation categories are `missing_citation`, `invalid_citation_shape` (shape/cardinality), `unknown_excerpt_id`, `cross_candidate_citation` and `unsupported_claim_scope`. The historical four qualification failures remain undiagnosed at this finer granularity; no raw output exists to establish their category. Diagnostics distinguish invalid JSON, invalid excerpt citations and provider-reported truncation. Only an output-limit finish reason establishes truncation; absent finish reason/token counts/request ID remain unknown. Historical parse errors alone are not evidence of truncation. Diagnostics contain bounded safe metadata, never raw output, prompts or credentials; successful requests settle usage before output rejection.

No automatic paid replay, heuristic JSON repair, inferred citations, output-budget escalation or provider/model switch follows an output failure. Explicit saved-lead retry is the only resumption trigger and does not bypass cooldown, ZDR/no-fallback, unresolved reservations or the shared cap. Loading/deploying performs no repair sweep, migration or live-run retry.

The main spec's `openai/gpt-4.1-mini` and existing code's `google/gemma-4-31b-it` disagree. This change does not switch models; the discrepancy is explicitly flagged for separate resolution.

## Public leaders and manual outreach

Only public operator About/rules/team/contact sections can establish explicitly named founders, administrators, moderators or community managers. At most three leaders per community; record role citations, observation date, optional explicitly published public profile link and independently evidenced named business/partnership route. Leader extraction shares the two linked-page total, prioritizing About/rules/team/contact. Never collect member/commenter lists, private profiles, personal phones or name-search enrichment. A frequent commenter is not an operator. Snippet hints are unverified, never verified leader/contact claims. No leader found is acceptable and does not lower fit.

Example: inspected About text names “Casey Example is the founder” and independently states “Casey Example handles business partnerships at partners@community.example.” Both claims need exact citations. A role without the second claim has no verified business route. Contact availability does not imply promotion permission; rules are independently allowed/prohibited/unknown with citations. Unknown/prohibited permission blocks promotional drafts. Only selected, inspected, qualified and reachable prospects with allowed rules can prepare editable manual drafts. Re-check current rules yourself. The app never sends messages, joins groups or bypasses access controls.

See [UI walkthrough](community-ui.md) and [offline benchmark / opt-in live pilot](pilot-run-results.md). No live/paid runs belong in automated tests.
