# V26 full working restore notes

This repo is based on the uploaded `nectar-v25-live-status-support-seo-reviews-full-repo.zip` working base.

It preserves the v25 review, live status, support, SEO, messaging, loyalty, discounts, cart rewards, Shopify Liquid and extension logic, then adds:

- Persistent MongoDB-backed email module library.
- Safe AI email module builder for Messaging > Modules.
- Robust review migration centre with CSV staging, duplicate detection, product/site review split and storefront review-signal scan.
- Public site/shop reviews endpoint at `/api/site-reviews`.
- Review model fields for site reviews, imported media, duplicate hashes and product mapping metadata.

LocalStorage is now cache/fallback for email modules, not the source of truth.

## Required checks

```bash
npm install
npm run check
```

## Optional AI env

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODULE_MODEL=gpt-4.1-mini
```

If `OPENAI_API_KEY` is not set, the module builder still returns safe fallback variants.
