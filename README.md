# Nectar Reviews API - secure preserve-UI OAuth v6

This build keeps the existing review/widget/admin behaviour, keeps the secure multi-shop Shopify OAuth foundation, and adds backwards-compatible storefront endpoints for the Shopify Liquid assets.

## Important

Do not use a global `SHOPIFY_ACCESS_TOKEN` for production. Product lookup uses the per-shop OAuth token stored in MongoDB after installation.

## Required Render environment variables

```bash
APP_URL=https://nectar-reviews-api.onrender.com
MONGODB_URI=your_mongodb_uri
SHOPIFY_API_KEY=your_shopify_client_id
SHOPIFY_API_SECRET=your_shopify_client_secret
SHOPIFY_API_VERSION=2026-07
SHOPIFY_SCOPES=read_products,write_products,read_discounts,write_discounts,read_price_rules,write_price_rules,write_metaobject_definitions,write_metaobjects
EMAIL_CREDENTIAL_SECRET=long_random_secret_32_chars_or_more
ADMIN_SHARED_SECRET=temporary_dev_admin_secret
ALLOW_UNAUTHENTICATED_ADMIN=false
```

## Shopify app URLs

App URL:

```text
https://nectar-reviews-api.onrender.com/admin
```

Allowed redirection URLs:

```text
https://nectar-reviews-api.onrender.com/auth/callback
https://nectar-reviews-api.onrender.com/auth/shopify/callback
https://nectar-reviews-api.onrender.com/api/auth/callback
```

## Test OAuth install

```text
https://nectar-reviews-api.onrender.com/auth/shopify?shop=your-store.myshopify.com
```

## Liquid files

Use the updated files in `Shopify-Liquid/`. The important fix is that the product widget block must load:

```text
https://nectar-reviews-api.onrender.com/review-widget.js
```

and must pass `shop.permanent_domain` and `product.id` as data attributes.

## Compatibility endpoints restored

The Liquid assets now have matching backend endpoints:

```text
GET  /api/widget/config
GET  /api/reviews/:itemId
GET  /api/global-reviews
POST /api/reviews/bulk
GET  /api/magic-link/order
POST /api/support-requests
```
