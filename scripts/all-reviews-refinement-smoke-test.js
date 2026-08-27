const fs = require('fs');
const assert = require('assert');

const liquid = fs.readFileSync('extensions/review-widget-extension/blocks/all_reviews_seo_page.liquid','utf8');
const css = fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page-refinement.css','utf8');
const js = fs.readFileSync('extensions/review-widget-extension/assets/nectar-all-reviews-page.js','utf8');
const api = fs.readFileSync('src/routes/public.js','utf8');
const model = fs.readFileSync('src/models/index.js','utf8');

const checks = [
  ['build marker bumped', liquid.includes('reviews-seo-20260827-3')],
  ['refinement css loaded', liquid.includes('nectar-all-reviews-page-refinement.css')],
  ['desktop full bleed enabled', css.includes('width:100vw!important') && css.includes('calc(50% - 50vw)')],
  ['mobile resets to container width', css.includes('@media(max-width:760px)') && css.includes('width:100%!important')],
  ['storefront font variables inherited', css.includes('--font-body-family') && css.includes('--font-heading-family')],
  ['Shopify product enrichment exists', api.includes('async function enrichSeoReviewProducts')],
  ['enrichment happens before SEO search filter', api.includes('const baseRows = await enrichSeoReviewProducts(shopDomain, rawBaseRows)')],
  ['product image is public', api.includes("productImage: plain.productImage || ''")],
  ['product image is stored in schema', model.includes("productImage: { type: String, default: '' }")],
  ['numeric title fallback is safe', api.includes("productTitle: reviewHasUsefulProductTitle(review) ? review.productTitle : 'Product review'")],
  ['renderer prefers product image', js.includes('review.productImage || mediaUrl(review)')],
  ['popular searches drop numeric IDs', js.includes("!/^\\\\d{6,}$/.test(String(label))")],
];
for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log(`✓ ${label}`);
}
console.log(`All Reviews refinement smoke passed: ${checks.length} checks`);
