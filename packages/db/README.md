# Shared database foundation

`@video-editor-agent/db` is a server-only, source-exported TypeScript workspace
package. Use a TypeScript bundler (Workers) or Node 24+ for scripts. Add
`"@video-editor-agent/db": "workspace:*"` to consuming services.

## Scope

- Drizzle schema and reviewed, committed PostgreSQL migrations.
- Neon WebSocket `Pool` for Workers and a separate Node `pg` transport for local
  development; both support interactive transactions.
- Better Auth web-authentication factory and core user/account/session/verification
  tables. No web sign-in method or plugins enabled yet; automatic account linking
  is disabled. Do not treat this as a ready-to-launch authentication service.
- Canonical user acquisition fields from `docs/outreach-attribution-rfc.md`, marked
  server-owned and excluded from auth responses.

Neon is the **candidate** in `docs/whatsapp-database-qualification.md`, not an
approved or production-qualified provider. This transport requires a Neon
`-pooler` endpoint and TLS; another provider needs a replacement connection module.
No Hyperdrive or HTTP-only transaction substitute is used.

## Setup and migrations

From the repository root:

```sh
docker compose up -d --wait postgres
cp packages/db/.env.example packages/db/.env
# The template matches Compose's local database; never commit real credentials.
pnpm --filter @video-editor-agent/db typecheck
pnpm --filter @video-editor-agent/db test
pnpm --filter @video-editor-agent/db db:generate
# Review SQL under packages/db/drizzle before applying to the intended database.
pnpm --filter @video-editor-agent/db db:migrate
pnpm --filter @video-editor-agent/db test:integration
```

Compose uses PostgreSQL 17, a persistent named volume, a healthcheck, and binds
port 5432 to `127.0.0.1` only. The `milo` / `milo_dev` credentials are for local
development **only**. No migrations run automatically at container startup.
Use `POSTGRES_PORT=5433 docker compose up -d --wait postgres` if 5432 is occupied,
and update both URLs in `packages/db/.env` to match.

```sh
docker compose stop postgres       # Preserve database data
docker compose down               # Remove containers, preserve volume
docker compose down -v            # DESTRUCTIVE: delete all local database data
```

The migration CLI selects Node `pg` for loopback URLs and Neon for remote URLs.
Local Node services should import `withLocalDatabase` / `createLocalDatabase` from
`@video-editor-agent/db/local`; they have the same lifecycle pattern as the Worker
factory and also work with `createAuth`. The local factory only accepts loopback
hosts, cannot accidentally connect to a remote unpooled database, and is not exported
from the Worker entry point. This setup runs apps on the host; container-to-container
connections and a local Workers TCP proxy are not configured here.

Migrations run explicitly, never during request handling. Generation requires no
connection or credentials. Keep migration SQL, snapshots and journal committed.
Only one deployment job should apply migrations at a time. After adding an auth
plugin or updating Better Auth, compare its required schema with ours and generate
and review a new Drizzle migration (do not replace the application schema blindly).

## Worker usage

Enable Workers `nodejs_compat` and use a current compatibility date. Supply
`DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` through managed secrets/
configuration, not global environment reads in this package.

```ts
import { withDatabase } from "@video-editor-agent/db";
import { createAuth } from "@video-editor-agent/db/auth";

// Inside a Worker fetch handler, for a request routed to /api/auth/*:
return withDatabase(env.DATABASE_URL, async (db) => {
  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: ["https://app.example.com"],
  });
  return await auth.handler(request);
});
```

Create the pool **inside each invocation**, never as a cross-request singleton.
Await every database/auth operation before closing. `withDatabase` closes in a
`finally`; `createDatabase` exposes `db` and an explicit async `close` for services
that need their own lifecycle. Native Worker WebSockets are used; only the migration
CLI and Node integration test install the `ws` fallback. A maximum of four local
connections is **not** a global concurrency limit; qualify provider-side pooled
capacity under aggregate load. Do not hold transactions during LLM/provider calls.

Better Auth's raw logger is disabled to avoid logging SQL, secrets or personal
data. Services must add sanitized diagnostics and telemetry. Handle query failures
without returning/logging raw driver errors. Explicitly configure a sign-in method,
verification policy, distributed rate limits and auth security tests before exposing
a production auth route.

## Identity and attribution boundaries

WhatsApp webhook signature checks and sender-to-internal-user resolution are not
Better Auth sessions. The required unique email in the core auth user schema does
not define a chat-first provisioning policy. Do not invent verified emails or link
accounts by matching phone numbers. Decide provisional-user creation and verified
account linking in the ingestion service.

`acquisition_ref = NULL` with a populated `acquisition_initialized_at` means
**permanently unattributed**. All acquisition fields start null, including for web
users; web signup alone is not WhatsApp acquisition. A check constraint disallows
partial initialization. `acquisition_message_id` is currently text; add its message
foreign key with the ingestion schema.

This scaffold does **not** enforce acquisition immutability or implement first
message acceptance. The future ingestion transaction must serialize initialization,
persist the message and processing/analytics intent atomically, tolerate duplicates,
and never update initialized acquisition. It also needs an existing-user rollout
policy. No referral registry, grammar or PostHog delivery behavior is invented here.

Messages, conversations, identity mappings, memory, runs, outbox and delivery events
belong to subsequent service work in `docs/whatsapp-agent-architecture.md`. Video
pipeline artifacts remain in R2 per `docs/pipeline-architecture.md`; no source media
or agent session blobs are placed in these auth tables. GTM Copilot's local SQLite
database remains separate.

## Validation limits

Unit tests are offline configuration/schema checks, not proof of database semantics.
For integration tests, migrate the local Compose database (or a **disposable Neon
database**), set `TEST_DATABASE_URL` in `packages/db/.env`, and run from the root:

```sh
pnpm --filter @video-editor-agent/db test:integration
```

It exercises Better Auth user/session persistence and transaction rollback and
cleans up its test user. It is skipped without configuration. Local PostgreSQL tests
do not qualify the Neon WebSocket transport or deployed Workers behavior. Deployed Workers
transport, concurrent locks, production auth flows and backup/restore still require
qualification; no resources are provisioned by this package.
