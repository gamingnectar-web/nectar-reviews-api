# ELEV8 Brand Directory URL Scrape + visibility fix

Fixes the current Brand Directory `Not found` state and adds a brand/collection URL scraper.

New workflow:
- Paste `https://x-zero.co.uk/collections/x-zero`
- ELEV8 discovers products from the supplier site.
- It classifies reusable core product lines separately (Energy, Hydration, Creatine, Shakers, Bundles, etc.).
- OpenAI refines the profile using supplier evidence only.
- The profile is saved as DRAFT in `product_brand_profiles`.
- The Brand Directory reads MongoDB and displays core lines.
- Existing manual/merchant product data is not changed.

API resilience:
- canonical: `/api/admin/product-creation-import/catalogue/brands`
- fallback: `/api/admin/product-creation-import/brands`

Install:
```bash
node scripts/install-elev8-brand-directory-fix.cjs
node scripts/elev8-brand-directory-fix-smoke.cjs
node --check src/modules/product-creation-import/catalogue-audit/brandScrape.service.js
node --check src/modules/product-creation-import/catalogue-audit/catalogueAudit.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/product-catalogue-audit.js
npm run deploy:preflight
```
