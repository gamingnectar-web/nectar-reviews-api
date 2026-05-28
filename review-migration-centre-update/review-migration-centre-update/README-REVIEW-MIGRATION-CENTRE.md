# Nectar Review Migration Centre update

This package adds a robust migration foundation for moving reviews from Yotpo, Shop/Shop-channel exports, Judge.me, Weebly/Square, or generic CSV files into Nectar Reviews.

It is designed around a safe source-of-truth model:

- MongoDB stores migration batches, staged rows, scans and imported reviews.
- CSV rows are staged before import.
- Product reviews and site/shop reviews are separated.
- Product mapping is attempted automatically using Shopify product IDs, handles, titles and SKUs.
- Duplicates are detected by source review ID and fallback review hash.
- Storefront scanning detects external review signals, but does not pretend to access private Shop app review data.

## Files added

```text
src/routes/reviewMigrations.js
src/models/reviewMigrationModels.js
src/services/reviewMigrationService.js
public/admin-review-migrations.js
```

## Files patched by the install script

```text
src/app.js
src/models/index.js
src/routes/public.js
public/admin.html
```

## Install

From the repo root:

```bash
unzip review-migration-centre-update.zip -d review-migration-centre-update
bash review-migration-centre-update/scripts/apply-review-migration-centre.sh .
```

Then check:

```bash
git diff
npm run check
```

If your repo does not have `npm run check` available, run:

```bash
node --check src/app.js
node --check src/models/index.js
node --check src/routes/public.js
node --check src/routes/reviewMigrations.js
node --check src/models/reviewMigrationModels.js
node --check src/services/reviewMigrationService.js
node --check public/admin-review-migrations.js
```

## Deploy

```bash
git add src/app.js src/models/index.js src/routes/public.js src/routes/reviewMigrations.js src/models/reviewMigrationModels.js src/services/reviewMigrationService.js public/admin.html public/admin-review-migrations.js
git commit -m "Add robust review migration centre"
git push
```

## New admin endpoints

All routes require the existing admin session protection.

```text
GET    /api/admin/review-migrations/overview
GET    /api/admin/review-migrations/settings
PATCH  /api/admin/review-migrations/settings
POST   /api/admin/review-migrations/csv/preview
GET    /api/admin/review-migrations/batches
GET    /api/admin/review-migrations/batches/:batchId
PATCH  /api/admin/review-migrations/staged/:rowId
POST   /api/admin/review-migrations/batches/:batchId/import
POST   /api/admin/review-migrations/scan/storefront
GET    /api/admin/review-migrations/scans
GET    /api/admin/review-migrations/scans/:scanId
GET    /api/admin/review-migrations/shop-review-sync/status
```

## New public endpoint

```text
GET /api/site-reviews?shopDomain=example.myshopify.com
```

This returns accepted, non-test, non-deleted site/shop-level reviews. Product-specific reviews continue to use the existing product review endpoints.

## Important Shop review note

The storefront scan is for ongoing discovery:

- Is Yotpo still present?
- Are Shop-like review snippets/widgets present?
- Are JSON-LD review or aggregateRating blocks present?
- Are there products that appear to have reviews outside Nectar?

It should not be treated as a guaranteed Shop review importer. Where possible, import from CSV/API/export. Longer term, Nectar should syndicate its reviews to Shopify's standard product review metaobjects when eligible, so Shop can consume Nectar reviews rather than Nectar trying to scrape Shop.

## Suggested Yotpo migration flow

1. Keep Yotpo live and Nectar widgets/schema off.
2. Export published Yotpo reviews as CSV.
3. Upload the CSV in Migration Centre.
4. Preview matched, site-level, skipped and duplicate rows.
5. Import matched + site reviews.
6. Fix manual mappings for unmatched product reviews.
7. Preview Nectar widgets on a duplicate theme.
8. Disable Yotpo widgets/schema/emails.
9. Enable Nectar widgets/schema/emails.
10. Keep Yotpo installed briefly as fallback, then remove it.
