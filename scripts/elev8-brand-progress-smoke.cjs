const fs=require('fs'),assert=require('assert');
const jobModel=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/brandScrapeJob.model.js','utf8');
const jobService=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/brandScrapeJob.service.js','utf8');
const scraper=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/brandScrape.service.js','utf8');
const routes=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/catalogueAudit.routes.js','utf8');
const main=fs.readFileSync('src/modules/product-creation-import/productCreationImport.routes.js','utf8');
const ui=fs.readFileSync('public/brand-scrape-progress.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['job model',jobModel.includes('product_brand_scrape_jobs')],
 ['job runner',jobService.includes('createBrandScrapeJob')],
 ['discovery progress',scraper.includes("stage:'discovered'")],
 ['product progress',scraper.includes("stage:'reading_products'")],
 ['line progress',scraper.includes("stage:'grouping_lines'")],
 ['AI progress',scraper.includes("stage:'ai_enrichment'")],
 ['nested job route',routes.includes("router.post('/brands/scrape-job'")],
 ['compat job route',main.includes("router.post('/brands/scrape-job'")],
 ['modal UI',ui.includes('ebp-modal')],
 ['activity feed',ui.includes('ebp-feed')],
 ['polling',ui.includes('async function poll')],
 ['admin loads progress UI',admin.includes('/brand-scrape-progress.js')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 Brand progress smoke passed: ${checks.length} checks`);
