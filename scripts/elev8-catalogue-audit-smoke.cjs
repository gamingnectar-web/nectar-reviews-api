const fs=require('fs'),assert=require('assert');
const files={
 model:fs.readFileSync('src/modules/product-creation-import/catalogue-audit/catalogueAudit.model.js','utf8'),
 service:fs.readFileSync('src/modules/product-creation-import/catalogue-audit/catalogueAudit.service.js','utf8'),
 routes:fs.readFileSync('src/modules/product-creation-import/catalogue-audit/catalogueAudit.routes.js','utf8'),
 index:fs.readFileSync('src/modules/product-creation-import/index.js','utf8'),
 ui:fs.readFileSync('public/product-catalogue-audit.js','utf8'),
 brandApply:fs.readFileSync('src/modules/product-creation-import/services/brandDirectoryProfile.service.js','utf8'),
 admin:fs.readFileSync('public/admin.html','utf8')
};
const checks=[
 ['brand profile model',files.model.includes('ProductBrandProfile')],
 ['catalogue audit model',files.model.includes('ProductCatalogueAudit')],
 ['supplier discovery',files.service.includes('discoverSiteProducts')],
 ['Shopify catalogue comparison',files.service.includes('listAllShopifyProducts')],
 ['coverage score',files.service.includes('coveragePercent')],
 ['brand suggestion via OpenAI',files.service.includes('openAiBrandSuggestion')],
 ['generate brands from Shopify',files.service.includes('generateBrandsFromShopify')],
 ['audit route',files.routes.includes("router.post('/audit'")],
 ['brand directory route',files.routes.includes("router.get('/brands'")],
 ['module mounted',files.index.includes("product-creation-import/catalogue")],
 ['Site Audit UI',files.ui.includes('Site Audit')],
 ['Brand Directory UI',files.ui.includes('Brand Directory')],
 ['missing products batch action',files.ui.includes('Import missing products')],
 ['admin script loaded',files.admin.includes('/product-catalogue-audit.js')],
 ['brand profiles feed future imports',files.brandApply.includes('applyBrandDirectoryProfile')],
 ['native importer tabs can be restored',files.ui.includes("removeProperty('display')")]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 catalogue audit smoke passed: ${checks.length} checks`);
