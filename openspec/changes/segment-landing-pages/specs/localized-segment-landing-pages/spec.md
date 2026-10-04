# Spec Delta

## Purpose

Provide audience-specific Milo landing pages in English, Hebrew, and German, with minimal homepages for choosing an event type while maintaining the established visual identity.

## ADDED Requirements

### Requirement: Localized segment routes
The site SHALL provide weddings, company-events, family-events, and friends-parties pages in English at `/<segment>/`, Hebrew at `/he/<segment>/`, and German at `/de/<segment>/`. It SHALL NOT provide a general segment page.

#### Scenario: Visit each segment
- **WHEN** a visitor opens any of the twelve segment URLs
- **THEN** the corresponding audience-specific landing page is available in the URL's language

### Requirement: Minimal localized homepages
The site SHALL provide minimal homepages at `/`, `/he/`, and `/de/` containing branding, a short product headline, links to all four segments in the current language, a WhatsApp CTA, language navigation, and a footer. Homepages SHALL omit the comparison and scrolling conversation sections.

#### Scenario: Choose an event type
- **WHEN** a visitor selects a segment on a localized homepage
- **THEN** the visitor reaches that segment in the same language

### Requirement: Preserve existing visual identity
Segment pages SHALL retain the current hero and WhatsApp preview, editor comparison, scrolling conversation, closing CTA, and footer in the existing order. Colors, typography, component styling, spacing, animations, and responsive behavior SHALL remain unchanged except for content-driven wrapping. Minimal homepages SHALL reuse the established visual treatment rather than introduce a redesign.

#### Scenario: Render a segment page
- **WHEN** any segment page is rendered on desktop or mobile
- **THEN** it uses the existing section structure and visual treatment, including the existing reduced-motion behavior

### Requirement: Complete audience-specific localized content
Each segment SHALL have localized titles, descriptions, headlines, example messages, deliverable names, captions, accessible labels, closing content, and WhatsApp prefills matching its audience. All visible interface copy SHALL be available in all three languages, with Hebrew RTL and English/German LTR. Media SHALL be relevant to the audience or clearly labeled illustrative placeholders and SHALL NOT misrepresent wedding images as other event types.

#### Scenario: Company event in German
- **WHEN** a visitor opens `/de/company-events/`
- **THEN** the copy and example deliverables are German and company-event-specific, and the WhatsApp CTA prefill references that use case

#### Scenario: Hebrew family event
- **WHEN** a visitor opens `/he/family-events/`
- **THEN** the page displays complete Hebrew family-event content with RTL layout and localized accessible labels

### Requirement: Page-preserving language navigation
Language selectors SHALL link to the equivalent current page in the selected language, not always to the homepage. Brand links SHALL return to the current language's homepage. Language choices SHALL identify languages without requiring a country-language equivalence.

#### Scenario: Switch languages on a segment
- **WHEN** a visitor switches from English weddings to German
- **THEN** the visitor reaches `/de/weddings/`

### Requirement: Localized metadata and valid WhatsApp links
Every page SHALL provide a localized title and description, canonical URL, and alternates for all three language versions. WhatsApp CTAs SHALL continue to use the configured public recipient number and validated international-number format without inventing a recipient; hero and closing CTAs on a segment SHALL use the same localized prefill.

#### Scenario: Inspect links and metadata
- **WHEN** a localized segment page is built
- **THEN** its metadata identifies that language and audience, language alternates identify equivalent pages, and both WhatsApp CTAs use the configured recipient and the same audience-specific prefill
