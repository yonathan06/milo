# Design

## Context

See proposal.md for motivation. The Astro app currently has English and Hebrew index routes rendering `LandingPage.astro`. The page composes existing styled components; `ui.ts` contains shared and wedding-specific translations. `ScrollConversation.astro` and `WhatsAppPreview.astro` hardcode wedding media. Language links in both the selector and footer target homepages. Existing build tests assume full landing sections on the index routes.

This design applies because routing, localization, and several components must share a new content model.

## Goals / Non-Goals

**Goals:** Keep presentation components stable while making content selectable by locale and segment; statically build the complete route matrix; make incomplete translations detectable in tests.

**Non-Goals:** A design refresh, a CMS, backend changes, a general segment page, new product promises, or replacing the scroll animation.

## Decisions

### Shared content model instead of duplicated templates
Define the four supported segment slugs and typed content records indexed by locale and segment. Separate shared interface translations from audience-specific hero, comparison, conversation, closing, metadata, and WhatsApp content. Require complete records for all three locales instead of relying on silent English fallback for new pages. Pass resolved copy and media into the existing components, preserving their markup, styles, and scripts. Duplicating twelve templates would make visual drift likely.

### Static route matrix following current locale conventions
Keep English unprefixed and add German to Astro's existing locale configuration. Use static generated segment routes with explicit supported segment parameters; localized home routes render a minimal entry component. Centralize locale-neutral page-path extraction so language links retain the segment without double prefixes. Unknown segments remain unavailable rather than silently rendering a default.

### Minimal homepage using existing presentation
Reuse the current hero branding, headline typography, CTA treatment, selector, and footer. Omit the preview and long sections on the minimal homepage and provide four plain segment links using existing link styling. Restrict any layout adjustments to supporting this reduced content, not redesigning segment pages.

### Explicit media selection
Keep current wedding assets for weddings only. Allow per-segment asset paths and descriptions in the content model. For other audiences, use clearly labeled illustrative placeholders if suitable licensed images are unavailable, retaining existing media dimensions and framing. Do not add remote asset dependencies or invent provenance.

### Metadata and WhatsApp remain shared infrastructure
Resolve canonical and alternate paths from the route matrix with a configurable production site origin; use a documented local origin for development when production origin is unavailable. Retain current recipient validation and encode the selected localized prefill once for all CTAs. Do not supply a fabricated recipient.

## Risks / Trade-offs

- [German copy expands within fixed layouts] → Use concise natural translations and verify wrapping at existing breakpoints without changing the design.
- [Incomplete Hebrew/German data could fall back silently] → Assert complete key coverage for both shared and segment-specific copy.
- [Only wedding photography exists] → Label other segment media as illustrative placeholders until licensed replacements are available.
- [Existing tests assume the old homepage] → Move full-page assertions to segment routes and add separate minimal-homepage checks.
- [Actual production origin is not recorded in the current configuration] → Document a deployment origin setting and validate canonical/alternate construction with a test origin.

## Migration Plan

Build and test all fifteen pages before deployment. Existing `/` and `/he/` URLs stay valid but become minimal entry points; wedding content moves to localized weddings URLs. Deploy the static build through the existing process. Rollback restores the previous source/build and locale configuration; no data migration is needed.
