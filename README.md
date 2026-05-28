# Nectar Reviews API — Full Restore Package

This is a complete restore repository package built for the deleted `nectar-reviews-api` repo.

It includes:

- Reviews API and storefront widget endpoints
- Shopify OAuth scaffold and webhook handling
- Admin dashboard shell
- Review manager and settings routes
- Persistent AI email module builder
- MongoDB-backed reusable email module library
- Review Migration Centre for Yotpo / Shop / generic CSV imports
- Site/shop-level reviews via `reviewScope: "site"` and `itemId: "__site__"`
- Storefront review-signal scanner
- Loyalty foundation and checkout beta endpoints
- Cart rewards campaign/tier scaffolds
- Discount module scaffold
- Shopify Liquid/theme extension files

## Run locally

```bash
npm install
cp .env.example .env
npm run check
npm start
```

## Deploy to Render

Set at least:

```bash
APP_URL=https://your-render-url.onrender.com
CORE_DB_URI=your_mongodb_uri
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
EMAIL_CREDENTIAL_SECRET=long_random_secret
REVIEW_TOKEN_SECRET=long_random_secret
ADMIN_SHARED_SECRET=temporary_dev_secret
```

Optional AI:

```bash
OPENAI_API_KEY=...
OPENAI_MODULE_MODEL=gpt-4.1-mini
```

## Admin

Open:

```text
/admin?shop=your-store.myshopify.com&admin_secret=YOUR_ADMIN_SHARED_SECRET
```

## Important

This is a full working restore package, not a byte-for-byte Git history restore. It is designed to get the app running again with the review, migration, AI module, loyalty and cart-reward structures discussed.
