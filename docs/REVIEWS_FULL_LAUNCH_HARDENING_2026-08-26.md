# Reviews full launch hardening — 2026-08-26

This pass restores the Reviews customer data pipeline: Shopify product enrichment, images, tags, configured metafields, conditional sliders, signed proof links, duplicate shop-domain protection, and immediate old-order safety reconciliation.

Key behavior:
- product context is enriched from Shopify before review requests are stored/sent;
- existing queued jobs are enriched again immediately before email send;
- `Drink` tag rules resolve to configured sliders;
- metafield rules match actual metafield keys / namespace.key;
- image/tag/metafield/slider context survives the signed token;
- proof emails keep real product IDs and images;
- magic links contain one canonical shopDomain;
- saving age/cutoff rules immediately marks ineligible queued jobs `skipped`;
- the Launch Portal shows order-age eligibility.
