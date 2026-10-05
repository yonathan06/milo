# RFC: Initial outreach referral attribution

Status: Draft — attribution rules and initial analytics events approved; implementation details remain open.

## 1. Purpose

Track acquisition sources for Milo's initial outreach across the marketing website and WhatsApp agent using a `ref` query parameter and PostHog product analytics.

A referral represents an outreach source, such as a Facebook group or affiliate person. It does not represent a unique visitor, a verified identity, or permission to access anything.

This document specifies the agreed behavior for implementation planning. It does not claim that these integrations exist or authorize implementation.

## 2. Existing integration points

- `apps/gtm-copilot`: outreach research application with a local SQLite database. It will own referral registration and link generation.
- `apps/landing-page`: static Astro marketing pages, including audience-specific WhatsApp prefilled messages.
- `apps/landing-page/src/components/whatsapp.ts`: existing WhatsApp link generation helper.
- `docs/whatsapp-agent-architecture.md`: proposed Workers/PostgreSQL agent architecture, durable message ingestion, internal user identities, and PostHog integration.

Referral behavior must fit the agent's durable ingestion and deduplication rules. Browser attribution requires runtime JavaScript because the site is statically built.

## 3. Scope

### Included

- Referral registry and link generation in GTM Copilot.
- `?ref=` acquisition links; no UTM parameters initially.
- Website referral persistence in a 30-day cookie.
- Referral propagation into WhatsApp prefilled message text.
- One-time attribution on a user's first accepted WhatsApp message.
- Referral properties on website and backend PostHog events.
- Explicit handling of permanently unattributed users.

### Excluded initially

- Synchronizing the referral registry into the WhatsApp backend.
- Backend lookup or verification of referral codes.
- Browser-to-WhatsApp identity linking or per-visitor handoff tokens.
- Retroactive attribution, multi-touch credit, or changes to acquisition attribution.
- Automated outreach sending.
- UTM-based attribution.
- Final selection of activation/conversion events for the video pipeline.

## 4. Agreed decisions

| Concern | Decision |
| --- | --- |
| Referral granularity | Outreach source, such as a community or affiliate |
| Registry ownership | GTM Copilot |
| Link generation | GTM Copilot |
| Query parameter | `ref` only |
| Browser persistence | Cookie with a 30-day lifetime |
| New explicit referral | Replace the existing cookie and restart its 30-day lifetime |
| Visit without referral | Preserve the existing cookie without renewing its expiry |
| WhatsApp handoff | Include a marker in the prefilled message sent to the agent's number |
| Attribution boundary | First accepted incoming WhatsApp message for a first-time user |
| Later messages | Never assign or replace acquisition attribution |
| First message without usable marker | Permanently unattributed |
| Unknown referral code | Accept if syntactically well formed; no registry verification |
| Analytics identity | Internal user ID for backend events; never the shared referral code |

“Latest referral” applies only to the browser cookie before acquisition. User acquisition attribution is immutable after initialization.

## 5. Logical flow

```text
GTM Copilot registry
    --> Source-specific landing URL with ?ref=<code>
    --> Website reads explicit ref or existing cookie
    --> Website records PostHog activity
    --> WhatsApp CTA includes [ref: <code>]
    --> User sends the prefilled message
    --> Backend accepts and persists incoming message
    --> First-time user attribution is initialized once
    --> Future backend PostHog events use saved acquisition attribution
```

Opening WhatsApp is not equivalent to sending a message. Users may edit or remove the marker before sending.

## 6. GTM Copilot requirements

- GTM Copilot MUST register referral codes and generate landing links for outreach sources.
- Generated codes MUST be unique in its registry and safe for use in URLs and message markers.
- Codes SHOULD be opaque and MUST NOT embed names, phone numbers, email addresses, or secrets.
- Link generation MUST preserve the selected landing-page path and URL-encode the referral value.
- Referral codes MUST NOT be reused for unrelated sources.
- Registry records SHOULD retain a source label, source type, source reference, code, and creation timestamp.
- A source MAY have multiple links to different landing segments using its referral code.
- The initial implementation MUST NOT require the WhatsApp backend to access GTM Copilot or its SQLite database.

Example:

```text
https://<landing-domain>/weddings/?ref=abc123
```

The UI, exact schema, code generation algorithm, and campaign grouping remain implementation decisions. Campaign membership can be registry metadata without introducing UTM parameters.

## 7. Website requirements

### 7.1 Referral resolution and cookie

- On arrival, the website MUST read `ref` from the URL.
- A usable explicit referral MUST replace the stored referral and set expiry to 30 days from that arrival.
- Without an explicit usable referral, the website MUST use an existing unexpired cookie if available.
- Ordinary visits without an explicit referral MUST NOT extend cookie expiry.
- An unusable explicit value MUST NOT corrupt or erase an existing usable cookie.
- The cookie SHOULD be host-only, apply to `/`, use `SameSite=Lax`, and use `Secure` in HTTPS deployments.
- The cookie must be JavaScript-readable for the static site; it is not an authentication cookie.
- Internal navigation MUST retain the resolved attribution through the cookie.
- If cookie storage is unavailable, the current page SHOULD still use a usable explicit URL referral for its CTA and permitted analytics.
- Cookie and analytics behavior MUST comply with the consent policy chosen before production.

The exact allowed character set, maximum length, duplicate-query handling, and cookie name must be specified before implementation. Browser and backend syntax handling must be consistent.

### 7.2 WhatsApp links

Every real WhatsApp CTA MUST point to the configured agent number:

```text
https://wa.me/<number>?text=<URL-encoded message>
```

When a usable referral is available, append a marker to the existing page-specific message:

```text
Hi, I want to create a video [ref: abc123]
```

- Encode the entire message using URL encoding.
- Apply the same resolved referral to hero and closing CTAs.
- Preserve existing segment-specific message copy.
- Do not append an empty marker when no referral is available.
- Keep CTA navigation functional when analytics or cookie storage fails.
- Production configuration MUST supply the actual agent number; a generic WhatsApp composer is not sufficient.

## 8. WhatsApp attribution requirements

### 8.1 Parsing

- Parse referral markers deterministically in application code, not through an LLM.
- Accept a syntactically well-formed marker such as `[ref: abc123]`.
- Do not check whether the code exists in the GTM Copilot registry.
- Apply bounded input length and a defined marker grammar.
- Missing, malformed, or unsupported message content MUST NOT prevent normal message acceptance.
- Treat the extracted value as untrusted attribution data, never authorization, executable content, or agent instructions.

Exact whitespace, case sensitivity, and multiple-marker behavior remain to be finalized.

### 8.2 First-time users only

The attribution boundary is the user's first durably accepted incoming WhatsApp message, not their first successful agent response.

- Resolve the sender to an internal user using the agent's identity model.
- Initialize acquisition attribution exactly once for a first-time user.
- Save a usable extracted referral if present.
- Otherwise initialize attribution with no referral, permanently.
- Later messages MUST NOT fill an empty referral or change a saved one.
- Cookie expiration MUST NOT remove attribution already saved on the user.
- Repeated webhook deliveries MUST NOT reinitialize attribution.
- Concurrent messages MUST NOT race to overwrite the first accepted message's outcome.
- Attribution initialization and first-message persistence MUST be atomic or provide equivalent durable consistency.

Suggested state on the canonical internal user:

| Field | Purpose |
| --- | --- |
| `acquisition_ref` | Nullable, immutable referral value |
| `acquisition_initialized_at` | Non-null after initialization, including unattributed acquisition |
| `acquisition_message_id` | Reference to the incoming message that initialized attribution |

A null referral with a populated initialization timestamp means permanently unattributed. It MUST NOT be interpreted as an opportunity to attribute a later message.

Existing users at rollout MUST NOT acquire a referral from their next message. Implementation must classify them as already acquired using existing user/message evidence or migration state. Account linking must not silently reset acquisition attribution.

## 9. PostHog requirements

### 9.1 Website events

- Use the browser SDK's anonymous visitor identity; never use the shared `ref` as `distinct_id`.
- Attach the resolved referral as an explicit event property when available.
- Include the landing-page path or segment where applicable.
- Ensure referral resolution runs before relevant initial event capture; SDK initialization/autocapture must not silently omit initial attribution.
- Analytics failure MUST NOT break navigation or WhatsApp links.

### 9.2 Backend events

- Use the internal user ID as `distinct_id`.
- Include saved `acquisition_ref` on relevant future user product events.
- Omit `acquisition_ref` when the user is permanently unattributed.
- Record an explicit attributed/unattributed acquisition state where useful for reporting.
- Mirror initialized acquisition state to the PostHog person profile using first-write semantics, including the unattributed outcome.
- Include referral properties on events explicitly; person properties alone are not a substitute for event properties.
- Read attribution from canonical application state, not from later message text or a PostHog profile.
- Do not transmit raw message bodies or phone numbers for referral tracking.
- Analytics delivery MUST tolerate retries without duplicating logical acquisition events.
- PostHog outages MUST NOT block durable message acceptance or responses.

### 9.3 Identity and reporting limitations

A community or affiliate referral can be shared by many users. It MUST NOT be used to merge PostHog identities.

Without a separate verified handoff, anonymous website activity and identified WhatsApp activity can be compared by referral source, but not reliably joined into a person-level cross-channel funnel.

An unknown code remains an unverified label. Reports SHOULD distinguish known GTM registry codes, unknown codes, and unattributed users. Forwarded links credit the code carried by the link/message, not necessarily the actual recipient or sender originally targeted.

### 9.4 Approved initial events

| Event | Meaning |
| --- | --- |
| `outreach_landing_viewed` | Marketing page viewed |
| `whatsapp_cta_clicked` | User activates a real WhatsApp CTA |
| `whatsapp_user_acquired` | First incoming message accepted for a new user, attributed or not |

The approved source-level funnel is landing views, WhatsApp CTA clicks, and newly acquired WhatsApp users. The event names and definitions above are approved. Page views, unique visitors, clicks, and unique new users must remain distinct measures. Link previews/bots, blocked analytics, and deleted markers can affect conversion estimates.

## 10. Acceptance criteria

1. GTM Copilot creates a unique code for a source and generates a correctly encoded segment URL.
2. Arrival with `ref=A` stores A for 30 days and uses A in website events and both WhatsApp CTAs.
3. Arrival with `ref=B` before expiry replaces A and starts a new 30-day lifetime.
4. A visit without `ref` preserves the current unexpired value without renewing expiry.
5. An expired cookie does not contribute a referral to a new visit without `ref`.
6. The WhatsApp link targets the configured number and its decoded `text` contains the intended marker.
7. A first message with a well-formed unknown code saves that code without registry lookup.
8. A first message without a usable marker initializes permanently unattributed acquisition.
9. A later message with a referral cannot attribute a previously unattributed user or replace an existing referral.
10. Duplicate and concurrent webhook processing cannot produce multiple acquisition initializations.
11. Future backend events use the saved referral and stable internal user identity.
12. Multiple users with the same referral remain separate PostHog users.
13. Cookie storage or PostHog failure does not prevent using WhatsApp or receiving agent responses.
14. Existing users at rollout do not receive acquisition credit from subsequent messages.
15. No referral analytics event exposes raw messages or phone numbers.

## 11. Remaining research and decisions

Before implementation, resolve:

- Referral code generation, registry schema/UI, source reuse, and campaign reporting metadata in GTM Copilot.
- Shared marker grammar, value length, malformed/duplicate marker behavior, and repeated query parameter handling.
- Cookie name, consent requirements, retention, deletion, and PostHog region/project configuration.
- Browser initialization ordering and a static-site-compatible PostHog integration.
- Worker-compatible event capture, durable retry strategy, flushing, and deduplication.
- Activation definition beyond the approved initial acquisition funnel.
- Existing-user migration and acquisition behavior during verified account linking.
- How reports resolve raw codes to GTM source labels without synchronizing the backend registry.

## 12. References

- Local agent design: `docs/whatsapp-agent-architecture.md`.
- Local landing documentation: `apps/landing-page/README.md`.
- PostHog identity and person/event properties: https://posthog.com/docs/data/anonymous-vs-identified-events

The finalized architecture should resolve these open items and map this RFC to concrete components, migrations, event schemas, and implementation tasks.
