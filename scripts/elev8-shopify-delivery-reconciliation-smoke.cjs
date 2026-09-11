const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync('src/modules/notifications/services/shopifyNotifications.js','utf8');
const e=fs.readFileSync('src/modules/notifications/services/notificationEngine.js','utf8');
const checks=[
['Shopify delivery snapshot',s.includes('getOrderDeliverySnapshot')],
['deliveredAt detection',s.includes('Boolean(deliveredAt)')],
['displayStatus detection',s.includes('textDelivered(f.displayStatus)')],
['tracking match',s.includes('tracking.some')],
['Shopify checked first',e.indexOf('getOrderDeliverySnapshot')<e.indexOf('trackByNumber(sub.trackingNumber')],
['Track123 fallback kept',e.includes("deliverySource:tracked.status==='DELIVERED'?'track123':'tracking'")],
['stop polling delivered',e.includes("if(current.status==='DELIVERED')sub.active=false")],
['delivery source stored',e.includes('deliverySource:current.deliverySource')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 Shopify delivery reconciliation smoke passed: ${checks.length} checks`);
