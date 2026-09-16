# ELEV8 stats accuracy + Brand Rules

Stats fixes:
- Today = Europe/London calendar day, not rolling 24 hours.
- Cancelled/unpaid orders excluded.
- Refunds netted from sales.
- Total Shopify customer count shown separately from 30-day active customers.
- 6-month quantity-weighted PO cost by SKU.
- Shopify unit cost fallback when no PO cost exists.
- Unknown cost never becomes zero cost.
- Margin/profit are blank when no costed revenue exists.
- Profit/order uses only fully-costed orders.

Brand Rules:
- Click a Brand Directory row to inspect what ELEV8 knows and its sources/confidence.
- "Always apply": defaults for every product from the brand.
- "Conditional rules": IF field/operator/value THEN set field/metafield, add tag, or add collection.
- Merchant-locked fields remain authoritative and cannot be overwritten by brand rules.
