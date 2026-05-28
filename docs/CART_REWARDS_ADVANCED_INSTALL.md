# Nectar Cart Rewards Advanced Suite

This package clean-replaces only Cart Rewards-owned code and keeps the existing review-widget app intact.

## Install from Codespace repo root

```bash
rm -rf nectar-cart-rewards-advanced-suite
unzip -o nectar-cart-rewards-advanced-suite.zip
node nectar-cart-rewards-advanced-suite/install-advanced-cart-rewards-suite.js
npm install
npm run check
npm run cart-rewards:smoke
```

Then commit and push:

```bash
git add .
git commit -m "Upgrade cart rewards calendar and product picker"
git push
```

## What this version adds

- Premium campaign modal instead of browser prompt/alert.
- Native Shopify product picker when available in the embedded app.
- Backend Shopify product/variant search by title, SKU, barcode, or raw Shopify query.
- Manual variant GID fallback for emergency setup.
- Product search uses per-shop OAuth tokens from the existing Shop model before falling back to dev env tokens.
- Proper month calendar with previous/next/today controls.
- Click any calendar day to create a scheduled campaign on that date.
- Calendar agenda list for active/scheduled promos.
- More complete appearance controls for drawer/cart/checkout surfaces.
- Analytics view for impressions, unlocks, claims, conversions, influenced revenue, top rewards, and anonymous usage.

## Product search requirements

For catalogue search and inventory data, the app needs Shopify product/inventory scopes and a valid OAuth token for the shop. This installer does not add customer scopes.

Recommended scopes for Cart Rewards:

```txt
read_products,read_inventory,read_orders
```

`read_orders` is only needed if you later connect order-level conversion attribution. The module still avoids customer profile data.

## Calendar behaviour

The calendar is a planning surface:

- browse month by month
- click a date to create a scheduled campaign
- edit campaigns from the listing
- use the scheduler to activate/expire campaigns automatically

The backend scheduler continues to turn campaigns on/off based on `startsAt`, `endsAt`, `autoActivate`, and `autoExpire`.

## Reviews modularisation

This package keeps reviews as the default product and prepares the modular route/folder structure for reviews, but it does not move the live reviews code yet. That should be done in a separate migration once Cart Rewards is stable.
