# Theme, Liquid and extension structure

The repo includes two parallel approaches:

1. `Shopify-Liquid/` — manual theme copy files for quick install/testing.
2. `extensions/theme-app-extension/` — Shopify theme app extension scaffold.

## Manual Liquid files

- Product review widget: `Shopify-Liquid/blocks/star_rating.liquid`
- Star badge: `Shopify-Liquid/blocks/star_badge.liquid`
- Product-card stars: `Shopify-Liquid/blocks/product_card_stars.liquid`
- Review carousel: `Shopify-Liquid/blocks/carousel.liquid`
- Review form page: `Shopify-Liquid/blocks/bulk_review_page.liquid`
- Cart rewards widget: `Shopify-Liquid/blocks/cart_rewards.liquid`

## Shopify extensions

- `extensions/theme-app-extension` for Online Store app blocks.
- `extensions/cart-reward-discount-function` for checkout-safe cart reward price protection.
- `extensions/checkout-loyalty-redemption` for beta loyalty checkout redemption.
- `extensions/checkout-ui-extension` for beta checkout cart rewards UI.

The backend remains modular under `src/modules/*`. Storefront surfaces should call the module endpoints rather than duplicating business logic in Liquid.
