# WhatsApp identity, messages, and delivery flow

## Scope

`packages/db` implements the PostgreSQL/Drizzle foundation for canonical users,
WhatsApp channels and sender identities, ordered conversation history, acquisition
attribution, outbound send units, and delivery callback evidence.

**This is not a complete WhatsApp roundtrip yet.** `apps/whatsapp-service` now
implements signature validation, webhook verification/normalization, transactional
incoming acceptance and referral attribution, callback evidence persistence, and
processing/acquisition outbox intents. A scheduled dispatcher publishes processing
message IDs to Cloudflare Queues with recoverable claims; dispatch is disabled by
default. The processing consumer now commits a unique pending `agent_runs` row
before acknowledgment, with per-item retries and a configured DLQ. Conversation
Durable Objects and PostgreSQL row locks now coordinate ordered deterministic test
replies, saving outbound content, chunks, send intents and terminal run state
atomically. This test responder is enabled only in the local config. LLM execution,
acquisition analytics dispatch, outbound queue/provider sends and callback
reconciliation remain runtime work.
See the [service README](../apps/whatsapp-service/README.md) for setup and tests.
Memory, media ingestion, and the video pipeline remain outside this milestone.

See [WhatsApp agent architecture](whatsapp-agent-architecture.md) and
[outreach attribution RFC](outreach-attribution-rfc.md) for the wider requirements.

## Entity relationships

```text
users
  +--> whatsapp_identities <-- whatsapp_channels
              |
              +--> conversations
                        |
                        +--> messages
                                 |
                                 +--> outbound_deliveries
                                           |
                                           +--> delivery_events

users.acquisition_message_id --> messages.id [owned incoming message]
```

A user is the canonical internal principal, not a phone number, WhatsApp sender
ID, referral code, or Better Auth browser session. A signed event from a recognized
channel can establish verified phone ownership; client-submitted numbers cannot.

## End-to-end illustration

Boxes marked `*` identify runtime components in the original foundation design;
some are now partially implemented by `apps/whatsapp-service` (see Scope above).
The incoming transaction now includes `outbox_intents` for processing and acquisition.
The outgoing transaction and agent/send/reconciliation paths remain future work.

```text
                        INCOMING MESSAGE
                               |
                               v
                    +----------------------+
                    | WhatsApp webhook*    |
                    | Validate signature   |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | whatsapp_channels    |
                    | Resolve recognized   |
                    | business endpoint    |
                    +----------+-----------+
                               |
          +--------------------v---------------------+
          | INCOMING DATABASE TRANSACTION            |
          |                                          |
          | users                                    |
          |   Find/create by normalized phone        |
          |   Lock for acquisition decision          |
          |     |                                    |
          |     v                                    |
          | whatsapp_identities                      |
          |   Find/create channel + sender mapping   |
          |     |                                    |
          |     v                                    |
          | conversations                            |
          |   Find/create; allocate next sequence    |
          |     |                                    |
          |     v                                    |
          | messages [inbound]                       |
          |   Deduplicate channel + provider ID      |
          |   Persist accepted content               |
          |     |                                    |
          |     v                                    |
          | users.acquisition_*                      |
          |   Initialize once if eligible            |
          |   Save referral or permanent no-ref      |
          |     |                                    |
          |     v                                    |
          | Processing + acquisition outbox intents* |
          +--------------------+---------------------+
                               |
                             COMMIT
                               |
                +--------------+---------------+
                |                              |
                v                              v
       Acknowledge webhook*           Durable dispatch*
       Duplicate delivery:                    |
       reuse existing message                 v
                                    +----------------------+
                                    | Conversation agent*  |
                                    | Read message history |
                                    | Generate response    |
                                    +----------+-----------+
                                               |
          +------------------------------------v-----+
          | OUTGOING DATABASE TRANSACTION            |
          |                                          |
          | messages [outbound]                      |
          |   Persist assistant response             |
          |     |                                    |
          |     v                                    |
          | outbound_deliveries                      |
          |   Persist send payload per chunk         |
          |   submission_status = pending            |
          |     |                                    |
          |     v                                    |
          | Send outbox intent per chunk*            |
          +--------------------+---------------------+
                               |
                             COMMIT
                               |
                               v
                    +----------------------+
                    | Outbound dispatcher* |
                    | Send saved payload   |
                    | No regeneration      |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | WhatsApp Cloud API   |
                    +----------+-----------+
                               |
          +--------------------+---------------------+
          |                    |                     |
          v                    v                     v
     Accepted send       Definite failure     Ambiguous timeout
          |                    |                     |
          v                    v                     v
   outbound_deliveries  outbound_deliveries   outbound_deliveries
   provider ID saved    retry or terminal    submission = unknown
   submission=accepted  failure recorded     reconcile / policy*
          |
          v
                 ASYNCHRONOUS STATUS CALLBACKS
                               |
                               v
                    +----------------------+
                    | WhatsApp webhook*    |
                    | Validate signature   |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | delivery_events      |
                    | Persist deduplicated |
                    | callback evidence    |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Callback reconciler* |
                    | Match send unit and  |
                    | update current state |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | outbound_deliveries  |
                    | Consolidated state   |
                    | No state regression  |
                    +----------------------+
```

Callbacks may arrive before the send response is persisted; the unmatched-event
path works independently of successful send-response handling. Status callbacks
never create a new conversational turn.

## Tables and responsibilities

### `users` (existing)

Better Auth owns web authentication fields. The application owns phone verification
and acquisition. Phone-only provisioning uses an opaque `.invalid` email placeholder
and never creates a browser session. Acquisition fields are hidden from auth
responses and cannot be supplied through Better Auth input.

| Acquisition state | Origin | Initialized timestamp | Message | Referral |
| --- | --- | --- | --- | --- |
| Uninitialized | null | null | null | null |
| WhatsApp acquisition | `whatsapp_first_message` | required | owned inbound message | optional |
| Preexisting user | `preexisting` | required | null | null |

A populated initialization timestamp with a null referral means **permanently
unattributed**, not an opportunity for attribution on a later message. Unknown,
syntactically usable codes are unverified labels; there is no referral registry FK.
Parsing and shared referral grammar are deferred, not delegated to an LLM.

### `whatsapp_channels`

`id`, `business_account_id`, unique `provider_phone_number_id`, optional
`display_phone_number`, `status` (`active`/`disabled`), and timestamps.

Identifies the receiving/sending business endpoint. Credentials live in managed
secrets, not channel rows. Provider identity is immutable; disable a channel instead
of rewriting it into another endpoint.

### `whatsapp_identities`

`id`, `user_id`, `channel_id`, `provider_sender_id`, `verified_at`, `created_at`.

Unique `(channel_id, provider_sender_id)` maps a sender to a canonical user. A user
can have associations across several channels. Owner/channel/sender are immutable;
verified account merging requires a separate design.

There is **no `last_seen_at`**. Activity can be derived from incoming message dates.

### `conversations`

`id`, unique `whatsapp_identity_id`, `status` (`active`/`closed`/`blocked`),
`next_sequence`, optional `last_incoming_at`, and timestamps.

One persistent conversation per identity for the one-to-one baseline. Owner and
channel are derived through the identity rather than duplicated. Sequence numbers
are PostgreSQL bigint / JavaScript bigint; serialize them explicitly when placing
references in JSON. The counter starts at 1 and cannot decrease.

`last_incoming_at` is a denormalized lookup shortcut, maintained by future ingestion.
Messaging-window eligibility must follow provider policy and trusted message times;
an acceptance timestamp alone is not a complete authorization to send.

### `messages`

`id`, `conversation_id`, `sequence`, `direction`, `content_type`, optional `text`,
versioned `content` JSONB, `channel_id`, optional `provider_message_id`,
`reply_to_message_id`, `provider_reply_to_id`, `provider_created_at`, `accepted_at`,
and `created_at`.

This is **what was said**, not the transport outcome. Unique conversation/sequence
orders history; unique channel/provider ID deduplicates incoming messages. Inbound
messages require a nonempty provider ID; outbound provider IDs live on send units.
Replies must reference another message in the same conversation. The external reply
ID can be retained even when there is no locally resolvable message.

Canonical identity, sequence, accepted time, and content are immutable. Normalized
unsupported types are explicit; recording them does not implement media handling.
The database checks the JSON version envelope, but adapters must additionally
validate payload versions, shapes, and sizes. Text messages require non-null text.

### `outbound_deliveries`

`id`, `message_id`, `channel_id`, `chunk_index`, unique `operation_key`, versioned
`payload` JSONB, `submission_status`, `delivery_status`, optional provider ID,
`attempt_count`, `next_attempt_at`, `last_error_code`, submission/delivery/read times,
and creation/update times.

This is **how a saved outgoing message is sent**. One row is one logical send chunk,
not one HTTP attempt. Unique `(message_id, chunk_index)` permits one conversation
response to become several WhatsApp messages. Send payload/identity are immutable;
retries reuse them rather than regenerate an answer. Accepted submission requires a
provider ID, which cannot subsequently be replaced.

Submission: `pending`, `submitting`, `accepted`, `unknown`, `blocked`, `failed`.
Delivery: `none`, `sent`, `delivered`, `read`, `failed`.

An ambiguous timeout is `unknown`, not a definite failure. Internal operation keys
prevent duplicate records, **not duplicate external sends**. Recovery/retry policy,
claim leases, chunk dispatch order, backoff, messaging windows, and template
eligibility remain runtime work. Detailed HTTP attempt history is not added here.

Delivered/read state cannot regress, and populated delivered/read milestones cannot
be rewritten. A contradictory failure callback is retained as evidence rather than
overwriting confirmed delivery. A reconciler should ignore stale updates instead
of submitting an update that the database will reject.

### `delivery_events`

`id`, `channel_id`, nullable `outbound_delivery_id`, `provider_message_id`, unique
`deduplication_key`, `status`, `provider_timestamp`, optional `error_code`, `received_at`.

This is **the evidence**, distinct from a send unit's current consolidated state.
A callback can be persisted without a matched delivery and linked later. Linking
must match both channel and provider message ID. Evidence is immutable apart from
its initial unmatched-to-matched reconciliation.

The future adapter must generate a deterministic deduplication key from normalized
callback identity (including enough status/time/error evidence to distinguish
legitimate events). This schema does not implement that normalization. Raw webhook
bodies are not stored. Retention can delete events; they need not live as long as
conversation content.

## Example

```text
users: Alice
  |
  +--> whatsapp_identity: Alice on our business channel
         |
         +--> conversation
                |
                +--> message #1 [inbound]: "Hi [ref: abc123]"
                |      |
                |      +--> Initializes Alice's acquisition once
                |
                +--> message #2 [outbound]: assistant response
                       |
                       +--> outbound_delivery: chunk 0
                       |      +--> event: sent
                       |      +--> event: delivered
                       |      +--> event: read
                       |
                       +--> outbound_delivery: chunk 1
                              +--> independently tracked outcome
```

## Transactions and consistency

Incoming ingestion resolves identity only after signature validation.
Within one short database transaction, lock the canonical user before the
first-acquisition decision, deduplicate the incoming message, allocate a conversation
sequence by row lock or atomic increment, persist the message, initialize eligible
acquisition, and persist processing/analytics intent. Acknowledge only after commit.
The first **durably accepted** incoming message wins; provider timestamps do not
order concurrent webhook acceptance. Duplicate acceptance must not allocate a new
sequence or reinitialize acquisition.

Future outgoing completion must commit saved response content, send chunks, and send
outbox intents together. Do not hold a transaction open during an LLM or provider
HTTP call. Service integration tests now exercise the real acceptance/dispatch functions,
including concurrency, rollback, and publication interruption. Consumer handoff tests cover concurrent logical-run deduplication and user erasure.
Agent execution, fenced response commits and outbound runtime tests are still needed before this becomes
a reliable roundtrip. The original DB integration tests remain foundation patterns.

Ownership checks and immutability/state guards are reviewed PostgreSQL triggers in
`packages/db/drizzle/0003_noisy_joseph.sql`. **Drizzle snapshots do not represent
these triggers or the acquisition FK's deferred timing.** Keep custom SQL through
future migrations; do not replace the schema with automatic startup synchronization.

## Migration and deletion

The migration marks users already present at rollout as `preexisting` before enabling
new acquisition initialization. It deliberately fails if legacy initialized
acquisition exists: the previous schema had no canonical messages table, so those
references require an explicitly reviewed import rather than fabricated evidence or
silent referral deletion. Normal later user creation remains uninitialized.

User deletion cascades through identities, conversations, messages, outbound send
units, and matched delivery events. The acquisition FK is deferred to allow this
whole-user erasure; deleting an acquisition message while retaining its initialized
user is rejected. Deleting other messages clears local reply pointers. Shared
business channels are retained. Unmatched callback events need explicit retention
cleanup because they have no owner/delivery association yet.

Production retention, deletion of external provider data, operational access, and
analytics policies must be chosen separately. Backend referral analytics must use
the internal user ID and saved acquisition state, never phone numbers, raw content,
or a shared referral code as identity.

## Verification

From the repository root:

```sh
pnpm --filter @video-editor-agent/db typecheck
pnpm --filter @video-editor-agent/db test
pnpm --filter @video-editor-agent/db db:generate
# Explicitly apply reviewed migrations only to the intended local/disposable DB.
pnpm --filter @video-editor-agent/db db:migrate
pnpm --filter @video-editor-agent/db test:integration
```

Integration tests require `TEST_DATABASE_URL`; without it they are skipped. They
cover ownership and direction checks, deduplication, concurrent sequence allocation,
atomic acquisition rollback, immutable attribution, send chunk identity, unknown
submission, callback reconciliation, state regression, migration fixtures, and
whole-user erasure. Local PostgreSQL success does not qualify Neon or deployed
Workers behavior.
