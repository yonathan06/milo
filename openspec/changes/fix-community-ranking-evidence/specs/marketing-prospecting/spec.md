# Spec Delta

## ADDED Requirements

### Requirement: Usable public evidence selection
The system SHALL distinguish usable inspected public metadata or text from empty responses, generic platform shells, and explicit access walls before declaring a community page verified. HTTP success and a generic platform title alone SHALL NOT establish verification. A sparse page with specific citable public community metadata SHALL NOT be rejected solely because its body is short. Original search snippets and source provenance SHALL survive inspection and enrichment. When inspection supplies no usable community-specific evidence, the system SHALL use available retained snippets or identity-matched references only as provisional evidence, with the page unverified and low assessment confidence. Provisional material SHALL NOT establish verified leadership, business contact, promotion permission, or outreach readiness. An empty shell without evidence of an access restriction SHALL NOT be cached as a genuine access wall.

#### Scenario: Generic platform shell
- **WHEN** a candidate returns only a generic Facebook or Reddit title without usable public community metadata or text
- **THEN** the page remains unverified, its useful search snippets remain available for provisional qualification, and it is not presented as an inspected community merely because the response succeeded

#### Scenario: Sparse but specific public metadata
- **WHEN** a public page has little body text but supplies citable community-specific description or metadata
- **THEN** that public evidence remains usable without applying a blanket minimum-body-length rejection

#### Scenario: Enrichment cannot erase source evidence
- **WHEN** inspection or linked-page enrichment supplies empty or generic material
- **THEN** original search snippets and their source provenance remain intact and cannot be promoted into verified page or operator evidence

#### Scenario: Explicit access restriction
- **WHEN** a public response explicitly requires login, membership, CAPTCHA, or reports a network access block
- **THEN** the system preserves the existing access-control gates and wall-cache limits without attempting to bypass the restriction

### Requirement: Empty-evidence ranking gate and saved-lead recovery
The system SHALL NOT initiate paid citation-required classification or qualification with an empty usable evidence catalog. It SHALL retain such leads as needing evidence or deferred with a visible explanation, without inventing citations, numeric fit, or an audience rejection. An explicit retry of an incomplete saved lead SHALL revalidate its stored evidence, rebuild provisional input from retained sources when a previously saved shell is unusable, and resume only unfinished stages without rediscovery. This recovery SHALL preserve canonical identities, source audit, review state, valid completed results, and all charge records and unresolved reservations. Loading a workspace or deploying a fix SHALL NOT automatically replay paid work or reset research data.

#### Scenario: No usable evidence
- **WHEN** neither inspected public material nor retained snippets or identity-matched references produce a usable catalog
- **THEN** no paid classification or qualification request is made and the lead remains visible as needs evidence rather than a fabricated nonmatch

#### Scenario: Retry previously misverified shell
- **WHEN** a user explicitly retries an incomplete saved lead whose stored page is only a generic shell but whose search sources contain usable audience evidence
- **THEN** the system corrects the evidence mode to provisional and resumes citation-backed classification and qualification under the shared spending cap without repeating discovery or resetting records

#### Scenario: Repeat successful recovery
- **WHEN** an explicitly recovered lead is retried again after its qualification completed
- **THEN** completed results and successful inspected evidence are reused without duplicate assessments, suggestions, observations, or charge settlement

### Requirement: Bounded model-output failure diagnostics
The system SHALL request bounded compact structured responses for citation-backed ranking and SHALL reject malformed JSON and invalid citations without attempting to fabricate or heuristically repair supported claims. Failure diagnostics SHALL distinguish missing input evidence, invalid JSON, invalid citations, and provider-reported output truncation. Where the provider supplies completion metadata, diagnostics SHALL retain the finish reason, configured output limit, reported token counts, and a safe request identifier; unavailable values SHALL remain unknown and truncation SHALL NOT be asserted solely from a parse error. Diagnostics SHALL NOT retain credentials, raw prompts, raw model responses, or private/member data. Successful HTTP responses that incur usage SHALL be authoritatively reconciled or conservatively settled before reporting output validation failures. Such failures SHALL NOT trigger automatic paid replay, a model/provider switch, or weakened citation, ZDR, no-fallback, spending, or unresolved-charge safeguards.

#### Scenario: Provider-reported truncation
- **WHEN** an inference response reports an output-limit finish reason and contains incomplete JSON
- **THEN** the affected stage reports truncated model output with available safe completion metadata while preserving evidence and settled usage

#### Scenario: Malformed output without truncation metadata
- **WHEN** an inference response contains invalid JSON but provides no output-limit finish reason
- **THEN** diagnostics report invalid JSON with truncation unknown rather than attributing it to a token limit without evidence

#### Scenario: Invalid evidence citation
- **WHEN** a syntactically valid response refers to an excerpt identifier not supplied in its input catalog
- **THEN** validation rejects that claim as an invalid citation, no unsupported ranking is saved, and the completed request's usage remains accounted for

#### Scenario: Valid response through the production path offline
- **WHEN** an offline provider fixture returns valid compact structured output through the same completion and validation path used for live inference
- **THEN** a supported provisional fit can be ranked with low confidence while the page remains unverified, without any real provider call
