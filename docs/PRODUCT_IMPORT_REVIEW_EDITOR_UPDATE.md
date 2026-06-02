# Product Import Review Editor Update

This update replaces the cramped product-import review output screen with a full-width Shopify-style review editor.

## Updated files

- `public/modules/product-creation-import/product-import-batch.js`
- `public/modules/product-creation-import/product-import-batch.css`
- `src/modules/product-creation-import/services/productImportBatch.service.js`

## What changed

- The product review modal is now a full-width editor with visible override inputs.
- Product basics, description, media, pricing, SEO, metafields, and validation are split into clear sections.
- Description/body HTML is visible and editable.
- SEO title, SEO description, URL handle, and a search preview are visible.
- SEO descriptions that look truncated are flagged before approval.
- Metafields are displayed as editable cards instead of raw JSON.
- Rich text / multi-line metafields use larger text areas.
- Selected images can be reordered, removed, and moved from rejected/possible into selected.
- Pricing, SKU, barcode, quantity, weight, and cost fields are now visible in the review flow.
- Raw AI/developer JSON is still available, but folded into a debug details panel.
- “Approve ready rows” now approves only fully ready rows, not warning rows.
- Backend validation now distinguishes blockers from warnings.
- Manual metafield overrides are persisted back into the batch item and draft payload.

## Validation notes

A product is blocked when core creation fields like title, image, vendor, or product type are missing.

A product receives warnings when fields like description, Shopify category, price, handle, SEO, metafields, or caffeine need manual review.

Warnings do not stop a manual approval, but they stop bulk “approve ready rows” from silently approving products that need a human check.
