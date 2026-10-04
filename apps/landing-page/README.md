# Milo landing pages

Astro static marketing pages for Milo, an AI video editor on WhatsApp. Four event segments in English, Hebrew, and German reuse the same existing design and scroll conversation. Minimal localized homepages link to the segments. No general segment page, UI framework, or external runtime assets.

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

| Page | English | Hebrew | German |
| --- | --- | --- | --- |
| Homepage | `/` | `/he/` | `/de/` |
| Weddings | `/weddings/` | `/he/weddings/` | `/de/weddings/` |
| Company events | `/company-events/` | `/he/company-events/` | `/de/company-events/` |
| Family events | `/family-events/` | `/he/family-events/` | `/de/family-events/` |
| Friends' parties | `/friends-parties/` | `/he/friends-parties/` | `/de/friends-parties/` |

Language switches keep the current segment. Brand links return to the current language's homepage. Hebrew uses RTL; English and German use LTR.

## Deployment and WhatsApp

Copy `.env.example` to `.env` and set `PUBLIC_WHATSAPP_NUMBER` to the agent's WhatsApp number, including country code. Rebuild after changing it; this is a static site.

Without a number, the CTA opens WhatsApp's generic message composer, **not an agent conversation**. No backend or WhatsApp account is provisioned by these pages. Each segment has its own localized message; hero and closing CTAs use the same destination.

Export `SITE_URL` with the actual deployed origin when building so canonical and language-alternate URLs are correct. This config reads the shell environment, not `.env`, for `SITE_URL`. Without it, URLs use `http://localhost:4321` for local development. For example, replace the example origin before deploying:

```sh
SITE_URL=https://your-actual-domain.example npm run build
```

## Content and design

- `src/i18n/ui.ts`: shared interface translations and homepage copy.
- `src/i18n/segments.ts`: typed audience copy for all twelve locale/segment combinations and per-segment media paths.
- `src/i18n/utils.ts`: language detection and locale-neutral/translated paths.
- `src/components/LandingPage.astro`: shared full segment-page composition.
- `src/components/HomePage.astro`: minimal homepage reusing the existing hero styling.
- `src/components/PageLayout.astro`: document, metadata, language selector, and footer.
- `src/pages/[segment].astro` and `src/pages/[locale]/[segment].astro`: static segment route matrix.
- `src/components/whatsapp.ts`: recipient validation and encoded chat links.

All pre-existing component style blocks and the scroll-animation script remain unchanged; `tests/validate-presentation.js` checks their original hashes. Homepage-only layout rules reduce the hero to one column without changing segment styles.

## Validation

`npm test` checks translation completeness, the twelve audience content records, media paths, language navigation, recipient validation, unchanged component CSS/animation, and all fifteen built pages including metadata and CTA messages.

Individual checks:

```sh
node --experimental-strip-types tests/validate-i18n.ts
node --experimental-strip-types tests/validate-content.ts
node --experimental-strip-types tests/validate-whatsapp.ts
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
playwright-cli -s=milo-desktop run-code --filename=tests/validate-i18n-browser.js
playwright-cli -s=milo-desktop run-code --filename=tests/validate-scroll-conversation.js
playwright-cli -s=milo-desktop run-code --filename=tests/validate-segments-browser.js
```

Checks cover desktop/mobile layouts, Hebrew RTL, German wrapping, all localized homepages and segments, language switching, loaded images, keyboard focus, reduced motion, the eight-message scroll interaction, non-interactive previews, and CTA navigation. External WhatsApp navigation is intercepted: tests do not send messages or verify a live agent. Screenshots are saved in `.playwright-cli/`.

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
