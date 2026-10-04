# Design

## Context

See proposal.md for the live incident and `apps/marketing-prospector/docs/pilot-run-results.md` for the read-only evidence audit. This is a follow-up to implemented `fix-community-ranking-evidence`; that change remains unarchived and its delta requirements must remain intact when eventually synced/archived.

Observed implementation:

- `discovery.ts` concatenates candidate title/snippet and page title/description/body into undifferentiated `source:N` excerpts. It filters exact generic platform names, not the longer popular-groups/navigation boilerplate seen in live search snippets.
- Thread URLs normalize correctly to parent identities, but `classificationQualifies` applies no community-context check on Facebook/Reddit. Custom sites instead require one phrase in `hasCommunityEvidence`; both inspected positive forum cases fail that regex despite explicit peer participation. The same phrase check controls recovery reuse.
- `validateQualification` checks score ranges and exact excerpt IDs, not whether evidence supports the claim at community scope. A syntactically valid member-audience claim backed by a topical post title can therefore become 100% supported coverage. Member location and topical planning requests can become community-level location/demand/activity assertions.
- Native triage schemas use all candidate IDs and all evidence IDs independently; they do not express per-candidate association. Prompts and server limits disagree on 3 versus 5 citations. Unknown-claim schemas are looser than server validation. The validator correctly fails closed, but `parseCompletion` collapses different citation failures into one generic code.
- Existing shared native fixtures exercise real transport/parsing with authored valid IDs, but do not include these semantic negatives or realistic multi-candidate protocol confusion. The frozen healthy corpus remains useful as a regression baseline, not model-quality proof.
- Schema-200 JSON checkpoints, retained sources, stage-error projections and mutation invalidation provide extension points without storage migration. Completed results are reused on retry and must not be automatically recalculated.

## Goals / Non-Goals

**Goals:** Make community qualification depend on appropriate evidence scope; preserve valid sparse/provisional descriptions and real forums; make native citation contracts internally consistent and candidate-scoped; expose exact safe rejection categories; prevent unnecessary recovery when scoped community evidence is already sufficient; verify observable behavior through shared offline native scenarios.

**Non-Goals:** New model/provider or dependency, paid probes, automatic live retry, forced score diversity, hard-coded score ceilings, new audience weights, weakened citations or JSON repair, bulk historical score correction, schema reset/migration, arbitrary demographic inference, extra crawling allowances, or a general run-lifecycle redesign. Keep the existing fixed-model discrepancy explicitly unresolved.

## Decisions

### 1. Preserve provenance and label active evidence scope

Introduce shared active-catalog construction that retains source URL, field and canonical target alongside bounded evidence roles: community description/participation, discussion, title, identity-matched reference and unknown. Store these as optional schema-200 JSON metadata, not new tables or a second assessment format. Build new/incomplete-stage inputs from retained candidate/source records and saved public pages; do not mutate on read.

Keep title and description/body fields separate before catalog splitting. Strip known platform boilerplate from active input, decode ordinary markup/entities consistently, and preserve exact selected normalized excerpts and URLs in the catalog. Retained source audit is not erased. Boilerplate removal must not strip a specific sparse description or silently turn source snippets into inspected facts. Public-page structure/metadata, explicit descriptions of members/participation, and exact canonical identity provide context; URL shape alone or a topical title does not establish audience.

References linking to the target can supply explicitly scoped facts about that target, not all facts on a page or a suggested different subreddit. Keep unrelated/individual material out of community-claim support. Do not add harvested personal passages to fixtures or logs; use authored neutral examples.

Alternative rejected: a longer minimum-text rule, a blacklist of real community names, or treating any platform group URL/title as sufficient audience context.

### 2. Separate existence, community context and dimension support

Classify existence using citable structure plus peer participation, independent of audience fit. Replace the custom-domain fixed phrase veto with this shared evidence-aware decision, applied consistently across platforms. Positive language includes planning forums, fellow community members asking questions and brides/grooms helping one another; articles/vendors merely mentioning forums remain negative.

Before qualification, require usable canonical-community context. A parent with only one relevant thread remains needs-community-evidence and makes no paid scoring request; explicit broader-community descriptions can support a genuine audience contradiction rather than a guessed rejection. Sufficient explicit community descriptions allow provisional scoring even when the page is blocked.

Qualification's compact output must select an evidence basis for supported dimensions/signals from bounded scope categories and exact catalog IDs. Server validation checks the selected basis against available scope: title/discussion-only citations cannot support parent member composition; an individual's location cannot establish community geography; old/undated examples do not prove current activity volume; topical advice requests do not establish demand for Milo's service. Keep unknown claims empty and unsupported dimensions null. Scope violations yield a safe category or a needs-evidence gate, never silently discarded claims or fabricated replacements.

Preserve 70/30 weights and normalized supported scores. A supported planning-only dimension may still normalize to 100 with 30% coverage after community context is established; the UI must not describe that as perfect overall audience alignment. There is no requirement to fabricate a numeric distribution: the target is correct support/coverage, not fewer ties by fiat.

Alternative rejected: clamping snippet scores below an arbitrary value, assigning unknown audience a zero, penalizing missing contacts, or requiring an inspected page for every provisional qualification.

### 3. Bind triage evidence to compact candidate keys

Give a triage batch stable request-local compact keys such as `C1` through `C10`, mapped server-side to durable candidate IDs. Request a fixed object keyed by those keys; each candidate's evidence property enumerates only that candidate's supplied IDs. Require all candidate keys exactly once, with bounded reason/status/evidence fields. Empty-input candidates can return only ambiguous with empty evidence. Validate the mapping and associations again on the server.

Use one native citation contract throughout ranking: at most three IDs per supported claim, empty evidence for unknown claims, and exact object shapes. Align schema, prompt and stage validator limits; leader-specific existing bounds need not change. Conditional constraints must stay within the structured-output route's supported vocabulary; server checks remain definitive. Classification remains 1,000 completion tokens and triage/qualification 2,000, with schemas/output limits fully reserved.

Alternative rejected: larger output limits, per-candidate paid triage calls, accepting string/guessed/fuzzy IDs, dropping invalid rows to salvage a batch, or retrying model output automatically. Invalid batches remain safely deferred; structurally valid batches should no longer fail due to avoidable candidate-association ambiguity.

### 4. Preserve precise safe diagnostics without raw output

Replace message-regex-only citation categorization with typed bounded categories: missing citation, invalid shape/cardinality, unknown ID, wrong candidate and unsupported claim scope. Preserve the prior safe completion metadata and invalid JSON/provider-reported truncation distinction. Category labels, stage and optional bounded claim identifiers are enough; never persist quoted model output or arbitrary provider exception fields.

Usage settlement still precedes output validation and occurs once. Preserve provider cooldown, conservative timeout settlement, no fallback/ZDR, current-price/full-reservation checks and unresolved-charge blockers. The historical four qualification failures do not reveal their exact subcategory and must not be retroactively relabeled. Exercise each category with known authored native fixtures instead of paid diagnostic replay.

Alternative rejected: saving raw responses for debugging or asserting that every invalid citation means an unknown ID.

### 5. Share sufficiency with recovery and projections

Use the same scoped community-context decision for ranking and pre-recovery reuse rather than a fixed phrase plus audience-word list. Sufficient saved descriptions/participation avoid extra searches; title/thread-only candidates may use the existing bounded recovery allowance, not a new one. Original/fallback/recovery maxima stay unchanged.

Add bounded evidence-quality/deferral reasons to existing JSON and stage projections. Expose needs-community-evidence, supported partial coverage, provisional source labels and safe citation categories without implying inspected pages or outreach readiness. Preserve stage separation and historical partial-run status. Existing mutation invalidation should suffice, verified with representative UI/cache scenarios.

Alternative rejected: silently recomputing old completed assessments on deployment, rerunning discovery to fix a stored stage, or rewriting live runs to appear successful.

### 6. Test the defect matrix, not just helper outputs

Extend shared fixture/provider/pipeline checks with authored neutral cases representing the observed patterns, separate from the unchanged 24-community corpus:

- Generic popular-groups text plus topical community/post title: retained audit, no scoring request, no perfect rank.
- City parent plus wedding thread: canonical deduplication/source retention remains correct, community rank deferred without parent context.
- Explicit couples/planner community metadata: native classification/qualification succeeds provisionally with correct coverage and trust limitations.
- Ordinary planning-forum and brides-helping-brides descriptions: eligible; matching vendor/article/directory negatives remain excluded.
- Supported partial dimensions, explicit audience mismatch, personal-location/old-activity/unrelated-community claims: validate scope, unknowns and unchanged score math.
- Multi-candidate native triage and qualification responses: valid keys/IDs accepted; missing/shape/unknown/cross-candidate/scope failures rejected and settled once, with no raw-output retention.
- Temporary persistence and UI/cache: incomplete-stage rebuild and retry remain idempotent; completed historical results, identity/source/review/billing rows survive reads/retries without automatic reassessment.

Mock both model catalog and completions with dummy credentials, stub acquisition and reject unmatched outbound requests. Do not re-use harvested health/member passages or the live databases as regression fixtures. All new semantic assertions must exercise the production pipeline/validator, including injected syntactically valid but unsupported responses, not only model-prompt wording.

## Risks / Trade-offs

- [Scope metadata falsely claims membership support] → Derive source roles from provenance/context, validate claim basis against canonical target and test syntactically valid false claims; do not trust a model basis label alone.
- [Conservatism reduces scored yield] → Preserve specific sparse community descriptions and eligible peer-participation language; report deferral rather than fabricate certainty.
- [Broader forum recognition admits articles/vendors] → Require hosted structure plus participation and paired negative fixtures, not the word forum alone.
- [New protocol is valid but model still fails] → Keep typed diagnostics and fail-closed settlement; offline transport tests do not promise live model reliability. Any later live comparison is separately authorized.
- [Partial normalization is mistaken for full audience fit] → Preserve coverage and explicit unsupported-dimension labels; avoid arbitrary score caps or changing the rubric.
- [Completed historical perfect scores remain visible] → Preserve them as historical assessments and document the boundary; no automatic paid or silent retrospective correction is authorized here.

## Migration Plan

No schema migration or data reset. Implement and verify on in-memory/temporary databases under Node 24, retaining both live runs and durable charge records. Optional JSON scope fields are created only while processing new/incomplete stages; no mass backfill. Rebuild source/build without restarting the active production process unless a later operation explicitly requires and announces it. Roll back code/build if needed without restoring an older spending balance. Record offline results separately from the existing live failure report; authorize any subsequent paid run independently.
