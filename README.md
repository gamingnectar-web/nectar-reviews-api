# Nectar Reviews API - secure preserve-UI OAuth build

This build keeps the existing review/widget/admin behaviour and adds the secure multi-shop Shopify OAuth foundation.

## Important deploy fix

Render was failing because `package.json` in the deployed repo is not valid JSON. Replace the repo files with this package exactly. This ZIP contains a validated `package.json` and `package-lock.json`.

Recommended Render settings:

- Build command: `npm install`
- Start command: `npm start`

If Render is currently using `yarn install`, that is okay too as long as `package.json` is valid, but `npm install` is preferred for this package.

## Required environment variables

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

Do not set a global `SHOPIFY_ACCESS_TOKEN` for production. The app now stores per-shop tokens from the OAuth install flow.

## Shopify app URLs

Use these in Shopify:

- App URL: `https://nectar-reviews-api.onrender.com/admin`
- Allowed redirection URLs:
  - `https://nectar-reviews-api.onrender.com/auth/callback`
  - `https://nectar-reviews-api.onrender.com/auth/shopify/callback`
  - `https://nectar-reviews-api.onrender.com/api/auth/callback`

## Install URL for testing

```txt
https://nectar-reviews-api.onrender.com/auth/shopify?shop=your-store.myshopify.com
```

After install, the app stores the shop token encrypted in MongoDB in the `shops` collection.

## Admin fallback for development

```txt
/admin?shop=your-store.myshopify.com&admin_secret=YOUR_ADMIN_SHARED_SECRET
```

This is for testing only. The scalable path is Shopify App Bridge session tokens plus the per-shop OAuth token saved by install.
