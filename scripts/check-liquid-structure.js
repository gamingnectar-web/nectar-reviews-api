const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'Shopify-Liquid/assets/widget.js',
  'Shopify-Liquid/assets/nectar-review-page.js',
  'Shopify-Liquid/assets/nectar-review-page.css',
  'Shopify-Liquid/assets/cart-rewards-widget.js',
  'Shopify-Liquid/blocks/bulk_review_page.liquid',
  'Shopify-Liquid/blocks/carousel.liquid',
  'Shopify-Liquid/blocks/product_card_stars.liquid',
  'Shopify-Liquid/blocks/star_badge.liquid',
  'Shopify-Liquid/blocks/star_rating.liquid',
  'Shopify-Liquid/blocks/cart_rewards.liquid',
  'Shopify-Liquid/snippets/nectar-stars.liquid',
  'extensions/theme-app-extension/blocks/nectar-reviews.liquid',
  'extensions/theme-app-extension/blocks/nectar-cart-rewards.liquid',
  'extensions/theme-app-extension/assets/nectar-reviews-widget.js',
  'extensions/cart-reward-discount-function/src/run.rs',
  'extensions/cart-reward-discount-function/shopify.extension.toml',
  'extensions/checkout-loyalty-redemption/src/Checkout.jsx',
  'extensions/checkout-ui-extension/src/Checkout.jsx'
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing Liquid/extension files:\n' + missing.map((m) => ` - ${m}`).join('\n'));
  process.exit(1);
}

console.log(`Liquid and extension structure check passed (${required.length} required files).`);
