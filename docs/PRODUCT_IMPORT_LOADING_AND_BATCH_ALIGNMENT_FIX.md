# Product import loading and batch alignment fix

## What changed

- Batch scanning now processes rows one at a time from the UI so the merchant can see which row is being refreshed.
- Batch rows pulse left-to-right while they are actively being scanned and get a completed marker once refreshed.
- Solo URL import now shows a loading strip and image placeholders while the product page is being scanned.
- Solo and batch image handling now preserves supplier/gallery order by carrying `originalIndex` through extraction, normalisation, scoring and selection.
- Core Product Flavour and Flavour Family are now included in the fallback metafield definitions, so solo imports surface the flavour fields even if Shopify definitions are not returned.
- Commercial suggestions from similar Shopify products now render as amber review prompts with green accept and red reject controls. They are not applied silently.
- SEO product-name cleanup now avoids repeated format terms such as `Collector Box - Collector Box` in titles/handles.
- Batch SEO/handle/image ordering now follows the same gallery/order approach used by the solo URL importer.

## Files changed

- `public/product-creation-import.js`
- `public/product-creation-import.css`
- `public/admin.html`
- `public/modules/product-creation-import/product-import-batch.js`
- `public/modules/product-creation-import/product-import-batch.css`
- `src/modules/product-creation-import/extractors/urlProductExtractor.js`
- `src/modules/product-creation-import/services/normaliseProduct.service.js`
- `src/modules/product-creation-import/services/productEnrichment.service.js`
- `src/modules/product-creation-import/services/productImportBatch.service.js`
- `src/modules/product-creation-import/services/shopifyProduct.service.js`

## Verification

Ran `npm ci --ignore-scripts` and `npm run check` successfully.
