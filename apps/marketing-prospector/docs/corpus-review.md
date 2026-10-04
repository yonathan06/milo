# Offline corpus provenance and review

Reviewed by implementation-time inspection of authored passages, labels and deterministic provider responses (2026-10-02). **Synthetic, not live:** no claim that these are real communities or that a human externally verified a live website. `.example` identities, operator names, business emails and excluded member/comment content are invented test data. Platform-shaped URLs are fixtures only and are never fetched during automated checks. No private or harvested member data is present.

Source: `src/server/community-fixtures.mjs`; every row carries a synthetic provenance identifier, source URL, authored public metadata/page text, expected relevance, and named/unnamed operator label. Search distractors include vendor portfolios, generic directories, articles and marriage counseling. Deterministic provider responses exercise the actual search/triage/inspection/classification/qualification/leader pipeline; they are independent of live provider availability. The labels below were checked against the authored passages, not inferred from benchmark outputs.

There are six communities per segment, 24 total, 16 labeled relevant:

| Segment | Row ID | Community kind / label | Reviewed evidence and operator expectation |
|---|---|---|---|
| Wedding | wedding-0 | Facebook; relevant; blocked | Couples planning weddings in public metadata; login wall; no verified leader |
| Wedding | wedding-1 | Reddit; relevant | Wedding planning forum; two original threads, one subreddit; unnamed |
| Wedding | wedding-2 | Independent forum; relevant | Public peer community for couples; explicit forum breadcrumb; named founder and independent business clause |
| Wedding | wedding-3 | Association member section; relevant | Explicit member network, not mere association homepage; unnamed |
| Wedding | wedding-4 | House-building forum; negative | Explicit construction/contractor audience, not wedding events |
| Wedding | wedding-5 | Unclear forum; negative/needs evidence | Sparse snippet; public forum existence but no supported audience/topic; null fit |
| Family | family_event-0 | Facebook; relevant; blocked | Families planning birthdays/reunions; login wall; no verified leader |
| Family | family_event-1 | Reddit; relevant | Family celebration forum; two threads, one subreddit; unnamed |
| Family | family_event-2 | Independent forum; relevant | Family-event peer community; explicit parent breadcrumb; named role/business clause |
| Family | family_event-3 | Association member section; relevant | Explicit family-event member network; unnamed |
| Family | family_event-4 | House-building forum; negative | Construction rather than family celebrations |
| Family | family_event-5 | Unclear forum; negative/needs evidence | No public audience/topic support; sparse snippet; null fit |
| Company | company_event-0 | Facebook; relevant; blocked | Office managers/executive assistants planning events; login wall; no leader |
| Company | company_event-1 | Reddit; relevant | Company-event planning forum; two threads, one subreddit; unnamed |
| Company | company_event-2 | Independent forum; relevant | Company-event peer community; explicit parent breadcrumb; named role/business clause |
| Company | company_event-3 | Association member section; relevant | Explicit company-event member network; unnamed |
| Company | company_event-4 | House-building forum; negative | Construction rather than company-event planning |
| Company | company_event-5 | Unclear forum; negative/needs evidence | Sparse snippet; unknown audience/topic; null fit |
| Professional | professional_planner-0 | Facebook; relevant; blocked | Planner/consultant peers, not filmmakers; login wall; no leader |
| Professional | professional_planner-1 | Reddit; relevant | Professional planning discussions; two threads, one subreddit; unnamed |
| Professional | professional_planner-2 | Independent forum; relevant | Planner peer forum; explicit parent breadcrumb; named role/business clause |
| Professional | professional_planner-3 | Association member section; relevant | Explicit planner/consultant member community; unnamed |
| Professional | professional_planner-4 | House-building forum; negative | Building contractors are not event consultants |
| Professional | professional_planner-5 | Unclear forum; negative/needs evidence | Sparse snippet; unsupported public audience/topic; null fit |

All four named-role pages explicitly state “Casey Example is the founder” and a separate named business/partnership clause. The same invented display name/email across four communities must not merge leader or community identities. Other pages never establish a named operator. Public role sections survive narrow extraction; member/comment blocks and synthetic personal phones must not. Permission is independent: named-forum rules explicitly allow commercial partnership promotion; unnamed/blocked pages do not establish permission. Safety fixtures additionally cover prohibited rules, unsupported leader/contact output, private addresses/redirects, unsupported invites, partial/contradictory fit, invalid excerpt IDs, provider cooldown and unresolved charges.

## Frozen comparison

`offline-baseline.json` was captured by executing the stopped pre-community source snapshot on this same authored search/page corpus with deterministic provider stubs and enforced public access walls. Its source SHA-256 identifies the original discovery implementation. It uses the same frozen originals to isolate pipeline behavior, not compare model-generated plans. The old runtime is not shipped or called by the benchmark; only frozen evaluation results remain. Parent identities are mapped to reviewed labels for recall, while correct parent deduplication is reported independently (the baseline retained two Reddit thread identities per segment).

Simulated pricing: Brave searches $0.005 each; fixed evaluation proxies of 150µ$ per triage batch, 100µ$ classification, 300µ$ qualification and 200µ$ leader call. These are **not real model prices or invoices**. Production obtains dynamic model prices and reserves under the shared cap. Synthetic/mock-provider metrics cannot establish live recall, multilingual model competence, target-site permissions or access reliability. A live pilot remains separately opt-in.
