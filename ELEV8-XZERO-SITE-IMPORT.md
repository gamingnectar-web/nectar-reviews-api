# ELEV8 X-Zero Full-Site Import

Adds a low-touch full-site importer for X-Zero and a reusable supplier-profile pattern.

- discovers product URLs via sitemap.xml, with Shopify products.json fallback;
- creates one site-import batch;
- classifies Energy, Hydration+, pouches, shakers, samples/bundles, mousepads, air fresheners and merch;
- applies family-specific facts before OpenAI enrichment;
- maps supplier facts into metafield definitions already present in Shopify;
- uses the existing OpenAI + Shopify-catalogue enrichment for descriptions, SEO and gaps;
- keeps merchant edits locked;
- detects exact Shopify duplicates and skips them;
- processes large imports in chunks in the background;
- auto-approves only completeness-ready products;
- optionally auto-creates Shopify DRAFTS, never publishes them.

POST `/api/admin/product-creation-import/batches/site-import`

```json
{
  "rootUrl": "https://x-zero.co.uk/",
  "name": "X-Zero full catalogue",
  "maxProducts": 500,
  "useAi": true,
  "autoApproveReady": true,
  "autoCreateDrafts": false,
  "batchSize": 12
}
```

Recommended first run: leave `autoCreateDrafts` false, inspect exceptions, then enable draft creation once the profile is proven.
