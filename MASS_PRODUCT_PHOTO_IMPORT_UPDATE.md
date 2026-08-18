# Mass Product Photo Import Update

This update builds on the latest `clean-main` Product Creation & Import workspace.

## What changed

- Added a Mass import from photo panel inside the batch importer.
- Merchants can upload product photos/screenshots showing product image + title.
- Merchants provide the brand/vendor and source website before AI extraction.
- Product-photo AI extraction now queues draft batch rows rather than creating live products.
- G FUEL rows force a V1 / V2 / Hydration check when the formula is unclear.
- AdvancedGG rows force ENERGY / FOCUS / HYDRATION / SLEEP when the product line is unclear.
- Z-Zero rows force ENERGY / HYDRATION when the product line is unclear.
- Required brand checks appear inside the product review modal and block readiness until saved.
- Photo imports show a source search link so the merchant can verify the exact supplier/product URL before draft creation.
- The import still creates Shopify products as drafts only.

## Important behaviour

Photo uploads are used to identify and queue products. They are not treated as final Shopify-hosted product media unless the merchant provides a verified product/source URL or selected image URL. This avoids silently creating products with unverifiable media.

## Files changed

- `src/modules/product-creation-import/extractors/photoProductExtractor.js`
- `src/modules/product-creation-import/productCreationImport.routes.js`
- `src/modules/product-creation-import/productImportBatch.model.js`
- `src/modules/product-creation-import/services/productImportBatch.service.js`
- `src/modules/product-creation-import/services/metafieldSchemaRegistry.service.js`
- `public/modules/product-creation-import/index.html`
- `public/modules/product-creation-import/product-import-batch.js`
- `public/modules/product-creation-import/product-import-batch.css`

## Preflight

Ran successfully:

```bash
npm run deploy:preflight
```

Output included:

```text
Relative require verification passed.
```
