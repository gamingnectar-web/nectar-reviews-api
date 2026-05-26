# Migration audit

This replacement repo intentionally consolidates the old root-level patch/addon structure into a modular product layout.

## Included product areas

- Reviews: `src/modules/reviews`, `Shopify-Liquid/blocks`, `Shopify-Liquid/assets`, and `extensions/theme-app-extension`.
- Loyalty: `src/modules/loyalty` and `extensions/checkout-loyalty-redemption`.
- Discounts: `src/modules/discounts` and `extensions/cart-reward-discount-function`.
- Cart rewards: `src/modules/cart-rewards`, `Shopify-Liquid/blocks/cart_rewards.liquid`, `Shopify-Liquid/assets/cart-rewards-widget.js`, and checkout extension scaffold.
- Campaigns: `src/modules/campaigns`.
- Help drawer: `src/modules/help`.
- Core Shopify OAuth/product search/settings/support routes: `src/core`.

## Intentionally not carried over

These old repository areas should not be copied into the cleaned repo unless you are deliberately recovering historical code:

- `.nectar-backups/`
- `REPLACED/`
- old generated zip files in the repo root
- `*.before-*` backup files
- one-off `apply-*`, `server-*addon*`, and `*-patch*` files
- duplicate root admin files that are now represented by `public/admin` and module-level admin folders

Those files made the repo harder to reason about and were replaced by module folders, docs, and check scripts.

## Replacement rule

Whole product areas can now be replaced by deleting and replacing one folder:

```bash
rm -rf src/modules/reviews
rm -rf src/modules/loyalty
rm -rf src/modules/discounts
rm -rf src/modules/cart-rewards
rm -rf src/modules/campaigns
```

Do not casually replace `src/core`, `src/config`, `src/app.js`, `server.js`, `package.json`, or `package-lock.json` unless you are changing the platform foundation.

## Checks

Run:

```bash
npm run check
```

This checks JavaScript syntax, required backend structure, and required Shopify Liquid/extension files.

## 2026-05-26 Liquid validation patch

Shopify CLI rejected the theme app extension because `type: "url"` settings used an external URL as `default`. Shopify only permits `/collections` and `/collections/all` as defaults for URL settings, so the `app_url` defaults were removed from every Liquid block. The frontend widget scripts already include a safe fallback to `https://nectar-reviews-api.onrender.com` when the setting is empty.

The shared `nectar-stars.liquid` snippet was also fixed so Liquid filters are assigned before conditional comparisons, avoiding syntax such as `nectar_rating > i | minus: 1`.
