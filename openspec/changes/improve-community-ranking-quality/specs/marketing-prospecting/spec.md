# Spec Delta

## ADDED Requirements

### Requirement: Canonical-community qualification scope
The system SHALL distinguish evidence characterizing a canonical community from a topical title, isolated discussion, individual participant statement or reference about another community. Resolving a thread to its parent identity SHALL NOT promote thread facts into claims about the parent's member audience. A community rank SHALL require citable context characterizing that community; title-only or discussion-only input without such context SHALL remain needs-evidence with no community numeric rank. When community context is sufficient, supported fit dimensions SHALL retain the frozen 70% audience-alignment and 30% planning-relevance weights and normalization over supported weights. Unsupported dimensions SHALL remain null with their coverage excluded. The system SHALL NOT invent low scores, arbitrary score caps, extra weights or forced score diversity to compensate for insufficient evidence. Provisional rankings SHALL retain low confidence, an unverified page and blocked verified-leader/contact/permission/outreach claims.

#### Scenario: Relevant thread in a broader city community
- **WHEN** a wedding-budget thread resolves to a city subreddit but supplies no evidence characterizing the parent's wedding-planning membership
- **THEN** the thread remains provenance and contextual planning evidence, but does not establish a perfect-fit wedding community or a numeric community rank

#### Scenario: Explicit community description with provisional sources
- **WHEN** retained public metadata explicitly describes the canonical community as couples helping couples plan weddings
- **THEN** the community can receive a citation-backed provisional assessment with supported coverage visible, low confidence, unverified page and no outreach readiness

#### Scenario: Partial fit after community context is established
- **WHEN** community evidence establishes planning relevance but not the requested member-audience alignment
- **THEN** the unsupported audience dimension remains null and excluded from coverage, with the supported dimension normalized under the unchanged rubric rather than penalized for missing evidence

#### Scenario: Claims about individuals or other communities
- **WHEN** an excerpt mentions one participant's location, one old discussion or a different community
- **THEN** it does not establish canonical-community geography, current activity volume, member demographics or demand for Milo's service without evidence supporting that claim at the required scope

### Requirement: Platform boilerplate and title-only evidence isolation
The system SHALL distinguish specific community descriptions and discussion provenance from platform-wide discovery text, navigation, login boilerplate and global platform counts. It SHALL exclude generic boilerplate from active inference support without erasing retained source URLs or audit records. A community name or topical post title SHALL NOT by itself establish membership composition or full supported fit coverage. When only titles and boilerplate remain and there is no usable community context, qualification SHALL be deferred without a paid qualification request or invented numeric score. Specific sparse community descriptions SHALL remain usable; a short body SHALL NOT be an automatic rejection.

#### Scenario: Facebook title plus global discovery boilerplate
- **WHEN** a result consists of a wedding-planning title followed by generic popular-groups text and a platform-wide user count
- **THEN** the title/source remain visible, the boilerplate does not support audience/activity/size claims, and qualification stays needs-evidence without a paid scoring request

#### Scenario: Specific sparse metadata survives filtering
- **WHEN** a short public description explicitly identifies the community's members and planning purpose
- **THEN** it remains citable community context despite a short or absent body, while search-only claims stay provisional

### Requirement: Participation-based public-forum eligibility
The system SHALL recognize public forums and peer/member communities from citable evidence of hosted community structure and participation, including ordinary descriptions of members asking questions, sharing tips or helping other members. Eligibility SHALL NOT depend on one fixed phrase or familiarity with the domain. A forum label alone, topical article, vendor portfolio, directory or noninteractive advice page SHALL NOT establish a community. Community existence and requested audience fit SHALL remain separate decisions, with insufficient audience evidence deferred rather than disguised as a non-community rejection.

#### Scenario: Planning forum with member participation
- **WHEN** a public forum describes planning questions and advice from fellow community members
- **THEN** it passes community eligibility and proceeds to evidence-scoped qualification rather than being excluded for missing a fixed phrase

#### Scenario: Brides and grooms helping each other
- **WHEN** a public wedding forum asks brides and grooms to comment on questions and help other couples plan their weddings
- **THEN** that participation evidence can establish a community even without the exact phrase public forum or community for

#### Scenario: Forum word without interaction
- **WHEN** a vendor, article or directory merely uses the word forum or a wedding community name without participation evidence
- **THEN** it does not become an eligible community solely because of that label

### Requirement: Candidate-scoped strict native citations
Native triage SHALL make each candidate's allowed evidence IDs explicit in its bounded structured-output contract. Classification and qualification SHALL consistently distinguish supported claims requiring exact input IDs from unknown claims requiring no supporting citation. Server validation SHALL remain authoritative for candidate association, excerpt existence, citation shape/cardinality and claim scope. Safe failure diagnostics SHALL distinguish missing required citations, invalid citation shape/cardinality, unknown excerpt IDs, cross-candidate references and claim-scope mismatches using bounded categories and available safe completion metadata. Diagnostics SHALL NOT store raw prompts, model output, credentials or private/member passages. Successful response usage SHALL settle once before validation failure is reported. Invalid output SHALL remain rejected without JSON repair, guessed citations, discarded invalid claims, model/provider switches or automatic paid replay. Existing completion limits, spending/cooldown/unresolved-charge gates and ZDR/no-fallback routing SHALL remain enforced.

#### Scenario: Valid multi-candidate native triage
- **WHEN** a mocked native response classifies several candidates using only the exact evidence IDs associated with each
- **THEN** every supported decision is accepted through the production parser and validator without a triage deferral

#### Scenario: Cross-candidate citation
- **WHEN** a triage response cites an excerpt that exists but belongs to another candidate
- **THEN** the batch is rejected with the safe cross-candidate category, no unsupported decision is saved, usage remains settled and no paid replay follows

#### Scenario: Unknown, missing or malformed citation
- **WHEN** a successful native response contains an unknown ID, omits a required citation or supplies a disallowed citation shape/cardinality
- **THEN** the corresponding safe category is recorded separately from invalid JSON or provider-reported truncation without retaining raw output

#### Scenario: Syntactically valid but unsupported claim scope
- **WHEN** qualification cites a real title or discussion excerpt for an unsupported community-member claim
- **THEN** the unsupported ranking is not saved as a fully supported community assessment and a safe scope diagnostic or needs-evidence outcome explains the limitation

### Requirement: Scoped evidence reuse and offline quality regression
The system SHALL reuse sufficient saved canonical-community evidence before issuing bounded recovery searches, without requiring one fixed community phrase. Insufficient evidence SHALL NOT justify new discovery allowances, automatic paid replay or unsupported ranking. The project SHALL maintain authored, sanitized regressions for title/boilerplate-only inputs, thread-to-parent overgeneralization, evidenced public forums, supported partial/full provisional assessments and strict native citation failures, alongside the unchanged frozen healthy corpus. Validation SHALL exercise production completion/parsing paths with mocked catalog/completion transport and reject unmatched outbound requests. Deployment and ordinary reads SHALL NOT reassess completed historical results, repair stored scores or replay live runs. Implementation verification SHALL preserve research/review/source/identity records, completed results and all spending/reservation records without resets or migrations.

#### Scenario: Sufficient saved forum or community metadata
- **WHEN** saved sources already characterize a community and its relevant participation using ordinary wording
- **THEN** processing reuses those sources without fresh recovery searches and applies normal provisional or inspected trust rules

#### Scenario: Offline live-shaped quality matrix
- **WHEN** the shared offline native pipeline evaluates authored positive, mismatch and insufficient-evidence fixtures
- **THEN** eligible participating forums remain eligible, title/thread-only negatives do not become perfect-fit community ranks, supported coverage and contradictions remain correct, invalid citations remain rejected, and the healthy benchmark retains its recall/precision/deduplication/leader-safety thresholds without real provider calls

#### Scenario: Deployment with historical perfect scores
- **WHEN** the fix is deployed and existing live runs are read
- **THEN** their completed assessments and billing remain historical records and no paid reassessment or automatic score rewrite occurs
