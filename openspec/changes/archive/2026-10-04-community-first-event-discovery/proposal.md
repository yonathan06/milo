# Proposal

## Why

The prospector should find event-planning and consulting communities for weddings, family celebrations, and company events, then identify their publicly named leaders when available. Current mandatory creator/WhatsApp lanes, custom-site rejection, and costly enrichment of weak or inaccessible candidates prevent that outcome; the September 30 run saved 20 leads but scored only four, with no suitable contact routes.

## What Changes

- **BREAKING**: Replace legacy mixed/creator research with community-only research and separate wedding, family-event, company-event, and professional-planner presets. Start with a fresh research database; no legacy request, plan, assessment, or schema compatibility is required.
- Generate audience-first queries for selectable Facebook, Reddit, independent forum/association, Discord, and optional WhatsApp lanes without mandatory creator or WhatsApp searches.
- Accept evidenced independent communities and association community sections, but not isolated vendor websites, directories, articles, or event listings as community prospects.
- Normalize discussion URLs to their evidenced parent community, preserving threads as provenance.
- Add conservative snippet-first triage and a bounded shortlist before fetching or paid recovery searches; ambiguous candidates remain reviewable.
- Separate audience relevance, evidence of demand, evidence completeness, activity, and outreach readiness. Missing facts remain unknown.
- Enrich relevant communities with explicitly named public leaders, role evidence, public business contact routes, and promotion/partnership rules. Leader availability is optional and never determines audience fit.
- Separate page-access failures from inference failures, resume qualification from saved evidence, and preserve spending/routing safeguards.
- Expose funnel diagnostics and a reproducible offline benchmark plus an opt-in live pilot.

## Capabilities

### New Capabilities

None; extend the existing marketing prospecting capability.

### Modified Capabilities

- `marketing-prospecting`: Community-first event research, bounded triage, parent-community identity, public leader enrichment, explainable qualification, recoverable processing, and stage-level diagnostics.

## Impact

- Target: `apps/marketing-prospector/`; changes to rubric/planning, discovery, identity/deduplication, enrichment, assessment, usage integration, server actions, and research/prospect UI.
- Replace historical schema migrations with clean SQLite initialization for research settings, query lanes/stages, candidate audit state, qualification metadata, and community-scoped leader evidence. Existing research history may be cleared; preserve monthly spending records and unresolved reservations independently of that reset.
- Use a minimal set of offline integration/smoke checks for persistence, pipeline behavior, safety/budget boundaries, and UI, plus the fixture benchmark. Do not require per-helper unit tests or legacy migration tests. Update README, query guidelines, and pilot documentation. No new paid provider or dependency is planned.
- Existing main spec names `openai/gpt-4.1-mini`, while current code/README use `google/gemma-4-31b-it`. This change does not select or switch models; implementation must flag that pre-existing discrepancy rather than silently resolve it.

## Non-goals

- No automatic messages, membership joins, private/member harvesting, CAPTCHA bypass, authenticated scraping, or new Bright Data enablement.
- No standalone vendor/business prospecting, inferred leaders, automatic contact enrichment from unrelated people databases, scheduled crawls, historical mass recrawls, or legacy compatibility. Bounded query broadening and blocked-page recovery remain in scope.
- No increases to the existing shared $10 monthly cap, model/provider fallback, or automatic release of unresolved charges.
