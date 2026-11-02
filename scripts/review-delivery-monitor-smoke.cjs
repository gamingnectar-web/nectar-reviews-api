'use strict';
const fs = require('fs');
const s = fs.readFileSync('src/modules/reviews/reviewRequestAutomation.js','utf8');
function check(ok,msg){
  if(ok) console.log('✓ '+msg);
  else { console.error('✗ '+msg); process.exitCode=1; }
}
check(s.includes('ELEV8_REVIEW_DELIVERY_RECONCILIATION_FIX_V1'),'fix marker present');
check(s.includes("fulfillments(first: 50) {\n        id\n        status"),'fulfillments queried as flat list');
check(!s.includes("fulfillments(first: 50) {\n        nodes {"),'invalid fulfillments.nodes removed');
check(s.includes("Array.isArray(order.fulfillments) ? order.fulfillments : []"),'flat response parser present');
check(s.includes("['DELIVERED', 'PICKED_UP'].includes(displayStatus)"),'delivered and pickup handled');
check(s.includes("order.updatedAt || order.processedAt || order.createdAt"),'tag fallback uses Shopify timestamp');
check(s.includes("const eligibility = reviewRequestEligibility(eligibilityDate, cfg);"),'reconciliation checks age safety');
check(s.includes("deliveredFulfillments.length === active.length"),'split shipments require all active fulfillments');
check(s.includes("events(first: 20, reverse: true) { nodes"),'events remains a connection');
if(process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 review delivery reconciliation smoke test passed.');
