'use strict';

const fs = require('fs');

const publicRoute = fs.readFileSync('src/routes/public.js', 'utf8');
const service = fs.readFileSync('src/modules/reviews/reviewIdentity.service.js', 'utf8');
const block = fs.readFileSync('extensions/review-widget-extension/blocks/review_identity.liquid', 'utf8');
const js = fs.readFileSync('extensions/review-widget-extension/assets/review-identity.js', 'utf8');
const css = fs.readFileSync('extensions/review-widget-extension/assets/review-identity.css', 'utf8');
const locale = fs.readFileSync('extensions/review-widget-extension/locales/en.default.schema.json', 'utf8');

function check(ok, msg) {
  if (ok) console.log('✓ ' + msg);
  else {
    console.error('✗ ' + msg);
    process.exitCode = 1;
  }
}

check(service.includes("reviewScope: 'product'"), 'identity count is product-review only');
check(service.includes("status: 'accepted'"), 'identity count only includes accepted reviews');
check(service.includes("isTestReview: { $ne: true }"), 'identity count excludes test reviews');
check(service.includes("itemId: { $ne: '__site__' }"), 'identity count excludes site-level review records');

check(publicRoute.includes("'/review-identity-summary'"), 'new read-only identity summary endpoint exists');
check(publicRoute.includes('getProductReviewIdentitySummary'), 'endpoint uses isolated identity service');

check(block.includes('"target": "content"'), 'theme app block uses current content target');
check(block.includes('"javascript": "review-identity.js"'), 'block loads Shopify-hosted JS asset');
check(block.includes('"stylesheet": "review-identity.css"'), 'block loads Shopify-hosted CSS asset');
check(block.includes('data-text-template'), 'merchant wording template is passed to the widget');
check(block.includes('t:review_identity.settings.text_template.label'), 'theme editor labels use schema translations');

check(js.includes('/review-identity-summary?shopDomain='), 'widget requests the product-review identity endpoint');
check(js.includes('{count}') && js.includes('{average}'), 'widget supports count and average wording placeholders');
check(js.includes("document.addEventListener('shopify:section:load'"), 'widget refreshes in the theme editor');
check(css.includes('.elev8-review-identity--pill'), 'pill layout exists');
check(css.includes('.elev8-review-identity--statement'), 'statement layout exists');
check(css.includes('.elev8-review-identity--badge'), 'badge layout exists');

check(locale.includes('"Review identity"'), 'schema locale exists');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 Review Identity widget smoke test passed.');
