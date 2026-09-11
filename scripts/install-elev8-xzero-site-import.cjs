const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

function patchModel(){let s=R('src','modules','product-creation-import','productImportBatch.model.js');if(!s.includes('automation: {'))s=s.replace("  errors: { type: [String], default: [] },",`  automation: {
    siteImport: { type: Boolean, default: false },
    supplierProfile: { type: String, default: '' },
    useAi: { type: Boolean, default: true },
    autoApproveReady: { type: Boolean, default: true },
    autoCreateDrafts: { type: Boolean, default: false },
    batchSize: { type: Number, default: 12, min: 1, max: 25 },
    discoveryMethod: { type: String, default: '' },
    discoveredCount: { type: Number, default: 0 }
  },
  errors: { type: [String], default: [] },`);W(['src','modules','product-creation-import','productImportBatch.model.js'],s);}

function patchBatchService(){let s=R('src','modules','product-creation-import','services','productImportBatch.service.js');if(!s.includes("require('./supplierProfile.service')"))s=s.replace("const { markMerchantEdits, preserveLockedFields } = require('./fieldAuthority.service');","const { markMerchantEdits, preserveLockedFields } = require('./fieldAuthority.service');\nconst { applySupplierProfile, supplierDefaultsForUrl, profileForUrl } = require('./supplierProfile.service');\nconst { mapSupplierFactsToExistingMetafields } = require('./supplierFactMapper.service');\nconst { discoverSiteProducts } = require('./siteCatalogDiscovery.service');\nconst { searchShopifyProducts } = require('./shopifyProduct.service');");
if(!s.includes('async function createSiteImportBatch')){const marker='async function listBatches({ shopDomain, limit = 30 }) {';if(!s.includes(marker))throw new Error('listBatches marker missing');const fn=`async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = true, autoApproveReady = true, autoCreateDrafts = false, batchSize = 12 }) {
  const discovery = await discoverSiteProducts({ rootUrl, maxProducts });
  const defaults = { ...discovery.supplierDefaults, ...supplierDefaultsForUrl(rootUrl) };
  const result = await createBatch({ shopDomain, name: name || \`${'${defaults.vendor || defaults.supplierName || \'Supplier\'}'} full site import\`, defaults, links: discovery.urls });
  result.batch.automation = { siteImport: true, supplierProfile: profileForUrl(rootUrl), useAi: useAi !== false, autoApproveReady: autoApproveReady !== false, autoCreateDrafts: Boolean(autoCreateDrafts), batchSize: Math.max(1, Math.min(Number(batchSize || 12), 25)), discoveryMethod: discovery.method, discoveredCount: discovery.count };
  await result.batch.save();
  return { ...result, discovery: { method: discovery.method, count: discovery.count, rootUrl: discovery.rootUrl } };
}

`;s=s.replace(marker,fn+marker);}
if(!s.includes('async function detectExistingProduct')){const marker='async function enrichItem({ shopDomain, item, defaults, useAi = true }) {';if(!s.includes(marker))throw new Error('enrichItem marker missing');const helper=`async function detectExistingProduct({ shopDomain, draft }) {
  const title = cleanText(draft.title || '', 180); if (!title) return null;
  const candidates = await searchShopifyProducts({ shopDomain, q: title, first: 8 }).catch(() => []);
  const norm = (v='') => cleanText(v,220).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const titleKey=norm(title), handleKey=norm(draft.handle||''), vendorKey=norm(draft.vendor||'');
  const exact=candidates.find(product => (norm(product.title)===titleKey || (handleKey && norm(product.handle)===handleKey)) && (!vendorKey || !product.vendor || norm(product.vendor)===vendorKey));
  return exact ? { exact:true, confidence:1, id:exact.id, title:exact.title, handle:exact.handle, image:exact.image||'', reason:'Exact title/handle match already exists in Shopify.' } : null;
}

`;s=s.replace(marker,helper+marker);}
const p1='  draft = applyMerchantSeoPattern(applyLockedBatchDefaults(draft, defaults), defaults);';if(!s.includes('draft = applySupplierProfile(draft);')){if(!s.includes(p1))throw new Error('supplier insertion marker missing');s=s.replace(p1,`  draft = applySupplierProfile(draft);\n${p1}`);}
const meta='  const metadata = await getProductImportMetadata({ shopDomain }).catch(() => ({}));';if(!s.includes('mapSupplierFactsToExistingMetafields(draft, metadata)'))s=s.replace(meta,`${meta}\n  draft = mapSupplierFactsToExistingMetafields(draft, metadata);`);
const final='  item.title = draft.title;';if(!s.includes('const existingProduct = await detectExistingProduct'))s=s.replace(final,`  const existingProduct = await detectExistingProduct({ shopDomain, draft });\n  if (existingProduct) draft.suggestions = { ...(draft.suggestions || {}), existingProduct };\n\n${final}`);
const status="  item.status = item.validation.status === 'ready' ? 'analysed' : 'needs_review';";if(s.includes(status)&&!s.includes("existingProduct ? 'skipped'"))s=s.replace(status,"  item.status = existingProduct ? 'skipped' : (item.validation.status === 'ready' ? 'analysed' : 'needs_review');\n  if (existingProduct) { item.approvalStatus = 'rejected'; item.error = 'Skipped: an exact Shopify product already exists.'; }");
if(!s.includes('  createSiteImportBatch,'))s=s.replace('module.exports = {\n  createBatch,','module.exports = {\n  createBatch,\n  createSiteImportBatch,');W(['src','modules','product-creation-import','services','productImportBatch.service.js'],s);}

function patchRoutes(){let s=R('src','modules','product-creation-import','productCreationImport.routes.js');if(!s.includes('createSiteImportBatch,'))s=s.replace('  createBatch,\n  listBatches,','  createBatch,\n  createSiteImportBatch,\n  listBatches,');if(!s.includes("router.post('/batches/site-import'")){const marker="router.get('/batches', asyncRoute(async (req, res) => {";if(!s.includes(marker))throw new Error('routes marker missing');const route=`router.post('/batches/site-import', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await createSiteImportBatch({ shopDomain: shopDomainFromReq(req), rootUrl: body.rootUrl || body.url || body.supplierUrl || '', name: body.name || '', maxProducts: body.maxProducts || 500, useAi: body.useAi !== false, autoApproveReady: body.autoApproveReady !== false, autoCreateDrafts: Boolean(body.autoCreateDrafts), batchSize: body.batchSize || 12 });
  res.json(result);
}));

`;s=s.replace(marker,route+marker);}W(['src','modules','product-creation-import','productCreationImport.routes.js'],s);}

function patchIndex(){let s=R('src','modules','product-creation-import','index.js');if(!s.includes("require('./jobs/siteImportAutomation')"))s=s.replace("const productCreationImportRoutes = require('./productCreationImport.routes');","const productCreationImportRoutes = require('./productCreationImport.routes');\nconst { startSiteImportAutomation } = require('./jobs/siteImportAutomation');");s=s.replace('function startProductCreationImportJobs() {}','function startProductCreationImportJobs() { return startSiteImportAutomation(); }');W(['src','modules','product-creation-import','index.js'],s);}

patchModel();patchBatchService();patchRoutes();patchIndex();console.log('ELEV8 X-Zero full-site import automation installed');
