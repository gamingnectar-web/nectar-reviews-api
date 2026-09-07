const fs=require('fs'),assert=require('assert');
const idx=fs.readFileSync('src/modules/index.js','utf8');
const reg=fs.readFileSync('src/modules/moduleRegistry.js','utf8');
const proxy=fs.readFileSync('src/modules/notifications/services/appProxyAuth.js','utf8');
const routes=fs.readFileSync('src/modules/notifications/routes/storefront.routes.js','utf8');
const engine=fs.readFileSync('src/modules/notifications/services/notificationEngine.js','utf8');
const liquid=fs.readFileSync('extensions/review-widget-extension/blocks/elev8-notifications-page.liquid','utf8');
const checks=[
 ['module mounted',idx.includes('mountNotificationsModule')],['scheduler started',idx.includes('startNotificationsJobs')],['registry entry',reg.includes("id: 'notifications'")],
 ['proxy HMAC',proxy.includes("createHmac('sha256'")&&proxy.includes('timingSafeEqual')],['signed customer id',proxy.includes('logged_in_customer_id')],
 ['order ownership check',routes.includes('That order does not belong to this customer')],['tracking ownership check',routes.includes('That tracking number does not belong to this order')],
 ['restock events',engine.includes("sub.type==='restock'")],['price drop events',engine.includes("sub.type==='price_drop'")],['tracking events',engine.includes("type:'tracking'")],
 ['theme block',liquid.includes('ELEV8 Notifications Page')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log(`✓ ${n}`)}console.log(`ELEV8 notifications smoke passed: ${checks.length} checks`);
