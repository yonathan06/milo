# GTM Copilot: community query planner

Generates multilingual community-discovery queries for a stored marketing segment country and saves them to SQLite. Uses AI SDK `generateText` + `Output.object`, Zod validation, and OpenRouter (`deepseek/deepseek-v4.1-flash` by default).

## Setup

Requires Node.js 24+ and pnpm. From the repository root:

```sh
pnpm install
cp apps/gtm-copilot/.env.example apps/gtm-copilot/.env
# Set OPENROUTER_API_KEY in that file.
pnpm --filter gtm-copilot db:init
```

Default database: `apps/gtm-copilot/data/gtm-copilot.sqlite` (ignored by Git). Override with `GTM_DATABASE_PATH`; relative paths resolve from the working directory. Opening the database **with the CLI** creates missing tables without deleting existing data.

## Research web app

Built with **TanStack Start for Solid**, **TanStack Query**, and **Tailwind CSS v4** via its Vite plugin. No API keys are needed to browse existing data.

```sh
# From the repository root; initialize/migrate the DB with the CLI first if needed.
pnpm --filter gtm-copilot db:init
pnpm --filter gtm-copilot dev
# Open http://127.0.0.1:3000
```

Pages:

- `/` — segments, descriptions, country/query/result counts, and segment search.
- `/results` — all saved search results in a TanStack Table, one row per URL, including results whose queries were deleted. Multi-select country and segment filters match the same discovery (OR within each selection, AND between country and segment), with text search, sortable columns, pagination, and links to result/segment details.
- `/segments/:segmentId` — countries and two tabs: **Queries** for planning, filtering, listing, and searching selected queries; **Search results** for a deduplicated table of this segment’s results, with country/text filters, discovery query links, ranks, and collection dates.
- `/queries/:queryId` — query rationale and collected results in stored rank order.
- `/results/:resultId` — result details, all discovery contexts, enrichment history, collected data, sources, limitations, verification, scrape metadata, and human reviews.

Browsing opens SQLite with `readOnly: true` and `PRAGMA query_only = ON`. Web mutations are explicit POST actions for **query generation**, **query search**, and **bulk enrichment and ranking**, using the existing planner, Brave runner, and community enrichment pipeline. Both the Results page and segment Results tab offer “Enrich & assess” for all saved results in their scope, regardless of filters/pagination. A result detail page offers “Enrich & assess this result” through the same action, with server-validated result scope, so individual results can be enriched or retried without launching the bulk queue. Meaningful extraction is reused for assessment-only work; current assessments are skipped. Failed/blocked and legacy all-empty extraction can be retried. A failed latest enrichment cannot silently reuse older evidence for current permissions. Empty extraction is rejected with one corrective model pass; a repeated empty response is saved as failed while retaining the collected sources. Detail pages show collection and extraction status separately and collapse unavailable fields. One global sequential enrichment queue uses server OpenRouter/scraper settings and may incur provider charges. Post-enrichment assessment produces a numeric match score and independent posting/admin-contact policy assessments. Legacy audience-fit verification remains available as history and is never converted into a numeric score or outreach approval. Progress is process-local, retained for one hour, and does not survive server restarts. The app never initializes/migrates the schema, edits segments/countries, or approves/sends outreach. An empty initialized database shows an empty state; a missing/uninitialized database shows an error with setup guidance. Enrichment attempts are newest-first; older successful attempts remain visible when the latest attempt failed. Stored text is rendered as text, not HTML, and external result links are restricted to HTTP(S).

TanStack Start server functions keep SQLite and API keys on the server. Each read closes its connection. TanStack Query has a per-router client with SSR hydration and a 30-second freshness window; reload to see CLI updates immediately. Web code lives in `web/`, separate from the existing CLI code in `src/`.

### Generate queries from a segment page

1. Set `OPENROUTER_API_KEY` in the server environment or app `.env` and restart the server. Optionally set `GTM_PLANNER_MODEL` (default: `deepseek/deepseek-v4.1-flash`). Browsing does not require an API key.
2. Choose **Selected countries** and check one or more, or choose **All countries**. Only countries belonging to that segment are accepted (up to 50 per job).
3. Leave the language override blank to use the explicit defaults displayed in the form, or enter 1–8 comma-separated BCP 47 language tags to apply to every selected country. Defaults include English/French for Canada, Dutch/French/German for Belgium, and Hebrew/English for Israel; unknown countries require an override. Languages never change the stored geographic scope.
4. Choose 1–20 queries per language (default 20), review the expected count/cost notice, and click **Generate queries**.

A background job processes countries sequentially, with a two-minute timeout per country. All language batches for a country must validate before any queries for that country are saved. Successful countries remain saved when another country fails. Existing exact country/language/query matches are updated, not duplicated; other existing queries are retained. Progress is polled every two seconds, and segment query lists/counts refresh automatically as countries finish. Failed countries can be selected for a retry.

Only one job per segment and three jobs globally can run at once. Jobs continue if you navigate away or reload, but **job progress is in memory, not a durable queue**: it expires one hour after completion and is lost on server restart or development hot reload. Already saved queries survive. Run one long-lived Node server process; multi-worker/serverless deployments need a shared durable job queue before enabling generation. Generation uses the configured model and incurs OpenRouter costs. No paid requests are made merely by viewing a page.

### Search selected queries from a segment page

1. Set `BRAVE_API_KEY` in the server environment or app `.env`, then restart the server.
2. Check individual queries, or **Select all queries**. With country/text filters applied, select-all affects only matching queries; existing selections remain when filters change. **Clear selection** removes all selections.
3. Click **Run search**. This uses Brave search quota and saves up to 50 results per query. Progress and result counts refresh every two seconds; failed queries can be selected for retry.

Only one search job runs globally per server process, with sequential requests and a two-minute timeout per query. A failed query does not prevent the remaining queries from running or remove previously saved results. You can leave the page and return while the server stays running. Like generation, search progress is in memory for one hour and is lost on restart; saved results persist. Multi-worker/serverless deployments require a shared durable queue.

Production (Node.js 24+, run from the app directory or via the workspace scripts):

```sh
pnpm --filter gtm-copilot build
HOST=127.0.0.1 PORT=3000 pnpm --filter gtm-copilot start
pnpm --filter gtm-copilot typecheck
```

`dev` and `start` load the app's `.env`, including `GTM_DATABASE_PATH`. The default path resolves to `data/gtm-copilot.sqlite` from the app working directory; use an absolute path when deploying elsewhere. Keep the database and its WAL files accessible to the server. After upgrading, run `pnpm --filter gtm-copilot db:init` to add search-completion tracking. The main page can search all unsearched queries across all segments sequentially; successful searches (including zero-result searches) are skipped on subsequent runs, while failures remain retryable. Existing queries with saved results are also skipped. Server action logs use the `[gtm-copilot]` prefix and include timestamps, job/segment/query/result IDs, progress, and failure messages with stack traces, causes, and provider status codes when available. Returned startup errors (such as missing API keys) are logged too. Credentials are redacted, but logs can still contain research/provider details; keep them private. When running in the background, tail the redirected server output (for example `tail -f /tmp/gtm-vite.log`). The app has **no authentication**: keep it local or behind an authenticated proxy (including Cloudflare Access for a tunnel) before exposing research data, paid query generation, or search. TanStack Start CSRF middleware protects same-origin server-function requests, but is not authentication: anyone who can access the app can request generation or searches using the server's API keys. Do not place the SQLite file in `public/`.

## Create a segment and country

Run this code from the app directory (or use the same helpers in your application):

```ts
import { MarketingDatabase } from './src/database.ts';

const db = new MarketingDatabase();
try {
  const segment = db.createSegment({
    name: 'Independent wedding photographers',
    description: 'Freelancers looking for peer advice and networking',
  });
  const country = db.addCountry(segment.id, 'DE');
  console.log(country.id); // Use this record ID in the planner.
} finally {
  db.close();
}
```

## Generate and save queries

```sh
pnpm --filter gtm-copilot plan \
  --segment-country-id 1 \
  --languages en,de
```

`--segment-country-id` refers to `marketing_segment_countries.id`, **not** a segment ID or country code. The record must exist. Languages are explicit BCP 47 tags (`en`, `de`, `pt-BR`); they are not inferred from the country.

- Default: **20 queries per language**. Override with `--count 1` through `--count 20`.
- Override the model with `--model` or `GTM_PLANNER_MODEL`.
- CLI loads the app's `.env` and uses a two-minute timeout.
- JSON output includes segment context, country code, language batches, and `savedQueries` with database IDs. Errors go to stderr with a nonzero exit code.

## Pipeline

1. Validate the country record ID and 1–8 language entries; canonicalize/deduplicate language tags.
2. Load the segment's name and description and the country code from SQLite. Missing records fail before a model call.
3. Generate one structured batch per language in parallel. Queries target the stored country, use local vocabulary, and diversify discovery angles and platforms.
4. Validate exact query counts and reject normalized duplicates within a language. If any generation fails, no queries are written.
5. Save all batches in one short transaction, after generation finishes. A database error rolls the entire batch back.

Re-runs **append** new queries. Exact country/language/query matches retain their IDs and timestamps and update platform/rationale. Existing queries are not deleted. Consequently, accumulated queries may exceed the requested per-run count.

The planner favors recall: short natural keywords for one audience/topic angle, one community-intent term, and the supplied geography. It avoids exact-phrase quotes, stacked constraints, mandatory terms, and exclusions; alternative angles belong in separate queries. At most one `site:` filter is used per query, alongside platform-agnostic queries. Generated query text has phrase quotes removed and whitespace normalized before validation and duplicate checking.

Supported platform labels: `web`, `reddit`, `facebook`, `linkedin`, `discord`, `slack`, `telegram`, `meetup`, `forum`. The planning pipeline does not execute searches, verify communities, or access private groups; execute stored queries separately with the Brave runner below. Language quality and geographic relevance are prompt-guided rather than deterministically verified. AI SDK retries transient provider failures twice; invalid model output fails without a repair pass.

## Programmatic usage

```ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MarketingDatabase } from './src/database.ts';
import { planMarketingSegmentCountryQueries } from './src/country-query-planner.ts';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const database = new MarketingDatabase();
try {
  const result = await planMarketingSegmentCountryQueries(
    { marketingSegmentCountryId: 1, languages: ['en', 'de'] },
    {
      database,
      model: openrouter('deepseek/deepseek-v4.1-flash'),
      abortSignal: AbortSignal.timeout(120_000),
    },
  );
  console.log(result.savedQueries);
} finally {
  database.close();
}
```

The low-level `planCommunityQueries` in `src/query-planner.ts` remains available for generation without persistence. It accepts a free-text segment, optional description/country code, languages, and query count. Both planners accept any AI SDK `LanguageModel` supporting structured output.

## Execute queries with Brave Search

Set `BRAVE_API_KEY` in the app's `.env`, then run:

```sh
# Run every stored query, sequentially.
pnpm --filter gtm-copilot run search
# Or select a query or a country record.
pnpm --filter gtm-copilot run search --query-id 1
pnpm --filter gtm-copilot run search --segment-country-id 1
```

`src/brave-search.ts` calls Brave Web Search directly using native `fetch`. It requests pages with `count=20` and offsets `0`, `1`, `2`, then truncates to the **first 50 web results**. It stops early when no more results are available. The stored query text and country code are sent to Brave; BCP 47 language tags are not sent as `search_lang` because Brave uses a different set of supported language codes.

- `search_results` stores URLs (unique by exact URL), titles, descriptions, and creation timestamps. Different URL spellings are not merged.
- `search_query_results` is the many-to-many junction table, storing `query_id`, `result_id`, rank (1–50), and collection time. One URL can belong to multiple queries.
- Each query is saved atomically after all pages succeed. Re-runs update metadata and ranks without duplicate rows or links; prior discoveries are retained even if absent from a later run. Metadata on a shared result reflects its latest save.
- Duplicate URLs within the first 50 entries are stored once with their first rank. Searches can yield fewer than 50 unique URLs.
- Requests are paced at 1100ms by default, with a 30-second timeout per request. Provider failures (including rate limits) stop execution without automatic retries. Completed queries remain saved if a subsequent query fails.
- CLI output is one JSON record per query with `queryId`, `fetchedCount`, and `savedResults` (including retained discoveries).

Programmatically, use `runSearchQuery(queryId, database, options)` from `src/brave-search.ts`. Options accept `apiKey`, `abortSignal`, `requestDelayMs`, and an injectable `fetch`. Read results with `database.listSearchResults(queryId)` and their provenance with `database.listResultQueryIds(resultId)`.

## Enrich a community search result

```sh
# Environment variables can live in ~/.bashrc; no .env file is required.
source ~/.bashrc
pnpm --filter gtm-copilot enrich --result-id 1
# Public Facebook group or Reddit community (requires APIFY_KEY):
pnpm --filter gtm-copilot enrich --result-id 1 --collector apify --posts 10
# Skip the supplementary community-profile Actor:
pnpm --filter gtm-copilot enrich --result-id 1 --collector apify --no-metadata
# Explicitly select Firecrawl (requires FIRECRAWL_API_KEY):
pnpm --filter gtm-copilot enrich --result-id 1 --collector firecrawl
# Or use native fetching without Firecrawl charges:
pnpm --filter gtm-copilot enrich --result-id 1 --collector native
# Optional model override:
pnpm --filter gtm-copilot enrich --result-id 1 --model deepseek/deepseek-v4.1-flash
```

`src/community-enrichment.ts` exposes `enrichSearchResult(resultId, database, options)`;
`src/community-scraper.ts` handles collection. Use the **search_results ID**, not a query ID.
Set `OPENROUTER_API_KEY` for structured extraction; optionally set `GTM_ENRICHMENT_MODEL`.
Set `APIFY_KEY` for public Facebook groups and Reddit communities; set `FIRECRAWL_API_KEY` for rendered public websites/forums. The default collector is `auto`: approved Reddit OAuth when a token is present; otherwise Apify for Facebook/Reddit when its key is present; Firecrawl for other websites when its key is present; otherwise native fetching. Social URLs without applicable credentials return `blocked` with an explanation.

Override with `--collector auto|apify|firecrawl|native` or `GTM_SCRAPE_COLLECTOR`. `apify` supports social community URLs only. `firecrawl` never handles social URLs. Explicit `firecrawl` without a key fails before collection. Programmatic options accept `collector`, `firecrawlApiKey`, `apifyApiKey`, `maxPosts`, `apifyMaxChargeUsd`, `supplementaryMetadata` and `verificationModel`. Functions can be called concurrently; no SQLite transaction spans network/model calls. Parallelism and provider rate/cost limits remain the caller's responsibility.

Collected public text is sent to the configured model provider. Firecrawl/Apify additionally receive target URLs and process page content; these are paid third-party services. Your Apify token is not Meta/Reddit authorization—review platform terms and your use-case permissions separately.

### Collection strategy

- **Public websites/forums:** Firecrawl's `/v2/scrape` renders public pages and returns Markdown plus HTML for link discovery. Full-page content (`onlyMainContent: false`) preserves admin/contact/rules links. Extraction stays in our existing evidence-validated pipeline, not Firecrawl's JSON/LLM extraction. Native mode reads HTML, Open Graph and JSON-LD instead. Follow at most two clearly labelled, same-origin about/contact/rules pages. Detected Discourse sites use the landing page plus native `/about.json` and `/latest.json` instead.
- **Reddit via Apify:** [`crawlerbros/reddit-scraper`](https://apify.com/crawlerbros/reddit-scraper) collects up to ten newest public posts, current subscriber counts and engagement. Accepts `/r/subreddit` URLs, including result URLs for posts; the input is normalized to the community root. Comments, NSFW and deep-history collection are disabled. Ordinary author/profile fields are excluded from local storage. Descriptions, rules, admin lists and contact routes are not guaranteed.
- **Reddit via official API:** `REDDIT_ACCESS_TOKEN` remains supported for approved OAuth access (metadata, ten posts and visible moderators). No token acquisition/refresh is implemented. Commercial use may require a separate agreement. Local records are **not automatically purged or synchronized with deletions**.
- **Facebook via Apify:** [`apify/facebook-groups-scraper`](https://apify.com/apify/facebook-groups-scraper) collects chronological public group posts and available group titles/engagement. Accepts `/groups/group` URLs, including group post URLs; profiles, pages and short links are not supported by this adapter. No account cookies or login credentials are sent. Actor output profiles, attachments and top comments are discarded locally; post bodies can still contain personal data. Private posts are not collected. If posts are unavailable but a publicly visible About page is available, metadata-only enrichment may still be possible; otherwise the result is `blocked`.
- **Supplementary social metadata (default in auto/Apify mode):** when primary sources are post-only rather than community metadata, one additional profile Actor runs **before** extraction: [`crawlerbros/reddit-community-scraper`](https://apify.com/crawlerbros/reddit-community-scraper) for descriptions, rules, visible moderators, weekly activity and posting/media settings; [`parsebird/facebook-group-profile-scraper`](https://apify.com/parsebird/facebook-group-profile-scraper) for publicly visible About details, growth/activity, visibility, visible admins/moderators, locations and rules. Each profile run is capped to one record, with no extra posts/wiki/member harvesting. Profiles may be incomplete, including on private groups with public About pages. No supplementary run occurs after an operational primary failure, in explicit native/Firecrawl mode, or without an Apify key. Disable with `--no-metadata` / `supplementaryMetadata: false`. Profile failures do not discard usable primary sources.
- Public visibility and robots permission are not authorization: review site terms and outreach rules before collecting/contacting. Private content is never intentionally requested, and no authenticated forum access is used.

Public-web requests are sequential (at least 1100ms apart) with local robots/crawl-delay checks. Robots errors fail closed (404 means no published policy). Firecrawl submissions also check `FirecrawlAgent` rules. Public-web collection is bounded to three documents, 2 MB per response and 40,000 characters per stored document. Native redirects are limited, same-origin and checked against robots before following. Timeouts: 20 seconds for native requests, 60 seconds for Firecrawl scraping (65 seconds for its API request), and a 720-second CLI budget for collection, supplementary metadata, extraction and verification.

Firecrawl uses `proxy: basic` (no enhanced/auto proxy escalation), verified TLS, no cookies/actions/login, fresh fetching (`maxAge: 0`), no LLM content cleanup and `storeInCache: false`. Cache opt-out is **not** an enterprise zero-data-retention guarantee. Provider HTTP status, target-page status, empty content and challenge pages are checked; warnings are stored. There are no application retries or automatic native retries after a Firecrawl denial/failure. Use native mode as a configured alternative, not to evade access denial. Each source records its collector (`native`, `firecrawl` or `apify`).

Apify starts a fixed post Actor and, when needed, one fixed metadata Actor, polls each status, then reads its bounded dataset. `--posts` controls the 1–10 post cap (default 10). Actor input, run `maxItems`, and dataset read limits are all bounded. Runs receive a 180-second server timeout and `maxTotalChargeUsd=0.5` by default; override the charge limit with `GTM_APIFY_MAX_CHARGE_USD` (greater than 0, at most 5). The charge ceiling applies **per Actor** (up to two runs per result), not to the whole enrichment. The provider charge limit is **not a guarantee about all platform/proxy costs**; Actor startup and resource charges may apply even for empty runs. Actor pricing/builds may change. There are no automatic run retries or alternate-provider fallbacks after a failure. Known unfinished runs are aborted best-effort on cancellation/error; if a start request's outcome is lost, inspect Apify Console (the server timeout still applies).

Each retained Apify source includes Actor/run/dataset IDs and readable allowlisted key/value facts, preserving quote verification. Operational failures are recorded as `failed`; successful runs with no usable records are `blocked`; limited public-post coverage is `partial`. Run IDs are recorded in limitations even when no source is retained. Apify datasets may retain the original Actor output; our local field filtering does not delete remote data. Manage provider retention separately.

Extraction includes name, description, **lastObservedActivity** (not a claim about the community's true last-active time), member count, location/language, visibility, publicly listed admins, public contact routes, recent observed posts, promotion rules, event/video signals, suggested outreach angles and additional growth/activity/media-capability metrics. Metadata dates/counts are not treated as observed post activity. A failed quote-validation pass can receive one bounded correction request; unsupported evidence is still rejected. Every fact/angle carries a source URL and a verbatim quote verified against collected text. Unknowns remain null/empty. Suggestions are not factual claims or permission to send messages. Evidence checks establish quote presence, not semantic correctness; review output before outreach.

### Cheap Jev link ranking before enrichment

Set `TYPESAFE_API_KEY` in the server/CLI environment. The new CLI screens saved URLs, titles and descriptions with TypeSafe Jev; **it does not scrape**. Its five-level Score is normalized to 0–100 and saved with confidence, model, rubric, source fingerprint, raw response and token usage in `search_result_link_rankings`. These are preliminary relevance scores, not evidence-backed match scores or permission to contact.

```bash
# Start with a bounded pilot (paid TypeSafe calls).
pnpm --filter gtm-copilot rank:links --limit 100
# Rank one link, or resume all remaining links. Completed unchanged rows are skipped.
pnpm --filter gtm-copilot rank:links --result-id 1
pnpm --filter gtm-copilot rank:links --all
# Preview counts without calling TypeSafe.
pnpm --filter gtm-copilot rank:links --all --dry-run
# Preview the best 100 qualifying links (no scraping or model calls).
pnpm --filter gtm-copilot enrich:ranked --min-score 75 --limit 100
# Explicitly execute paid enrichment/verification/assessment for that shortlist.
pnpm --filter gtm-copilot enrich:ranked --min-score 75 --min-confidence 0.5 --limit 100 --execute
```

Default model: pinned `jev-1.13.0`; override with `GTM_LINK_RANKING_MODEL` or `--model` (a pinned version ID). Rank commands default to 100 links; `--all` is explicit. `--force` reranks previously completed rows. Transient HTTP/network errors retry up to four times (five attempts), with exponential backoff/jitter and `Retry-After` support. HTTP 408/429/500/502/503/504/529, socket resets and per-attempt timeouts are retried; authentication/validation errors and caller cancellation are not. Exhausted retries stop new batches; active batches finish saving before the job exits. Rerunning resumes without repeating successful work. Retried requests may incur additional charges if a response was lost. Failed rankings, changed snippets, other model versions and other rubrics do not qualify for ranked enrichment. Enrichment selects descending relevance, then confidence, skips current complete assessments, and reuses saved meaningful extraction via the existing pipeline. Thresholds are initial policy choices, not validated accuracy guarantees; evaluate a pilot and sample excluded/uncertain/non-English links before large runs. Confidence describes distribution concentration, not outreach safety.

Both CLI and web bulk ranking pack up to **10 links per request**, one scoped Score question per link, with **two concurrent batch workers**. Set `GTM_JEV_BATCH_SIZE=1..20` and `GTM_JEV_CONCURRENCY=1..4` to tune them. Requests are capped at 24,000 UTF-8 bytes (including all questions), automatically split by size, and paced to at most two starts/second per process, including retries. This is conservative headroom beneath Jev's documented **80 requests/sec**, **100k tokens/sec**, **64k total context / 32k state-plus-longest-question** limits ([models](https://docs.typesafe.ai/models)). Rate-limit cooldowns apply to all local workers. Other processes/users can still consume shared quota; avoid running web and CLI ranking concurrently. Small batches reduce the irrelevant-shared-state risks noted in the Jev docs. Batch token usage is allocated across saved rows so totals are not multiplied by batch size. Single-result requests use the same retry/pacing policy.

The Results page also has a **Rank unranked results with Jev** button. It processes all saved results needing a current ranking, independent of filters/pagination, and polls bounded job counts/token usage every two seconds. One process-local ranking queue rejects overlapping starts; permanent errors or exhausted retries stop the queue, preserving completed scores for retry. The button uses server-side `TYPESAFE_API_KEY`; progress disappears on server restart but saved rankings survive. Each result detail page also has a **Rank this result with Jev** button, scoped to that result and sharing the same queue/lock; current rankings are skipped. Ranking does not launch enrichment. Run `pnpm --filter gtm-copilot db:init` before using this button on an existing database; web status/actions never migrate schema.

CLI startup adds the ranking table without deleting existing data. No paid calls run during migration. The existing web **Enrich & assess** action and single-result `enrich` command remain unfiltered; use **`enrich:ranked`** for score-gated spending. Community-level collection deduplication is not part of this pipeline yet. Do not run separate enrichment CLIs and the web enrichment queue concurrently.

### Post-enrichment match and permissions assessment

Use `pnpm --filter gtm-copilot assess --result-id 2` for saved-source assessment only; `--model MODEL` overrides the assessment model and `--force` explicitly reassesses a current result. The enrichment CLI and web “Enrich & assess” action also assess existing enriched results missing a current assessment without scraping them again. Assessment-only web requests use `startResultAssessment({ data: { resultId: 2 } })`; optional `segmentId` must contain the result. Both actions share one sequential queue. Progress reports `enrichment` and `assessment` phases separately; failures remain retryable, while current assessments are skipped. No sources are recollected by the assessment-only action.

After meaningful extraction and the existing verification attempt, the enrichment CLI/web job runs a separate assessment. A failed assessment does not discard extraction or collected sources. `GTM_ASSESSMENT_MODEL` selects the model (defaults to the configured verification/extraction model); at most one corrective call is made, with no automatic provider fallback.

Rubric `event-video-match-v1`: audience relevance 40%, event/video workflow relevance 30%, observed geography alignment 15%, recent observed activity 10%, community scale 5%. Relevance anchors: 0 explicit mismatch, 25 adjacent, 50 generally relevant, 75 repeated relevant organizer/workflow evidence, 100 direct demonstrated need. Geography: 100 evidenced target-country alignment, 50 explicitly global, 0 evidenced incompatibility, otherwise unknown. Query country/language is not community-location evidence. Activity uses the newest evidenced dated post (100 within 7 days, 75 within 30, 50 within 90, 25 within 365, otherwise 0). Scale uses an exact evidenced member count (25 below 100, 50 below 1,000, 75 below 10,000, otherwise 100).

The total is the rounded weighted mean of known components. Missing evidence stays unknown, not zero; no audience/event-video evidence means the total is unknown. Coverage caps confidence: low below 50%, medium below 80%, high only with at least 80% and usable factual verification. A result-level score uses the snapshot of **all** discovery contexts, not a separate score for each segment. Explanations identify supported contexts and conflicts.

Posting and admin-contact permissions are independent: **Allowed**, **Approval required**, **Prohibited**, **Unknown**. Allowed requires explicit verified channel-specific commercial permission and fresh sources; admin contact also requires verified admin ownership. A profile/contact link is not consent. A strong match never overrides prohibition. Every verdict requires human review and does not approve or send messages; existing human-review gates remain unchanged.

Run `pnpm --filter gtm-copilot db:init` explicitly before deploying assessment UI/actions to an existing database. This adds the assessment table/index without altering enrichment or review history; web browsing never migrates schema. Existing results show assessment pending. Rollback to older app code can leave the extra table in place; do not delete evidence or reviews.

Assessment records are append-only, tied to enrichment, context fingerprint, rubric version, model, and timestamps. Failed reassessments never revive older permissions. New enrichment/context or sources older than 30 days makes the assessment stale. Historical evidence remains inspectable.

The Results and segment Results tables show **Match score**, **Posting permission**, and **Admin contact** separately. Click Match score to sort ascending/descending; numeric scores (including zero) precede unknown values in both directions. Default ordering then places enriched-unscored results above results awaiting extraction. Legacy audience-fit ratings are not converted into new scores. Detail pages show score components, confidence/coverage, channel-specific quoted evidence, the saved context snapshot, and immutable assessment history. Use **Assess saved sources** / **Assess N enriched results** for assessment-only work; **Reassess saved sources** explicitly refreshes a current detail record. Pending, failed, and stale assessments stay distinguishable. Tables/cards do not approve outreach.

### Outreach verification and human sign-off

`src/outreach-verification.ts` makes a separate semantic review call over source text, extraction and the actual query/segment/country context. Use `GTM_VERIFICATION_MODEL` / `--verification-model` for a separate model; otherwise the extraction model is used in a separate call. It checks factual support (not just quote presence), every contact route's ownership/role, every outreach angle's support, audience fit and channel-specific rules. Index/quote errors may receive one bounded correction request. Missing or failed verification preserves scrape data but leaves outreach `needs_review`.

Deterministic gates require collected sources no older than 30 days, an observed dated post within 90 days, supported facts/angles and evidenced audience fit. Commercial **communityPosting** and **directContact** permissions are assessed separately as allowed, approval-required, prohibited or unknown. Unknown rules are not permission; public admin visibility is not consent to DM. Private/restricted community posting is blocked. Automated results are `needs_review`, `do_not_contact` or `review_candidate`—**never approved**. Model review can still be wrong and is not external fact-checking, platform authorization or legal advice. If factual support is false, treat extracted claims as unverified; the raw evidence and critique remain available for review.

Read the complete record with `database.getEnrichment(enrichmentId)` and candidates with `database.listOutreachCandidates(status)`. Explicit human decisions are stored in `enrichment_outreach_reviews` with reviewer, channel, notes, permission confirmation and review time:

```sh
pnpm --filter gtm-copilot review:outreach --enrichment-id 1 --decision rejected \
  --channel communityPosting --reviewer "Your name" --notes "Rules prohibit promotions"
# Only after reviewing evidence and obtaining/verifying channel-specific permission:
pnpm --filter gtm-copilot review:outreach --enrichment-id 1 --decision approved \
  --channel directContact --reviewer "Your name" --permission-confirmed \
  --notes "Describe the actual permission and verified contact route here"
```

`recordOutreachReview()` refuses approval of old attempts, stale evidence/activity, unsupported facts/angles, insufficient fit or prohibited channels. Direct contact also needs explicitly verified admin/business ownership. Approval is specific to the **recorded channel**, not every route/channel; inspect review history before using it. Nothing sends messages. The candidate query only returns the newest attempt per result; a failed refresh cannot revive an earlier approval. Approved candidates are re-filtered for freshness at read time, and approvals do not carry to new scrapes.

### Storage and limitations

Opening the database adds `search_result_enrichments` and the review table, and transactionally migrates older enrichment tables without deleting existing data. Existing rows default to `needs_review`, with no verification and empty scrape metadata. Each run appends an attempt with status `complete`, `partial`, `blocked`, or `failed`, collection timestamps, source text, structured JSON, limitations and errors. `complete` means collection/extraction completed without reported limitations, **not** that all fields are available. Failures never overwrite earlier successes. Read newest-first history with `database.listEnrichments(resultId)`. A failed CLI run exits nonzero; blocked/partial runs print their limitations normally.

Database columns include `sources_json`, `data_json`, `scraped_at`, `scrape_metadata_json`, `verification_json` and indexed `outreach_status`. `scraped_at` reflects the latest valid source-fetch timestamp (or completion of an empty/failed collection), not a model-inferred activity date. Metadata stores:

- Request URL/collector, start/collection-complete/enrichment-complete times, duration and model IDs.
- Post/metadata limits, coverage of available vs missing fields, stage outcomes/errors.
- Provider Actor/run/dataset/build IDs, status, timestamps, reported costs, raw/usable record counts and per-run caps. Costs are snapshots and may lag the provider ledger.
- Source URLs/kinds/collectors/fetch dates, character counts/limit flags and SHA-256 content fingerprints.
- Original query IDs, queries, marketing segments/descriptions, countries and languages, preserving shared-result provenance. Query geography is context—not a scraped location fact.

Every attempt is persisted, including blocked/error outcomes. Sources and extraction/verification JSON remain immutable; only the current outreach status changes on human review, with append-only review history. Raw source text can contain personal data even though ordinary profile fields are filtered. Retention/deletion automation remains out of scope.

No search snippets are treated as freshly scraped facts. Latest posts are limited to what was actually observed; general forums may expose none. Sources are truncated and excerpts are retained locally, so schedule retention/deletion appropriate to each site's terms. Stored enrichments cascade if their search result is deleted; deleting a query/segment retains shared search results and enrichment history.

The collector rejects local/private DNS destinations, credentials and nonstandard ports. It is a **local operator tool**, not a hardened arbitrary-URL service: DNS checks do not pin the subsequent fetch connection against rebinding. Firecrawl controls its own transport, redirects and subresource loads; we cannot enforce local checks inside that service. Returned destination URLs are validated, and cross-origin or robots-disallowed destinations are discarded before retention, but this cannot prevent a provider-side request that already occurred. Apify is restricted to fixed Actors and normalized Facebook group/Reddit community URLs; it controls its own network access, proxy behavior and public-data collection. Local public-web robots checks do not govern Actor internals. Use reviewed URLs and an egress-restricted environment before exposing collection to untrusted users.

Policy references: [Reddit Data API guidance](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki), [Reddit API terms](https://redditinc.com/policies/data-api-terms), [Meta automated collection terms](https://www.facebook.com/legal/automated_data_collection_terms), [Discourse API](https://docs.discourse.org/).

## SQLite relationships

```text
marketing_segments
  └─ marketing_segment_countries (many per segment)
       └─ marketing_segment_country_queries (many per country)
            └─ search_query_results (query_id, result_id, rank, collected_at)
                 └─ search_results (URLs shared across queries)
```

Uses Node's built-in `node:sqlite`. Countries use uppercase two-letter codes; format is validated, not membership in the ISO registry. Each segment can have a country only once. Queries retain language, platform, rationale, and UTC creation timestamps. Foreign keys reject orphans, and deleting a segment or country cascades to its children.

Deleting a query removes its result links, not shared result records. Results without links are retained. Opening an existing database automatically creates the results tables without changing existing queries.

`MarketingDatabase` provides creation, record lookup, listing by parent, segment updates, query/result batch persistence, provenance lookup, and deletion helpers. Always close it when finished.

```sh
pnpm --filter gtm-copilot typecheck
```
