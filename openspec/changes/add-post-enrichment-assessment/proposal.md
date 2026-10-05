# Proposal

## Why

GTM Copilot currently ranks results with a coarse audience-fit rating while posting and contact policy evidence is buried inside enrichment verification. Each result needs an explicit post-enrichment assessment that separates marketing match from channel-specific permissions, including for results already enriched.

## What Changes

- Add a persisted assessment step after successful extraction and verification, producing a 0–100 match score (or unknown), confidence, explanations, component scores, and source evidence.
- Assess permission to post and permission to contact admins independently: allowed, approval required, prohibited, or unknown. These are evidence-backed policy assessments, never authorization to send messages.
- Assess existing meaningful enrichments without recollecting sources; retry failed assessments without rerunning scraping. Preserve enrichment when assessment fails.
- Show match score and both permission assessments in all-results and segment-results tables, with sortable match score and a detail-page breakdown.
- Preserve existing immutable enrichment history, human reviews, and conservative outreach eligibility gates.

## Capabilities

### New Capabilities

- `gtm-result-assessment`: Post-enrichment match scoring, independent channel permissions, persistence, assessment-only retries, and research UI presentation.

### Modified Capabilities

None. The project currently has no main capability specs.

## Impact

- `apps/gtm-copilot/src/`: new assessment module and persistence schema/API; enrichment pipeline, CLI, existing verification integration, and CLI-only migrations.
- `apps/gtm-copilot/web/`: enrichment job phases, assessment POST action, read-store projections, tables, and result details.
- Tests and app documentation, including provider configuration and score/permission interpretation.
- Additional model usage for assessments; no new scraping providers, automated messages, segment editing, or permission-granting behavior.
