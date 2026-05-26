# Nectar Modular API

This is a clean modular replacement structure for the Nectar Shopify app. It separates the product areas so each one can be deleted and replaced as a complete folder instead of patching many root files.

## What this build includes

- Small `server.js` bootstrap file.
- Stable Express app in `src/app.js`.
- Core systems in `src/core/`.
- Product modules in `src/modules/`:
  - `reviews`
  - `loyalty`
  - `discounts`
  - `cart-rewards`
  - `campaigns`
  - `help`
- Per-shop module toggles.
- Admin shell at `/admin`.
- Shopify OAuth install routes.
- Shopify product search route.
- Review widget compatibility at `/review-widget.js`.
- Backwards-compatible review endpoints:
  - `GET /api/widget/config`
  - `GET /api/reviews/:itemId`
  - `POST /api/reviews/bulk`
  - `GET /api/global-reviews`
  - `GET /api/magic-link/order`
  - `POST /api/support-requests`

## Deploy environment variables

Copy `.env.example` and set these in Render:

```bash
APP_URL=https://nectar-reviews-api.onrender.com
CORE_DB_URI=your_mongodb_connection_string
SHOPIFY_API_KEY=your_shopify_client_id
SHOPIFY_API_SECRET=your_shopify_client_secret
SHOPIFY_API_VERSION=2026-07
SHOPIFY_SCOPES=read_products,write_products,read_discounts,write_discounts,read_price_rules,write_price_rules,write_metaobject_definitions,write_metaobjects
EMAIL_CREDENTIAL_SECRET=long_random_secret_32_chars_or_more
TOKEN_SIGNING_SECRET=long_random_secret_32_chars_or_more
ADMIN_SHARED_SECRET=temporary_dev_admin_secret
ALLOW_UNAUTHENTICATED_ADMIN=false
DEFAULT_ENABLED_MODULES=reviews,help
```

## Shopify app URLs

App URL:

```txt
https://nectar-reviews-api.onrender.com/admin
```

Allowed redirection URLs:

```txt
https://nectar-reviews-api.onrender.com/auth/callback
https://nectar-reviews-api.onrender.com/auth/shopify/callback
https://nectar-reviews-api.onrender.com/api/auth/callback
```

Install test URL:

```txt
https://nectar-reviews-api.onrender.com/auth/shopify?shop=your-store.myshopify.com
```

## How modules are replaced

Each product area is isolated. To replace reviews only:

```bash
rm -rf src/modules/reviews
# upload replacement src/modules/reviews folder
```

To replace cart rewards only:

```bash
rm -rf src/modules/cart-rewards
# upload replacement src/modules/cart-rewards folder
```

Do not casually replace `src/core`, `src/config`, `src/app.js`, `server.js`, or `package.json` unless you are intentionally changing the platform foundation.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Without `CORE_DB_URI`, the app will still start and module settings will use in-memory demo storage. Persistent reviews, campaigns, loyalty ledgers and Shopify installs require MongoDB.

## Admin

Open:

```txt
http://localhost:3000/admin?shop=your-store.myshopify.com
```

Use **Module settings** to enable or disable product areas per shop.


## Shopify Liquid and extension files

This replacement includes both manual Liquid install files and Shopify extension scaffolds.

Manual copy files:

- `Shopify-Liquid/assets/`
- `Shopify-Liquid/blocks/`
- `Shopify-Liquid/snippets/`

Shopify extension scaffolds:

- `extensions/theme-app-extension/`
- `extensions/cart-reward-discount-function/`
- `extensions/checkout-loyalty-redemption/`
- `extensions/checkout-ui-extension/`

Run:

```bash
npm run liquid:check
```

to confirm those pieces are present.
