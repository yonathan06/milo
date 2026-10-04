# Provider and target-site terms review

**Reviewed:** 2026-09-26  
**Decision:** Use Brave Search API for bounded discovery. The user confirmed that required provider and target-site permissions are in place. This authorization is user-provided; it was not independently verified. Recheck current terms and quotas before live calls. The community build permits credentialed paid calls only after reservation under the fixed shared $10 calendar-month cap; this is not permission to run a live pilot automatically.

## Tavily

Official pages reviewed:

- [Pricing](https://www.tavily.com/pricing) — Researcher tier currently advertises 1,000 API credits/month, no credit card, and stop-on-exhaustion; the page says credits reset on the first of each month. Pricing/quotas can change and must be rechecked before any pilot.
- [Platform Terms](https://www.tavily.com/terms) — Sections 2 and 3.2 limit use to internal business purposes and restrict using the Services or Output in connection with “unsolicited marketing proposals.” This app's prospecting and outreach-preparation use may fall within that restriction. Terms also define Output to include results, links, and other materials, but do not grant a clear, specific retention license for the prospect evidence this app intends to persist.
- [Privacy Policy](https://www.tavily.com/privacy) — Section 2.1 says Tavily collects query data and uploaded documents, may use portions of queries to improve responses absent a contrary contract, and may send query data to third-party search-index providers. Section 3 gives purpose-based retention criteria, not a fixed API query/output deletion period.
- [Acceptable Use Policy](https://www.tavily.com/acceptable-use-policy) — Reviewed alongside platform terms; does not resolve the use/retention conflicts above.

### Evidence retention decision

Do **not** persist Tavily-derived snippets, titles, descriptions, page text, candidate classifications, or inferred facts. This review also does not authorize retaining returned URLs as prospect evidence: URLs are part of Tavily Output, and no specific retention permission was established. Do not send personal or sensitive information in search queries. Do not make live Tavily calls for this workflow unless Tavily provides written authorization for prospecting/outreach-preparation use and clarifies permitted output retention/deletion (or replacement provider terms establish both).

Locally authored briefs, rubrics, reviewer notes, and review states are app data, not provider evidence. Their storage does not make an otherwise prohibited provider query permissible.

## Target-site access

- [Meta Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms) require express written permission for automated data collection. The user confirmed that required provider and target-site permissions are held; the permission grant and scope were not independently inspected.
- [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service) prohibit unauthorized or impermissible automated access and collection of information about users. A public invite URL alone is not permission to join or inspect membership.

Page fetching is limited to public pages under the user's confirmed authorization. No login, joining, messaging, CAPTCHA handling, access-control bypass, or private/member extraction is performed. Login/CAPTCHA/access-denied pages are rejected and recorded as diagnostics; the permission grant itself should be retained by the user and reviewed for scope.

## Brave Search API

Official pages reviewed on 2026-09-26:

- [Pricing](https://brave.com/search/api/) — Search is listed at $5 per 1,000 requests, with a $5 monthly credit (approximately 1,000 Search requests), and 50 QPS. Pricing and credits may change. A payment card is required; this is not a no-card free plan.
- [Terms of Service](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service) — Standard terms limit storage to transient storage necessary to operate the application and prohibit otherwise storing, caching, or building a database of results. Persistent storage requires a plan or separate terms explicitly granting storage rights. Standard terms also prohibit redistributing/publishing results and using them to train or improve AI models/services.
- [Privacy Policy](https://api-dashboard.search.brave.com/documentation/resources/privacy-policy) — Brave states that it may retain API-account search-query records for up to 90 days for billing and troubleshooting; enterprise Zero Data Retention is separately available.

The user confirmed that the required permissions for the planned use and retention are held. On that basis, select Brave for the planned bounded query use and local persistence. The permission grant itself is not reproduced or independently verified here; do not treat this note as evidence of its scope beyond the user's confirmation. Before live calls, configure a hard monthly $10 cap, reserve estimated request cost before each call, and stop on quota or permission uncertainty. At listed pricing, 1,000 requests cost $5 before any applicable monthly credit; chargeable use must never exceed the $10 cap. Do not use returned results to train models or redistribute/publish them.

## OpenRouter inference

Official OpenRouter references reviewed on 2026-09-26:

- [Chat completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request) — OpenAI-compatible chat-completion API; `max_completion_tokens` bounds generated output. Responses may include prompt/completion token usage and cost.
- [Model catalog](https://openrouter.ai/docs/api/api-reference/models/get-models) — `GET /api/v1/models` lists model-specific prompt, completion, and request prices. Rates are model-specific and can change; do not hard-code them.
- [Zero Data Retention](https://openrouter.ai/blog/insights/zero-data-retention/) and [provider directory](https://openrouter.ai/providers/) — provider routing supports data-collection denial and ZDR restrictions; availability depends on the model's eligible upstream providers.
- [OpenRouter support/privacy](https://openrouter.ai/support/) — OpenRouter states it does not log prompt/completion content by default, but it retains request metadata; upstream inference providers have their own data policies.

The implementation requires `provider.data_collection = deny`, `zdr = true`, `require_parameters = true`, and `allow_fallbacks = false`. It reads the selected model's catalog pricing, bounds input tokens conservatively from UTF-8 request size, sets a hard completion-token limit, reserves a buffered maximum cost in the shared SQLite ledger before inference, then reconciles reported usage. Missing prices, unavailable ZDR routing, missing credentials, or an unaffordable reservation stop the request. This still transmits user briefs and public-page text to OpenRouter and the selected upstream; do not submit private/sensitive brief details. OpenRouter and the upstream may retain request metadata even with ZDR.

### Model selection update (2026-09-25)

The selected fixed model for the local prospector is `google/gemma-4-31b-it`; no environment-based override is supported. Model/provider availability, prices, and eligible ZDR routes are dynamic and must be rechecked through the live model catalog/provider routing before paid inference. The client requires structured-output parameter support, data collection denied, ZDR, and provider fallback disabled. References: [Gemma 4 31B IT free model page](https://openrouter.ai/google/gemma-4-31b-it), [structured-output guidance](https://openrouter.ai/docs/guides/features/structured-outputs), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection). Historical prices/provider counts are intentionally omitted; the implementation reads current catalog prices.

## Public community leader boundaries (implementation update, 2026-10-02)

This implementation note is not a new legal/terms verification. The existing user-confirmed permission scope remains controlling. Independent forums and association community sections still require authorized public-only inspection; a public URL is not an access-control or retention permission grant.

Leader evidence is limited to narrowly scoped inspected public About/rules/team/contact operator sections, at most three explicitly named community-scoped operators. Keep role source excerpts, observation dates, and any independently evidenced business route. Optional published public profile links are provenance, not authorization to inspect private profiles. Search hints, name similarities, posting frequency, shared emails/domains and ordinary membership cannot establish verified leadership or contact. Do not harvest member/comment lists, personal telephone numbers, private profiles or unrelated people databases. Leader enrichment uses the same two linked-page allowance, not an additional crawl budget. Missing leaders are acceptable and do not affect fit.

A published role is not a business-contact claim; a business route is not promotion permission. Save permission separately as allowed/prohibited/unknown with public rule citations. Unknown/prohibited rules, an unverified page, missing route or unselected state block manual promotional drafts. There is no automated sending, joining, logging in or CAPTCHA bypass. Keep the durable spending ledger and unresolved reservations through research resets/rollbacks; no maintenance operation authorizes a fresh budget or new provider fallback.

## Gate before live calls

Use Brave for search and OpenRouter for inference; do not fall back to Tavily or Serper implicitly. Keep result persistence and automated target-site inspection within the permissions the user confirmed. Recheck current terms/prices and ZDR availability before a live pilot, keep API credentials server-only, enforce the shared $10 cap before paid requests, and record reconciled usage. No live call was made during this review.
