# QA report — Product Creation & Import batch update

Checked on: 2026-06-01

## Result

This package is a complete replacement for the Product Creation & Import module files it touches, plus new batch-import files. It is **not** a full repository/codespace replacement. Do not delete the rest of the repo and upload only this folder, because the wider app still needs `server.js`, `src/app.js`, config, existing models, existing importer services, Shopify utilities, package files and public admin assets.

## Checks run

- Unzipped package successfully.
- Confirmed expected files are present.
- Ran `node --check` against every JavaScript file in `src` and `public` included in this package.
- Reviewed route imports and service exports.
- Confirmed legacy routes remain present in the replacement `productCreationImport.routes.js`.

## Included capabilities

- Batch model for unlimited product URL/manual item rows.
- Shared batch defaults: supplier, vendor, product type, category, template, collections, tags and currency.
- Batch create, list, get, add items, scan/enrich, edit item, approve item and create Shopify draft endpoints.
- Product image scoring and selected/rejected image grouping.
- Nutrition/flavour/profile extraction with OpenAI enrichment and non-AI heuristic fallback.
- Standardised metafield mapping for flavour, sweetness, sourness, servings, calories, caffeine, sugar, carbs, sodium, dietary labels and warnings.
- Standalone batch UI under `public/modules/product-creation-import/`.

## Notes

- The UI can accept any number of links. Very large batches should be scanned in chunks from the backend/API to avoid request timeouts. The UI currently sends `processAll: true` for convenience.
- Products are still created as Shopify draft products only.
- Existing invoice checker, URL scanner, purchase-order helper, product search and manual draft routes are preserved in the replacement routes file.

## Install method

Copy the included folders/files into the existing repo root, overwriting matching files. Then run:

```bash
npm run check
npm start
```

Recommended manual smoke test:

1. Open `/api/admin/product-creation-import/health` with a valid shop session.
2. Open `/modules/product-creation-import/index.html?shop=YOUR-SHOP.myshopify.com`.
3. Create a small batch with 2-3 product links.
4. Click Scan / enrich batch.
5. Review selected/rejected images and metafields.
6. Approve one row.
7. Create Shopify drafts.
