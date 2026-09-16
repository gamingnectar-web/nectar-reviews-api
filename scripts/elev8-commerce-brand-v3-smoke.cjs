const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync('src/app.js','utf8');
const brand=fs.readFileSync('src/routes/brandDirectoryV3.js','utf8');
const commerce=fs.readFileSync('src/routes/elev8CommercePulse.js','utf8');
const rail=fs.readFileSync('public/elev8-commerce-rail.js','utf8');
const ui=fs.readFileSync('public/brand-directory-v3.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const checks=[
['brand v3 mounted',app.includes("/api/admin/brand-directory-v3")],
['brand v3 mounted before modules',app.indexOf("/api/admin/brand-directory-v3")<app.indexOf("mountPlatformModules(app")],
['commerce API mounted',app.includes("/api/admin/elev8-commerce")],
['brand health route',brand.includes("router.get('/health'")],
['Mongo brands route',brand.includes("router.get('/brands'")],
['scrape job route',brand.includes("router.post('/scrape-job'")],
['storefront backfill route',brand.includes("router.post('/backfill-storefront'")],
['6m weighted PO costs',commerce.includes('sixMonthWeightedCosts')],
['returning customer metric',commerce.includes('returningCustomerRate')],
['gross profit per order',commerce.includes('grossProfitPerOrder')],
['cost coverage metric',commerce.includes('costCoverage')],
['home rail only',rail.includes('body.e8-context-home #e8-commerce-rail')],
['brand v3 frontend',ui.includes('/api/admin/brand-directory-v3')],
['admin assets loaded',admin.includes('/elev8-commerce-rail.js')&&admin.includes('/brand-directory-v3.js')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 commerce + Brand Directory v3 smoke passed: ${checks.length} checks`);
