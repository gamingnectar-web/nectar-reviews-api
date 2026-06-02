# Product Import Site-Aligned Logic Update

This update tightens the product importer so it behaves like a merchant-assisted Shopify editor rather than a free-text AI generator.

## What changed

- Batch defaults now remain the source of truth for vendor, product type, category, template, SEO format/location, and selected collections.
- `url-import`, `product-import`, and `invoice-import` are stripped from actual product tags.
- Collections and suggested tags are filtered against existing Shopify site options where possible, rather than allowing AI to invent random names.
- Vendor, product type, category, template, collection, and tag fields now use Shopify-backed datalist options in the batch form and review editor.
- Image ordering now preserves the supplier page/gallery order instead of sorting product media by scoring alone.
- AI image classification is stricter for supplement/nutrition/ingredients label images and uses high-detail vision requests.
- Supplement label images are kept out of the main Shopify media roster and written to the Ingredients Label metafield plan.
- SEO is rewritten deterministically into the merchant pattern: `vendor - product name - product format - location`; handles are generated from the same pattern.
- SEO meta descriptions are regenerated as complete sentences to avoid cut-off copy being approved.
- G FUEL flavour extraction now avoids using collector/collab names as flavours and recognises flavour phrases such as `Pomegranate Green Tea` and `Orange Creamsicle` from page text.
- Formula 2.0 / EN2.0 extraction remains mapped into the formula version metafield.
- The importer now asks Shopify for similar product commercial values and shows suggestions for price, compare-at price, weight, SKU and barcode where comparable data exists.
- Suggestions are shown as buttons in the review editor and are not applied silently.

## Key files changed

- `public/modules/product-creation-import/index.html`
- `public/modules/product-creation-import/product-import-batch.js`
- `public/modules/product-creation-import/product-import-batch.css`
- `src/modules/product-creation-import/extractors/urlProductExtractor.js`
- `src/modules/product-creation-import/productImportBatch.model.js`
- `src/modules/product-creation-import/services/imageCandidateScoring.service.js`
- `src/modules/product-creation-import/services/productMediaClassifier.service.js`
- `src/modules/product-creation-import/services/nutritionProfileExtractor.service.js`
- `src/modules/product-creation-import/services/metafieldSchemaRegistry.service.js`
- `src/modules/product-creation-import/services/productEnrichment.service.js`
- `src/modules/product-creation-import/services/productImportBatch.service.js`
- `src/modules/product-creation-import/services/shopifyProduct.service.js`

## Validation

`npm run check` passed after dependency installation.
