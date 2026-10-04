# Proposal

## Why

The current landing page is wedding-focused despite serving several event audiences. Dedicated localized pages will make each audience's use case clear while retaining Milo's established design.

## What Changes

- Add full landing pages for weddings, company events, family events, and friends' parties in English, Hebrew, and German.
- Replace the English and Hebrew homepages with minimal localized entry points and add a German homepage, linking to the four segments and WhatsApp.
- Preserve the existing visual design, section structure, animations, and responsive behavior on segment pages; change only audience-specific content and relevant media.
- Add complete German localization and segment-preserving language navigation.
- Provide localized metadata, canonical URLs, and language alternates.
- Do not add a general segment page or redesign the site.

## Capabilities

### New Capabilities

- `localized-segment-landing-pages`: Four event-specific landing pages in three languages with minimal localized homepages and consistent existing design.

### Modified Capabilities

None. The existing marketing-prospecting capability concerns a separate research application.

## Impact

Changes are confined to `apps/landing-page/`: Astro routes/configuration, translation/content data, existing landing components, media references, and validation scripts. No backend behavior, new paid services, or WhatsApp recipient configuration changes are required.
