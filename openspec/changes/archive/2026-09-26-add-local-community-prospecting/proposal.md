# Proposal

## Why

Milo's marketing team needs a repeatable way to turn free-text audience ideas into researched community and creator partnership prospects. Today the repository contains only a public, illustrative landing page; it has no prospect research, qualification, or outreach workflow. A local, low-cost internal tool can test audience opportunities without promising referral fulfillment or automating unsolicited messages.

## What Changes

- Add an internal TanStack Start workspace, bound to the local machine with no account or sign-in, where a marketer submits a worldwide audience brief and starts a single on-demand research run.
- Automatically discover relevant online communities across platforms through this pipeline: generate 5–10 queries, search with Brave or Serper for about 50 URLs, filter/deduplicate URLs and apply domain rules, fetch pages with Cheerio and Playwright fallback, extract title/description/text/platform/community URL, classify relevance and community type, then persist findings in SQLite. Record the platform for each finding (for example Facebook, Reddit, WhatsApp, or a custom website).
- Use OpenRouter for model-driven rubric/query-plan generation, relevance classification and scoring, and selected-prospect draft generation. Hard-code the lightweight decision-making model to `openai/gpt-4.1-mini` without a model override; bound completion tokens, preflight current model pricing and structured-output/ZDR eligibility, and reserve/reconcile inference cost through the shared monthly ledger. Require data-collection denial, Zero Data Retention routing, and no provider fallback.
- Derive relevance criteria from each brief before searching; score prospects against that brief, with evidence confidence and contactability tracked separately. Keep per-brief assessments when a prospect appears in multiple runs.
- Suggest a domain- and language-specific landing-page angle for each high-relevance prospect, including uncertain matches with a verification caveat. Suggestions never create or publish pages.
- On prospect selection, generate a reviewable partnership outreach draft and channel-specific manual-send guide using verified public contact routes and visible community rules. Never send messages automatically.
- Enforce a shared $10/month external-service cap across Brave Search and OpenRouter inference with bounded query/result/fetch volumes, paid calls enabled without an opt-in flag (still subject to credentials, permissions, routing checks, and the hard cap), pre-call maximum-cost reservation, usage reconciliation, and provider/source permission gates before live calls.
- Defer referral fulfillment, commissions, affiliate links, automated outreach, and landing-page generation/publishing to later changes.

## Capabilities

### New Capabilities
- `marketing-prospecting`: On-demand audience research, evidence-backed scoring, prospect review, landing-page suggestions, and manually executed outreach preparation.

### Modified Capabilities
None.

## Impact

- New local-only TanStack Start application with all prospect, run, and review data persisted in local SQLite; existing public Astro landing pages remain unchanged.
- Brave web-search and fixed-model OpenRouter inference integrations, optional local browser-assisted public-page verification, server-only API credentials, and a shared hard usage ledger.
- New tests for search-budget enforcement, deduplication, per-brief scoring, provenance, suggestions, and no-send boundaries.
- No existing OpenSpec capabilities or public APIs are changed.
