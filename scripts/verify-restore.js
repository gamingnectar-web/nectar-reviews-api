const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'server.js',
  'src/app.js',
  'src/routes/admin.js',
  'src/routes/public.js',
  'src/routes/loyalty.js',
  'src/routes/loyaltyCheckout.js',
  'src/modules/loyalty/loyalty.service.js',
  'src/modules/loyalty/loyalty.models.js',
  'public/admin.html',
  'public/admin.js',
  'public/admin-review-manager-enhancements.js',
  'public/admin-dashboard-analytics.js',
  'public/admin-email-tracking-enhancer.js',
  'public/admin-messaging-campaigns.js',
  'public/admin-help-drawer.js',
  'public/admin-loyalty-foundation.js',
  'public/review-widget.js',
  'Shopify-Liquid/blocks/star_rating.liquid',
  'Shopify-Liquid/blocks/carousel.liquid',
  'extensions/review-widget-extension/shopify.extension.toml',
  'extensions/review-widget-extension/blocks/star_rating.liquid'
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Restore verification failed. Missing files:');
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const adminHtml = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');
const requiredText = ['Review Manager', 'Messaging', 'Documentation', 'Trash', 'Loyalty', 'data-loyalty-tab="overview"'];
const missingText = requiredText.filter((text) => !adminHtml.includes(text));
if (missingText.length) {
  console.error('Restore verification failed. Admin HTML is missing expected UI markers:');
  missingText.forEach((text) => console.error(`- ${text}`));
  process.exit(1);
}

for (const file of [
  'Shopify-Liquid/blocks/star_rating.liquid',
  'Shopify-Liquid/blocks/carousel.liquid',
  'Shopify-Liquid/blocks/product_card_stars.liquid',
  'Shopify-Liquid/blocks/star_badge.liquid',
  'Shopify-Liquid/blocks/bulk_review_page.liquid',
  'extensions/review-widget-extension/blocks/star_rating.liquid',
  'extensions/review-widget-extension/blocks/carousel.liquid',
  'extensions/review-widget-extension/blocks/product_card_stars.liquid',
  'extensions/review-widget-extension/blocks/star_badge.liquid',
  'extensions/review-widget-extension/blocks/bulk_review_page.liquid'
]) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (/"id"\s*:\s*"app_url"[^\n\]]*"default"\s*:/.test(text)) {
    console.error(`Restore verification failed. app_url schema default remains in ${file}`);
    process.exit(1);
  }
}

const security = fs.readFileSync(path.join(root, 'src/utils/security.js'), 'utf8');
if (/X-Frame-Options/.test(security) && /setHeader\('X-Frame-Options'/.test(security)) {
  console.error('Restore verification failed. X-Frame-Options header is still being set.');
  process.exit(1);
}

console.log('Restore verification passed. Legacy v25 admin/review/loyalty logic is present.');
