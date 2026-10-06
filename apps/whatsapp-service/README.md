# WhatsApp service — ingestion milestone

One Cloudflare Worker owns the webhook, scheduled processing-outbox dispatcher,
and processing queue consumer. The existing `@video-editor-agent/db` package owns
schema/migrations and connection transport. No framework, LLM, agent execution,
conversation coordinator, or outbound sender is added yet.

## Implemented

- `GET /webhooks/whatsapp`: verification challenge.
- `POST /webhooks/whatsapp`: raw-body HMAC verification before parsing/persistence;
  streaming 256 KiB request limit; bounded batched message/status normalization.
- Per-event interactive transaction: recognized active channel, verified phone
  provisioning, identity/conversation resolution, canonical-user locking,
  deduplication, sequence allocation, message persistence, immutable first
  acquisition, processing intent, and one acquisition analytics intent.
- Text and explicit `unsupported` content records. No media ingestion or downloads.
- Deduplicated status evidence (including unmatched events); no agent intent for
  callbacks. Disabled channels can still record callback evidence.
- Scheduled processing dispatch: `FOR UPDATE SKIP LOCKED`, 5-minute claim leases,
  random per-attempt fencing tokens, bounded batches of 25, exponential publication
  retry capped at 5 minutes, and expired-claim recovery.
- Queue payload: `{ version: 1, messageId: string }`; no body, phone or referral.
- Processing consumer validates jobs, loads canonical inbound evidence and its
  processing intent, and commits one unique pending `agent_runs` row per message.
  Duplicate deliveries reuse that run; consumption may precede publication update.
  Acknowledgment follows the transaction commit. Each item retries independently;
  after five retries it moves to the configured processing DLQ.
- Missing messages are acknowledged without provisioning anything (delayed jobs
  can outlive user erasure). Run rows cascade on erasure; malformed jobs, outbound
  references and messages without processing intents retry toward the DLQ.
- Acquisition intents remain pending for a later analytics dispatcher; they are
  not sent to the processing queue.

The message/intent transaction commits before acknowledgment. Queue failure does
not change already accepted content. A partially committed batch returns failure;
provider retries safely deduplicate its accepted events. Normalization validates
all events before starting acceptance. Unknown/disabled incoming channels return
403; invalid envelopes return 400; persistence failure returns 503.

Queue publication is at-least-once: a crash after `send()` but before the publication
update can duplicate a queue item. Claim fencing prevents stale completion updates,
not duplicate external publications. The consumer now enforces one logical pending
run per inbound message. Acknowledgment transfers responsibility to canonical
PostgreSQL state; it does NOT mean agent execution succeeded. A future coordinator
must discover pending runs, order them by incoming conversation sequence, and enforce
attempt leases/fenced response commits. No runner or recoverable execution scheduler
is implemented yet; pending runs remain stored, not marked completed.

## Files

- `src/index.ts`: production entry point with Neon transport.
- `src/service.ts`: shared HTTP, Queue and scheduled handlers.
- `src/local.ts`: local-only simulation/state endpoints and loopback pg transport.
- `ui/`: framework-free chat simulator and service inspector.
- `src/env.ts`: binding and queue-reference types.
- `src/http/webhook.ts`: verification, bounded raw-body authentication and HTTP outcomes.
- `src/whatsapp/signature.ts`: Web Crypto HMAC verification.
- `src/whatsapp/normalize.ts`: provider adapter and normalized event contracts.
- `src/messaging/accept-events.ts`: transactions and callback deduplication.
- `src/referral/parse.ts`: deterministic marker parsing.
- `src/outbox/dispatch.ts`: processing claims/publication/recovery.
- `src/queues/processing.ts`: validated queue intake, durable logical-run handoff,
  per-item acknowledgment/retry policy.
- `src/runtime/database.ts`: shared persistence types; local pg is excluded from the production entry point.

Helpers stay together where their transaction boundary matters; there are no empty
modules reserved for future services.

## Local simulator UI

Cloudflare supports [local Queues with Wrangler/Miniflare](https://developers.cloudflare.com/queues/configuration/local-development/).
The local queue automatically invokes this Worker's consumer: no cloud account,
remote queue, or separate queue container is needed. This is local emulation, not
production durability/load qualification; remote Queues dev mode is unsupported.

From the repository root (Node 24+):

```sh
docker compose up -d --wait postgres
pnpm --filter @video-editor-agent/whatsapp-service dev:setup
pnpm --filter @video-editor-agent/whatsapp-service dev
# Open http://127.0.0.1:8787
```

`dev:setup` applies committed migrations to the loopback database in
`wrangler.local.jsonc` and refuses remote URLs. It does not reset existing data.
If port 5432 is occupied, change Compose's `POSTGRES_PORT` and the URL in that local
config together. Do not override `LOCAL_DATABASE_URL` in `.dev.vars`, since the
setup script reads the config directly. Do not put real Meta secrets in the local
config; these signing values are deliberately fake, local-only credentials.

The UI lets you:

- Send text through a generated Meta-style webhook signed server-side; browser
  code never receives signing secrets. The real signature/ingestion handler runs.
- Change simulated sender, replay the same provider message ID, or use an invalid
  signature to verify rejection without creating a message.
- Disable auto-dispatch to inspect pending outbox rows, then run the dispatcher.
- Watch local Queue consumption create one pending run per inbound message.
- Inspect persisted messages, processing/acquisition intents and runs in a live
  database snapshot. Counts cover the latest 100 messages for the selected sender;
  they are not queue-depth metrics. Status polls every 1.5 seconds.

Local Cron triggers do not fire automatically. The UI dispatch button invokes the
same dispatcher; `--test-scheduled` also exposes
`http://127.0.0.1:8787/__scheduled` for exercising the scheduled handler. See
[testing Cron triggers locally](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally).
Wrangler local state lives in the ignored `.wrangler/local-state` directory.

Only `wrangler.local.jsonc` references `src/local.ts` and the `ui/` assets. The
production entry point does not expose simulation/admin endpoints or include the
local PostgreSQL adapter. Local endpoints accept loopback hosts and the optional `SIMULATOR_PUBLIC_ORIGIN`
host configured in `wrangler.local.jsonc`. That origin also permits HTTPS browser
requests when a tunnel forwards HTTP to the Worker. Update/remove this setting when
your temporary tunnel changes. Other cross-origin browser requests are rejected.
This is NOT authentication: anyone with the configured tunnel URL can inspect data
and submit simulation/dispatch requests. Use only disposable development data and
stop the tunnel when finished; add Cloudflare Access before sharing it more broadly.
Keep the Worker bound to `127.0.0.1` and never deploy the local config. Raw simulation
requests are limited to 8 KiB and outgoing test text to 4096 characters. Use fake
phone numbers and message content only.

Local `pg` uses Workers' supported [node:net compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/net/)
to reach Docker PostgreSQL directly. No Hyperdrive is added. The same service
handlers use the existing Neon transport when deployed. `dev:staging` retains the
previous Neon-backed local Worker mode with `wrangler.jsonc`.

**This is intake visualization, not an AI chatbot:** no model runs or assistant
responses are simulated. Pending runs are genuinely persisted and awaiting the
future coordinator/runner.

## Local checks

From the repository root:

```sh
pnpm install
pnpm --filter @video-editor-agent/whatsapp-service typecheck
pnpm --filter @video-editor-agent/whatsapp-service test
pnpm --filter @video-editor-agent/whatsapp-service test:integration
pnpm --filter @video-editor-agent/whatsapp-service deploy:dry-run
```

Only three focused unit tests. Integration tests load `packages/db/.env` if present,
require a loopback `TEST_DATABASE_URL`, and skip if it is absent. They apply all
reviewed migrations in an isolated temporary schema, then drop that schema; they
never dispatch existing database work or migrate the configured public schema.
The test role needs schema creation permission. These tests cover concurrent
acceptance, atomic rollback, attribution, callback deduplication, queue failure,
concurrent claims, post-publication interruption, lease recovery, stale fencing,
concurrent consumer deduplication, immutable run identity, deleted-message handling,
and cascaded fixture cleanup. They do not qualify deployed Workers/Neon or Queues.

## Staging setup — explicit operator actions

1. Review `packages/db/drizzle/0004_optimal_tempest.sql` and
   `0005_conscious_scorpion.sql`, then apply migrations to
   the intended database with `pnpm --filter @video-editor-agent/db db:migrate`.
   Do not use automatic schema synchronization; existing custom SQL guards remain.
   Migration 0005 also guards inbound run ownership and immutable run identity;
   its trigger is not represented in Drizzle snapshots.
2. Create a recognized channel through controlled database administration:

   ```sql
   INSERT INTO whatsapp_channels (id, business_account_id, provider_phone_number_id)
   VALUES ('internal-channel-id', 'meta-business-account-id', 'meta-phone-number-id');
   ```

   Provider credentials are not stored in channel rows. The signature secret is
   the Meta app secret, not the WhatsApp access token. This Worker assumes all
   configured channels belong to the same Meta app; multiple apps need separate
   authentication/routing configuration.
3. Create both queues before deployment:
   `pnpm --filter @video-editor-agent/whatsapp-service exec wrangler queues create milo-whatsapp-processing`
   and `pnpm --filter @video-editor-agent/whatsapp-service exec wrangler queues create milo-whatsapp-processing-dlq`.
   The DLQ intentionally has no consumer; inspect/replay failures operationally
   after fixing their cause. Do not indiscriminately replay malformed jobs.
4. Supply `DATABASE_URL`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` through
   managed Worker secrets. Local `.dev.vars.example` is a template only; never
   commit `.dev.vars`. The production config and `dev:staging` use a reachable
   Neon pooled TLS endpoint. The separate simulator config uses loopback PostgreSQL.
5. Deploy the Worker and configure Meta's webhook URL as
   `https://<worker-host>/webhooks/whatsapp`, with the configured verify token.

**Dispatch remains disabled by default (`DISPATCH_ENABLED=false`).** It can now be
explicitly enabled in staging to exercise queue-to-pending-run handoff, once both
queues, the consumer and migrations are deployed. This does not enable replies:
agent execution is still absent. Keep production dispatch disabled until the
coordinator/runner is ready. Monitor pending-run age and the DLQ; finite Queues
retention is not a long-term recovery store. Intents remain in PostgreSQL while
dispatch is disabled. No resources are provisioned by tests or dry-run commands.

## Referral protocol

Codes match the landing page's case-sensitive `[A-Za-z0-9_-]{1,64}` grammar. Accept
exactly one lowercase `[ref: CODE]` marker, with optional ASCII spaces/tabs around
the code. Multiple complete markers (including malformed ones) are unattributed.
Preserve accepted message text; never delegate parsing to a model or look up unknown
codes in GTM Copilot. No-ref/unsupported first messages are permanently unattributed.

## Remaining before launch

- Conversation Durable Object, ordered pending-run recovery/execution, attempts and fencing.
- Agent execution, memory/tools, persisted responses and outbound send intents.
- Sender, callback reconciliation and unmatched-evidence retention.
- Acquisition analytics dispatcher and PostHog integration.
- Trace propagation/OTel, abuse/rate/spend limits, alerting, retention and erasure policy.
- Deployed database qualification, live signature/provider tests and queue fault drills.

`GET /health` reports process liveness only, not database/provider readiness.
