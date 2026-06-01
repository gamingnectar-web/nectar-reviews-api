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

- PO discount logic now allocates product-specific discounts into product lines. For example, if a line shows `£104.00 paid` and `£84.96 discount` for 8 tubs, the app calculates `£188.96 gross line total`, `£23.62 gross/unit`, `£13.00 paid/unit`, and keeps `£84.96 product discount`. The generated Shopify/Sidekick prompt uses gross product costs plus product discounts so the final total reconciles correctly.

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
- Invoice import has vendor, currency, product/order discount, shipping and tax fields before analysis/PO creation. Product-specific discounts are allocated to PO lines where detected; any remaining unallocated discount is kept as an extra order-level discount.
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

## v34 additions

### URL image selection
URL import still collects every likely product/gallery image it can find, but the admin UI now renders them as selectable thumbnails. Only selected image URLs are sent to Shopify when creating the draft product. The textarea remains as the source of truth so a merchant can paste/remove image URLs manually.

### Handle / URL rules
Settings now has a clear **URL / Handle Conditions** area. The main field is a token pattern, for example:

```txt
{vendor}-{title}-{format}-{location}
```

With vendor `G Fuel`, title `UNC 2.0`, format `tub`, and location `uk`, this becomes:

```txt
gfuel-unc-2-0-tub-uk
```

The URL and Manual Create tabs include `URL format token` and `URL location token` fields so each product can override the defaults.

### Product weight
URL scanning now tries to extract weight from JSON-LD, product-page text and common labels such as `Net Wt`, `Product weight`, `280g`, `16oz`, etc. The create flow sends weight and weight unit to Shopify on the initial variant when found or manually entered.

### Barcode lookup
The importer now has a **Find barcode** action. It checks the source page/schema first. For wider barcode lookup, set:

```txt
BARCODE_LOOKUP_API_URL=https://your-provider.example/search
```

The app sends `q=<title>` and `vendor=<vendor>` and accepts JSON keys such as `barcode`, `gtin`, `ean` or `upc`.

### Metafield mapper
A dedicated **Metafield Mapper** tab lets you create rules that align Shopify product metafields to vendor/category/tag/title conditions. Modes:

- `fixed/manual value` fills a known value automatically.
- `ask AI from page/images` gives GPT an instruction for that metafield.
- `copy common value from similar products` is intended for profile reuse and works alongside the existing similar-product metafield copy logic.

### PO visibility
The invoice flow creates internal supplier PO draft records in MongoDB. They now appear in the new **PO Drafts** tab as well as in History. These are not Shopify customer draft orders.

For customer-facing invoices, Shopify uses Draft Orders and invoice sending. That is a different flow and needs `read_draft_orders,write_draft_orders`. For inbound stock/receiving, use Shopify Inventory Transfers when you want to progress beyond internal PO drafts; that needs `write_inventory_transfers` and related inventory permissions.

## V35 updates: image selection, SEO alt text, PO clarity

### Product image import
- URL scans now dedupe product/gallery images by canonical CDN path and keep the highest quality/original candidate where the same image appears with different `width` parameters.
- Only selected images are sent to Shopify for product creation.
- Selected product images are attached to the Shopify product with generated alt text based on the product title.
- Settings now includes **Image / SEO Conditions**. When enabled, selected images are also copied into Shopify **Content > Files** via Shopify `fileCreate`; this requires the `write_files` scope and app reinstall.

### Product search results
- Shopify product search results are deduped by Shopify product id/handle so the invoice matching modal does not show repeated variants/product cards.

### Sweetness and sourness
- `core.sweetness` and `core.sourness` are now treated as 1-5 gauge values:
  - 1 = very low
  - 3 = medium
  - 5 = very high
- AI enrichment is instructed to return numeric string values only for those two fields.

### Purchase order behaviour
- The PO created by this module is an internal supplier PO record inside Nectar.
- It is not a native Shopify Admin Purchase Order because Shopify does not currently expose a public create/update API for the Shopify Admin Purchase Orders screen.
- The UI now says **Internal Draft PO** and **Formalise internal PO** to avoid suggesting that a native Shopify PO is created.
- Formalising is now blocked unless every line is assigned to an existing Shopify product or created as a new Shopify draft product.
- For a future Shopify-native stock movement record, the closest public API surface is Shopify Inventory Transfers, which needs `write_inventory_transfers` and destination/origin location setup.

## V36 updates: PO prompt workaround

Because Shopify does not expose a public API to create the native **Products > Purchase orders** records, the module now supports a prompt-based handoff after an internal PO is formalised.

### New flow

1. Analyse invoice/order screenshot.
2. Match or create every product line.
3. Create the internal draft PO.
4. Formalise the internal PO.
5. Click **Create prompt**.
6. Copy the generated prompt into Shopify/Sidekick or the merchant's purchasing workflow.

The generated prompt includes:

- PO number
- supplier/vendor
- supplier URL
- currency
- invoice/order number and date where available
- every product line
- matched Shopify product title
- Shopify product ID / variant ID where available
- handle, SKU and barcode where available
- quantity
- unit cost
- line total
- line discount context / promo label
- subtotal
- PO-level discount
- shipping
- tax
- final total
- notes

The prompt explicitly tells Shopify not to create a customer draft order or customer invoice, and to keep the PO as a draft unless stock receipt is confirmed.

### Endpoint

```txt
POST /api/admin/product-creation-import/purchase-order/prompt
```

Body:

```json
{
  "importId": "product_creation_import_id"
}
```

Response:

```json
{
  "prompt": "Can you create a purchase order draft...",
  "purchaseOrder": {},
  "importId": "..."
}
```

The PO Drafts tab also shows a **Create prompt** action for formalised internal POs.

## v38 — PO line removal / non-stock treatment

Invoice/order imports can now keep the source order accurate without forcing every visible line into the stock PO.

New PO treatment options on each invoice line:

- **Stock product** — included in the internal PO and must be matched/created before formalising.
- **Non-stock cost / insurance** — kept as a reconciliation cost, but not treated as product inventory. Use this for lines like Checkout+, insurance, route/protection, warranty or damage cover.
- **Landing item / unknown** — excluded from the stock PO until the actual landed item is known. Use this for mystery tubs/items that will be assigned when they arrive.
- **Remove from PO** — removed from product stock lines entirely.

The formalise step now only blocks unmatched **stock product** lines. Non-stock costs and removed/landing lines are carried into the generated prompt as context so Shopify/Sidekick does not create stock for them.

The prompt now includes a dedicated **Non-stock / removed lines** section and totals for:

- gross stock product subtotal
- stock product discounts
- net stock product cost
- non-stock charges / insurance
- removed/landing line value
- shipping, tax and final paid total

This is intended for cases such as:

- **Mystery Energy Tub** — mark as `Landing item / unknown`, then add/receive it manually when the actual product is known.
- **G FUEL Checkout+** — mark as `Non-stock cost / insurance`, so it reconciles the paid order total but does not create inventory.

## v39 — robust draft creation + product-kind metafield guardrails

This update fixes two live-test issues:

1. **Draft product creation is now resilient.** The app creates the Shopify draft product first, then attaches optional parts one by one:
   - selected product images
   - Shopify product metafields
   - inventory cost / price paid
   - optional Shopify Files copies

   This means a bad image URL, invalid metafield type/value, or missing optional scope no longer blocks the draft product itself from being created. The UI now shows warnings such as image/metafield failures after the draft product has been created.

2. **Drink profile metafields are now product-kind aware.** Core drink profile fields are only suggested/applied to likely drink/consumable products:
   - `core.formula_version`
   - `core.grouped_profiles`
   - `core.sourness`
   - `core.sweetness`
   - `core.flavour_profile`

   Products such as lunch boxes, shakers, accessories, merch, insurance/protection lines and unknown mystery items will not inherit flavour, sweetness or sourness from unrelated G Fuel tubs.

Additional guardrails:

- Similar-product metafield copying no longer uses vendor alone. A G Fuel lunch box will not copy drink metafields from G Fuel tubs just because the vendor matches.
- Metafield mapping rules must have at least one condition before they apply.
- Core drink metafield rules are skipped for clear non-drink products.
- OpenAI enrichment is explicitly instructed not to add flavour/sweetness/sourness/formula fields for non-consumable products.

## v40 SEO and URL import guardrails

URL import now scores Product JSON-LD blocks against the actual source URL, page title and H1 before using them. This prevents supplier pages with multiple related Product JSON-LD objects from importing the title/SEO for a different product.

SEO title and meta description are now editable on URL Import and Manual Create. The backend also validates SEO relevance against the current product title and replaces unrelated SEO text before creating the Shopify draft product.

Shopify draft product creation now explicitly sets the product search engine listing fields from the current draft rather than relying on copied profile data or Shopify defaults.

## v41 product editor layout and approval guardrails

- URL Import and Manual Create now use a Shopify-style full-width product editor: title, description, media, pricing, inventory/shipping, product organisation, metafields, and search engine listing.
- Tags are no longer applied automatically by extraction, AI, or conditional rules. Suggested tags are shown as click-to-add chips and only selected tags are sent to Shopify.
- Vendor, product type, theme template, and collections can still be filled by rules. Collections are attached after product creation where Shopify allows manual custom-collection assignment.
- Search engine listing now includes a live preview, current handle pattern, and examples from existing Shopify products so the merchant can compare URL/title format before creating the draft.
- Product metafields are grouped into expandable sections. `rich_text_field` metafields use an editor and are converted to Shopify rich-text JSON before saving.
- Image selection remains click-based; only selected images are attached to the Shopify draft product.

Notes:
- Shopify smart collections are rule-based and cannot be manually joined through the Collects API. If a selected collection is smart, the draft product will still be created and the app will show a warning.
- Shopify native product category/taxonomy assignment is not handled through the current REST create flow; the importer stores the category value for mapping logic and uses product type/template/collections for creation.
