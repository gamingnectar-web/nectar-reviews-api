const fs=require('fs'),assert=require('assert');
const scrape=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/brandScrape.service.js','utf8');
const backfill=fs.readFileSync('src/modules/product-creation-import/catalogue-audit/storefrontBrandBackfill.service.js','utf8');
const rules=fs.readFileSync('src/modules/product-creation-import/services/brandRules.service.js','utf8');
const ui=fs.readFileSync('public/brand-directory-workspace.js','utf8');
const guard=fs.readFileSync('public/elev8-view-isolation.js','utf8');
const admin=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['scrape uses product lines not SEO focus',scrape.includes('PRODUCT-LINE RULE DIRECTORY')&&!scrape.includes('seoTitle:`')],
 ['scrape line matchers',scrape.includes('matcherForFamily')],
 ['backfill public + admin fallback',backfill.includes('fetchPublicProducts')&&backfill.includes('fetchAdminProducts')],
 ['backfill isolates vendor failures',backfill.includes('errors.push({vendor,error:error.message})')],
 ['line rules applied on import',rules.includes('for(const line of profile.coreProductLines')],
 ['workspace brand default tab',ui.includes('Brand defaults')],
 ['workspace product-line tabs',ui.includes('data-bdw-tab="line-')],
 ['workspace Shopify metafield assessment',ui.includes("importApi('/metadata')")&&ui.includes('Brand metafields')],
 ['workspace About Brand universal rule',ui.includes('Add About Brand rule')],
 ['workspace correct v3 scrape route',ui.includes("brandApi('/scrape-job'")],
 ['workspace correct backfill route',ui.includes("brandApi('/backfill-storefront'")],
 ['single workspace loaded',admin.includes('/brand-directory-workspace.js')],
 ['legacy progress removed',!admin.includes('/brand-scrape-progress.js')],
 ['legacy route fix removed',!admin.includes('/brand-scrape-route-fix.js')],
 ['view isolation loaded',admin.includes('/elev8-view-isolation.js')&&guard.includes('isolate(id)')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 Brand Directory live rework smoke passed: ${checks.length} checks`);
