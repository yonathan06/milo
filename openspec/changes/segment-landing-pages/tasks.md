# Tasks

## 1. Locale and content model

- [x] 1.1 Add German locale/direction and complete shared translations; update locale/path unit tests and verify them with `node --experimental-strip-types tests/validate-i18n.ts` from `apps/landing-page`.
- [x] 1.2 Define typed content for the four segments in all three languages, including metadata, hero, conversation, closing text, and WhatsApp prefills; add completeness and audience-specific content assertions and verify all twelve records pass.
- [x] 1.3 Configure per-segment media with existing wedding assets and clearly labeled illustrative placeholders for other audiences; verify every referenced asset exists and document placeholder provenance/replacement in the landing-page README.

## 2. Shared presentation and navigation

- [x] 2.1 Make existing landing components consume resolved segment content and configurable media while preserving their style blocks, section order, markup treatment, and scroll scripts; verify component/build assertions cover audience-specific content and the existing eight-message interaction.
- [x] 2.2 Update selector and footer language links to preserve the locale-neutral current page and use language labels; verify unit/build tests cover every segment across all three target languages and localized brand-home links.
- [x] 2.3 Add minimal localized homepage content using existing branding, headline, CTA, and link styling without preview/comparison/conversation sections; add homepage assertions verifying four localized segment links and no long landing sections.

## 3. Routes and metadata

- [x] 3.1 Generate the twelve static segment routes and three homepages with English unprefixed; update build validation to check the entire route matrix, correct language/direction, one main/h1/footer per page, and absence of a general route, then run `npm run build` and build validation.
- [x] 3.2 Add localized title/description, canonical URLs, and three equivalent-page language alternates; document the production origin setting and verify all metadata against a configured test origin.
- [x] 3.3 Preserve WhatsApp recipient validation and use the audience-specific localized prefill consistently across CTAs; add assertions for encoded messages, equal hero/closing destinations, and invalid recipient rejection.
- [x] 3.4 Update the landing-page README with available routes, content organization, and runnable validation commands; verify documented commands match the actual scripts.

## 4. Integrated verification

- [x] 4.1 Run all localization/content and build checks and verify all fifteen generated pages pass without missing translations, links, or media.
- [x] 4.2 Update existing browser validation routes and run desktop/mobile checks on representative segment pages in all three languages plus each minimal homepage; verify unchanged visual treatment, German wrapping, Hebrew RTL, accessible language switching, scroll interaction, and reduced-motion behavior, recording any unavailable browser tooling explicitly.

## 5. Audience photography follow-up

- [x] 5.1 Source and download four distinct event-appropriate photographs each for company events, family events, and friends' parties; document source/license links and visually inspect the photos before wiring them into previews.
- [x] 5.2 Replace illustration references with local photographs in all preview locations and update image descriptions in English, Hebrew, and German; keep wedding assets, CSS, and animations unchanged and verify content/media and presentation tests pass.
- [x] 5.3 Update media validation to require distinct photographs and run the full build/test suite plus desktop/mobile browser checks across all localized pages; verify no broken images or layout regressions.
