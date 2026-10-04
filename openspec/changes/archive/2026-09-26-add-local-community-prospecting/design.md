# Design

## Context

See proposal.md and specs/marketing-prospecting/spec.md. Repository is a pnpm workspace with a static Astro landing page in `apps/landing-page`; `/` and `/he/` render the same illustrative WhatsApp conversation. Its README explicitly says the site does not provision a backend or connected editor, and the WhatsApp number is optional. There is no prospect database or service to reuse. Model inference is remote through OpenRouter; credentials are explicit server configuration, while the lightweight decision-making model is hard-coded to `openai/gpt-4.1-mini`.

## Goals / Non-Goals

**Goals:**
- Isolate local research data, credentials, and browser activity from the public landing site.
- Preserve an inspectable chain from brief and predeclared rubric through queries, source observations, scoring, suggestions, and selected-prospect draft.
- Fail closed on provider quota, unsupported page access, model unavailability, and spending uncertainty.

**Non-Goals:**
- Replicate Facebook or WhatsApp internal search, access private groups, or infer group members/admin phone numbers.
- Serve a publicly deployed marketing CRM, provision a video editor, or make claims about Milo delivery capacity.
- Send messages, log into social networks programmatically, create landing pages, or operate affiliate/referral infrastructure.

## Decisions

### 1. Separate loopback-only workspace

Create `apps/marketing-prospector` as a Node 24 TanStack Start (React) application in the existing pnpm workspace. Use Start routes for the small review UI and server functions for SQLite reads/writes and research actions; keep database and API-key imports server-only. No separate API service, authentication middleware, accounts, or sign-in flow. Bind both development and local production servers only to `127.0.0.1`, validate mutation requests' origin, and never expose API keys to client code. Keep research data and credentials out of the public Astro bundle; leave existing landing routes unchanged. A CLI-only approach would make brief submission, per-prospect review, and on-demand draft selection cumbersome; integrating this into the static landing page would leak internal concerns into a public site. Loopback binding and origin checks are minimal safeguards for an unauthenticated local app, not an invitation to expose it on a LAN.

Persist research data in local SQLite: runs, queries, community findings, source observations, brief-specific assessments, review states, suggestions, drafts, and usage ledger. Browser UI state may be transient; no hosted database or browser-local data store. Require one local writer and transactional updates so partial runs retain completed findings. Store the community identity and its platform separately: use recognized values such as Facebook, Reddit, WhatsApp, Discord, or forums when identified, and `custom_website` for a community hosted on an unrecognized/custom website. Keep original source URLs, canonical community URLs, and observed timestamps. Do not discard a relevant community solely because its platform is unfamiliar. Credentials live in ignored local environment configuration, never in SQLite or logs.

### 2. Automated community discovery pipeline

After a user submits a brief, run the following pipeline automatically:
1. Generate 5–10 search queries from the brief.
2. Search with a Brave or Serper provider adapter and collect approximately 50 result URLs.
3. Filter URLs by deduplication, junk exclusion, domain rules, and recognized platforms. Keep relevant custom websites rather than restricting discovery to named social networks.
4. Fetch pages with HTTP and Cheerio; use Playwright as a fallback when needed to render a page.
5. Extract title, description, page text, platform, and community URL.
6. Classify results with rules or an LLM, returning relevance from 0 to 1, a reason, and community type.
7. Persist findings in a local SQLite `communities` table.

Each row records both community type and platform. Recognize platforms such as Facebook, Reddit, WhatsApp, Discord, and forums; use `custom_website` when the community is on an unrecognized/custom website. The platform list is extensible. Retain source URLs and query provenance for each finding.

The monthly external-service spend cap is $10. Meter search API usage and stop before a request that would exceed the remaining cap. Fetch only public pages; do not log in, join communities, send messages, bypass CAPTCHA or access controls, or collect private/member information.

### 3. Run-frozen agent rubric and structured outputs

Use OpenRouter for rubric/query-plan generation, candidate classification, evidence-based scoring, and selected-prospect draft generation. Require `OPENROUTER_API_KEY` and hard-code `openai/gpt-4.1-mini` for lightweight decision-making across planning, classification, scoring, and drafting. Do not require or accept an `OPENROUTER_MODEL` override. Fail closed with setup guidance when credentials or an eligible route for the fixed model are unavailable. Read the selected model's current prompt/completion/request rates from OpenRouter's model catalog. Before each inference request, estimate a conservative input-token upper bound from serialized UTF-8 request size, cap completion tokens, reserve a buffered maximum cost in the shared monthly ledger, then reconcile returned usage. Route with data collection denied, Zero Data Retention required, and provider fallbacks disabled; fail closed if no eligible route or price is available. Paid calls are enabled without an opt-in flag and share the fixed $10 calendar-month cap with Brave Search. This permission does not bypass credentials, current pricing checks, provider/source permissions, eligible structured-output/ZDR routing, or pre-call budget reservations; it does not authorize purchases, subscriptions, or automatic top-ups. Validate model output against bounded schemas; the model cannot initiate network calls itself. Deterministic code handles URL normalization, deduplication, confidence rules, scoring range, threshold comparison, and budget enforcement.

A run starts with a saved rubric: relevance dimensions and weights summing to 100, high-relevance cutoff (default 80/100), and search plan. Freeze it before search results are assessed. Apply scores only within that brief; store score, dimension breakdown, rationale, and source references on each brief-prospect assessment, not on global prospect identity. Confidence (e.g., snippet-only / independently confirmed) and contactability (unknown / suitable public route / unsuitable) are separate enums. For every score meeting the cutoff, create a prospect-specific landing-page suggestion; infer a likely language only from evidence and mark it unverified when necessary. Show suggestions even at low confidence, as agreed. If model output is invalid, skip affected assessment with a visible error, not a made-up score.

### 4. Draft only at selection; preserve manual boundary

On selection, reload prospect and public evidence; if no suitable contact route or rules forbid promotion, explain blocker without offering an improvised path. Otherwise produce an editable, evidence-grounded introduction and ordered instructions for that channel (for example, a publicly listed business email or visible contact-admin path). Explicitly flag facts the marketer must check. Use only confirmed Milo positioning from the landing page; avoid promises about editor availability, free trials, turnaround, pricing, referrals, or commissions. Never wire an outbound-send endpoint, social login, or automatic schedule. A separate status can record that a person contacted a prospect; it must not imply the app sent anything.

### 5. Budget, quality gate, and observability

Meter Brave Search and OpenRouter inference against the shared hard $10 calendar-month cap. Reserve estimated maximum cost before every paid request, reconcile actual usage, and stop before any request that could exceed the remaining budget. Record per-provider usage, query counts, run state, and partial errors. Fixture-test query generation, approximately 50 URL results, URL filtering/deduplication, page extraction, platform/custom-website classification, relevance output, provider failure, cost reservation/reconciliation, budget exhaustion, and partial SQLite persistence.

## Risks / Trade-offs

- **Search index misses or misclassifies communities** -> use diverse bounded queries, report channel coverage and unknowns, evaluate real pilot precision rather than promise recall.
- **Public WhatsApp links become stale or expose sensitive membership** -> keep source context, avoid joining/harvesting, mark status unverified, refresh only via manual new run.
- **Model hallucinates fit, language, contacts, or service claims** -> schema validation, citations, explicit unknown states, fixed rubric, human review before external communication.
- **Provider storage or platform terms conflict with prospect persistence** -> review current terms before integration; retain only independently verified facts allowed by source, disable adapter if incompatible.
- **Brave quota or OpenRouter credentials/fixed-model/ZDR route unavailable** -> fail closed, retain partial results, show setup/quota diagnostics, and never fall back to an unapproved provider.
- **Unauthenticated local server or data file exposed accidentally** -> loopback binding in dev and production, origin checks for mutations, ignored secrets/data paths, and no network-accessible deployment configuration.

## Migration Plan

Add the workspace app and ignored local data/config paths without modifying existing landing pages. Configure Brave and OpenRouter credentials explicitly. Use the hard-coded `openai/gpt-4.1-mini` model with paid calls enabled without an opt-in flag, subject to the fixed shared $10 calendar-month cap. Preflight current model pricing and structured-output/ZDR route eligibility before running the bounded pilot; fail closed rather than substituting another model or weakening routing restrictions. Rollback by stopping/removing the local app; public site remains untouched. Preserve or export local data before deleting its SQLite file.
