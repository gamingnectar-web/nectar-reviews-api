# PRODUCT CREATION & PRODUCT IMPORT

This module is mounted as a selectable product in the left-hand product menu and is available at:

```txt
/admin?product=product-creation-import
```

API namespace:

```txt
/api/admin/product-creation-import
```

## What changed in v32

- Reviewed the v31 invoice/product creation flow end-to-end.
- Shopify product search now tries Admin GraphQL product search first, including product titles, handles, SKUs, barcodes and variant inventory data, then falls back to the older REST first-250-products filter if needed.
- Shopify draft product creation still sends all image URLs, price and compare-at price.
- Inventory item cost is now written after product creation through Shopify Inventory Item update, instead of trying to put `cost` on the variant payload.
- Health/status now reports missing product-import scopes, so an older install can tell you when it needs to be reconnected.
- Invoice image uploads now fail clearly if the compressed data URL is still too large, instead of silently truncating the image and giving poor extraction.
- Default `SHOPIFY_SCOPES` now includes inventory scopes required for cost saving:

```txt
read_products,write_products,read_inventory,write_inventory,read_customers,read_orders
```

- PO discount logic has been tightened: PO-level discount is the source of truth for PO totals. Line-level discounts are retained as row context/promotional notes, but are no longer auto-subtracted from totals to avoid double-discounting when the extracted line total is already the paid/final total.

## What changed in v31

- URL import collects all product/gallery image URLs it can find, not just the first JSON-LD/Open Graph image.
- URL and Manual Create forms include:
  - Retail price
  - Compare-at price
  - Price paid / cost
  - Featured image URL
  - All image URLs textarea
- Shopify draft product creation sends every listed image URL to Shopify, capped at 50 for request safety.
- Shopify draft product creation passes `compare_at_price` on the first variant.
- Added a **Settings** tab for Product Creation & Import.
- Settings support:
  - Handle prefix/suffix/max-length rules.
  - Default PO currency.
  - Vendor presets.
  - SKU rules based on vendor, tag, product line and metafield values such as `core.formula_version`.
  - Conditional defaults, for example add a tag when title contains X, set product type when vendor contains X, or set a metafield when Formula Version equals EN.
- Invoice import has vendor, currency, PO-level discount, shipping and tax fields before analysis/PO creation.
- Invoice product search opens a modal with a search bar and selectable Shopify product results.
- Draft PO creation posts vendor/currency/discount/shipping/tax overrides to the backend and does not depend on every line being matched first.

## Required Shopify scopes

Required for the full implemented product import flow:

```txt
read_products,write_products,read_inventory,write_inventory
```

`read_products` and `write_products` are needed for product search and product creation. `read_inventory` and `write_inventory` are needed when saving the product's inventory item cost / price paid after creation.

Optional future scopes if you later decide to create native Shopify customer draft orders or native inventory transfer/shipment records from this module:

```txt
read_draft_orders,write_draft_orders,write_inventory_transfers,write_inventory_shipments
```

Important: the current PO inside this module is an internal supplier purchase-order draft, not a Shopify customer draft order.

## Environment variables

```txt
OPENAI_API_KEY=...
OPENAI_INVOICE_MODEL=gpt-4.1-mini
OPENAI_PRODUCT_IMPORT_MODEL=gpt-4.1-mini
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_customers,read_orders
```

If `OPENAI_API_KEY` is missing, image extraction falls back to typed invoice notes. Shopify product search, manual creation, URL extraction and PO drafting still work.

After changing `SHOPIFY_SCOPES`, reinstall/reconnect the Shopify app for the shop so the saved OAuth token actually has the new scopes.

## Main endpoints

```txt
GET  /health
GET  /metadata
GET  /settings
POST /settings
POST /profile/suggest
POST /url/scan
POST /invoice/analyse
GET  /products/search?q=...
POST /shopify/assign
POST /shopify/create
POST /purchase-order/draft
POST /purchase-order/formalise
GET  /history
```

## Purchase order behaviour

The PO is stored inside the `product_creation_imports` document under `purchaseOrder`. It is intentionally an internal supplier purchase-order draft, not a Shopify-native customer invoice, so the merchant can formalise it after checking all product matches and draft creations.

PO-level fields:

```txt
supplierName
supplierUrl
currency
poLevelDiscount / discountTotal
shippingTotal
taxTotal
total
notes
```

Line fields carried into the PO:

```txt
title
sku
barcode
quantity
unitCost
originalUnitPrice
discountAmount
discountLabel
suggestedRetailPrice
productId
variantId
matchStatus
```

Totals:

```txt
subtotal = sum of line totals
PO discount = poLevelDiscount or discountTotal only
final total = subtotal + shipping + tax - PO discount
```

Line discount values remain visible but are not automatically subtracted from PO totals.

## Settings rule behaviour

Settings are stored in the `product_creation_import_settings` collection.

Handle rules:

```txt
prefix
suffix
maxLength
separator
overwriteExistingHandle
```

SKU rule tokens:

```txt
{vendorCode}
{lineCode}
{productLine}
{titleCode}
{handle}
{vendor}
{metafield}
```

SKU rules can match on:

```txt
vendorContains
tagContains
productLineContains
metafieldNamespace + metafieldKey
```

For G Fuel / AdvancedGG style rules, use `core.formula_version` as the product-line source. Example: when vendor contains `G Fuel` and Formula Version contains `EN`, use a SKU template such as:

```txt
{vendorCode}-{lineCode}-{titleCode}
```

## Product metafield behaviour

The module fetches product metafield definitions from Shopify via Admin GraphQL. It renders those definitions in the URL and Manual Create forms. On creation, non-empty metafields are sent to Shopify with the draft product.

The core G Fuel fields are included even if Shopify does not return definitions, because these are important to the product line/profile workflow:

```txt
core.formula_version
core.grouped_profiles
core.sourness
core.sweetness
core.flavour_profile
```

## Image handling from invoices

If the invoice/order image contains a visible product thumbnail but no actual image URL, the AI extractor returns:

```txt
imageDescription
imageSearchQuery
```

That gives the merchant a useful image hint. The app cannot turn a flat screenshot thumbnail into a high-quality Shopify product image URL automatically unless the supplier page or matched Shopify product provides an image URL. The recommended flow is:

1. Analyse invoice/order screenshot.
2. Search/assign existing product when possible, which brings in the Shopify product image.
3. For unmatched lines, use **Create… → Use URL import** so the supplier product page can provide proper product image URLs.
4. If no URL exists, use **Manual create** and paste product image URLs manually.
