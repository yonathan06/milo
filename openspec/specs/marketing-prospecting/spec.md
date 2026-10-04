# Marketing Prospecting Specification

## Purpose

Give marketers a local, evidence-backed workflow for finding worldwide community and creator prospects from an audience brief, assessing their fit, and preparing manual partnership outreach without automatically contacting anyone.

## Requirements

### Requirement: Local access without accounts
The system SHALL operate on the user's local machine without requiring account creation, login, or authentication. It SHALL NOT expose its research workspace to other machines by default, and SHALL persist prospecting data locally rather than in a hosted database.

#### Scenario: Open local workspace
- **WHEN** the user starts the application and opens its local address
- **THEN** the workspace is usable without a sign-in screen or account setup

#### Scenario: Remote access not enabled
- **WHEN** another machine attempts to reach the application over the network
- **THEN** the application does not serve the workspace

### Requirement: On-demand audience research
The system SHALL accept a nonempty free-text audience brief and start research only when a user submits it. It SHALL treat geography and language as worldwide unless the brief constrains them, and SHALL show run progress, completion, partial results, and errors without silently starting scheduled refreshes.

#### Scenario: Submit worldwide brief
- **WHEN** a user submits an audience brief without geographic or language limits
- **THEN** the system starts one research run without applying a default country or language restriction

#### Scenario: Invalid or unavailable research
- **WHEN** a brief is empty or a required research service is unavailable
- **THEN** the system does not create fabricated prospects and explains the validation error or unavailable service

### Requirement: Fixed lightweight decision-making model
The system SHALL use OpenRouter with the hard-coded model `openai/gpt-4.1-mini` for rubric/query planning, relevance classification, scoring, and selected-prospect drafting. It SHALL require server-only API credentials but SHALL NOT require or accept a model override. Before inference, it SHALL check current model pricing and require structured-output support, data collection denied, Zero Data Retention routing, and no provider fallback. Missing credentials, unknown pricing, or an unavailable eligible route SHALL stop inference with a visible diagnostic rather than selecting another model or weakening routing restrictions.

#### Scenario: Fixed model without model configuration
- **WHEN** valid credentials, an eligible route, and sufficient reserved budget are available without a model environment variable
- **THEN** inference uses `openai/gpt-4.1-mini` regardless of any model override supplied in the environment

#### Scenario: Fixed model has no eligible route
- **WHEN** the fixed model lacks an eligible structured-output/ZDR route or current pricing cannot be established
- **THEN** the system does not initiate inference and reports the limitation without a model or provider fallback

### Requirement: Brief-specific relevance rubric
Before acquiring candidates, the system SHALL derive and retain explicit relevance criteria from the submitted brief and Milo's stated service positioning. It SHALL assess candidates against that run's retained criteria rather than changing criteria to match discovered results.

#### Scenario: Criteria recorded before discovery
- **WHEN** a research run begins for a new audience brief
- **THEN** its criteria are visible and stored with that run before candidate assessment

#### Scenario: Distinct audience briefs
- **WHEN** the same prospect is found under two briefs with different audience needs
- **THEN** each brief retains its own relevance assessment and explanation

### Requirement: Public-source prospect discovery
After a user submits a brief, the system SHALL automatically execute a bounded public-source discovery pipeline for relevant communities across platforms and custom websites. It SHALL generate 5–10 original queries, retrieve up to 10 results per query through the configured search provider, and inspect at most 50 deduplicated shortlisted candidates. It SHALL filter junk/unsafe URLs, preserve query and original-source provenance, extract public title/description/text/platform/community identity, classify community relevance with a reason, and persist results locally. It SHALL label unfamiliar platforms `custom_website` and SHALL NOT discard a site solely because it is unfamiliar. Independent forums and explicitly evidenced association/member communities SHALL be eligible; isolated vendor websites, generic directories, articles, and event listings SHALL NOT become community prospects without actual community evidence. Community research SHALL use audience-first searches and only selected discovery lanes, without mandatory creator or WhatsApp searches. Original queries SHALL precede bounded fallback attempts; each original query SHALL have at most two broader attempts when it yields no new likely-fit or ambiguous candidate. Fetching SHALL NOT log in, join communities, send messages, bypass CAPTCHA or access controls, or collect private/member information. Inaccessible sources SHALL remain visible as unverified leads; provider errors SHALL produce partial results rather than fabricated findings.

#### Scenario: Public results from multiple channels
- **WHEN** a run finds relevant public results on Facebook, Reddit, and an independent forum
- **THEN** each eligible community is presented with its platform, public identity, and source evidence

#### Scenario: Sparse or inaccessible result
- **WHEN** a candidate lacks an accessible public page or public operator contact
- **THEN** its page verification or contact status remains unknown/unverified and the source limitation is recorded without fabricated data

#### Scenario: Automated bounded pipeline
- **WHEN** a user submits a valid community brief with an available provider
- **THEN** discovery runs automatically within the original-query, per-query-result, fallback, candidate, and shared-spending limits

#### Scenario: Community platform classification
- **WHEN** an unfamiliar website explicitly hosts a relevant public discussion community
- **THEN** it is eligible and stored with its community type and `custom_website` platform

#### Scenario: Non-community website
- **WHEN** an event vendor portfolio or directory lacks evidence that it operates a community
- **THEN** it is not saved as a qualified community merely because it discusses events

#### Scenario: Optional lanes
- **WHEN** a community run selects Facebook, Reddit, and public forums only
- **THEN** its plan does not include creator, Discord, or WhatsApp discovery searches

### Requirement: Durable deduplication and provenance
The system SHALL persist runs, candidate-stage evidence, and prospects locally across restarts. It SHALL deduplicate equivalent community identities across queries and runs while preserving original thread/source URLs, brief-specific assessments, observations, and review state. Supported discussion URLs SHALL resolve to their parent community when the parent identity is explicit. Independent sites SHALL retain distinct community paths unless public evidence establishes an equivalent identity. Named leaders SHALL NOT be merged into their community's identity. Identity reconciliation within the new workspace SHALL preserve evidence and selection and SHALL NOT initiate a mass crawl. Compatibility with identities stored before the authorized research reset is not required. Users SHALL be able to review, select, or reject prospects without erasing earlier evidence.

#### Scenario: Repeat discovery
- **WHEN** different queries or briefs find the same canonical community
- **THEN** one prospect identity retains distinct source observations and per-brief assessments

#### Scenario: Resume work
- **WHEN** the application restarts after a completed or partial run
- **THEN** saved evidence, stage states, assessments, and review states remain available

#### Scenario: Reddit discussion provenance
- **WHEN** two Reddit threads belong to the same explicitly identified subreddit
- **THEN** the community has one canonical subreddit identity and both original threads remain source evidence

#### Scenario: Different communities on one domain
- **WHEN** two community sections share a domain but lack evidence that they are the same community
- **THEN** they remain distinct prospects

#### Scenario: Identity reconciliation within the new workspace
- **WHEN** rediscovery establishes that a discussion identity saved in the new workspace belongs to an existing parent community
- **THEN** reconciliation retains aliases, sources, assessments, and review state without unrelated merges

### Requirement: Explainable assessment
The system SHALL assign evidence-supported, brief-specific community relevance and rationale separately from evidence confidence, evidence coverage, demand signals, activity, and contactability. It SHALL distinguish observed facts, provisional estimates, contradictions, and unknowns. Missing activity, demand, location, size, leader, or contact evidence SHALL NOT be treated as observed audience mismatch. For community-first assessments, unsupported fit dimensions SHALL remain unknown; a relevance score SHALL be derived only from supported fit dimensions with their coverage visible, and SHALL remain absent when none are supported. Partial fit evidence and snippet-only evidence SHALL force low confidence. All supported claims SHALL cite validated source excerpts. Results SHALL support relevance sorting and prospect-type review while clearly separating unscored candidates from low-scoring nonmatches. The system SHALL use a single community assessment format without legacy assessment decoding.

#### Scenario: High fit with missing contact
- **WHEN** evidence establishes strong audience alignment but no public business route
- **THEN** relevance can remain high while contactability remains unknown

#### Scenario: Snippet-only evidence
- **WHEN** assessment uses only search metadata or identity-matched public references
- **THEN** its explanation identifies the provisional limitation and confidence is low

#### Scenario: Unknown activity or demand
- **WHEN** a wedding-planning community has evidenced audience fit but no accessible activity or footage-demand evidence
- **THEN** those signals remain unknown without automatically lowering audience relevance

#### Scenario: No supported fit dimensions
- **WHEN** available evidence establishes neither audience alignment nor planning/consulting relevance
- **THEN** the candidate is shown as needing evidence without an invented numeric relevance score

#### Scenario: Explicit mismatch
- **WHEN** evidence establishes a house-building community rather than event planning
- **THEN** assessment records supported low relevance rather than describing the mismatch as merely unknown

### Requirement: Per-prospect landing-page suggestions
The system SHALL include a proposed audience/domain-specific message angle and prospect language for every candidate meeting the run's declared high-relevance threshold, regardless of confidence. It SHALL label uncertain language or audience claims for verification. Suggestions SHALL NOT create, edit, or publish landing pages.

#### Scenario: High relevance with uncertain language
- **WHEN** a high-relevance prospect has an unverified audience language
- **THEN** the system presents a landing-page suggestion with a language-verification warning

#### Scenario: Overlapping suggestions
- **WHEN** two high-relevance prospects could share a landing page
- **THEN** each prospect still has its own suggestion; the system does not automatically build separate pages

### Requirement: On-demand manual outreach preparation
Only after a user selects a prospect, the system SHALL prepare a reviewable partnership introduction draft and channel-specific instructions for sending it manually through a suitable publicly available contact route, accounting for visible promotion rules. It SHALL identify unverified claims and SHALL NOT assert referral availability, commissions, pricing, service capacity, or guaranteed outcomes absent approved facts. It SHALL NOT send messages, join groups, or create outreach accounts.

#### Scenario: Selected reachable prospect
- **WHEN** a user requests outreach preparation for a selected prospect with an appropriate public contact route
- **THEN** the system displays an editable draft, evidence-backed personalization, visible rules, and manual-send steps without transmitting the message

#### Scenario: Missing or unsuitable contact route
- **WHEN** a selected prospect has no appropriate public contact route or public rules bar promotions
- **THEN** the system explains the blocker and does not propose a prohibited or fabricated sending method

### Requirement: Strict external-service spending control
The system SHALL display research-provider usage and enforce a fixed shared calendar-month spending cap of $10 across search and OpenRouter inference. Paid calls SHALL be enabled without a paid-call opt-in flag or budget configuration. Calls SHALL remain subject to valid credentials, provider/source permissions, current pricing and routing checks, and a pre-call maximum-cost reservation reconciled against returned usage. It SHALL stop before a search request that could exceed the remaining cap and report partial results and the reason for stopping. It SHALL NOT initiate unmetered paid calls, purchases, subscriptions, or automatic top-ups.

#### Scenario: Budget exhausted mid-run
- **WHEN** the next external call could exceed remaining monthly budget or available quota
- **THEN** the system skips that call, preserves gathered results, and reports budget or quota exhaustion

#### Scenario: Paid calls enabled without an opt-in flag
- **WHEN** credentials and provider/source permissions are available, pricing and routing checks pass, and the next call fits within the remaining shared $10 monthly cap
- **THEN** the system reserves the maximum cost and permits the call without requiring a paid-call opt-in flag or budget configuration

#### Scenario: No paid provider configured
- **WHEN** only a free-tier source is configured
- **THEN** the system runs within available free quota or pauses with a clear error instead of charging an unconfigured paid provider

### Requirement: Event-community research settings
The system SHALL offer community-first research presets for weddings, family celebrations, company events, and professional event-planning/consulting networks, with editable briefs, explicit audience kind, selected lanes, and optional public leader discovery. The UI SHALL offer community discovery only; legacy mixed/creator research SHALL NOT be offered. Requests SHALL supply valid community settings; missing settings or legacy research modes SHALL produce a visible validation error rather than compatibility fallback. Consumer and professional audiences SHALL have separate targeting semantics, and professional planners SHALL NOT be excluded from a professional-planner run. The system SHALL save and display the research settings and frozen plan for each run.

#### Scenario: Professional planner preset
- **WHEN** a user selects professional event-planning and consulting communities
- **THEN** the plan targets planner/consultant peer networks rather than excluding them as vendors or redirecting to filmmakers

#### Scenario: Consumer wedding preset
- **WHEN** a user selects consumer wedding-planning communities
- **THEN** the plan prioritizes couples' planning communities and distinguishes them from professional-only networks

#### Scenario: Unsupported legacy request
- **WHEN** a research request omits community settings or requests legacy mixed/creator research
- **THEN** the system rejects the request with a visible validation error without starting research

### Requirement: Fresh research workspace without budget reset
The application SHALL support a fresh community-only research workspace without migrating or decoding pre-reset research data. The user-authorized reset MAY clear research runs, prospects, and their evidence, but SHALL preserve spending records and unresolved reservations used to enforce the shared $10 calendar-month cap. Resetting research data SHALL NOT release unresolved charges or restore previously consumed allowance. Subsequent runs SHALL remain subject to the same shared cap and reconciliation blockers. Unsupported pre-reset research schemas SHALL produce a visible reset instruction rather than being silently migrated.

#### Scenario: Authorized clean start
- **WHEN** the user-authorized research reset completes
- **THEN** the workspace contains no old research records and new community research can use the fresh schema without legacy decoding

#### Scenario: Reset with prior spending or unresolved reservations
- **WHEN** research data is reset after paid usage or an unresolved reservation in the current month
- **THEN** that usage and reservation still count toward the shared cap and unresolved charges remain blockers

### Requirement: Conservative pre-inspection triage
The system SHALL retain search candidates and their provenance before triage, classify them as likely-fit, ambiguous, or explicitly rejected, and expose reasons and evidence mode. Missing or ambiguous snippets SHALL NOT cause automatic audience rejection. Triage unavailability SHALL leave candidates deferred/ambiguous with visible diagnostics. Only the bounded shortlisted candidates SHALL receive automatic page inspection. Automatic recovery SHALL be limited to 10 potentially relevant blocked communities per run, up to two identity-specific searches and two public references each, reusing saved evidence first. Other retained leads SHALL remain manually retryable under the shared budget.

#### Scenario: Explicit wrong audience
- **WHEN** a candidate snippet explicitly describes marriage counseling rather than wedding-event planning
- **THEN** it can be triage-rejected with an auditable reason before expensive recovery

#### Scenario: Sparse snippet
- **WHEN** a public planning-community candidate has insufficient snippet text
- **THEN** it remains ambiguous rather than being declared irrelevant

#### Scenario: Recovery allowance exhausted
- **WHEN** 10 shortlisted blocked communities have used automatic recovery
- **THEN** other blocked candidates remain visible without automatic additional recovery searches and can be manually retried

### Requirement: Public community leader evidence
When leader discovery is enabled, the system SHALL record at most three explicitly named public community operators per community, with role, source URL/excerpt, observed date, and any explicitly associated public business contact route. Leaders SHALL be derived only from inspected public role-bearing About, rules, team, or contact evidence; search hints SHALL remain unverified. The system SHALL NOT infer leadership from name similarity, posting frequency, shared contact details, or ordinary membership. It SHALL NOT harvest member lists, personal phone numbers, private profiles, or private contacts. Leader enrichment SHALL share the existing maximum of two linked-page inspections per candidate. Missing leader evidence SHALL NOT exclude an otherwise relevant community. Promotion/partnership rules SHALL be recorded as allowed, prohibited, or unknown with citations; a public contact alone SHALL NOT imply permission to promote.

#### Scenario: Explicit named leader
- **WHEN** an inspected community About page names its founder and lists a partnership email explicitly associated with that operator
- **THEN** the name, role, public business route, and supporting evidence are saved with the community

#### Scenario: Ordinary active member
- **WHEN** a frequent commenter has no explicit public operator-role evidence
- **THEN** the commenter is not recorded as a community leader

#### Scenario: Leader absent
- **WHEN** a relevant community publishes no leader name
- **THEN** leader availability remains unknown without reducing audience relevance

#### Scenario: Promotions prohibited
- **WHEN** inspected rules prohibit commercial promotion
- **THEN** readiness reflects that prohibition and the system does not propose an outreach route that violates it

### Requirement: Recoverable stage-specific processing
The system SHALL retain successfully inspected public evidence before qualification, distinguish access failures from inference and enrichment failures, and allow explicit retries of unfinished stages using saved evidence without repeating discovery. A model timeout or rate limit after a successful fetch SHALL NOT relabel that page as inaccessible. Retries SHALL preserve hard spending, structured-output, and privacy-routing safeguards; ambiguous charges SHALL NOT be released merely to permit retry. Repeated provider failures SHALL pause automatic inference with visible diagnostics. No retry SHALL create duplicate canonical identities, assessments, suggestions, or charge-settlement records.

#### Scenario: Inference fails after inspection
- **WHEN** a public page is inspected successfully but its scoring request times out
- **THEN** saved page evidence remains inspected and scoring is visibly failed/pending rather than page-unverified

#### Scenario: Explicit qualification retry
- **WHEN** a user retries a lead with saved page evidence and an incomplete assessment
- **THEN** qualification resumes from that evidence without rerunning discovery

#### Scenario: Unresolved charge
- **WHEN** a previous external charge has not been authoritatively reconciled or conservatively settled
- **THEN** the spending blocker is visible and new paid requests do not bypass it

### Requirement: Community discovery diagnostics and evaluation
The system SHALL expose per-run counts for returned, URL-rejected, duplicate, triage-rejected, ambiguous, shortlisted, inspected, access-blocked, scored, scoring-failed, and leader-enriched candidates. It SHALL distinguish discovery from recovery usage and audience fit from outreach-ready yield. The project SHALL provide a deterministic offline evaluation corpus spanning the four event segments and a separately user-triggered live pilot; automated tests SHALL NOT initiate paid discovery. Offline acceptance SHALL require at least 80% recall of labeled relevant communities, at least 80% precision among top-ranked qualified communities, correct parent deduplication, and zero unsupported verified leader/contact claims.

#### Scenario: Model outage diagnostics
- **WHEN** many saved leads cannot be scored because of provider errors
- **THEN** diagnostics show scoring failures rather than representing all those leads as unsuitable audiences

#### Scenario: Reproducible offline comparison
- **WHEN** the offline benchmark runs against saved labeled search/page fixtures
- **THEN** it reports relevance recall, top-ranked precision, leader/contact accuracy, stage counts, and simulated costs without paid provider calls
