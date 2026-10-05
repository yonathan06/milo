# WhatsApp database qualification — task 1.1

## Status and decision record

**In progress; not approved and not qualified for production.** This record proposes
one candidate and provides an executable staging probe. Local checks are not proof
of deployed transaction support. No database or Cloudflare resources were provisioned
and no live transaction/restore evidence has been collected.

| Decision | Proposed choice | Approval / evidence |
| --- | --- | --- |
| Provider | Neon managed PostgreSQL, paid plan with selected restore window | Pending owner approval, project ID and plan verification |
| Region | AWS `eu-central-1` (Frankfurt); candidate only, subject to user geography, residency and latency review | Pending owner approval |
| Workers transport | `@neondatabase/serverless` WebSocket `Pool`, `drizzle-orm/neon-serverless`, Neon **`-pooler`** endpoint (PgBouncer transaction pooling), TLS required | Local bundle/typecheck pass; deployed evidence pending |
| Backup / restore | Proposed 7-day PITR window, daily encrypted logical backup in separately controlled EU storage, 30-day backup expiry | Pending retention/privacy approval, pricing/plan confirmation and storage provisioning |
| Recovery targets | Proposed PITR RPO ≤ 5 minutes, RTO ≤ 60 minutes; logical-backup disaster recovery RPO ≤ 24 hours | Targets only; must be measured in a restore drill |
| Approver | Responsible infrastructure/data owner | Name, date and explicit acceptance pending |

PITR in the same provider is not an independent backup. Approve export access,
encryption, key custody, deletion implications and off-provider storage before
scheduling logical backups. Restore into an isolated new database/branch, check
constraints and row counts, rehearse connection-secret cutover while ingestion and
sending are paused, then document restart/replay. Never overwrite the source during
a drill. Phase 12.5 performs the full incident drill; this task still requires an
approved policy, not a claim that these recovery targets are achieved.

### Why this candidate

The application needs interactive transactions (queries depend on previous results),
not just HTTP query batching. Neon provides a Workers-compatible WebSocket driver
and a provider-side pooled endpoint. Drizzle's `neon-serverless` adapter exposes
interactive transactions. A request-scoped driver pool opens WebSocket connections
**to PgBouncer**, not fresh unpooled PostgreSQL connections per request. Workers
sockets cannot be reused across unrelated requests; close the request-scoped pool
before returning. The probe caps each pool at four connections. This is not a global
connection limit: phase 12.4 must qualify aggregate load and provider pool limits.

No Hyperdrive, session-affine features, global socket pool, or `neon-http` transaction
substitute is used. Application access remains behind a module boundary; this package
is a disposable qualification harness, not the application's schema or persistence API.
Better Auth integration remains task 1.2, not a result of this probe.

Reference documentation (review the current provider plan before approval):
- https://neon.com/docs/serverless/serverless-driver — Workers lifecycle and WebSocket transactions
- https://neon.com/docs/connect/connection-pooling — pooled endpoint and transaction-pooling limitations
- https://orm.drizzle.team/docs/connect-neon — Drizzle adapter choices
- https://neon.com/docs/introduction/regions — available regions
- https://neon.com/docs/introduction/branch-restore — restore window and branching

## Run the qualification

Use `packages/whatsapp-db-qualification`. Its Worker has only an authenticated
`POST /qualify` endpoint. Do not deploy it against production or reuse application
credentials. Set a strong random probe token; restrict access with Cloudflare Access
as an additional control if available. Each invocation creates random-ID rows in the
qualification schema and deletes them in `finally`; abrupt termination may leave
rows to remove manually **in this isolated database**. There is no webhook or agent.

1. Obtain owner approval for the candidate region and create an isolated Neon project
   or branch. Create a least-privilege qualification role and retrieve its pooled URL.
2. Apply `packages/whatsapp-db-qualification/sql/setup.sql` manually with `psql` using
   an admin connection, `ON_ERROR_STOP=1`, to that isolated database. Review SQL first.
   Grant the runtime role `USAGE` on `whatsapp_qualification` and
   `SELECT, INSERT, UPDATE, DELETE` on its two tables. Do not grant DDL privileges.
3. From the repository root:

   ```sh
   pnpm install --filter @video-editor-agent/whatsapp-db-qualification
   pnpm --filter @video-editor-agent/whatsapp-db-qualification typecheck
   pnpm --filter @video-editor-agent/whatsapp-db-qualification test
   pnpm --filter @video-editor-agent/whatsapp-db-qualification exec wrangler deploy --dry-run
   pnpm --filter @video-editor-agent/whatsapp-db-qualification exec wrangler secret put DATABASE_URL
   pnpm --filter @video-editor-agent/whatsapp-db-qualification exec wrangler secret put PROBE_TOKEN
   pnpm --filter @video-editor-agent/whatsapp-db-qualification deploy:staging
   ```

   Enter secrets interactively, never commit them. `DATABASE_URL` must use a Neon
   `-pooler` hostname and `sslmode=require`. Wrangler credentials belong to the
   operator's managed environment, not this repo.
4. Run the deployed probe with a token supplied from the operator's secret store:

   ```sh
   curl --fail-with-body -X POST "$PROBE_URL/qualify" \
     -H "Authorization: Bearer $PROBE_TOKEN"
   ```

   Avoid verbose curl or shell tracing (it exposes tokens). Expect `status: passed`
   and seven checks: `commit`, `rollback`, `concurrent_row_lock`,
   `concurrent_sequence`, `conditional_update`, `claim_transactions`,
   `expired_claim_recovery`. A 503 is a **failure**, not qualification evidence.
5. Repeat under several simultaneous HTTP invocations. Collect sanitized JSON output,
   UTC timestamps, commit SHA, Wrangler/dependency versions, deployment ID, region,
   and provider-side pooling/connection metrics. Confirm no unpooled endpoint was
   configured and that connections return to baseline after completion. Do not save
   credentials, connection URLs or query/error logs with secrets in evidence.
6. Approve policy and attach evidence below. Disable/delete the qualification Worker
   and revoke its credentials once testing is done.

### What the checks prove (when executed against deployed infrastructure)

- Commit persists both a counter and an intent; deliberate rollback persists neither
  the counter mutation nor its extra intent.
- An overlapping transaction on a separate connection receives PostgreSQL `55P03`
  from `FOR UPDATE NOWAIT` while another transaction holds the row lock.
- Eight concurrent atomic updates return exactly the sequence 1–8.
- Eight conditional updates produce exactly one winner.
- Eight transactional `FOR UPDATE SKIP LOCKED` claims produce eight unique active
  claims; a ninth finds none. Expiring one lease permits recovery with an incremented
  fence. These are transport semantics tests, not the final outbox implementation.

Unit tests cover URL guards, method/auth gating and sanitized configuration failure.
They do **not** mock database success or claim to prove transaction behavior.
The dry-run checks Worker bundling, not live WebSocket transport.

## Evidence and approval checklist

- [x] Candidate transport and isolated probe implemented.
- [x] Local typecheck, unit tests, Worker deployment dry-run pass.
- [ ] Provider/region/plan explicitly approved (owner, date, project reference).
- [ ] Backup/restore/retention policy explicitly approved (owner, date).
- [ ] Deployed Worker outputs and concurrency evidence attached (location/reference).
- [ ] Provider pooling metrics and post-test connection cleanup reviewed.
- [ ] Restore capabilities and configured window verified on the selected plan.
- [ ] Task 1.1 signed off. Only then check its box in `whatsapp-agent-tasks.md`.
