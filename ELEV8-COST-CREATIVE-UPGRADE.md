# ELEV8 Marketing Intelligence: Cost Basis + Creative Upgrade

This patch addresses two issues observed in Marketing Intelligence.

## 1. Missing cost basis
The first implementation only looked at purchase orders created or updated inside the same 183-day marketing window. That is wrong for cost basis: inventory sold today may have been purchased more than six months ago.

This upgrade:
- scans all stored PO history for the shop
- matches cost by SKU, then variant ID, then product ID
- falls back to Shopify inventory-item unit cost
- tracks costed vs uncosted units
- adds a **Cost & inventory** modal on each product
- shows Shopify variants, current inventory, PO receipts, weighted PO unit cost, Shopify unit cost, matched source, margin formula and missing-cost reasons

## 2. Creative quality
The Creative Studio now has **Generate art direction**. It uses the product, selected style and marketing insight to create an editable campaign brief before the image is generated.

The background prompt is also stricter:
- premium DTC/editorial photography
- restrained prop count
- no oversized floating ingredients
- no random liquid pours
- no clutter
- clean lower-third hero zone for the real Shopify packshot

The AI still generates the background only; ELEV8 overlays the real product image afterwards.
