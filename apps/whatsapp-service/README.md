# WhatsApp service — queued AI simulator roundtrip

One Cloudflare Worker owns the webhook, scheduled processing-outbox dispatcher,
processing queue consumer, and conversation Durable Objects. The existing DB
package owns schema/migrations and connection transport. Local messages reach the
processing queue, then the conversation coordinator calls `apps/whatsapp-agent`
through a service binding and persists its reply for the simulator. Real WhatsApp
outbound delivery remains deferred; a deterministic responder is retained for tests.

## Start the AI simulator

1. Start local PostgreSQL (`docker compose up -d`).
2. Export `OPENROUTER_API_KEY` in the Bash session used to start dev.
   Wrangler loads it from the shell through the agent's declared required secret.
   No service token or `.dev.vars` file is needed. Do not reuse production credentials.
3. Run `pnpm --filter @video-editor-agent/whatsapp-service dev:setup` to apply
   reviewed migrations (including 0007 attempt leases) to the local database.
4. Run `pnpm --filter @video-editor-agent/whatsapp-service dev`. This applies
   reviewed local migrations before starting both Workers with an `AGENT` service binding. Open `http://127.0.0.1:8787`.
5. Send with **auto-dispatch** checked. Webhook acceptance persists the message;
   dispatch publishes its reference; the queue creates the run and schedules the
   coordinator. The send response immediately displays the persisted incoming
   message. A local WebSocket pushes committed replies and run state automatically.
   `/dev/state` loads once on page load (or on Refresh/sender changes), never on an
   interval. Without auto-dispatch, click Dispatch (or invoke the scheduled handler).

Model calls run outside DB transactions. Short claim/completion transactions use
60-second attempt leases and fencing tokens. Only queue-consumed runs are eligible
for inference; an earlier unconsumed message prevents later turns overtaking it.
The agent receives at most 20 earlier authorized messages and no future input.
Duplicate wakeups respect active leases, and stale/expired attempts cannot commit.
Failures retry with backoff; after three failed or interrupted attempts a persisted
fallback unblocks the conversation. Blocked channels/conversations are checked
again at completion. No provider errors, keys, or message bodies are logged.

Missing/invalid provider configuration will produce retries and ultimately a
fallback, not an AI reply. Configure the secrets before sending. The simulator
checks the agent's internal configuration health endpoint and reports missing keys
or unavailable bindings rather than claiming AI replies are enabled. Saved
fallback and deterministic replies are labeled separately from agent replies. Production keeps
`AGENT_ENABLED=false`; enabling it additionally requires deploying the agent Worker,
configuring its provider key, and reviewing launch limits and delivery policy.
The agent remains internal-only; its service binding is the access boundary.

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
- Conversation Durable Objects durably schedule bounded batches through alarms.
  PostgreSQL conversation locks serialize response commits in inbound sequence
  order, even if queue messages arrive out of order. Earlier durable messages are
  included even when their queue item has not yet arrived. A recovery sweep finds
  unfinished conversations independently of queue delivery; alarms recover retries.
- A deterministic text responder completes each run with an outbound message,
  saved send chunk, and `send` outbox intent in one short transaction. Duplicate
  processing does not regenerate a completed response. Blocked/closed conversations
  and disabled channels produce explicit blocked runs without replies.
- Acquisition and send intents remain pending for future analytics/send dispatchers;
  neither is sent to the processing queue. Simulator bubbles show persisted replies,
  not evidence that real WhatsApp received them.

The message/intent transaction commits before acknowledgment. Queue failure does
not change already accepted content. A partially committed batch returns failure;
provider retries safely deduplicate its accepted events. Normalization validates
all events before starting acceptance. Unknown/disabled incoming channels return
403; invalid envelopes return 400; persistence failure returns 503.

Queue publication is at-least-once: a crash after `send()` but before the publication
update can duplicate a queue item. Claim fencing prevents stale completion updates,
not duplicate external publications. The consumer now enforces one logical pending
run per inbound message. Acknowledgment transfers responsibility to canonical
PostgreSQL state and, when the test responder is enabled, a recoverable Durable
Object alarm. It does NOT mean execution has already completed. Alarms and the
scheduled/manual recovery sweep discover unfinished work; run state records actual
completion. The deterministic test path stays inside a bounded transaction (no external calls).
The local AI path uses separate claim/completion transactions around model calls,
with attempt leases and fenced completion. Per-user spend limits remain deferred.

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
- `src/coordination/conversation.ts`: per-conversation Durable Object and recoverable alarms.
- `src/agent/process-conversation.ts`: ordered transactional run completion and recovery discovery.
- `src/agent/test-responder.ts`: bounded deterministic reply text and responder version.
- `src/agent/agent-client.ts`: validated service-binding call to the AI agent.
- `src/agent/process-agent-conversation.ts`: leased claim, bounded context, external inference, fenced response commit.
- `src/agent/conversation-state.ts`: canonical snapshot shared by local HTTP and WebSocket updates.
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
- Local Queue consumption schedules conversation processing automatically.
  Sent messages appear immediately; inbound/outbound bubbles and completed-run
  states update through local WebSocket notifications, without polling.
  Refresh reloads canonical state and reconnects if the live channel disconnects.
- Inspect persisted messages, processing/acquisition/send intents, send chunks and runs in a live
  database snapshot. Counts cover the latest 100 messages for the selected sender;
  they are not queue-depth metrics. The snapshot is loaded once, not on an interval.

Local Cron triggers do not fire automatically; Durable Object alarms do. The UI
dispatch button invokes the same dispatcher plus pending-conversation recovery;
it also processes old pending messages after upgrading. The `--test-scheduled` also exposes
`http://127.0.0.1:8787/__scheduled` for exercising the scheduled handler. See
[testing Cron triggers locally](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally).
Wrangler local state lives in the ignored `.wrangler/local-state` directory.

Only `wrangler.local.jsonc` references `src/local.ts` and the `ui/` assets. The
production entry point does not expose simulation/admin endpoints or include the
local PostgreSQL adapter. Local endpoints accept loopback hosts and, with
`ALLOW_TRYCLOUDFLARE=true` in `wrangler.local.jsonc`, any `*.trycloudflare.com`
hostname. No edits are needed when the temporary tunnel changes. HTTPS browser
origins are permitted for the same tunnel host when TLS terminates at the tunnel;
sibling tunnel origins and other cross-origin browser requests remain rejected.
Set the flag to `false` for loopback-only access. This is NOT authentication:
anyone with the active tunnel URL can inspect data
and submit simulation/dispatch requests. Use only disposable development data and
stop the tunnel when finished; add Cloudflare Access before sharing it more broadly.
Keep the Worker bound to `127.0.0.1` and never deploy the local config. Raw simulation
requests are limited to 8 KiB and outgoing test text to 4096 characters. Use fake
phone numbers and message content only.

Local `pg` uses Workers' supported [node:net compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/net/)
to reach Docker PostgreSQL directly. No Hyperdrive is added. The same service
handlers use the existing Neon transport when deployed. `dev:staging` retains the
previous Neon-backed local Worker mode with `wrangler.jsonc`.

**Local replies now come from the AI agent.** `AGENT_ENABLED=true` is set only
in the local config; production defaults to `false`. Configure the provider key
as described above. `TEST_RESPONDER_ENABLED` is disabled locally;
it remains an optional deterministic test path. No WhatsApp send API is called.
On upgrade, run `dev:setup`, restart Wrangler, refresh the UI and click the
dispatcher to recover old pending messages.

## Local checks

From the repository root:

```sh
pnpm install
pnpm --filter @video-editor-agent/whatsapp-service typecheck
pnpm --filter @video-editor-agent/whatsapp-service test
pnpm --filter @video-editor-agent/whatsapp-service test:integration
pnpm --filter @video-editor-agent/whatsapp-service deploy:dry-run
```

Eight focused unit tests cover webhook, queue intake, simulator access, one-shot
state loading, immediate sent-message rendering, pushed replies and mocked agent
service calls. Integration tests load `packages/db/.env` if present,
require a loopback `TEST_DATABASE_URL`, and skip if it is absent. They apply all
reviewed migrations in an isolated temporary schema, then drop that schema; they
never dispatch existing database work or migrate the configured public schema.
The test role needs schema creation permission. These tests cover concurrent
acceptance, atomic rollback, attribution, callback deduplication, queue failure,
concurrent claims, post-publication interruption, lease recovery, stale fencing,
concurrent consumer deduplication, immutable run identity, deleted-message handling,
ordered concurrent response commits, rollback of response/send intents, duplicate
processing, blocked conversations and cascaded fixture cleanup. AI-path tests cover
queue eligibility, outside-transaction inference, bounded history, active leases,
stale completion fencing, bounded fallback retries and blocking during inference. They do not qualify
deployed Workers/Neon or Queues.

## Staging setup — explicit operator actions

1. Review `packages/db/drizzle/0004_optimal_tempest.sql` and
   `0005_conscious_scorpion.sql`, `0006_rare_johnny_blaze.sql`, and
   `0007_right_randall.sql`, then apply migrations to
   the intended database with `pnpm --filter @video-editor-agent/db db:migrate`.
   Do not use automatic schema synchronization; existing custom SQL guards remain.
   Migrations 0005/0006 guard run identity, response ownership and terminal-state
   immutability; these custom SQL guards are not represented in Drizzle snapshots.
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
queues, the consumer and migrations are deployed. The coordinator binding has a
Wrangler SQLite-class migration. Production defaults `TEST_RESPONDER_ENABLED=false`;
keep production dispatch disabled until a real agent and outbound sender are ready. Monitor pending-run age and the DLQ; finite Queues
retention is not a long-term recovery store. Intents remain in PostgreSQL while
dispatch is disabled. No resources are provisioned by tests or dry-run commands.

## Referral protocol

Codes match the landing page's case-sensitive `[A-Za-z0-9_-]{1,64}` grammar. Accept
exactly one lowercase `[ref: CODE]` marker, with optional ASCII spaces/tabs around
the code. Multiple complete markers (including malformed ones) are unattributed.
Preserve accepted message text; never delegate parsing to a model or look up unknown
codes in GTM Copilot. No-ref/unsupported first messages are permanently unattributed.

## Remaining before launch

- Per-user spend/rate budgets, durable tool outcomes for future side effects, and contextual memory.
- Outbound queue/dispatcher, provider policy checks and WhatsApp sender.
- Sender, callback reconciliation and unmatched-evidence retention.
- Acquisition analytics dispatcher and PostHog integration.
- Trace propagation/OTel, abuse/rate/spend limits, alerting, retention and erasure policy.
- Deployed database qualification, live signature/provider tests and queue fault drills.

`GET /health` reports process liveness only, not database/provider readiness.
