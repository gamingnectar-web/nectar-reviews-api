# ELEV8 Brand Directory live rework

Built against `clean-main` live code on 17 Sep 2026.

## Fixes

- Removes the conflicting legacy Brand Directory scripts that were competing for the same scrape button.
- Uses one correct `/admin/brand-directory-v3/*` frontend API path with `adminFetch`.
- Brand scrape now focuses on **Brand facts + product-line formats**, not SEO copy.
- Product lines become tabs inside each brand.
- Every product line has a readable recognition rule (`IF title contains Hydration`) and its own reusable actions.
- Brand Defaults is separate from product lines.
- Shopify metafield metadata is assessed and likely brand-level fields are surfaced.
- `About Brand` can be mapped once to the real Shopify metafield and applied to every product in that brand.
- Product-line rules feed the existing import pipeline through `brandRules.service.js`.
- Storefront brand backfill falls back to Shopify Admin products and isolates per-brand errors instead of failing the entire job.
- Adds a view-isolation guard so Review Manager cannot remain visible above Product Imports / Cart Rewards / other sections.

## Rule precedence

Merchant locked value > product-specific evidence > product-line rule > brand-wide rule > AI inference.

## Install

```bash
node scripts/install-elev8-brand-directory-live-rework.cjs
node scripts/elev8-brand-directory-live-rework-smoke.cjs
node --check src/modules/product-creation-import/catalogue-audit/brandScrape.service.js
node --check src/modules/product-creation-import/catalogue-audit/storefrontBrandBackfill.service.js
node --check src/modules/product-creation-import/services/brandRules.service.js
node --check public/brand-directory-workspace.js
node --check public/elev8-view-isolation.js
npm run deploy:preflight
```
