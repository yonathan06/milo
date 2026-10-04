# Spec Delta

## Purpose

Give marketers a local, evidence-backed workflow for finding worldwide community and creator prospects from an audience brief, assessing their fit, and preparing manual partnership outreach without automatically contacting anyone.

## ADDED Requirements

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
After a user submits a brief, the system SHALL automatically execute a bounded discovery pipeline for relevant online communities across platforms and custom websites. The pipeline SHALL generate 5–10 queries, search through Brave or Serper for approximately 50 URLs, filter and deduplicate URLs using junk/domain/platform rules, fetch pages using HTTP/Cheerio with Playwright fallback, extract title, description, text, platform, and community URL, classify relevance from 0 to 1 with a reason and community type, and persist findings in a local SQLite `communities` table. Each finding SHALL record a platform label such as Facebook, Reddit, WhatsApp, Discord, or forums; unrecognized/custom sites SHALL be labeled `custom_website`. The platform labels SHALL be extensible, and unfamiliar sites SHALL not be discarded solely for being unrecognized. Fetching SHALL not log in, join communities, send messages, bypass CAPTCHA or access controls, or collect private/member information. The system SHALL retain source/query provenance. Invalid or inaccessible sources SHALL produce visible diagnostics and partial results, not fabricated findings.

#### Scenario: Public results from multiple channels
- **WHEN** a run finds public results for multiple supported prospect types
- **THEN** the run presents each candidate with its type, public identity, and source evidence

#### Scenario: Sparse or inaccessible result
- **WHEN** a search result lacks an eligible accessible page or public admin/contact information
- **THEN** the candidate is marked unverified or contact unknown, the run records the source limitation, and no private information is fabricated

#### Scenario: Automated bounded pipeline
- **WHEN** a user submits a valid brief and an enabled provider is available
- **THEN** the system generates 5–10 queries, processes approximately 50 result URLs through filtering, page extraction, classification, and SQLite persistence without requiring manual research

#### Scenario: Community platform classification
- **WHEN** a discovered community is associated with a recognized platform or an unrecognized/custom website
- **THEN** the system stores its community type and platform separately, using an extensible platform label or `custom_website`

### Requirement: Durable deduplication and provenance
The system SHALL persist research runs and prospects locally across restarts. It SHALL deduplicate equivalent identities across queries and runs while preserving their source links, brief-specific assessments, observed-at dates, and review state. It SHALL allow a user to review, select, or reject a prospect without erasing earlier evidence.

#### Scenario: Repeat discovery
- **WHEN** different queries or briefs find the same canonical community or creator
- **THEN** the system stores one prospect identity with distinct source observations and per-brief assessments

#### Scenario: Resume work
- **WHEN** the local application restarts after a completed or partial run
- **THEN** saved prospects, assessments, evidence, and user review states remain available

### Requirement: Explainable assessment
The system SHALL assign each candidate a brief-specific relevance score and rationale based on available evidence, plus a separate evidence-confidence level and contactability state. It SHALL distinguish observed facts from estimates and unknowns; low confidence SHALL NOT masquerade as low relevance or as verified fit. Results SHALL support review by score and prospect type.

#### Scenario: High fit with missing contact
- **WHEN** public evidence suggests a strong audience match but provides no appropriate contact route
- **THEN** the relevance assessment can remain high while contactability is unknown

#### Scenario: Snippet-only evidence
- **WHEN** a candidate is scored solely from a search snippet
- **THEN** its explanation identifies that limitation and its confidence reflects the missing independent verification

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
