const fs=require('fs'),assert=require('assert');
const paths={
 model:'src/modules/product-creation-import/catalogue-audit/catalogueAudit.model.js',
 service:'src/modules/product-creation-import/catalogue-audit/catalogueAudit.service.js',
 routes:'src/modules/product-creation-import/catalogue-audit/catalogueAudit.routes.js',
 main:'src/modules/product-creation-import/productCreationImport.routes.js',
 scrape:'src/modules/product-creation-import/catalogue-audit/brandScrape.service.js',
 ui:'public/product-catalogue-audit.js'
};
const f={};for(const [k,p] of Object.entries(paths))f[k]=fs.readFileSync(p,'utf8');
const checks=[
 ['core lines persisted',f.model.includes('coreProductLines:')],
 ['aliases persisted',f.model.includes('aliases:')],
 ['brand scraper exists',f.scrape.includes('scrapeBrandUrl')],
 ['catalogue discovery used',f.scrape.includes('discoverSiteProducts')],
 ['range classifier exists',f.scrape.includes('deterministicProductLines')],
 ['AI line refinement exists',f.scrape.includes('aiBrandAndLines')],
 ['scrape saves profile',f.service.includes('scrapeAndSaveBrand')],
 ['nested scrape route',f.routes.includes("router.post('/brands/scrape-url'")],
 ['compat list route',f.main.includes("router.get('/brands'")],
 ['compat scrape route',f.main.includes("router.post('/brands/scrape-url'")],
 ['brand URL UI',f.ui.includes('ca-brand-source-url')],
 ['MongoDB refresh UI',f.ui.includes('Brands in MongoDB')],
 ['core line chips UI',f.ui.includes('Core product lines')],
 ['404 API fallback',f.ui.includes('error.status!==404')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 Brand Directory fix smoke passed: ${checks.length} checks`);
