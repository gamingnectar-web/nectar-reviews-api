const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync('src/app.js','utf8');
const direct=fs.readFileSync('src/routes/brandDirectoryDirect.js','utf8');
const backfill=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/storefrontBrandBackfill.service.js','utf8');
const nav=fs.readFileSync('public/elev8-context-nav.js','utf8');
const live=fs.readFileSync('public/brand-directory-live-fix.js','utf8');
const progress=fs.readFileSync('public/brand-scrape-progress.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['direct v2 route mounted',app.includes("app.use('/api/admin/brand-directory-v2'")],
 ['brands endpoint',direct.includes("router.get('/brands'")) ,
 ['scrape-job alias',direct.includes("router.post('/brands/scrape-job'")),
 ['storefront backfill endpoint',direct.includes("router.post('/generate-from-storefront'")),
 ['public storefront scan',backfill.includes('/products.json?limit=250&page=')],
 ['vendor grouping',backfill.includes('cardsForVendor')],
 ['OpenAI brand generation',backfill.includes('aiProfile')],
 ['dashboard exact sidebar navigation',nav.includes("imports:['Product Creation & Import']")),
 ['home sidebar collapsed',nav.includes('grid-template-columns:86px')],
 ['module global groups hidden',nav.includes("title==='products'||title==='developers'")),
 ['ELEV8 brand returns home',nav.includes('goHome()')],
 ['Mongo brands use v2 endpoint',live.includes('/api/admin/brand-directory-v2')],
 ['Gaming Nectar backfill button',live.includes('Backfill missing brands from Gaming Nectar')],
 ['progress tries v2 first',progress.includes("'/api/admin/brand-directory-v2'")),
 ['new UI scripts loaded',admin.includes('/elev8-context-nav.js')&&admin.includes('/brand-directory-live-fix.js')],
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 navigation + Brand Directory smoke passed: ${checks.length} checks`);
