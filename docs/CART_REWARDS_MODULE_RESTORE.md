# Cart Rewards module restore

This repo includes the restored v25 Reviews/Loyalty admin plus the advanced Cart Rewards suite as a separate product module.

## Module ownership

Cart Rewards-owned files are grouped so the module can be replaced without touching Reviews:

- `src/modules/cart-rewards/`
- `public/modules/cart-rewards/`
- `extensions/review-widget-extension/blocks/cart-rewards-widget.liquid`
- `extensions/review-widget-extension/assets/nectar-cart-rewards.css`
- `extensions/review-widget-extension/assets/nectar-cart-rewards.js`
- `extensions/review-widget-extension/snippets/cart-reward-card.liquid`
- `extensions/cart-reward-discount-function/`
- `extensions/checkout-ui-extension/`
- `Shopify-Liquid/blocks/cart-rewards-widget.liquid`
- `Shopify-Liquid/assets/nectar-cart-rewards.*`

## What was added

- Campaign builder with tiers and reward product search.
- Monthly planning calendar.
- Campaign templates.
- Cart/storefront evaluation and claim APIs.
- Inventory-aware reward visibility.
- Analytics/event tracking foundation.
- Discount Function and Checkout UI extension foundations.

## What was not changed

The restored Reviews, Messaging, Documentation, Trash, Loyalty, and customer-mode files remain in place. Cart Rewards is loaded from the admin module switcher rather than replacing the review admin UI.
