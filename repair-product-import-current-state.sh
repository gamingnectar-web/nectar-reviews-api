#!/usr/bin/env bash
set -euo pipefail

echo "== Repairing current partial Product Import install =="

rm -rf .one-shot-import-backup .shopify-intelligence-backup

REQ=(
  "src/modules/product-creation-import/jobs/siteImportAutomation.js"
  "src/modules/product-creation-import/productImportBatch.model.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "src/modules/product-creation-import/services/productEnrichment.service.js"
  "src/modules/product-creation-import/productCreationImport.service.js"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "public/supplier-sites-admin.js"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f"; exit 1; }
done

cat > src/modules/product-creation-import/jobs/siteImportAutomation.js <<'EOF'
async function processAutomatedSiteImports() {
  return { disabled: true, reason: 'manual-only supplier imports' };
}
function startSiteImportAutomation() { return null; }
module.exports = { startSiteImportAutomation, processAutomatedSiteImports };
EOF

python3 - <<'PY'
from pathlib import Path

p=Path("src/modules/product-creation-import/productImportBatch.model.js")
s=p.read_text()
s=s.replace("useAi: { type: Boolean, default: true }","useAi: { type: Boolean, default: false }")
s=s.replace("autoApproveReady: { type: Boolean, default: true }","autoApproveReady: { type: Boolean, default: false }")
if "backgroundEnabled:" not in s:
    s=s.replace(
        "useAi: { type: Boolean, default: false },",
        "useAi: { type: Boolean, default: false },\n"
        "    backgroundEnabled: { type: Boolean, default: false },\n"
        "    backgroundAi: { type: Boolean, default: false },"
    )
p.write_text(s)

p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()
s=s.replace(
"async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = true, autoApproveReady = true, autoCreateDrafts = false, batchSize = 12 }) {",
"async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = false, autoApproveReady = false, autoCreateDrafts = false, batchSize = 1 }) {"
)
s=s.replace("useAi:useAi !== false","useAi:useAi === true")
s=s.replace("useAi: useAi !== false","useAi: useAi === true")
s=s.replace("autoApproveReady:autoApproveReady !== false","autoApproveReady:autoApproveReady === true")
s=s.replace("autoApproveReady: autoApproveReady !== false","autoApproveReady: autoApproveReady === true")
s=s.replace("batchSize:Math.max(1,Math.min(Number(batchSize || 12),25))","batchSize:Math.max(1,Math.min(Number(batchSize || 1),10))")
s=s.replace("batchSize: Math.max(1, Math.min(Number(batchSize || 12), 25))","batchSize: Math.max(1, Math.min(Number(batchSize || 1), 10))")
s=s.replace(
"async function scanBatch({ shopDomain, batchId, itemIds = [], limit = 20, processAll = false, useAi = true })",
"async function scanBatch({ shopDomain, batchId, itemIds = [], limit = 20, processAll = false, useAi = false })"
)
s=s.replace(
"async function enrichBatch({ shopDomain, batchId, itemIds = [], useAi = true })",
"async function enrichBatch({ shopDomain, batchId, itemIds = [], useAi = false })"
)
s=s.replace(
"async function enrichItem({ shopDomain, item, defaults, useAi = true })",
"async function enrichItem({ shopDomain, item, defaults, useAi = false })"
)
old="""  const candidates = batch.items.filter((item) => {
    if (item.status === 'created' || item.status === 'creating') return false;
    if (wanted.size) return wanted.has(item.itemId);
    if (processAll) return ['queued', 'failed', 'needs_review', 'analysed', 'approved'].includes(item.status) || item.approvalStatus !== 'approved';
    return ['queued', 'failed', 'needs_review'].includes(item.status);
  });
  const selected = processAll ? candidates : candidates.slice(0, Math.max(1, Number(limit) || 20));"""
new="""  const candidates = batch.items.filter((item) => {
    if (item.status === 'created' || item.status === 'creating') return false;
    if (wanted.size) return wanted.has(item.itemId);
    return item.status === 'queued';
  });
  const selected = candidates.slice(0, Math.max(1, Number(limit) || 20));"""
s=s.replace(old,new)
p.write_text(s)

p=Path("src/modules/product-creation-import/productCreationImport.routes.js")
s=p.read_text()
s=s.replace("useAi: body.useAi !== false","useAi: body.useAi === true")
s=s.replace("autoApproveReady: body.autoApproveReady !== false","autoApproveReady: body.autoApproveReady === true")
s=s.replace("batchSize: body.batchSize || 12","batchSize: body.batchSize || 1")
p.write_text(s)

p=Path("public/supplier-sites-admin.js")
s=p.read_text()
s=s.replace("useAi:true","useAi:false")
s=s.replace("useAi: true","useAi: false")
s=s.replace("batchSize:12","batchSize:1")
s=s.replace("batchSize: 12","batchSize: 1")
s=s.replace("      await repairCatalogue();\n","")
s=s.replace("      await scanBatch(data.batch._id);\n","")
s=s.replace("      await scanUntilComplete(data.batch._id);\n","")
s=s.replace("Repair queued / failed","Run one pass")
s=s.replace("Scan missing / failed","Run one pass")
p.write_text(s)
PY

cat > src/modules/product-creation-import/services/merchantCatalogueContext.service.js <<'EOF'
const { cleanText, normaliseMetafields, parseTags } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');
const { getProductImportSettings, applySettingsToDraft } = require('./productImportSettings.service');
const { applyBrandDirectoryProfile } = require('./brandDirectoryProfile.service');
const {
  listRecentlyUsedProductVendors,
  listRecentlyUsedProductTypes,
  listRecentlyUsedThemeTemplates,
  listShopifyCollections,
  listProductSeoExamples,
  getProductMetafieldDefinitions,
  getProfileValuesFromExistingProducts,
} = require('./shopifyProduct.service');

const snapshotCache = new Map();
const profileCache = new Map();
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const PROFILE_TTL_MS = 15 * 60 * 1000;

function keyText(value=''){ return cleanText(value,220).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim(); }
function compact(value=''){ return keyText(value).replace(/\s+/g,''); }
function exactExisting(raw='', rows=[], field='value'){
  const value=cleanText(raw,180); if(!value)return '';
  const key=keyText(value), comp=compact(value);
  const hit=(rows||[]).find(row=>{
    const candidate=cleanText(typeof row==='string'?row:(row?.[field]||row?.title||row?.handle||''),180);
    return keyText(candidate)===key || compact(candidate)===comp;
  });
  return hit ? cleanText(typeof hit==='string'?hit:(hit?.[field]||hit?.title||hit?.handle||''),180) : value;
}
function titleTokens(value=''){
  return new Set(keyText(value).split(/\s+/).filter(w=>w.length>2).filter(w=>!['the','and','for','with','from','product','drink','energy','powder','tub','box','uk','stock'].includes(w)));
}
function overlapScore(a='',b=''){ const aa=titleTokens(a),bb=titleTokens(b); let n=0; aa.forEach(x=>{if(bb.has(x))n++}); return n; }
function productFamilyText(draft={}){
  return [draft.title,draft.productType,draft.productCategory,draft.handleFormat,parseTags(draft.tags).join(' '),parseTags(draft.recommendedTags).join(' '),draft.descriptionHtml].filter(Boolean).join(' ').toLowerCase();
}
function chooseSimilarExamples(draft={},examples=[]){
  const vendor=keyText(draft.vendor||''), type=keyText(draft.productType||''), family=productFamilyText(draft);
  return (examples||[]).map(product=>{
    let score=0;
    if(vendor&&keyText(product.vendor||'')===vendor)score+=50;
    if(type&&keyText(product.productType||'')===type)score+=25;
    score+=Math.min(24,overlapScore(draft.title||'',product.title||'')*8);
    const hay=`${product.title||''} ${product.productType||''}`.toLowerCase();
    if(/hydration/.test(family)&&/hydration/.test(hay))score+=15;
    if(/collector/.test(family)&&/collector/.test(hay))score+=15;
    if(/shaker|cup/.test(family)&&/shaker|cup/.test(hay))score+=15;
    if(/powder|serving|formula/.test(family)&&/powder|serving|formula/.test(hay))score+=10;
    return {product,score};
  }).filter(x=>x.score>=35).sort((a,b)=>b.score-a.score).slice(0,8);
}
function mode(values=[]){
  const counts=new Map(); values.filter(Boolean).forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
}
function mergeMetafields(existing=[],incoming=[]){
  const map=new Map();
  [...existing,...incoming].filter(Boolean).forEach(mf=>{
    if(!mf.namespace||!mf.key||mf.value===undefined||mf.value===null||mf.value==='')return;
    const k=`${mf.namespace}.${mf.key}`,cur=map.get(k);
    if(!cur||(!cur.value&&mf.value)||Number(mf.confidence||0)>Number(cur.confidence||0))map.set(k,mf);
  });
  return normaliseMetafields([...map.values()]);
}
async function getSnapshot(shopDomain){
  const cached=snapshotCache.get(shopDomain);
  if(cached&&Date.now()-cached.at<SNAPSHOT_TTL_MS)return cached.value;
  const [vendors,productTypes,templates,collections,seoExamples,metafieldDefinitions,settings]=await Promise.all([
    listRecentlyUsedProductVendors({shopDomain,limit:250}).catch(()=>[]),
    listRecentlyUsedProductTypes({shopDomain,limit:250}).catch(()=>[]),
    listRecentlyUsedThemeTemplates({shopDomain,limit:250}).catch(()=>[]),
    listShopifyCollections({shopDomain,limit:250}).catch(()=>[]),
    listProductSeoExamples({shopDomain,limit:120}).catch(()=>[]),
    getProductMetafieldDefinitions({shopDomain}).catch(()=>[]),
    getProductImportSettings({shopDomain}).catch(()=>({})),
  ]);
  const value={vendors,productTypes,templates,collections,seoExamples,metafieldDefinitions,settings};
  snapshotCache.set(shopDomain,{at:Date.now(),value}); return value;
}
async function similarMetafields({shopDomain,draft}){
  const vendor=cleanText(draft.vendor||'',120),type=cleanText(draft.productType||'',120);
  if(!vendor&&!type)return {matchedProductCount:0,metafields:[]};
  const cacheKey=`${shopDomain}|${keyText(vendor)}|${keyText(type)}|${[...titleTokens(draft.title||'')].slice(0,4).join('-')}`;
  const cached=profileCache.get(cacheKey);
  if(cached&&Date.now()-cached.at<PROFILE_TTL_MS)return cached.value;
  const value=await getProfileValuesFromExistingProducts({shopDomain,tags:[],vendor,productType:type,title:draft.title||''}).catch(()=>({matchedProductCount:0,metafields:[]}));
  profileCache.set(cacheKey,{at:Date.now(),value}); return value;
}
function allowedProfileMetafield(mf={},draft={}){
  const compound=`${mf.namespace}.${mf.key}`.toLowerCase();
  if(/barcode|gtin|sku|price|cost|inventory|quantity|mpn/.test(compound))return false;
  const family=productFamilyText(draft);
  const drink=/drink|powder|hydration|formula|servings?|caffeine|flavour|flavor/.test(family);
  if(!drink&&['core.product_flavour','core.flavour_family','core.flavour_profile','core.formula_version','core.grouped_profiles','core.sourness','core.sweetness','nutrition.servings','nutrition.serving_size','nutrition.calories_per_serving','nutrition.caffeine_mg_per_serving','nutrition.sugar_g_per_serving','nutrition.carbs_g_per_serving','nutrition.sodium_mg_per_serving','nutrition.dietary_labels','nutrition.warning_labels','custom.ingredients_label'].includes(compound))return false;
  if(compound==='core.about_brand')return true;
  return /^(core|custom|nutrition)\./.test(compound);
}
function collectionSuggestions(draft={},collections=[]){
  const hay=[draft.vendor,draft.productType,draft.productCategory,draft.title].filter(Boolean).join(' ').toLowerCase();
  const suggestions=[];
  for(const c of collections||[]){
    const title=cleanText(c.title||'',120),handle=cleanText(c.handle||'',120);
    const words=keyText(title).split(/\s+/).filter(w=>w.length>3);
    if(words.some(w=>hay.includes(w)))suggestions.push(handle||title);
  }
  return [...new Set([...(draft.collections||[]),...suggestions])].slice(0,20);
}
async function applyMerchantCatalogueContext({shopDomain,draft={}}){
  let next=normaliseDraftProduct(draft||{});
  if(!shopDomain||!next.title)return next;
  const snapshot=await getSnapshot(shopDomain);
  if(next.vendor)next.vendor=exactExisting(next.vendor,snapshot.vendors,'vendor');
  if(next.productType)next.productType=exactExisting(next.productType,snapshot.productTypes,'productType');
  next=await applyBrandDirectoryProfile({shopDomain,draft:next}).catch(()=>next);
  const similar=chooseSimilarExamples(next,snapshot.seoExamples), examples=similar.map(x=>x.product);
  if(!next.productType&&examples.length)next.productType=mode(examples.map(x=>cleanText(x.productType||'',120)));
  if(!next.themeTemplate){
    const likely=mode((snapshot.templates||[]).filter(x=>x.template&&x.template!=='default').slice(0,5).map(x=>x.template));
    if(likely&&examples.length)next.themeTemplate=likely;
  }
  next.collections=collectionSuggestions(next,snapshot.collections);
  const profile=await similarMetafields({shopDomain,draft:next});
  const reusable=(profile.metafields||[]).filter(mf=>allowedProfileMetafield(mf,next)).map(mf=>({...mf,source:'shopify-catalogue-pattern',confidence:Math.min(Number(mf.confidence||0),0.92)}));
  next.metafields=mergeMetafields(next.metafields||[],reusable);
  next=applySettingsToDraft(next,snapshot.settings||{});
  next.enrichment={...(next.enrichment||{}),merchantCatalogue:{source:'existing-shopify-products',similarProductCount:examples.length,similarProducts:examples.slice(0,5).map(x=>({title:x.title||'',handle:x.handle||'',vendor:x.vendor||'',productType:x.productType||''})),matchedProfileProducts:Number(profile.matchedProductCount||0),appliedWithoutAi:true,checkedAt:new Date().toISOString()}};
  return normaliseDraftProduct(next);
}
module.exports={applyMerchantCatalogueContext,getSnapshot};
EOF

python3 - <<'PY'
from pathlib import Path

p=Path("src/modules/product-creation-import/services/productEnrichment.service.js")
s=p.read_text()
anchor="const { preserveLockedFields } = require('./fieldAuthority.service');"
imp="const { applyMerchantCatalogueContext } = require('./merchantCatalogueContext.service');"
if imp not in s:
    s=s.replace(anchor,anchor+"\n"+imp)
s=s.replace("async function suggestProductProfile({ shopDomain, draft }) {","async function suggestProductProfile({ shopDomain, draft, useAi = false }) {")
s=s.replace("  const ai = await aiSuggestProductProfile({ draft: normalised, metadata });","  const ai = useAi === true ? await aiSuggestProductProfile({ draft: normalised, metadata }) : {};")
old="""async function enrichProductDraft({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const suggestion = await suggestProductProfile({ shopDomain, draft: normalised });"""
new="""async function enrichProductDraft({ shopDomain, draft, useAi = false }) {
  let normalised = normaliseDraftProduct(draft || {});
  normalised = await applyMerchantCatalogueContext({ shopDomain, draft: normalised });
  const suggestion = await suggestProductProfile({ shopDomain, draft: normalised, useAi });"""
if old in s:
    s=s.replace(old,new)
p.write_text(s)

p=Path("src/modules/product-creation-import/productCreationImport.service.js")
s=p.read_text()
s=s.replace("async function enrichImportDraftFully({ shopDomain, draft, useAi = true }) {","async function enrichImportDraftFully({ shopDomain, draft, useAi = false }) {")
s=s.replace("normalised = await enrichProductDraft({ shopDomain, draft: normalised });","normalised = await enrichProductDraft({ shopDomain, draft: normalised, useAi });")
s=s.replace("enrichImportDraftFully({ shopDomain, draft: extracted, useAi: true })","enrichImportDraftFully({ shopDomain, draft: extracted, useAi: false })")
s=s.replace("enrichImportDraftFully({ shopDomain, draft: { ...draft, source: draft?.source || 'manual' }, useAi: true })","enrichImportDraftFully({ shopDomain, draft: { ...draft, source: draft?.source || 'manual' }, useAi: false })")
s=s.replace("enrichProductDraft({ shopDomain, draft: sourceDraft })","enrichProductDraft({ shopDomain, draft: sourceDraft, useAi: false })")
p.write_text(s)

p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()
s=s.replace("await enrichProductDraft({ shopDomain, draft });","await enrichProductDraft({ shopDomain, draft, useAi });")
s=s.replace("enrichProductDraft({ shopDomain, draft })","enrichProductDraft({ shopDomain, draft, useAi })")
p.write_text(s)
PY

node --check src/modules/product-creation-import/jobs/siteImportAutomation.js
node --check src/modules/product-creation-import/productImportBatch.model.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/services/merchantCatalogueContext.service.js
node --check src/modules/product-creation-import/services/productEnrichment.service.js
node --check src/modules/product-creation-import/productCreationImport.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js

npm run deploy:preflight

echo
echo "Repair complete."
echo "Run: git diff --check && git diff --stat"
