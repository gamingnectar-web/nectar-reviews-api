const fs = require('fs');
const path = require('path');
const root=process.cwd();
const f=(...p)=>path.join(root,...p);
const read=(...p)=>{const file=f(...p);if(!fs.existsSync(file))throw new Error(`Missing ${file}`);return fs.readFileSync(file,'utf8')};
const write=(p,s)=>fs.writeFileSync(f(...p),s);

// Extend brand schema.
let model=read('src','modules','product-creation-import','catalogue-audit','catalogueAudit.model.js');
if(!model.includes('coreProductLines:')){
  model=model.replace(
    "  productFamilies: { type: [String], default: [] },",
    "  productFamilies: { type: [String], default: [] },\n  coreProductLines: { type: [mongoose.Schema.Types.Mixed], default: [] },\n  aliases: { type: [String], default: [] },"
  );
}
write(['src','modules','product-creation-import','catalogue-audit','catalogueAudit.model.js'],model);

// Add scrape+save to service.
let service=read('src','modules','product-creation-import','catalogue-audit','catalogueAudit.service.js');
if(!service.includes("require('./brandScrape.service')")){
  service=service.replace(
    "const { ProductBrandProfile, ProductCatalogueAudit } = require('./catalogueAudit.model');",
    "const { ProductBrandProfile, ProductCatalogueAudit } = require('./catalogueAudit.model');\nconst { scrapeBrandUrl } = require('./brandScrape.service');"
  );
}
if(!service.includes('async function scrapeAndSaveBrand')){
  const marker='async function generateBrandsFromShopify({ shopDomain, onlyMissing=true }) {';
  if(!service.includes(marker))throw new Error('generateBrandsFromShopify marker missing');
  const addition=`async function scrapeAndSaveBrand({shopDomain,sourceUrl,brandName='',approve=false}){
  const scraped=await scrapeBrandUrl({sourceUrl,brandName});
  const s=scraped.suggestion||{};
  const profile=await saveBrand({shopDomain,profile:{
    ...s,
    name:s.name||scraped.brandName,
    canonicalVendor:s.canonicalVendor||scraped.brandName,
    website:s.website||scraped.website,
    productFamilies:s.productFamilies||[],
    coreProductLines:s.coreProductLines||scraped.deterministicProductLines||[],
    aliases:Array.from(new Set([...(s.aliases||[]),scraped.brandName,s.name,s.canonicalVendor].filter(Boolean))),
    sourceUrls:Array.from(new Set([sourceUrl,...(s.sourceUrls||[])])),
    source:'supplier',confidence:Number(s.confidence||0),status:approve?'approved':'draft',
    lastAuditedAt:new Date(),
    evidence:{...(s.evidence||{}),discoveredCount:scraped.discoveredCount,discoveryMethod:scraped.discoveryMethod,
      sampleProducts:scraped.productCards.slice(0,30).map(p=>({title:p.title,url:p.url,productType:p.productType}))}
  }});
  return {profile,scraped};
}

`;
  service=service.replace(marker,addition+marker);
}
if(!service.includes('scrapeAndSaveBrand,')){
  service=service.replace(
    'generateBrandsFromShopify,listAllShopifyProducts,brandMissingFields',
    'generateBrandsFromShopify,scrapeAndSaveBrand,listAllShopifyProducts,brandMissingFields'
  );
}
write(['src','modules','product-creation-import','catalogue-audit','catalogueAudit.service.js'],service);

// Nested route.
let routes=read('src','modules','product-creation-import','catalogue-audit','catalogueAudit.routes.js');
if(!routes.includes('scrapeAndSaveBrand')){
  routes=routes.replace('generateBrandsFromShopify','generateBrandsFromShopify,scrapeAndSaveBrand');
}
if(!routes.includes("router.post('/brands/scrape-url'")){
  routes=routes.replace(
    "router.post('/brands/generate-from-shopify'",
    `router.post('/brands/scrape-url',wrap(async(req,res)=>{
  const body=req.body||{};
  const result=await scrapeAndSaveBrand({shopDomain:shop(req),sourceUrl:body.sourceUrl||body.url||'',brandName:body.brandName||'',approve:Boolean(body.approve)});
  res.json(result);
}));
router.post('/brands/generate-from-shopify'`
  );
}
write(['src','modules','product-creation-import','catalogue-audit','catalogueAudit.routes.js'],routes);

// Main importer compatibility endpoints: fixes current "Not found" screen even if nested router is unavailable.
let mainRoutes=read('src','modules','product-creation-import','productCreationImport.routes.js');
if(!mainRoutes.includes("require('./catalogue-audit/catalogueAudit.service')")){
  const marker="const { healthCheckShopify, searchShopifyProducts } = require('./services/shopifyProduct.service');";
  if(!mainRoutes.includes(marker))throw new Error('main route import marker missing');
  mainRoutes=mainRoutes.replace(marker,`${marker}
const {
  listBrands: listCatalogueBrands,
  saveBrand: saveCatalogueBrand,
  scrapeAndSaveBrand: scrapeAndSaveCatalogueBrand,
} = require('./catalogue-audit/catalogueAudit.service');`);
}
if(!mainRoutes.includes("router.get('/brands'")){
  const marker="router.get('/metadata', asyncRoute(async (req, res) => {";
  if(!mainRoutes.includes(marker))throw new Error('main route insertion marker missing');
  const aliases=`// Brand Directory compatibility endpoints.
router.get('/brands', asyncRoute(async (req, res) => {
  res.json({ brands: await listCatalogueBrands({ shopDomain: shopDomainFromReq(req) }) });
}));
router.post('/brands', asyncRoute(async (req, res) => {
  const brand=await saveCatalogueBrand({shopDomain:shopDomainFromReq(req),profile:req.body?.brand||req.body||{}});
  res.json({brand});
}));
router.post('/brands/scrape-url', asyncRoute(async (req, res) => {
  const body=req.body||{};
  const result=await scrapeAndSaveCatalogueBrand({
    shopDomain:shopDomainFromReq(req),sourceUrl:body.sourceUrl||body.url||'',brandName:body.brandName||'',approve:Boolean(body.approve)
  });
  res.json(result);
}));

`;
  mainRoutes=mainRoutes.replace(marker,aliases+marker);
}
write(['src','modules','product-creation-import','productCreationImport.routes.js'],mainRoutes);

// Frontend.
let ui=read('public','product-catalogue-audit.js');

if(!ui.includes('async function rawApi')){
  ui=ui.replace(
    "  async function api(path,options={}){",
    `  async function rawApi(base,path,options={}){
    const fn=window.adminFetch||window.fetch.bind(window);
    const res=await fn(\`\${base}\${path}\`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const error=new Error(data.error||data.message||\`Request failed (\${res.status})\`);error.status=res.status;throw error}
    return data;
  }
  async function catalogueApi(path,options={}){
    try{return await rawApi(API,path,options)}
    catch(error){
      if(error.status!==404)throw error;
      if(path==='/brands')return rawApi('/api/admin/product-creation-import','/brands',options);
      if(path==='/brands/scrape-url')return rawApi('/api/admin/product-creation-import','/brands/scrape-url',options);
      throw error;
    }
  }
  async function api(path,options={}){`
  );
  const old="    const fn=window.adminFetch||window.fetch.bind(window);\n    const res=await fn(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});\n    const data=await res.json().catch(()=>({}));\n    if(!res.ok) throw new Error(data.error||data.message||`Request failed (${res.status})`);\n    return data;\n  }";
  if(ui.includes(old))ui=ui.replace(old,"    return catalogueApi(path,options);\n  }");
}

if(!ui.includes('ca-brand-source-url')){
  const old=`    brands.innerHTML=\`
      <div class="ca-hero"><div><h2 style="margin:0">Brand Directory</h2><p class="ca-muted">Reusable brand information generated from your existing Shopify catalogue and supplier audits.</p></div>
      <div class="ca-actions"><button class="ca-btn primary" id="ca-generate-brands">Generate missing brands from Shopify</button></div></div>
      <div class="ca-card"><div id="ca-brand-list" class="ca-muted">Loading…</div></div>\`;`;
  const next=`    brands.innerHTML=\`
      <div class="ca-hero"><div><h2 style="margin:0">Brand Directory</h2><p class="ca-muted">Reusable brand information and core product-line rules. MongoDB remains usable even when Shopify is unavailable.</p></div>
      <div class="ca-actions"><button class="ca-btn" id="ca-generate-brands">Generate missing brands from Shopify</button></div></div>
      <div class="ca-card">
        <h3>Scrape a brand website</h3>
        <p class="ca-muted">Paste a brand homepage or collection. ELEV8 discovers the catalogue, identifies core ranges/formulas and creates a reusable draft profile.</p>
        <div style="display:grid;grid-template-columns:minmax(220px,2fr) minmax(160px,1fr) auto;gap:10px;align-items:end">
          <label><span class="ca-label">Brand / collection URL</span><input class="ca-input" id="ca-brand-source-url" placeholder="https://x-zero.co.uk/collections/x-zero"></label>
          <label><span class="ca-label">Brand name (optional)</span><input class="ca-input" id="ca-brand-name" placeholder="X-Zero"></label>
          <button class="ca-btn primary" id="ca-scrape-brand">Scrape & create draft</button>
        </div>
        <div id="ca-brand-scrape-status" class="ca-muted" style="margin-top:10px"></div>
      </div>
      <div class="ca-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3 style="margin:0">Brands in MongoDB</h3><button class="ca-btn" id="ca-refresh-brands">Refresh</button></div><div id="ca-brand-list" class="ca-muted" style="margin-top:12px">Loading…</div></div>\`;`;
  if(!ui.includes(old))throw new Error('Brand Directory markup marker missing');
  ui=ui.replace(old,next);
}
if(!ui.includes("ca-scrape-brand')?.addEventListener")){
  ui=ui.replace(
    "$('ca-generate-brands')?.addEventListener('click',generateBrands);",
    "$('ca-generate-brands')?.addEventListener('click',generateBrands);\n    $('ca-scrape-brand')?.addEventListener('click',scrapeBrand);\n    $('ca-refresh-brands')?.addEventListener('click',loadBrands);"
  );
}
if(!ui.includes('async function scrapeBrand()')){
  const marker='  async function loadBrands(){';
  if(!ui.includes(marker))throw new Error('loadBrands marker missing');
  ui=ui.replace(marker,`  async function scrapeBrand(){
    const url=$('ca-brand-source-url')?.value.trim();
    if(!url)return alert('Paste a brand or collection URL first.');
    const btn=$('ca-scrape-brand'),status=$('ca-brand-scrape-status');
    btn.disabled=true;btn.textContent='Scraping…';
    if(status)status.textContent='Discovering products, identifying core ranges and generating reusable brand information…';
    try{
      const data=await api('/brands/scrape-url',{method:'POST',body:JSON.stringify({sourceUrl:url,brandName:$('ca-brand-name')?.value.trim()||'',approve:false})});
      if(status)status.textContent=\`Saved \${data.profile?.name||'brand'} as a draft. Found \${data.scraped?.discoveredCount||0} products and \${(data.profile?.coreProductLines||data.profile?.productFamilies||[]).length} core product lines.\`;
      await loadBrands();
    }catch(error){if(status)status.textContent=\`Brand scrape failed: \${error.message}\`}
    finally{btn.disabled=false;btn.textContent='Scrape & create draft'}
  }

${marker}`);
}
if(!ui.includes('Core product lines')){
  const start=ui.indexOf('  function brandCard(b){');
  const end=ui.indexOf('  async function loadBrands(){',start);
  if(start<0||end<0)throw new Error('brandCard markers missing');
  const replacement=`  function brandCard(b){
    const missing=[];if(!b.aboutBrand)missing.push('About Brand');if(!b.seoTitle||!b.seoDescription)missing.push('SEO');if(!(b.productFamilies||[]).length&&!((b.coreProductLines||[]).length))missing.push('Product families');
    const lines=(b.coreProductLines||[]).length
      ? (b.coreProductLines||[]).slice(0,12).map(line=>\`<span class="ca-badge" style="margin:3px">\${esc(line.name||line.productType||'Range')}</span>\`).join('')
      : (b.productFamilies||[]).slice(0,12).map(line=>\`<span class="ca-badge" style="margin:3px">\${esc(line)}</span>\`).join('');
    return \`<div class="ca-brand"><div><h3 style="margin:0">\${esc(b.name)}</h3><div class="ca-muted">\${esc(b.canonicalVendor||'')} · \${esc(b.source||'')} · \${Math.round(Number(b.confidence||0)*100)}% confidence</div>\${b.website?\`<div class="ca-muted">\${esc(b.website)}</div>\`:''}</div>
      <div>\${b.aboutBrand?\`<div>\${esc(b.aboutBrand)}</div>\`:'<span class="ca-muted">No About Brand yet.</span>'}\${lines?\`<div style="margin-top:10px"><strong>Core product lines</strong><div style="margin-top:5px">\${lines}</div></div>\`:''}\${missing.length?\`<div class="ca-muted" style="margin-top:8px">Missing: \${esc(missing.join(', '))}</div>\`:''}</div>
      <div>\${b.status==='approved'?statusBadge('matched'):statusBadge('possible_match')}</div></div>\`;
  }

`;
  ui=ui.slice(0,start)+replacement+ui.slice(end);
}
write(['public','product-catalogue-audit.js'],ui);

console.log('✓ Brand Directory API fallback added');
console.log('✓ Brand URL scraper added');
console.log('✓ Core product-line storage added');
console.log('✓ MongoDB brand cards upgraded');
