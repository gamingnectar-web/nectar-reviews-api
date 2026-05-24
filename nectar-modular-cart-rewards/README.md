# Nectar modular Cart Rewards integration

This package folderises the new Cart Milestone Rewards product under the existing Shopify app identity.

The Shopify app still opens as the main app / `review-widget`. The left sidebar gets an app-product dropdown:

- `review-widget` — the existing Reviews Platform admin remains the default landing area.
- `Cart Milestone Rewards` — loads the new cart milestone module from `public/modules/cart-rewards/` and backend routes from `src/modules/cart-rewards/`.

## Why this structure

This avoids mixing Cart Rewards into the existing Reviews tabs. Cart Rewards becomes its own module workspace while sharing the same Shopify app install, auth/session, database connection and app shell.

## Folder structure added

```txt
public/
  module-registry.js
  module-shell.js
  module-shell.css
  modules/
    cart-rewards/
      admin.js
      admin.css
    reviews/
      module.json
      README.md

src/
  modules/
    index.js
    moduleRegistry.js
    reviews/
      index.js
    cart-rewards/
      controllers/
      jobs/
      middleware/
      models/
      routes/
      seed/
      services/
      tests/
      utils/
```

## Install in GitHub Codespaces

From the repo root:

```bash
unzip nectar-modular-cart-rewards.zip
node nectar-modular-cart-rewards/install-modular-cart-rewards.js
npm install
npm run check
npm run cart-rewards:smoke
```

Then commit on a branch:

```bash
git checkout -b modular-cart-rewards
git add .
git commit -m "Add modular cart rewards product"
git push origin modular-cart-rewards
```

## Landing behaviour

Default app opening:

```txt
/admin?shop=your-store.myshopify.com
```

opens Reviews / `review-widget`.

Deep-link to Cart Rewards:

```txt
/admin?shop=your-store.myshopify.com&module=cart-rewards
```

The selector also stores the last selected module in `sessionStorage` so the merchant can stay in the same product workspace during the browser session.

## Reviews folderisation path

The Reviews code is intentionally kept working as-is. The module shell treats Reviews as a module now, but the large existing `public/admin.js` and existing review routes are not hard-moved in this package because that is the riskiest way to break the live app.

When ready, move Reviews in stages:

1. Move review-specific admin JS into `public/modules/reviews/admin.js`.
2. Move review-specific CSS into `public/modules/reviews/admin.css`.
3. Keep only shared shell helpers in root `public/admin.js`.
4. Split review backend routes into `src/modules/reviews/routes/` and mount them from `src/modules/reviews/index.js`.
5. Update `public/module-registry.js` so Reviews has its own `script` and `css` like Cart Rewards.

## Cart Rewards privacy boundary

Cart Rewards does not use customer profile data. It evaluates:

- shop domain
- cart subtotal / cart lines
- reward campaign rules
- live Shopify product/variant availability
- signed reward claim tokens

It does not need customer IDs, emails, customer tags, order history or login status.
