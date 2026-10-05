# Milo landing pages

Astro static marketing pages for Milo, an AI video editor on WhatsApp. Four English event segments reuse the same design and scroll conversation. The homepage includes tabbed previews of each segment. No general segment page or UI framework. PostHog is loaded only after analytics consent.

## Run

From `apps/landing-page`:

```sh
npm run dev -- --background
npm run astro -- dev status
npm run astro -- dev logs
npm run astro -- dev stop
npm run build
npm test
```

Local preview: http://localhost:4321

## Pages

| Page | Path |
| --- | --- |
| Homepage | `/` |
| Weddings | `/weddings/` |
| Company events | `/company-events/` |
| Family events | `/family-events/` |
| Friends' parties | `/friends-parties/` |

English only. Brand links return to `/`. Localized routes and language controls are not available.

## Deployment and WhatsApp

Copy `.env.example` to `.env` and set `PUBLIC_WHATSAPP_NUMBER` to the agent's WhatsApp number, including country code. Rebuild after changing it; this is a static site.

Local previews without a number open WhatsApp's generic message composer, **not an agent conversation**. Building with a non-local `SITE_URL` requires an agent number. No backend or WhatsApp account is provisioned by these pages. Each segment has its own English message; hero and closing CTAs use the same destination.

Export `SITE_URL` with the actual deployed origin when building so canonical URLs are correct. This config reads the shell environment, not `.env`, for `SITE_URL`. Without it, URLs use `http://localhost:4321` for local development. For example, replace the example origin before deploying:

```sh
SITE_URL=https://your-actual-domain.example npm run build
```

## Outreach attribution and consent

Set `PUBLIC_POSTHOG_KEY` to your public project token and `PUBLIC_POSTHOG_HOST` to your ingestion host (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). Rebuild after changes. An empty key disables analytics without affecting CTAs. The integration uses Astro's bundled browser script and the PostHog JavaScript SDK, following [PostHog's Astro guide](https://posthog.com/docs/libraries/astro).

Referral contract: `ref` is case-sensitive ASCII `[A-Za-z0-9_-]{1,64}`. Exactly one query parameter is required; duplicate, empty, or malformed values fall back to an existing valid cookie. Values are unverified labels, never identities. The backend must adopt this same value grammar for `[ref: code]` markers before rollout.

The default policy is explicit opt-in, pending production privacy/legal review:

- Before consent or after declining, no referral cookie or SDK is used. A usable URL referral still updates the current page's WhatsApp links.
- Allowing sets the host-only `milo_ref` cookie for 30 days, `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS. A new explicit referral replaces it and restarts expiry. Ordinary visits read it without renewing it; browser expiry removes attribution. Blocked cookies still allow current-page URL attribution.
- `milo_consent` remembers the choice for 180 days as a necessary preference cookie. There is no persistent preferences button; clearing site cookies in the browser resets the choice and shows the banner again. Declining deletes `milo_ref` and stops capture. Clearing cookies does not delete already-delivered events.
- The SDK uses an anonymous in-memory identity (not persisted across full page navigations), with no `identify`, person profiles, autocapture, automatic pageviews, session recording, surveys, or feature-flag requests. Counts of unique visitors are therefore not reliable across pages.
- Only `outreach_landing_viewed` and real-agent `whatsapp_cta_clicked` events are captured, with `landing_path`, optional `ref`, and click `cta_placement`. Query strings, fragments and referrers are stripped; no phone number or message text is sent. Events start only after consent; clicks before consent are not replayed.
- Every CTA appends `[ref: code]` to its original message and encodes the entire message. Analytics is best-effort and never delays navigation.

Modules: `WhatsAppCta.astro` renders shared anchors; `CookieConsent.astro` renders preferences; `OutreachTracking.astro` mounts the browser controller in `PageLayout.astro`. `src/lib/referral.ts`, `outreach.ts`, and `analytics.ts` separate protocol/cookies, orchestration, and SDK integration. No WhatsApp backend acquisition behavior is implemented here.

If deploying a CSP, allow the PostHog ingestion host in `connect-src` and SDK asset hosts in `script-src` as described in the linked guide (or configure a first-party proxy). Confirm consent wording, retention, project region and backend grammar before production.

## Content and design

- `src/content/ui.ts`: shared English interface and homepage copy.
- `src/content/segments.ts`: typed audience copy for all four segments and per-segment media paths.
- `src/components/LandingPage.astro`: shared full segment-page composition.
- `src/components/HomePage.astro`: minimal homepage reusing the existing hero styling.
- `src/components/PageLayout.astro`: English document, metadata, and footer.
- `src/pages/[segment].astro`: static segment routes.
- `src/components/whatsapp.ts`: recipient validation and encoded chat links.

English hero, preview, comparison, conversation, and closing CTA styling is preserved; unused RTL overrides are removed. `tests/validate-presentation.js` checks the English style baselines and unchanged scroll-animation script.

## Validation

`npm test` checks the four audience content records, media paths, recipient validation, unchanged core component CSS/animation, and all five English-only built pages including metadata and CTA messages.

Individual checks:

```sh
node --experimental-strip-types tests/validate-content.ts
node --experimental-strip-types tests/validate-whatsapp.ts
node --experimental-strip-types tests/validate-referral.ts
node tests/validate-presentation.js
npm run build
node --experimental-strip-types tests/validate-build.js
```

To test a configured deployment origin and recipient, supply the same environment variables to the build and build validator (or to `npm test`). Any number used in tests is only test input, never a provisioned agent.

### Browser validation

Run with the background dev server active and Playwright's requested browser installed (`playwright-cli install-browser chromium`). If using an existing browser executable instead, pass `--config=/path/to/your/local-config.json` to `open`; that config can set `browser.launchOptions.executablePath` without committing machine-specific paths.

```sh
playwright-cli -s=milo-desktop open http://localhost:4321/weddings/
playwright-cli -s=milo-desktop run-code --filename=tests/validate-desktop.js
playwright-cli -s=milo-mobile open --device='iPhone 15' http://localhost:4321/weddings/
playwright-cli -s=milo-mobile run-code --filename=tests/validate-mobile.js
playwright-cli -s=milo-desktop run-code --filename=tests/validate-scroll-conversation.js
playwright-cli -s=milo-desktop run-code --filename=tests/validate-segments-browser.js
```

For the outreach browser test, start a test server with `PUBLIC_POSTHOG_KEY=phc_test` and a test-only `PUBLIC_WHATSAPP_NUMBER`, then open it and run `playwright-cli -s=milo-desktop run-code --filename=tests/validate-outreach-browser.js`. This test mocks the SDK module, never delivers analytics or sends messages, and checks consent, referral replacement/expiry, event properties, scoped CTA styles, and storage/SDK failures. Use a fresh browser session afterward, since it deliberately simulates blocked cookies.

Checks cover desktop/mobile layouts, all five English pages, preview-tab switching, loaded images, keyboard focus, reduced motion, the eight-message scroll interaction, non-interactive previews, and CTA navigation. External WhatsApp navigation is intercepted: tests do not send messages or verify a live agent. Screenshots are saved in `.playwright-cli/`.

## Assets

Company-event, family-event, and friends-party previews each use four distinct, locally stored stock photographs from [Pexels](https://www.pexels.com/license/):

- Company events: a stage presentation, conference audience, networking, and a team toast.
- Family events: birthday cakes, a family celebration, children opening gifts, and candle blowing.
- Friends' parties: dancing, confetti, a group toast, and a beach party.

Source pages, download URLs, and the license link for all twelve photographs are recorded in `public/media/credits.json`. Photos are cropped/compressed to 960×640 JPEGs and served locally; no runtime request to Pexels is needed. These are illustrative stock-photo previews, not customer footage or Milo output, and do not imply endorsement by the people pictured. Wedding photos remain unchanged.

Wedding photos from Unsplash, downloaded for reliable local loading:

- https://images.unsplash.com/photo-1519741497674-611481863552
- https://images.unsplash.com/photo-1511285560929-80b456fea0bc
- https://images.unsplash.com/photo-1511795409834-ef04bbd61622
- https://images.unsplash.com/photo-1523438885200-e635ba2c371e

All clips and recaps are static illustrative thumbnails, not output from a connected AI editor. The play symbol is decorative; the website contains no video player. `public/chat-pattern.svg` is the original chat wallpaper.

DM Sans is self-hosted under the SIL Open Font License; see `public/fonts/OFL.txt`.
