const fs=require('fs'),assert=require('assert');
const index=fs.readFileSync('src/modules/product-creation-import/index.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const ui=fs.readFileSync('public/product-catalogue-audit.js','utf8');
const diag=fs.readFileSync('public/brand-directory-diagnostics.js','utf8');
const checks=[
 ['direct alias route',index.includes("app.use('/api/admin/brand-directory'")],
 ['diagnostic script loaded',admin.includes('/brand-directory-diagnostics.js')],
 ['same brand-card renderer reused',ui.includes('window.__elev8RenderBrandCard=brandCard')],
 ['shop domain forwarded',diag.includes('shopDomain=')],
 ['three API fallbacks',diag.includes('/api/admin/brand-directory')],
 ['clear API error',diag.includes('API routing issue')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 Brand Directory hardening smoke passed: ${checks.length} checks`);
