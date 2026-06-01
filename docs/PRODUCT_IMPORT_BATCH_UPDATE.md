# Nectar product importer batch update

This update adds a batch workspace to the existing `product-creation-import` module without removing the current URL scan, invoice checker, PO draft, manual draft, or single product creation flows.

## What this adds

- Unlimited-size batch records using `product_import_batches`.
- Shared batch defaults for supplier/brand/vendor/product type/category/template/collections/tags.
- Any number of product links can be pasted into a batch.
- Chunk-safe scan endpoint so very large batches can be processed in batches or all at once.
- AI-backed product profile and nutrition extraction when `OPENAI_API_KEY` is set.
- Heuristic fallback when AI is not available.
- Product image scoring with selected, possible and rejected image groups.
- Standardised flavour/nutrition metafield mapping for collection filtering.
- Approval-first Shopify creation. Only approved rows are created, and Shopify products are still created as drafts.
- Standalone admin UI at `/modules/product-creation-import/index.html?shop=your-shop.myshopify.com`.

## Files included

```txt
src/modules/product-creation-import/productCreationImport.routes.js
src/modules/product-creation-import/productImportBatch.model.js
src/modules/product-creation-import/services/productImportBatch.service.js
src/modules/product-creation-import/services/imageCandidateScoring.service.js
src/modules/product-creation-import/services/nutritionProfileExtractor.service.js
src/modules/product-creation-import/services/metafieldSchemaRegistry.service.js
public/modules/product-creation-import/index.html
public/modules/product-creation-import/product-import-batch.css
public/modules/product-creation-import/product-import-batch.js
```

## Install

Copy the folders in this zip into the repo root, preserving paths.

Then run:

```bash
npm run check
```

Start the app and open:

```txt
/admin?shop=your-shop.myshopify.com
```

Then open the standalone batch UI:

```txt
/modules/product-creation-import/index.html?shop=your-shop.myshopify.com
```

## Optional admin sidebar link

Add this button in `public/admin.html` under the Products nav group if you want it visible in the main app shell:

```html
<button class="tab-btn product-tab-btn" data-product-key="product-creation-import" onclick="window.location.href='/modules/product-creation-import/index.html' + window.location.search">
  <span>Product Importer <span id="nav-status-product-creation-import" class="tab-status-dot warning"></span></span><span class="pill">Beta</span>
</button>
```

## API examples

Create a batch:

```bash
curl -X POST "$APP_URL/api/admin/product-creation-import/batches" \
  -H "Content-Type: application/json" \
  -H "x-shop-domain: your-shop.myshopify.com" \
  -d '{
    "name":"G FUEL May batch",
    "defaults": { "vendor":"G FUEL", "productType":"Energy Tub", "themeTemplate":"gfuel", "collections":["gfuel"] },
    "links":"https://example.com/products/a\nhttps://example.com/products/b"
  }'
```

Scan all queued rows:

```bash
curl -X POST "$APP_URL/api/admin/product-creation-import/batches/$BATCH_ID/scan" \
  -H "Content-Type: application/json" \
  -H "x-shop-domain: your-shop.myshopify.com" \
  -d '{"processAll":true,"useAi":true}'
```

Approve a row:

```bash
curl -X POST "$APP_URL/api/admin/product-creation-import/batches/$BATCH_ID/items/$ITEM_ID/approval" \
  -H "Content-Type: application/json" \
  -H "x-shop-domain: your-shop.myshopify.com" \
  -d '{"approvalStatus":"approved"}'
```

Create Shopify draft products for approved rows:

```bash
curl -X POST "$APP_URL/api/admin/product-creation-import/batches/$BATCH_ID/create-shopify-drafts" \
  -H "Content-Type: application/json" \
  -H "x-shop-domain: your-shop.myshopify.com" \
  -d '{"approvedOnly":true}'
```

## Notes

- The batch accepts however many links are posted. For very large batches, call `/scan` repeatedly with a lower `limit` instead of `processAll: true` to avoid request timeouts.
- Shopify creation remains draft-only because it reuses the existing `createShopifyProductFromDraft` service.
- AI enrichment is conservative. Nutrition values are marked review-needed when inferred rather than explicitly extracted.
