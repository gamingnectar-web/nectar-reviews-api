# All Reviews SEO Page — v4 hotfix

This update fixes the issues visible on the live `/pages/reviews` page.

## Fixes

- Corrects the v3 JavaScript RegExp bug that failed to recognise numeric Shopify product IDs.
- Raw Shopify IDs are never exposed as customer-facing product names.
- Numeric IDs are removed from Popular searches.
- Existing product images are preferred over the fallback initial tile.
- Shopify product enrichment now uses REST first and Admin GraphQL as a fallback.
- Successfully recovered title, handle, URL and product image continue to be persisted into MongoDB by the existing enrichment flow.
- Desktop app-block breakout uses a stronger full-viewport implementation.
- Mobile stays normally contained.

## Codespaces

```bash
node scripts/install-all-reviews-v4-hotfix.js
node scripts/all-reviews-v4-hotfix-smoke-test.js
npm run deploy:preflight
```

Then commit and push `clean-main`.

## Shopify

The following extension assets must be present locally before `shopify app deploy`:

- `blocks/all_reviews_seo_page.liquid`
- `assets/nectar-all-reviews-page.js`
- `assets/nectar-all-reviews-page-hotfix.css`
- existing `assets/nectar-all-reviews-page.css`
- existing `assets/nectar-all-reviews-page-refinement.css`
