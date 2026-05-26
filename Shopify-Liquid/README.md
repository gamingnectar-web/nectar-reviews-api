# Shopify Liquid manual install files

Use these files when you want to manually copy theme assets/blocks instead of deploying the Shopify theme app extension.

## Assets

- `assets/widget.js` — storefront review widget loader
- `assets/nectar-review-page.js` — review landing form submitter
- `assets/nectar-review-page.css` — review/widget/cart-reward styling
- `assets/cart-rewards-widget.js` — cart reward progress widget
- `assets/thumbs-up.png` — legacy placeholder asset

## Blocks

- `blocks/star_rating.liquid`
- `blocks/star_badge.liquid`
- `blocks/product_card_stars.liquid`
- `blocks/carousel.liquid`
- `blocks/bulk_review_page.liquid`
- `blocks/cart_rewards.liquid`

## Snippets

- `snippets/nectar-stars.liquid`
- `snippets/nectar-review-summary.liquid`

The hosted app must still serve `/review-widget.js` and backend compatibility endpoints such as `/api/widget/config`, `/api/reviews/:itemId`, and `/api/global-reviews`.
