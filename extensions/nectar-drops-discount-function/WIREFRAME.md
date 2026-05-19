# Nectar Drops Discount Function Wireframe

Future architecture:

1. MongoDB remains the source of truth for ledger history.
2. App mirrors redeemable Drops to a Shopify customer metafield.
3. Function reads cart/customer/metafield input.
4. Function applies the discount.
5. Webhooks reconcile points after order completion/refund.

Avoid direct database/network calls from the Function unless the merchant/platform setup explicitly supports it.
