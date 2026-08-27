# All Reviews SEO Page — refinement

Fixes:
- Full-bleed desktop layout inside Shopify theme page-width wrappers.
- Mobile returns to normal contained width.
- Typography inherits Gaming Nectar theme body/heading font variables.
- Older reviews with only product IDs are enriched server-side from Shopify.
- Resolved title, handle, URL and featured image are persisted back to the Review record.
- Raw numeric Shopify IDs are never shown as product names.
- Product images are preferred over placeholder initials.
- Numeric product IDs are excluded from Popular searches.

## Install in Codespaces
node scripts/install-all-reviews-refinement.js
node scripts/patch-all-reviews-renderer.js
node scripts/all-reviews-refinement-smoke-test.js
npm run deploy:preflight

## Shopify deploy
The extension changes still require `shopify app deploy` from the correct local Shopify app project.
