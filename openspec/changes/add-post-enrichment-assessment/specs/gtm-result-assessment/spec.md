# Spec Delta

## Purpose

Provide an evidence-backed post-enrichment assessment of each search result's marketing match and separate permissions for posting and contacting community administrators.

## ADDED Requirements

### Requirement: Assessment follows meaningful enrichment
The system SHALL run assessment after successful factual extraction and the existing verification attempt. Failed or blocked enrichment SHALL NOT produce a match score. Assessment failure SHALL preserve successful enrichment and collected sources.

#### Scenario: Successful enrichment proceeds to assessment
- **WHEN** a result finishes enrichment with evidenced facts or posts
- **THEN** the job proceeds to a separately reported assessment phase and persists its outcome

#### Scenario: Assessment fails
- **WHEN** an assessment times out or returns invalid output
- **THEN** the enrichment remains available and the assessment is marked failed and retryable without rescraping

### Requirement: Explainable match score
Each completed assessment SHALL contain an integer match score from 0 through 100 or an explicit unknown value, confidence, explanation, component scores, evidence, and a rubric version. Match SHALL use actual saved discovery context and observed community content, not query geography or language as proof of community location. Missing evidence SHALL remain unknown rather than become a zero score. Without audience or event/video relevance evidence the total SHALL be unknown.

#### Scenario: Supported match
- **WHEN** supplied sources support a result's audience and event/video relevance
- **THEN** the assessment reports a bounded score with supporting source URLs and verbatim quotes

#### Scenario: Insufficient evidence
- **WHEN** only community size or activity is known and relevance is unsupported
- **THEN** the result remains unscored with an explanation instead of receiving a fabricated numeric match

### Requirement: Channel-specific permission assessments
The system SHALL separately report posting permission and admin-contact permission as allowed, approval required, prohibited, or unknown, each with an explanation and supporting evidence. Match score SHALL NOT change these permissions.

#### Scenario: Strong match but posting prohibited
- **WHEN** a result has a high match score and explicit rules prohibiting commercial posts
- **THEN** its score remains visible while posting permission is prohibited

#### Scenario: Channels have different rules
- **WHEN** sources permit posting with approval but prohibit promotional admin contact
- **THEN** posting shows approval required and admin contact shows prohibited independently

### Requirement: Conservative permission interpretation
Allowed permission SHALL require explicit evidence authorizing the specific commercial channel. A visible admin profile or public contact route SHALL NOT be treated as consent. Unsupported, stale, failed, or missing permission evidence SHALL NOT be presented as allowed. Every assessment SHALL retain a human-review-required indication and SHALL NOT send messages or grant approvals.

#### Scenario: Admin profile without contact consent
- **WHEN** a community lists an administrator but contains no explicit permission for commercial contact
- **THEN** admin-contact permission is unknown, even if the result is a strong match

#### Scenario: Existing approval is not transferable
- **WHEN** an assessment is refreshed or a new enrichment is assessed
- **THEN** a prior human approval is not automatically applied to the new evidence or assessment

### Requirement: Assessment-only execution
The system SHALL support explicit result and segment-scoped assessment of existing meaningful enrichments without calling scraping providers. Enrichment actions SHALL assess eligible already-enriched results lacking a current assessment rather than silently skip them. Scope identifiers SHALL be validated server-side, and overlapping assessment/enrichment jobs SHALL NOT duplicate provider work.

#### Scenario: Previously enriched result
- **WHEN** the user requests assessment of an already-enriched result with no current assessment
- **THEN** saved sources are reused, no scrape is started, and assessment progress is shown

#### Scenario: Invalid scope
- **WHEN** a requested result does not belong to the requested segment
- **THEN** the action rejects the request before calling a model or scraping provider

### Requirement: Persisted assessment provenance and history
The system SHALL retain assessment attempts independently of immutable enrichment and review records, identifying the source enrichment, context snapshot, rubric version, model, timestamps, outcome, and errors. Context or enrichment changes SHALL mark prior assessments non-current. Older successful attempts SHALL remain inspectable, but SHALL NOT silently restore current permissions after a failed refresh or expired evidence.

#### Scenario: Changed discovery context
- **WHEN** an assessed result acquires new discovery context
- **THEN** its old assessment is marked stale and can be reassessed without overwriting the prior outcome

#### Scenario: Failed reassessment
- **WHEN** reassessment fails after a successful older assessment
- **THEN** the detail page retains historical evidence while current permission displays remain conservative

### Requirement: Table and detail presentation
Both results tables SHALL show separate match score, posting permission, and admin-contact permission columns. Numeric match scores SHALL support ascending and descending sorting; unknown scores SHALL not masquerade as numeric zero. Default ordering SHALL show scored results first, followed by enriched unscored results and non-enriched results. Detail pages SHALL show score components, confidence, explanations, evidence, assessment status, and retry controls.

#### Scenario: Sorting scored and unknown results
- **WHEN** the table is loaded or the match-score sort direction changes
- **THEN** scored results sort numerically, with unknown values distinguished from valid zero scores

#### Scenario: Viewing permission evidence
- **WHEN** the user opens an assessed result
- **THEN** posting and admin-contact permissions each show their own rationale and evidence alongside, not merged into, the match breakdown

### Requirement: Compatible deployment
Schema initialization and migration SHALL remain explicit CLI operations, never read-page side effects. Existing initialized data and outreach reviews SHALL be preserved, and legacy verification-only results SHALL display assessment pending rather than an invented 0–100 score.

#### Scenario: Legacy result after migration
- **WHEN** the application reads an existing enrichment without a new assessment
- **THEN** its factual data and reviews remain intact and the user can start assessment without scraping again
