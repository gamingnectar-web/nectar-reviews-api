# ELEV8 navigation + Brand Directory live fix

This consolidates four issues visible in the live admin:

1. Brand Directory says `Not found` even though MongoDB contains brand profiles.
2. Brand URL scraping cannot start because the live route returns 404.
3. Generating other brands depends on Shopify Admin API availability.
4. The ELEV8 dashboard Product Imports tile can open the wrong module and the left sidebar is cluttered with unrelated global navigation.

## Brand Directory

A direct route is mounted at:

`/api/admin/brand-directory-v2`

It reads the existing `product_brand_profiles` collection directly, with a safe single-shop fallback when the embedded shop parameter is absent.

It also supports:

- `GET /brands`
- `POST /brands/scrape-job`
- `GET /brands/scrape-job/:jobId`
- `POST /generate-from-storefront`

The storefront backfill scans public `gamingnectar.com/products.json`, groups products by vendor, infers product lines, and creates missing draft brand profiles without relying on Shopify Admin API availability.

## Navigation

The ELEV8 home dashboard now uses exact sidebar destinations rather than fuzzy text matching. `Product Imports` targets `Product Creation & Import` explicitly.

On ELEV8 home the sidebar collapses to the ELEV8 logo only. Inside a module, the global `PRODUCTS` and `DEVELOPERS` groups are hidden, leaving the contextual `MANAGE` and `CONFIGURATION` controls. Clicking the ELEV8 logo returns to the home options.

## Install

```bash
node scripts/install-elev8-nav-brand-live-fix.cjs
node scripts/elev8-nav-brand-live-fix-smoke.cjs
node --check src/routes/brandDirectoryDirect.js
node --check src/modules/product-creation-import/catalogue-audit/storefrontBrandBackfill.service.js
node --check public/elev8-context-nav.js
node --check public/brand-directory-live-fix.js
npm run deploy:preflight
```
