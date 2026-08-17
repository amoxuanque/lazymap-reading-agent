# Unified Product Design QA

## Scope

- Visual target: selected warm wabi-sabi personal reading dashboard.
- User flow: home -> search -> generation -> reading map, plus shelf and profile.
- Desktop viewport: 1280 px.
- Mobile viewport: 390 x 844 px.
- Product logic boundary: catalog/upload generation and backend rules unchanged.

## Audit Before Implementation

1. Shelf: healthy visual target; warm paper, brown typography, terracotta emphasis.
2. Home: inconsistent; dark background and blue/black generated covers broke continuity.
3. Search: inconsistent; dark search panel and large saturated fallback cover dominated the result.
4. Generation: inconsistent; dark cards and controls no longer resembled the entry experience.
5. Profile: inconsistent; dark account panels looked like a separate product.
6. Map detail: inconsistent; dark poster, cards, sticky navigation, and long-form sections broke the warm reading atmosphere.

## Implementation Review

- Shared warm theme tokens now control paper background, surfaces, text hierarchy, borders, accent color, focus state, and reduced motion.
- Navbar, desktop footer, mobile tab bar, buttons, inputs, generic covers, and book cards use the same visual language.
- Home, search, generation, profile, shelf, and map detail reflow without horizontal overflow.
- Generic generated covers and reading-map posters use the real paper texture asset instead of saturated dark gradients.
- Existing catalog/upload copy and `sourceMeta.productType` behavior remain intact.

## Interaction Verification

1. Home search: passed; `Siddhartha` navigates to `?q=Siddhartha`.
2. Search result action: passed; the result card opens Generation Center with book context.
3. Upload selection: passed; `upload-sample.txt` shows the selected state and `生成深度阅读地图` CTA.
4. Detail navigation: passed; `方法地图` scrolls to the correct section.
5. Detail module selection: passed; selected part state updates visibly.
6. Console: passed; no browser errors during the tested flow.

## Visual Evidence

- Before contact sheet: `tmp/design-audit-before/contact-sheet.png`
- Desktop after contact sheet: `tmp/design-qa-unified/contact-sheet-v2.png`
- Mobile after contact sheet: `tmp/design-qa-unified/mobile-contact-sheet.png`
- Source comparison: `tmp/design-qa-unified/reference-vs-unified-routes.png`

## Remaining Notes

- Production build retains the existing bundle-size warning for the main JavaScript chunk.
- Screenshot review covers visible contrast and responsive reflow, but is not a full WCAG conformance audit.

final result: passed
