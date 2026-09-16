# ELEV8 Commerce Pulse + Brand Directory v3

This patch does two things.

1. Dashboard-only left rail:
- Today sales / orders / AOV
- 7-day and 30-day sales
- 30-day customers
- returning customer %
- returning revenue %
- gross profit
- gross margin
- gross profit per order
- cost coverage
- six-month sales

Gross profit uses a six-month quantity-weighted PO unit cost by SKU from `product_creation_imports`.
Unknown SKU cost is never treated as zero for coverage; the UI shows cost coverage.

2. Brand Directory v3:
- Direct route mounted before platform module mounts
- Reads MongoDB directly
- Starts brand scrape jobs
- Backfills missing brands from the public Gaming Nectar storefront
- Defaults to `gaming-nectar.myshopify.com` only when no shop context is provided and that shop exists in the brand-profile collection.

Install:
```bash
node scripts/install-elev8-commerce-brand-v3.cjs
node scripts/elev8-commerce-brand-v3-smoke.cjs
node --check src/routes/brandDirectoryV3.js
node --check src/routes/elev8CommercePulse.js
node --check public/elev8-commerce-rail.js
node --check public/brand-directory-v3.js
npm run deploy:preflight
```
