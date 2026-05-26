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

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full;
  });
}

const liquidFiles = [
  ...walk(path.join(root, 'Shopify-Liquid')).filter((file) => file.endsWith('.liquid')),
  ...walk(path.join(root, 'extensions', 'theme-app-extension')).filter((file) => file.endsWith('.liquid'))
];

const errors = [];

for (const file of liquidFiles) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');

  const schemaMatch = text.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/);
  if (schemaMatch) {
    let schema;
    try {
      schema = JSON.parse(schemaMatch[1]);
    } catch (error) {
      errors.push(`${rel}: schema JSON does not parse: ${error.message}`);
    }

    if (schema && Array.isArray(schema.settings)) {
      for (const setting of schema.settings) {
        if (setting.type === 'url' && Object.prototype.hasOwnProperty.call(setting, 'default')) {
          const allowedDefaults = new Set(['/collections', '/collections/all']);
          if (!allowedDefaults.has(setting.default)) {
            errors.push(`${rel}: url setting "${setting.id}" has invalid default "${setting.default}"`);
          }
        }
      }
    }
  }

  if (/\{%-?\s*(if|elsif)\s+[^%]*\|\s*minus:/.test(text)) {
    errors.push(`${rel}: do not pipe filters directly inside if/elsif comparisons; assign filtered value first.`);
  }
}

if (errors.length) {
  console.error('Liquid validation check failed:\n' + errors.map((m) => ` - ${m}`).join('\n'));
  process.exit(1);
}

console.log(`Liquid and extension structure check passed (${required.length} required files, ${liquidFiles.length} Liquid files validated).`);
