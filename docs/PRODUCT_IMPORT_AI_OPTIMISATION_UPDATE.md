# Product Import AI Optimisation Update

This update improves the batch and single product importer so merchant-selected batch defaults, SEO format, flavour/nutrition extraction and supplement label media are handled automatically before review.

## Main changes

- Batch defaults now behave as locked merchant choices where provided: vendor, product type, Shopify category, theme template, SEO/product format, SEO/location, collections and suggested tags are reapplied after supplier extraction and AI enrichment.
- Added batch default fields for SEO/product format and SEO/location.
- SEO title, SEO description and URL handles now follow the merchant pattern: vendor + product name + product format + location.
- Product import AI receives more page context and candidate image URLs, so it can extract visible flavour, servings, caffeine, calories, sugar and formula details from product images as well as text.
- Added formula version extraction for G FUEL style formula signals such as EN2.0 / 2.0 Formula / New & Improved Energy Formula.
- Added image role classification. Supplement facts / ingredients label images are excluded from the main Shopify media roster and moved into an Ingredients Label metafield plan.
- The review editor now has a dedicated Ingredients / supplement label image area, with controls to move an image between product media and label media.
- Single URL/manual imports now use the same enrichment path as the batch importer, so the improved AI/profile/metafield logic is not limited to batches.

## Files changed

- `public/modules/product-creation-import/index.html`
- `public/modules/product-creation-import/product-import-batch.js`
- `public/modules/product-creation-import/product-import-batch.css`
- `src/modules/product-creation-import/productCreationImport.service.js`
- `src/modules/product-creation-import/productImportBatch.model.js`
- `src/modules/product-creation-import/extractors/urlProductExtractor.js`
- `src/modules/product-creation-import/services/productImportBatch.service.js`
- `src/modules/product-creation-import/services/productImportSettings.service.js`
- `src/modules/product-creation-import/services/productEnrichment.service.js`
- `src/modules/product-creation-import/services/nutritionProfileExtractor.service.js`
- `src/modules/product-creation-import/services/imageCandidateScoring.service.js`
- `src/modules/product-creation-import/services/metafieldSchemaRegistry.service.js`
- `src/modules/product-creation-import/services/normaliseProduct.service.js`
- `src/modules/product-creation-import/services/productMediaClassifier.service.js`

## Environment

The image role and nutrition/profile visual extraction use the existing `OPENAI_API_KEY`. Optional model overrides:

- `OPENAI_PRODUCT_IMPORT_MODEL`
- `OPENAI_PRODUCT_IMPORT_VISION_MODEL`

If no OpenAI key is present, the importer still runs using heuristic text/image rules, but visual reading of label images will not be available.

## Verification

`npm run check` passed after dependency install.
