# Product Import Batch Rescan, Scope and Layout Fix

This update addresses the issues seen in the batch importer and messaging layout designer.

## Product import fixes

- Batch Scan now refreshes already-analysed rows as well as queued rows, so new SEO/flavour/metafield logic is applied to existing batches after deployment.
- Rows are temporarily marked `scanning` before the request returns, giving a visible left-to-right pulse while the batch is being processed.
- Shopify scope checks now combine the stored install scopes with the current `SHOPIFY_SCOPES` env value and split on commas/whitespace, avoiding false missing-scope warnings when the env already contains `read_products` and `read_inventory`.
- G FUEL flavour alias handling now maps common product/collab names to actual flavour values, including Sharingan → Pomegranate Green Tea, Tornado → Orange Creamsicle, F*** S*** UP / Vox Machina → Peach Orange Raspberry, Jump Scare → White Cran Strawberry, Awakening → White Grape Lime, and Dimension Drip → Grape & Strawberry.
- G FUEL Energy Formula powder/tub products now default formula version to `GF-EN2.0` when explicit formula text is not otherwise available.
- G FUEL energy powder/tub caffeine now falls back to 140mg only when the product is clearly a G FUEL energy product and not hydration/caffeine-free.
- Supplement facts images with filename markers such as `SFF` are classified as ingredients/supplement label images and excluded from the main media roster.
- Vendor matching now treats compact variants such as `GFuel` and `G Fuel` as the same when aligning to existing Shopify vendor values.
- Merchant SEO titles/handles are rebuilt during rescans using vendor, product name, product format and location.

## Messaging layout designer fixes

- Applying saved product-card layouts no longer fails due to a missing local setter.
- Applied product-card layouts now show as selected and the button changes to `Remove from builder`.
- The active product-card layout ID is carried in the email builder design payload.

## Verification

`npm run check` passed after dependency install.
