# WhatsApp response agent

A separate Cloudflare Worker running Milo's conversational model/tool loop with
Vercel AI SDK and OpenRouter. This is the conversation agent, **not** the Strands
director/editor containers described in `docs/pipeline-architecture.md`.

## Current behavior

- Replies in the user's language with brief WhatsApp-friendly text.
- Accepts a current text message and at most 20 recent user/assistant messages.
- Exposes typed `analyze_media`, `create_video`, and `get_video_status` tools.
  Each returns `{ ok: false, error: { code: "unimplemented", tool, message } }`
  to the model. Nothing is analyzed, submitted, rendered, or persisted.
- Limits turns to four model steps, 1,000 output tokens per step, a 25-second
  deadline, and no automatic model retries. The last step disables tools so the
  model can explain an unavailable capability. These are execution limits, not
  a billing/spend ceiling or an exactly-once inference guarantee.
- No shell, filesystem, database, source-media, or storage tools.

## Internal API

`GET /health` reports `{ configured: boolean }` (200 when configured, 503 when
missing the provider key/model). It makes no model calls and exposes no secrets;
it checks configuration, not provider availability or account credits.

`POST /respond` through the internal `AGENT` service binding (no token):

```json
{
  "message": "Can you make a birthday recap from media-001?",
  "history": [
    { "role": "assistant", "content": "What would you like to create?" }
  ]
}
```

Returns `{ version, text, usage, toolOutcomes }`. Tool failures are normal model
context, not HTTP failures. Invalid input returns 400, oversized input 413,
missing configuration 503, and model/timeout/invalid-response failures 502.
Provider exceptions and message content are not logged or returned as diagnostics.

The endpoint is for a trusted backend, not a webhook or browser. Public
`workers.dev` and preview URLs are disabled, and no public routes are configured.
The service binding from `apps/whatsapp-service` is the access boundary and calls
it with authorized history. Keep this Worker internal-only; adding public routes
would require a separate authentication policy.

## Run and verify

```sh
# Export OPENROUTER_API_KEY in this Bash session before starting dev.
# No .dev.vars file is required.
# Optionally export AGENT_MODEL to override the configured model.
pnpm --filter @video-editor-agent/whatsapp-agent dev
pnpm --filter @video-editor-agent/whatsapp-agent typecheck
pnpm --filter @video-editor-agent/whatsapp-agent test
pnpm --filter @video-editor-agent/whatsapp-agent deploy:dry-run
```

Wrangler's `secrets.required` configuration loads the exported provider key from
the shell and only binds declared secrets/configuration variables, not the entire
shell environment. Optional `.dev.vars` files still take precedence if present.

For deployment, set `OPENROUTER_API_KEY` through `wrangler secret put`. The default model
is `anthropic/claude-sonnet-4.5`; availability and live provider behavior must be
verified with the selected account. Tests use mock inference and require no keys.

## Integration boundary / deferred work

The local WhatsApp simulator now calls this Worker through the `AGENT` service
binding after queue intake and conversation scheduling. Its coordinator claims a
60-second attempt lease in PostgreSQL, loads bounded conversation history, invokes
this Worker outside transactions, then commits the reply/run/send intent with a
fenced completion check. Three failed attempts produce a persisted fallback;
expired/interrupted attempts can be recovered. History is scoped to the canonical
conversation and current turn, not supplied by the simulator client.

Run both Workers together using `pnpm --filter @video-editor-agent/whatsapp-service
dev`; see that app's README for provider-key and database setup. Real WhatsApp
outbound delivery remains deferred. Production agent execution is disabled by
default.

This app does not send WhatsApp messages, persist memory, orchestrate the video
pipeline, or implement durable retries, per-user rate/spend limits, or telemetry.
Real pipeline tools must later authorize media/job ownership in application code
and return durable job IDs rather than block a conversational turn. Pipeline
completion means validated timeline artifacts, not a rendered video.

See `docs/whatsapp-agent-architecture.md` for the roundtrip design and
`docs/pipeline-architecture.md` for the deferred video pipeline.
