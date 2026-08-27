const fs = require('fs');
const assert = require('assert');

const liquid = fs.readFileSync(
  'extensions/review-widget-extension/blocks/all_reviews_seo_page.liquid',
  'utf8'
);

const js = fs.readFileSync(
  'extensions/review-widget-extension/assets/nectar-all-reviews-page.js',
  'utf8'
);

const css = fs.readFileSync(
  'extensions/review-widget-extension/assets/nectar-all-reviews-page-hotfix.css',
  'utf8'
);

const api = fs.readFileSync('src/routes/public.js', 'utf8');

const checks = [
  ['v4 build marker', liquid.includes('reviews-seo-20260827-4')],
  ['hotfix css included', liquid.includes('nectar-all-reviews-page-hotfix.css')],
  [
    'desktop true viewport breakout',
    css.includes('left: 50% !important') &&
      css.includes('margin-left: -50vw !important') &&
      css.includes('width: 100vw !important'),
  ],
  [
    'mobile removes viewport breakout',
    css.includes('left: auto !important') &&
      css.includes('max-width: 100% !important'),
  ],
  ['raw id helper exists', js.includes('const isRawProductId =')],
  ['safe title helper exists', js.includes('const safeProductTitle =')],
  ['popular searches exclude ids', js.includes('!isRawProductId(label)')],
  [
    'product images preferred',
    js.includes('review.productImage || mediaUrl(review)'),
  ],
  ['GraphQL fallback helper exists', api.includes('async function fetchSeoProductsGraphql')],
  ['GraphQL fetches Product nodes', api.includes('... on Product')],
  ['GraphQL fetches featured media', api.includes('featuredMedia')],
  [
    'REST failures fall back to GraphQL',
    api.includes('const unresolvedIds = missingIds.filter((id) => !productMap.has(id));'),
  ],
];

for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log(`✓ ${label}`);
}

console.log(`All Reviews v4 hotfix smoke passed: ${checks.length} checks`);
