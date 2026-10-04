# Proposal

## Why

Run `588ff4c3-5033-4778-a3b6-38da71efc589` saved 25 leads but no assessments: 17 generic Facebook/Reddit shells were incorrectly treated as inspected evidence, overwriting useful snippets, and 18 classification attempts failed on malformed JSON or an invalid citation. The offline corpus did not cover these shell responses; the pipeline needs conservative evidence selection and actionable model-output diagnostics before users spend on repeat attempts.

## What Changes

- Distinguish community-bearing public metadata/text from title-only platform shells, empty responses, and explicit access walls. An HTTP success or a generic platform title is not verified community evidence.
- Preserve original search snippets and their source provenance through inspection/enrichment. Use them as provisional evidence when a page provides no usable facts, never as verified page/leader/contact evidence.
- Avoid paid classification/qualification calls when their required citation catalog is empty. Keep those candidates visible as needs-evidence/deferred, not wrong-audience or fabricated numeric scores.
- Support explicit retry of incomplete leads already saved with unusable shell evidence by rebuilding from retained sources without rediscovery, schema reset, or automatic paid replay.
- Request compact, bounded structured output and report malformed JSON, invalid citations, and provider-reported truncation distinctly, with safe completion metadata and authoritative usage settlement.
- Extend the existing shared offline pipeline, provider-safety and UI scenarios with platform shells, sparse valid metadata, empty catalogs and truncated/malformed responses. Preserve the healthy 24-community benchmark.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `marketing-prospecting`: Define usable public evidence selection, preservation of provisional sources, empty-evidence inference gating, and safe bounded model-output failure diagnostics for retriable ranking.

## Impact

- Application: `apps/marketing-prospector`, principally server `public-pages.ts`, `discovery.ts`, `enrichment.ts`, `openrouter.ts`, and citation/qualification callers; existing stage-error and evidence projections may need small UI changes.
- Persistence: reuse schema-200 evidence/error JSON and retained candidate/source records. Preserve existing runs, identities, review state, successful assessments and all billing records. No research reset, migration, new storage dependency, or startup mass repair.
- Safeguards unchanged: public-only/SSRF checks, access-wall cache, bounded discovery/recovery, exact citations, low confidence for provisional evidence, manual-only outreach, shared $10 cap, unresolved-charge blockers, ZDR and no provider fallback.
- The spec names `openai/gpt-4.1-mini` while code uses `google/gemma-4-31b-it`; this pre-existing discrepancy remains explicitly unresolved. No model/provider switch is part of this fix.
- Planning/implementation verification must remain offline. Retrying the user's actual run or making live diagnostic completions requires separate user direction; creating this change does not authorize either.
