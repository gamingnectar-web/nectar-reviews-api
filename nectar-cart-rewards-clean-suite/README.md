# Nectar Premium Cart Rewards Suite

This update keeps the Shopify app identity as `review-widget`, keeps Reviews as the default workspace, and improves the folderised Cart Rewards module.

## What this update fixes/adds

- Removes the browser `prompt()` campaign creator and replaces it with a premium modal.
- Adds a Campaign Builder workspace for campaign details, tiers, reward products, scheduling and inventory rules.
- Adds Shopify product search for selecting reward variants.
- Adds cart drawer/cart page appearance controls: layout, density, progress style, colours, drawer behaviour and surfaces.
- Adds analytics overview: impressions, unlocks, claims, conversions, influenced revenue, top rewards and anonymous reward usage.
- Keeps Cart Rewards free of customer profile data. Anonymous cart/order attribution only.
- Keeps Reviews as the default product and protects it behind a workspace wrapper so switching back does not blank the review dashboard.
- Keeps Reviews prepared for future folderisation under `public/modules/reviews` and `src/modules/reviews`.

## Install

From your Codespace repo root:

```bash
unzip -o nectar-cart-rewards-premium-suite.zip
node nectar-cart-rewards-premium-suite/install-premium-cart-rewards-suite.js
npm install
npm run check
npm run cart-rewards:smoke
```

Then commit:

```bash
git add .
git commit -m "Add premium cart rewards builder and analytics"
git push
```

## Test path

1. Open `/admin` in the embedded Shopify app.
2. Confirm `review-widget` opens by default.
3. Switch App product to `Cart Milestone Rewards`.
4. Click `New campaign`; a modal should open instead of a browser alert/prompt.
5. Open Builder, add tiers, search products, and save.
6. Switch back to `review-widget`; reviews should reappear.

## Notes

Cart Rewards inventory still hides sold-out rewards by default. Merchants can deliberately select continuation/back-order or backup behaviour in campaign inventory settings.
