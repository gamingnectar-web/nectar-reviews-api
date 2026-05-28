# PRODUCT CREATION & PRODUCT IMPORT

This module is mounted as a selectable product in the left-hand product menu and is available at:

```txt
/admin?product=product-creation-import
```

API namespace:

```txt
/api/admin/product-creation-import
```

## What changed in v30

- Invoice/order image import now asks the AI extractor to read product thumbnails, product image hints, quantities, paid prices, original prices, discount labels and discount values.
- Invoice lines now expose editable quantity, price paid, original price, discount, promo label and suggested retail fields before product creation or PO drafting.
- Suggested product matches now require merchant confirmation via the UI before they are assigned.
- Unmatched lines now have a **Create…** menu with three paths:
  - Use URL import.
  - Manual create.
  - Quick draft now.
- Invoice imports can now create an internal **draft PO** at the bottom of the page. The draft PO includes matched/created product references, costs, quantities, discounts, shipping, tax and totals.
- URL/manual product creation now includes an editable Shopify handle field for the optimised product URL.
- The UI now loads previously used Shopify tags and shows clickable tag chips.
- The UI now loads product metafield definitions from Shopify and renders them as editable boxes.
- Core G Fuel profile fields are always available:
  - `core.formula_version`
  - `core.grouped_profiles`
  - `core.sourness`
  - `core.sweetness`
  - `core.flavour_profile`
- GPT enrichment can prefill product tags, product handle, product type and core profile metafields from the scanned URL/product content and similar existing products.
- Similar existing products are used to copy common metafield values after tags are selected.

## Required Shopify scopes

Minimum:

```txt
read_products,write_products
```

The current repo default scope string already includes `read_products` and `write_products`.

## Environment variables

```txt
OPENAI_API_KEY=...
OPENAI_INVOICE_MODEL=gpt-4.1-mini
OPENAI_PRODUCT_IMPORT_MODEL=gpt-4.1-mini
```

If `OPENAI_API_KEY` is missing, image extraction falls back to typed invoice notes. Shopify product search, manual creation, URL extraction and PO drafting still work.

## Main endpoints

```txt
GET  /health
GET  /metadata
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

The PO is stored inside the `product_creation_imports` document under `purchaseOrder`. It is intentionally an internal draft, not a Shopify-native purchase order, so the merchant can formalise it after checking all product matches and draft creations.

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
3. For unmatched lines, use **Create… → Use URL import** so the supplier product page can provide a proper image URL.
4. If no URL exists, use **Manual create** and paste/upload a product image URL manually.
