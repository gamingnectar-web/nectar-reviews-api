# PRODUCT CREATION & PRODUCT IMPORT module

This update adds a selectable left-menu product called **Product Creation & Import**.

## What changed

- Added `src/modules/product-creation-import` backend module.
- Mounted routes at `/api/admin/product-creation-import` behind the existing admin session middleware.
- Added `public/product-creation-import.js` and `public/product-creation-import.css`.
- Added a new admin view: `#v-product-creation-import`.
- Updated `public/admin-product-context.js` so the Products menu contains **Product Creation & Import** and the Manage menu swaps to URL Import, Invoice Import, Manual Create and History.
- Added `?product=product-creation-import` / `?module=product-creation-import` support so the app can open directly on this product instead of Reviews.
- Added `productCreationImport.enabled` to the shop module defaults.
- Updated default scopes to include `write_products`.
- Increased the default JSON body size to `5mb` so compressed invoice images can be posted as base64.

## Admin flow

1. Open the app.
2. In the left Products menu, select **Product Creation & Import**.
3. Choose one of:
   - URL Import: scan an external product page and create an editable Shopify draft.
   - Invoice Import: upload an invoice picture, extract line items, auto-match Shopify products, assign manually or create drafts.
   - Manual Create: create a product draft directly.
   - History: view recent imports.

## Direct loading

Use this URL shape to open directly into the module:

```txt
/admin?shop=your-store.myshopify.com&product=product-creation-import
```

## Requirements

- Shopify OAuth token or `SHOPIFY_ACCESS_TOKEN`/`SHOPIFY_ADMIN_ACCESS_TOKEN` for development.
- `write_products` scope for product creation.
- Optional `OPENAI_API_KEY` to enable invoice picture extraction. Without it, invoice import still accepts typed fallback line notes.

## Safety

All products created by this module are created as Shopify `draft` products. The merchant must review and publish them inside Shopify.
