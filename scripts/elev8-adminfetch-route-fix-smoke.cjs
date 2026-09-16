const fs=require('fs'),assert=require('assert');
const adminFetch=fs.readFileSync('public/admin.js','utf8');
const brand=fs.readFileSync('public/brand-directory-v3.js','utf8');
const commerce=fs.readFileSync('public/elev8-commerce-rail.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const checks=[
['adminFetch prepends /api',adminFetch.includes("fetch(`${API}${withShop(path)}`")],
['brand uses /admin relative path',brand.includes("window.adminFetch(`/admin/brand-directory-v3")],
['brand does not double-prefix /api',!brand.includes("window.adminFetch(`/api/admin/brand-directory-v3")],
['commerce uses /admin relative path',commerce.includes("window.adminFetch('/admin/elev8-commerce/commerce-pulse')")],
['commerce does not double-prefix /api',!commerce.includes("window.adminFetch('/api/admin/elev8-commerce")],
['legacy diagnostics removed',!admin.includes('/brand-directory-diagnostics.js')],
['legacy live-fix removed',!admin.includes('/brand-directory-live-fix.js')],
['route-fix controller loaded',admin.includes('/brand-scrape-route-fix.js')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 adminFetch route fix passed: ${checks.length} checks`);
