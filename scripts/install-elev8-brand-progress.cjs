const fs=require('fs'),path=require('path');
const root=process.cwd();
const f=(...p)=>path.join(root,...p);
const read=(...p)=>{const file=f(...p);if(!fs.existsSync(file))throw new Error(`Missing ${file}`);return fs.readFileSync(file,'utf8')};
const write=(p,s)=>fs.writeFileSync(f(...p),s);

// Patch brand scraper to emit real progress.
let scrape=read('src','modules','product-creation-import','catalogue-audit','brandScrape.service.js');
scrape=scrape.replace(
  "async function scrapeBrandUrl({sourceUrl,brandName=''}) {",
  "async function scrapeBrandUrl({sourceUrl,brandName='',onProgress=async()=>{}}) {"
);
if(!scrape.includes("headline:'Supplier catalogue found'")){
  scrape=scrape.replace(
    "  const discovery=await discoverSiteProducts({rootUrl:url,maxProducts:1000});",
    `  const discovery=await discoverSiteProducts({rootUrl:url,maxProducts:1000});
  await onProgress({
    stage:'discovered',progress:20,headline:'Supplier catalogue found',
    detail:\`Found \${discovery.count||0} product URLs via \${discovery.method||'site discovery'}.\`,
    discoveredCount:discovery.count||0,
    log:'Catalogue discovered',logDetail:\`\${discovery.count||0} product URLs found\`,logStatus:'success'
  });`
  );
}
if(!scrape.includes("headline:'Reading product data'")){
  scrape=scrape.replace(
    "  for(let i=0;i<discovery.urls.length;i+=12){\n    const results=await Promise.all(discovery.urls.slice(i,i+12).map(fetchProductCard));\n    cards.push(...results.filter(Boolean));\n  }",
    `  for(let i=0;i<discovery.urls.length;i+=12){
    const chunk=discovery.urls.slice(i,i+12);
    const results=await Promise.all(chunk.map(fetchProductCard));
    cards.push(...results.filter(Boolean));
    const processed=Math.min(i+chunk.length,discovery.urls.length);
    const pct=20+Math.round((processed/Math.max(discovery.urls.length,1))*35);
    await onProgress({
      stage:'reading_products',progress:pct,headline:'Reading product data',
      detail:\`Analysed \${processed} of \${discovery.urls.length} supplier products.\`,
      discoveredCount:discovery.urls.length,processedCount:processed,
      log:processed===discovery.urls.length?'Finished reading product catalogue':'Read another group of products',
      logDetail:\`\${processed}/\${discovery.urls.length} analysed\`,
      logStatus:processed===discovery.urls.length?'success':'info'
    });
  }`
  );
}
if(!scrape.includes("headline:'Grouping core product lines'")){
  scrape=scrape.replace(
    "  const productLines=deterministicProductLines(cards);",
    `  const productLines=deterministicProductLines(cards);
  await onProgress({
    stage:'grouping_lines',progress:62,headline:'Grouping core product lines',
    detail:\`Identified \${productLines.length} reusable product families/ranges.\`,
    productLineCount:productLines.length,
    log:'Core product lines identified',logDetail:productLines.map(x=>x.name).slice(0,8).join(' · '),logStatus:'success'
  });`
  );
}
if(!scrape.includes("headline:'Generating brand intelligence'")){
  scrape=scrape.replace(
    "  const suggestion=await aiBrandAndLines({brandName:name,website,cards,productLines});",
    `  await onProgress({
    stage:'ai_enrichment',progress:72,headline:'Generating brand intelligence',
    detail:'Creating About Brand, SEO, claims and line-level defaults from supplier evidence.',
    log:'Started AI enrichment',logDetail:'Building reusable brand information'
  });
  const suggestion=await aiBrandAndLines({brandName:name,website,cards,productLines});
  await onProgress({
    stage:'ai_complete',progress:90,headline:'Brand intelligence generated',
    detail:'Brand information is ready to save.',
    productLineCount:(suggestion.coreProductLines||productLines||[]).length,
    log:'AI enrichment complete',logDetail:\`\${Math.round(Number(suggestion.confidence||0)*100)}% profile confidence\`,logStatus:'success'
  });`
  );
}
write(['src','modules','product-creation-import','catalogue-audit','brandScrape.service.js'],scrape);

// Catalogue router.
let routes=read('src','modules','product-creation-import','catalogue-audit','catalogueAudit.routes.js');
if(!routes.includes("require('./brandScrapeJob.service')")){
  routes=routes.replace(
    "const router=express.Router();",
    "const { createBrandScrapeJob, getBrandScrapeJob } = require('./brandScrapeJob.service');\n\nconst router=express.Router();"
  );
}
if(!routes.includes("router.post('/brands/scrape-job'")){
  const marker="router.post('/brands/scrape-url'";
  const idx=routes.indexOf(marker);
  if(idx<0)throw new Error('scrape-url route marker missing');
  const add=`router.post('/brands/scrape-job',wrap(async(req,res)=>{
  const body=req.body||{};
  const job=await createBrandScrapeJob({shopDomain:shop(req),sourceUrl:body.sourceUrl||body.url||'',brandName:body.brandName||''});
  res.status(202).json({job});
}));
router.get('/brands/scrape-job/:jobId',wrap(async(req,res)=>{
  const job=await getBrandScrapeJob({shopDomain:shop(req),jobId:req.params.jobId});
  res.json({job});
}));

`;
  routes=routes.slice(0,idx)+add+routes.slice(idx);
}
write(['src','modules','product-creation-import','catalogue-audit','catalogueAudit.routes.js'],routes);

// Main compatibility router.
let main=read('src','modules','product-creation-import','productCreationImport.routes.js');
if(!main.includes("require('./catalogue-audit/brandScrapeJob.service')")){
  const marker="const { healthCheckShopify, searchShopifyProducts } = require('./services/shopifyProduct.service');";
  if(!main.includes(marker))throw new Error('main import marker missing');
  main=main.replace(marker,`${marker}
const { createBrandScrapeJob, getBrandScrapeJob } = require('./catalogue-audit/brandScrapeJob.service');`);
}
if(!main.includes("router.post('/brands/scrape-job'")){
  const marker="router.post('/brands/scrape-url'";
  const idx=main.indexOf(marker);
  if(idx<0)throw new Error('main scrape-url marker missing');
  const add=`router.post('/brands/scrape-job', asyncRoute(async (req,res)=>{
  const body=req.body||{};
  const job=await createBrandScrapeJob({shopDomain:shopDomainFromReq(req),sourceUrl:body.sourceUrl||body.url||'',brandName:body.brandName||''});
  res.status(202).json({job});
}));
router.get('/brands/scrape-job/:jobId', asyncRoute(async (req,res)=>{
  const job=await getBrandScrapeJob({shopDomain:shopDomainFromReq(req),jobId:req.params.jobId});
  res.json({job});
}));

`;
  main=main.slice(0,idx)+add+main.slice(idx);
}
write(['src','modules','product-creation-import','productCreationImport.routes.js'],main);

// Load the additive progress UI from admin.html.
let admin=read('public','admin.html');
if(!admin.includes('/brand-scrape-progress.js')){
  admin=admin.replace('</body>','  <script src="/brand-scrape-progress.js?v=brand-progress-1" defer></script>\n</body>');
}
write(['public','admin.html'],admin);

console.log('✓ Real brand scrape progress backend installed');
console.log('✓ Background job endpoints installed');
console.log('✓ Activity modal loaded in admin');
