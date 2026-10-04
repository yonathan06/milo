# Design

## Context

See proposal.md for the incident and scope. The change crosses acquisition, evidence checkpointing, inference validation, persistence projections and offline verification, so a design is warranted.

Observed current implementation:

- `fetchPageWithFallback` accepts a page when any title/description/body exists. `processCandidate` likewise accepts `Facebook` or `Reddit` alone and replaces the saved snippet catalog with page material.
- `enrichPage` rebuilds the catalog from page/linked sources. `createEvidenceCatalog` omits excerpts shorter than 12 characters; generic platform titles consequently yield an empty catalog. Keeping the raw candidate audit does not currently prevent loss of the active inference input.
- Classification requires at least one exact citation but has no empty-input gate; it requests only 500 completion tokens and parses with plain `JSON.parse`. Qualification already rejects an empty catalog.
- OpenRouter reconciles successful requests before returning content, but discards finish reason and completion identifiers. Native JSON parsers consequently cannot distinguish confirmed truncation from malformed output. The incident's 17 JSON errors are known; their truncation cause is NOT known.
- Stage/error/evidence JSON, durable candidate sources, explicit retry, separate spending storage and existing query invalidation support repair without changing the schema. Shared fixtures commonly bypass native inference via classification/assessment callbacks, missing production response-handling bugs.

## Goals / Non-Goals

**Goals:** Keep trusted inspected evidence and provisional sources distinct; avoid impossible citation requests; make explicit saved-lead retry safe and idempotent; expose useful bounded output diagnostics; test the native completion/validation path offline.

**Non-Goals:** No research reset, schema migration, startup repair sweep, automatic rerun of the affected live run, new paid diagnostic calls, provider/model switch, JSON repair/guessed citations, access-control bypass, new crawler allowance, or general run-lifecycle redesign. The existing model-spec/code discrepancy stays flagged and unchanged.

## Decisions

### 1. Evaluate public evidence usability before verification

Use a shared inspection predicate in acquisition and candidate processing, including stored-page revalidation. Check extracted specific metadata/text and the resulting citable material, not HTTP status or a title alone. Empty pages and known generic platform titles without specific metadata are unusable; a short specific description or meaningful community title remains usable. This is a content-usability check, NOT audience or community eligibility classification: a readable vendor page still goes through normal reference-only rejection.

Explicit login/membership/CAPTCHA/network-security blocks remain access walls. A generic shell with no observed restriction is an extraction failure, not a wall-cache entry. Normal public browser rendering may still serve a genuinely dynamic public page within current limits; an explicit wall must never escalate to interaction/bypass.

Alternative rejected: a blanket minimum body-length rule, which discards legitimate sparse community metadata. Generic titles cannot justify verification or inference on their own.

### 2. Retain source layers and select a trustworthy active catalog

Keep original snippets in the existing candidate/source records throughout inspection and enrichment. Build the active catalog from usable inspected material when present, otherwise from retained snippets and already saved identity-matched references. Keep source URLs and field provenance exact. Do not silently mix provisional snippets into a page-mode catalog: source mode must represent the trust of the claims being scored. Empty linked sources must not overwrite a usable catalog.

When no usable catalog remains, checkpoint a needs-evidence/deferred classification/scoring state without invoking paid inference. A shell plus usable snippets can proceed through native classification and qualification with `sourceMode: snippet`, low confidence, unverified page, deferred/disabled verified-leader work and blocked outreach. Do not invent fit, leader, contact or permission facts to complete a stage.

Alternative rejected: retaining `page` mode just because an HTTP fetch succeeded, or falling back to deterministic numeric fit based on names.

### 3. Repair only incomplete saved leads on explicit retry

Before retry treats `evidence.page` as a successful inspection, revalidate it. For an incomplete lead saved with a generic/empty shell, preserve the public observation/audit, clear its use as verified evidence, rebuild from retained candidate/source records, and resume missing stages. Reuse sufficient saved material rather than rediscovering or issuing recovery searches for this ranking repair. Preserve genuine successful pages, valid completed assessments, selected state, existing identity aliases and settled usage. Repeating successful recovery must not generate more inference, suggestions, observations or settlements.

Use schema-200 JSON/state fields; do not reset or migrate a workspace and do not mutate data on ordinary reads. Existing Enrich / retry remains the explicit trigger; deployment alone starts nothing. Historical run `partial` status may continue to describe the original discovery attempt; current stage/funnel projections show retry progress without a separate lifecycle overhaul.

Alternative rejected: bulk startup reclassification or direct editing of the reported run to appear complete. This would erase evidence of the incident or replay paid work without authorization.

### 4. Preserve safe completion metadata and validate strictly

Expose bounded metadata from the native completion path: provider finish reason, safe generation/request ID when available, configured completion limit and actual reported token counts (separate from fallback estimates). Reconcile successful-call usage first, including malformed/truncated content. Reject provider-reported output-limit failures with a typed/safe diagnostic; classify invalid JSON and unknown citation IDs separately. If metadata is absent, show unknown rather than guessing truncation. Persist a bounded diagnostic through existing stage errors/triage reasons; do not store raw output, prompts, credentials or member content.

Use compact-output prompts, concise schema text bounds, and allowed-ID constraints where the structured-output route supports them, with server validation remaining authoritative. A proposed initial classification ceiling of 1,000 tokens (rather than 500) remains below the existing 4,096 maximum and must be fully included in preflight reservation; retain bounded triage/qualification outputs. No adaptive output-budget escalation or automatic paid replay is added. Keep ZDR, data-collection denial, required parameters, no fallback, conservative timeout settlement, cooldown and unresolved-charge blockers unchanged.

Alternative rejected: stripping fences, guessing missing JSON delimiters, dropping bad citations, or switching models when validation fails. None establishes trustworthy supported claims.

### 5. Extend shared scenarios, including native inference

Add small authored shell/metadata fixtures outside the frozen 24-community benchmark. Exercise actual classifier/qualifier and JSON validation using an injected mocked OpenRouter catalog/completion fetcher with dummy credentials; stub public-page/search acquisition separately. Fail tests on any unmatched outbound request. Do not rely solely on callback validators that skip the production completion path.

Cover Facebook/Reddit title-only responses, sparse usable descriptions, explicit network/login walls, empty catalogs, an existing stored bad snapshot, valid compact provisional scoring, provider-reported truncation, invalid JSON without metadata, unknown IDs and repeated explicit retry. Assert zero inference/reservations for empty input, low-confidence snippet scores with unverified pages, unchanged search counts during repair, single settlement for invalid paid responses, and no duplicate successful results. Reuse the existing safety, persistence, UI and benchmark suites rather than proliferating helper tests.

## Risks / Trade-offs

- [Heuristics reject real sparse pages] -> Test specific metadata without body text and keep eligibility separate from usability; prefer explicit unknown over verified shells.
- [Snippets overstate membership or demand] -> Exact citations, provisional mode/low confidence, no verified operators/contact/permission, and unchanged independent signal semantics.
- [Larger bounded output reservation reduces affordable throughput] -> Include the ceiling in current dynamic pricing and the shared cap; no implicit budget expansion.
- [Providers omit useful completion metadata] -> Keep unknown values explicit; do not diagnose all parse errors as truncation.
- [Deterministic fixtures still cannot prove model quality] -> Test the native protocol path and retain stated benchmark limitations; no live success guarantee.

## Migration Plan

Implement/test on isolated temporary or in-memory databases using Node 24. No schema/data migration or reset is necessary. Deployment only changes code; the existing live run and billing stay untouched. If process restart is needed during apply, announce it first and preserve any active work. The user can later explicitly retry individual saved leads under normal spending checks; no live replay belongs to this implementation authorization. Roll back source/build if necessary while retaining current research and authoritative budget storage.
