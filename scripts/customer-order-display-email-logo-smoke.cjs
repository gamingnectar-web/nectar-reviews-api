'use strict';

const fs = require('fs');

const route = fs.readFileSync('src/routes/public.js', 'utf8');
const auto = fs.readFileSync('src/modules/reviews/reviewRequestAutomation.js', 'utf8');
const storefront = fs.readFileSync('public/storefront/nectar-review-page.js', 'utf8');
const liquid = fs.readFileSync('Shopify-Liquid/assets/nectar-review-page.js', 'utf8');
const extension = fs.readFileSync('extensions/review-widget-extension/assets/nectar-review-page.js', 'utf8');

function check(ok, msg) {
  if (ok) console.log('✓ ' + msg);
  else {
    console.error('✗ ' + msg);
    process.exitCode = 1;
  }
}

check(route.includes('ELEV8_CUSTOMER_ORDER_DISPLAY_EMAIL_LOGO_FIX_V1'), 'public magic-link exposes customer-facing order name');
check(route.includes('orderName: cleanText(tokenPayload?.orderName'), 'magic-link returns signed orderName separately from orderId');

check(auto.includes('ELEV8_CUSTOMER_ORDER_DISPLAY_EMAIL_LOGO_FIX_V1'), 'email renderer fix marker exists');
check(auto.includes('nested presentation table'), 'logo renderer documents valid nested table fix');
check(!auto.includes('const logoHtml = logo ? ' + String.fromCharCode(96) + '<tr><td align="center"'), 'invalid bare logo table row is gone');
check(auto.includes('orderDate: sourceJob.orderCreatedAt || sourceJob.createdAt || sourceJob.fulfilledAt'), 'preview links use actual order-created date first');
check(auto.includes('orderDate: job.orderCreatedAt || job.createdAt || job.fulfilledAt'), 'live links use actual order-created date first');

for (const [name, source] of [
  ['Render storefront asset', storefront],
  ['Shopify-Liquid mirror', liquid],
  ['theme-extension mirror', extension],
]) {
  check(source.includes('customerOrderReference'), name + ' has friendly order reference helper');
  check(source.includes('formatCustomerOrderDate'), name + ' formats customer date');
  check(source.includes('<strong>Order:</strong>'), name + ' support modal says Order rather than Order ID');
  check(source.includes("return 'Recent order';"), name + ' never falls back to exposing a Shopify GID');
  check(source.includes("month: 'long'"), name + ' uses readable UK long date');
  check(source.includes('orderName: testPayload.orderName'), name + ' preserves signed customer-facing order name');
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Customer order display + email logo smoke test passed.');
