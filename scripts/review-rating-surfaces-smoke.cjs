'use strict';

const fs = require('fs');

const service = fs.readFileSync('src/modules/reviews/reviewCardSummary.service.js', 'utf8');
const publicRoute = fs.readFileSync('src/routes/public.js', 'utf8');
const cardJs = fs.readFileSync('public/storefront/elev8-card-rating.js', 'utf8');
const summaryBlock = fs.readFileSync('extensions/review-widget-extension/blocks/product_review_summary.liquid', 'utf8');
const summaryJs = fs.readFileSync('extensions/review-widget-extension/assets/product-review-summary.js', 'utf8');
const summaryCss = fs.readFileSync('extensions/review-widget-extension/assets/product-review-summary.css', 'utf8');
const fullWidget = fs.readFileSync('extensions/review-widget-extension/blocks/star_rating.liquid', 'utf8');

function check(ok, msg) {
  if (ok) console.log('✓ ' + msg);
  else {
    console.error('✗ ' + msg);
    process.exitCode = 1;
  }
}

check(service.includes("status: 'accepted'"), 'card summaries only count accepted reviews');
check(service.includes('isTestReview: { $ne: true }'), 'card summaries exclude test reviews');
check(publicRoute.includes("router.get('/reviews/card-summaries'"), 'batch product-card summary endpoint exists');

check(cardJs.includes('/reviews/card-summaries?'), 'card JS uses one batch summary endpoint');
check(cardJs.includes('/widget/config?'), 'card JS respects existing ELEV8 card style settings');
check(cardJs.includes('MutationObserver'), 'card JS supports dynamically loaded product grids');

check(summaryBlock.includes('"target": "section"'), 'product page summary is a theme app block');
check(summaryBlock.includes('"javascript": "product-review-summary.js"'), 'product page summary loads extension JS');
check(summaryBlock.includes('data-target-id="elev8-reviews-{{ product.id }}"'), 'product page summary targets full review widget');
check(summaryJs.includes('scrollIntoView'), 'product page summary scrolls to reviews');
check(summaryCss.includes('.elev8-product-review-summary__stars-fill'), 'product page summary supports live star fill');
check(fullWidget.includes('id="elev8-reviews-{{ product.id }}"'), 'full ELEV8 review widget has stable product anchor');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 product rating surfaces smoke test passed.');
