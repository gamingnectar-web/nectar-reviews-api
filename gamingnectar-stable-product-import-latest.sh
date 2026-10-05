#!/usr/bin/env bash
set -euo pipefail

echo "=============================================================="
echo " GamingNectar Product Import - Stable Consolidated Release"
echo "=============================================================="
echo
echo "This release applies:"
echo "  1. Strict one-shot/manual supplier imports"
echo "  2. No background retry timers"
echo "  3. AI disabled unless explicitly requested"
echo "  4. Shopify catalogue intelligence for all import methods"
echo "  5. Brand Directory + merchant catalogue conventions first"
echo
echo "Starting from the current clean-main codebase..."
echo

set -euo pipefail

echo "== Installing strict one-shot supplier import safety patch =="

REQ=(
  "src/modules/product-creation-import/jobs/siteImportAutomation.js"
  "src/modules/product-creation-import/productImportBatch.model.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "public/supplier-sites-admin.js"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

mkdir -p .one-shot-import-backup
cp src/modules/product-creation-import/jobs/siteImportAutomation.js .one-shot-import-backup/
cp src/modules/product-creation-import/productImportBatch.model.js .one-shot-import-backup/
cp src/modules/product-creation-import/services/productImportBatch.service.js .one-shot-import-backup/
cp public/supplier-sites-admin.js .one-shot-import-backup/

# ------------------------------------------------------------------
# 1) Completely disable scheduled supplier-site processing.
# ------------------------------------------------------------------
cat > src/modules/product-creation-import/jobs/siteImportAutomation.js <<'EOF'
async function processAutomatedSiteImports() {
  // Intentionally disabled.
  // Supplier imports are user-triggered, one-shot operations only.
  // A failed or needs_review product must never be retried by a timer.
  return { disabled: true, reason: 'manual-only supplier imports' };
}

function startSiteImportAutomation() {
  // No timer. No interval. No background retries.
  return null;
}

module.exports = { startSiteImportAutomation, processAutomatedSiteImports };
EOF

# ------------------------------------------------------------------
# 2) Safe defaults in Mongo schema.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path

p=Path("src/modules/product-creation-import/productImportBatch.model.js")
s=p.read_text()

s=s.replace(
"""    useAi: { type: Boolean, default: true },
    autoApproveReady: { type: Boolean, default: true },""",
"""    useAi: { type: Boolean, default: false },
    backgroundEnabled: { type: Boolean, default: false },
    backgroundAi: { type: Boolean, default: false },
    autoApproveReady: { type: Boolean, default: false },"""
)

p.write_text(s)
print("Safe automation defaults applied")
PY

# ------------------------------------------------------------------
# 3) Enforce one-shot semantics in the batch service.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

s=s.replace(
"async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = true, autoApproveReady = true, autoCreateDrafts = false, batchSize = 12 }) {",
"async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = false, autoApproveReady = false, autoCreateDrafts = false, batchSize = 1 }) {"
)

# Patch automation block(s)
s=s.replace(
"""    useAi:useAi !== false,
    autoApproveReady:autoApproveReady !== false,
    autoCreateDrafts:Boolean(autoCreateDrafts),
    batchSize:Math.max(1,Math.min(Number(batchSize || 12),25)),""",
"""    useAi:useAi === true,
    backgroundEnabled:false,
    backgroundAi:false,
    autoApproveReady:autoApproveReady === true,
    autoCreateDrafts:Boolean(autoCreateDrafts),
    batchSize:Math.max(1,Math.min(Number(batchSize || 1),10)),"""
)

s=s.replace(
"""result.batch.automation = { siteImport: true, supplierProfile: profileForUrl(rootUrl), useAi: useAi !== false, autoApproveReady: autoApproveReady !== false, autoCreateDrafts: Boolean(autoCreateDrafts), batchSize: Math.max(1, Math.min(Number(batchSize || 12), 25)), discoveryMethod: discovery.method, discoveredCount: discovery.count };""",
"""result.batch.automation = { siteImport: true, supplierProfile: profileForUrl(rootUrl), useAi: useAi === true, backgroundEnabled: false, backgroundAi: false, autoApproveReady: autoApproveReady === true, autoCreateDrafts: Boolean(autoCreateDrafts), batchSize: Math.max(1, Math.min(Number(batchSize || 1), 10)), discoveryMethod: discovery.method, discoveredCount: discovery.count };"""
)

old="""async function scanBatch({ shopDomain, batchId, itemIds = [], limit = 20, processAll = false, useAi = true }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const wanted = new Set(asArray(itemIds));
  const candidates = batch.items.filter((item) => {
    if (item.status === 'created' || item.status === 'creating') return false;
    if (wanted.size) return wanted.has(item.itemId);
    if (processAll) return ['queued', 'failed', 'needs_review', 'analysed', 'approved'].includes(item.status) || item.approvalStatus !== 'approved';
    return ['queued', 'failed', 'needs_review'].includes(item.status);
  });
  const selected = processAll ? candidates : candidates.slice(0, Math.max(1, Number(limit) || 20));"""

new="""async function scanBatch({ shopDomain, batchId, itemIds = [], limit = 20, processAll = false, useAi = false }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const wanted = new Set(asArray(itemIds));

  const candidates = batch.items.filter((item) => {
    if (item.status === 'created' || item.status === 'creating') return false;

    // Explicit item IDs are the only way to re-run a failed/review item.
    if (wanted.size) return wanted.has(item.itemId);

    // Default/bulk scans are first-attempt only.
    // failed / needs_review / analysed / approved are terminal until a user
    // explicitly targets them.
    return item.status === 'queued';
  });

  const selected = candidates.slice(0, Math.max(1, Number(limit) || 20));"""

if old not in s:
    raise SystemExit("Could not find scanBatch block in expected clean-main shape.")
s=s.replace(old,new)

s=s.replace(
"async function enrichBatch({ shopDomain, batchId, itemIds = [], useAi = true }) {",
"async function enrichBatch({ shopDomain, batchId, itemIds = [], useAi = false }) {"
)

p.write_text(s)
print("One-shot scan semantics applied")
PY

# ------------------------------------------------------------------
# 4) Frontend: never auto-scan after import, AI off by default.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p=Path("public/supplier-sites-admin.js")
s=p.read_text()

s=s.replace("rootUrl,name,maxProducts,useAi:true,", "rootUrl,name,maxProducts,useAi:false,")
s=s.replace("rootUrl,name,maxProducts,useAi: true,", "rootUrl,name,maxProducts,useAi: false,")
s=s.replace("batchSize:12", "batchSize:1")
s=s.replace("batchSize: 12", "batchSize: 1")

# Remove automatic follow-up repair after a new site import.
s=s.replace("      await repairCatalogue();\n", "")
s=s.replace("      await scanBatch(data.batch._id);\n", "")
s=s.replace("      await scanUntilComplete(data.batch._id);\n", "")

# Make button language explicit about one-pass behaviour.
s=s.replace("Repair queued / failed", "Run one pass")
s=s.replace("Scan missing / failed", "Run one pass")

# Ensure manual bulk pass only targets current queued/failed items once per click.
# Existing attempted Set already prevents re-attempt in the same click.
s=s.replace(
"Catalogue repair finished.",
"One-pass scan finished."
)
s=s.replace(
"Catalogue repair stopped.",
"One-pass scan stopped."
)

p.write_text(s)
print("Supplier Sites frontend made manual-only")
PY

node --check src/modules/product-creation-import/jobs/siteImportAutomation.js
node --check src/modules/product-creation-import/productImportBatch.model.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check public/supplier-sites-admin.js

echo
echo "Running full project preflight..."
npm run deploy:preflight

echo
echo "One-shot safety patch passed."
echo
echo "Review:"
echo "  git diff --check"
echo "  git diff --stat"
echo
echo "Then commit:"
echo "  git add src/modules/product-creation-import/jobs/siteImportAutomation.js \\"
echo "          src/modules/product-creation-import/productImportBatch.model.js \\"
echo "          src/modules/product-creation-import/services/productImportBatch.service.js \\"
echo "          public/supplier-sites-admin.js"
echo '  git commit -m "Make supplier imports strictly one-shot and manual"'
echo "  git push origin clean-main"

echo
echo "=============================================================="
echo " Applying Shopify catalogue intelligence layer"
echo "=============================================================="
echo

set -euo pipefail

echo "== Installing Shopify catalogue intelligence layer =="

REQ=(
  "src/modules/product-creation-import/services/productEnrichment.service.js"
  "src/modules/product-creation-import/services/shopifyProduct.service.js"
  "src/modules/product-creation-import/services/brandDirectoryProfile.service.js"
  "src/modules/product-creation-import/productCreationImport.service.js"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

mkdir -p .shopify-intelligence-backup
for f in "${REQ[@]}"; do cp "$f" ".shopify-intelligence-backup/$(basename "$f")"; done

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

function keyText(value=''){
  return cleanText(value,220).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function compact(value=''){ return keyText(value).replace(/\s+/g,''); }

function exactExisting(raw='', rows=[], field='value'){
  const value=cleanText(raw,180);
  if(!value)return '';
  const key=keyText(value), comp=compact(value);
  const hit=(rows||[]).find(row=>{
    const candidate=cleanText(typeof row==='string'?row:(row?.[field]||row?.title||row?.handle||''),180);
    return keyText(candidate)===key || compact(candidate)===comp;
  });
  return hit ? cleanText(typeof hit==='string'?hit:(hit?.[field]||hit?.title||hit?.handle||''),180) : value;
}

function titleTokens(value=''){
  return new Set(
    keyText(value).split(/\s+/)
      .filter(word=>word.length>2)
      .filter(word=>!['the','and','for','with','from','product','drink','energy','powder','tub','box','uk','stock'].includes(word))
  );
}

function overlapScore(a='',b=''){
  const aa=titleTokens(a), bb=titleTokens(b);
  let n=0; aa.forEach(x=>{if(bb.has(x))n+=1});
  return n;
}

function productFamilyText(draft={}){
  return [
    draft.title,draft.productType,draft.productCategory,draft.handleFormat,
    parseTags(draft.tags).join(' '),parseTags(draft.recommendedTags).join(' '),
    draft.descriptionHtml
  ].filter(Boolean).join(' ').toLowerCase();
}

function chooseSimilarExamples(draft={}, examples=[]){
  const vendor=keyText(draft.vendor||'');
  const type=keyText(draft.productType||'');
  const family=productFamilyText(draft);
  return (examples||[])
    .map(product=>{
      let score=0;
      if(vendor && keyText(product.vendor||'')===vendor)score+=50;
      if(type && keyText(product.productType||'')===type)score+=25;
      score+=Math.min(24,overlapScore(draft.title||'',product.title||'')*8);
      const hay=`${product.title||''} ${product.productType||''}`.toLowerCase();
      if(/hydration/.test(family)&&/hydration/.test(hay))score+=15;
      if(/collector/.test(family)&&/collector/.test(hay))score+=15;
      if(/shaker|cup/.test(family)&&/shaker|cup/.test(hay))score+=15;
      if(/powder|serving|formula/.test(family)&&/powder|serving|formula/.test(hay))score+=10;
      return {product,score};
    })
    .filter(x=>x.score>=35)
    .sort((a,b)=>b.score-a.score)
    .slice(0,8);
}

function mode(values=[]){
  const counts=new Map();
  values.filter(Boolean).forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
}

function mergeMetafields(existing=[], incoming=[]){
  const map=new Map();
  [...existing,...incoming].filter(Boolean).forEach(mf=>{
    if(!mf.namespace||!mf.key||mf.value===undefined||mf.value===null||mf.value==='')return;
    const k=`${mf.namespace}.${mf.key}`;
    const current=map.get(k);
    if(!current || (!current.value&&mf.value) || Number(mf.confidence||0)>Number(current.confidence||0)) map.set(k,mf);
  });
  return normaliseMetafields([...map.values()]);
}

async function getSnapshot(shopDomain){
  const cached=snapshotCache.get(shopDomain);
  if(cached && Date.now()-cached.at<SNAPSHOT_TTL_MS)return cached.value;

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
  snapshotCache.set(shopDomain,{at:Date.now(),value});
  return value;
}

async function similarMetafields({shopDomain,draft}){
  const vendor=cleanText(draft.vendor||'',120);
  const type=cleanText(draft.productType||'',120);
  if(!vendor && !type)return {matchedProductCount:0,metafields:[]};

  const cacheKey=`${shopDomain}|${keyText(vendor)}|${keyText(type)}|${[...titleTokens(draft.title||'')].slice(0,4).join('-')}`;
  const cached=profileCache.get(cacheKey);
  if(cached && Date.now()-cached.at<PROFILE_TTL_MS)return cached.value;

  const value=await getProfileValuesFromExistingProducts({
    shopDomain,
    tags:[],
    vendor,
    productType:type,
    title:draft.title||'',
  }).catch(()=>({matchedProductCount:0,metafields:[]}));

  profileCache.set(cacheKey,{at:Date.now(),value});
  return value;
}

function allowedProfileMetafield(mf={}, draft={}){
  const compound=`${mf.namespace}.${mf.key}`.toLowerCase();
  // Never copy identifiers/commercial values from another product.
  if(/barcode|gtin|sku|price|cost|inventory|quantity|mpn/.test(compound))return false;

  const family=productFamilyText(draft);
  const drink=/drink|powder|hydration|formula|servings?|caffeine|flavour|flavor/.test(family);
  if(!drink && [
    'core.product_flavour','core.flavour_family','core.flavour_profile',
    'core.formula_version','core.grouped_profiles','core.sourness','core.sweetness',
    'nutrition.servings','nutrition.serving_size','nutrition.calories_per_serving',
    'nutrition.caffeine_mg_per_serving','nutrition.sugar_g_per_serving',
    'nutrition.carbs_g_per_serving','nutrition.sodium_mg_per_serving',
    'nutrition.dietary_labels','nutrition.warning_labels','custom.ingredients_label'
  ].includes(compound)) return false;

  // About-brand is safe to inherit for the same brand.
  if(compound==='core.about_brand')return true;

  // Reusable structural/profile fields only.
  return /^(core|custom|nutrition)\./.test(compound);
}

function collectionSuggestions(draft={}, collections=[], similar=[]){
  const hay=[draft.vendor,draft.productType,draft.productCategory,draft.title].filter(Boolean).join(' ').toLowerCase();
  const suggestions=[];
  for(const c of collections||[]){
    const title=cleanText(c.title||'',120);
    const handle=cleanText(c.handle||'',120);
    const words=keyText(title).split(/\s+/).filter(w=>w.length>3);
    if(words.some(w=>hay.includes(w)))suggestions.push(handle||title);
  }
  // Preserve only explicitly existing collections. Never invent.
  return [...new Set([...(draft.collections||[]),...suggestions])].slice(0,20);
}

async function applyMerchantCatalogueContext({shopDomain,draft={}}){
  let next=normaliseDraftProduct(draft||{});
  if(!shopDomain||!next.title)return next;

  const snapshot=await getSnapshot(shopDomain);

  // First, canonicalise using values that already exist in this Shopify store.
  if(next.vendor)next.vendor=exactExisting(next.vendor,snapshot.vendors,'vendor');
  if(next.productType)next.productType=exactExisting(next.productType,snapshot.productTypes,'productType');

  // Existing Brand Directory remains the preferred reusable brand-content source.
  next=await applyBrandDirectoryProfile({shopDomain,draft:next}).catch(()=>next);

  const similar=chooseSimilarExamples(next,snapshot.seoExamples);
  const examples=similar.map(x=>x.product);

  // If source data did not know the type, learn the modal type from close Shopify neighbours.
  if(!next.productType && examples.length){
    next.productType=mode(examples.map(x=>cleanText(x.productType||'',120)));
  }

  // Template and collection conventions should follow the merchant catalogue,
  // but we never invent values that don't already exist.
  if(!next.themeTemplate){
    const likely=mode((snapshot.templates||[]).filter(x=>x.template&&x.template!=='default').slice(0,5).map(x=>x.template));
    if(likely && examples.length)next.themeTemplate=likely;
  }
  next.collections=collectionSuggestions(next,snapshot.collections,examples);

  // Reuse safe profile/brand metafields from genuinely similar existing products.
  const profile=await similarMetafields({shopDomain,draft:next});
  const reusable=(profile.metafields||[])
    .filter(mf=>allowedProfileMetafield(mf,next))
    .map(mf=>({...mf,source:'shopify-catalogue-pattern',confidence:Math.min(Number(mf.confidence||0),0.92)}));
  next.metafields=mergeMetafields(next.metafields||[],reusable);

  // Apply merchant rules last so explicit settings win over learned conventions.
  next=applySettingsToDraft(next,snapshot.settings||{});

  next.enrichment={
    ...(next.enrichment||{}),
    merchantCatalogue:{
      source:'existing-shopify-products',
      similarProductCount:examples.length,
      similarProducts:examples.slice(0,5).map(x=>({
        title:x.title||'',handle:x.handle||'',vendor:x.vendor||'',productType:x.productType||''
      })),
      matchedProfileProducts:Number(profile.matchedProductCount||0),
      appliedWithoutAi:true,
      checkedAt:new Date().toISOString(),
    }
  };

  return normaliseDraftProduct(next);
}

function clearMerchantCatalogueCache(shopDomain=''){
  if(shopDomain){
    snapshotCache.delete(shopDomain);
    for(const key of profileCache.keys())if(key.startsWith(`${shopDomain}|`))profileCache.delete(key);
  }else{
    snapshotCache.clear();profileCache.clear();
  }
}

module.exports={applyMerchantCatalogueContext,getSnapshot,clearMerchantCatalogueCache};
EOF

# ------------------------------------------------------------------
# Make product enrichment deterministic by default; AI only explicit.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/services/productEnrichment.service.js")
s=p.read_text()

if "merchantCatalogueContext.service" not in s:
    anchor="const { preserveLockedFields } = require('./fieldAuthority.service');"
    s=s.replace(anchor,anchor+"\nconst { applyMerchantCatalogueContext } = require('./merchantCatalogueContext.service');")

s=s.replace(
"async function suggestProductProfile({ shopDomain, draft }) {",
"async function suggestProductProfile({ shopDomain, draft, useAi = false }) {"
)
s=s.replace(
"  const ai = await aiSuggestProductProfile({ draft: normalised, metadata });",
"  const ai = useAi === true ? await aiSuggestProductProfile({ draft: normalised, metadata }) : {};"
)

old="""async function enrichProductDraft({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const suggestion = await suggestProductProfile({ shopDomain, draft: normalised });"""

new="""async function enrichProductDraft({ shopDomain, draft, useAi = false }) {
  let normalised = normaliseDraftProduct(draft || {});
  normalised = await applyMerchantCatalogueContext({ shopDomain, draft: normalised });
  const suggestion = await suggestProductProfile({ shopDomain, draft: normalised, useAi });"""

if old not in s:
    raise SystemExit("Could not patch enrichProductDraft signature/body")
s=s.replace(old,new)

p.write_text(s)
print("Product enrichment now uses Shopify catalogue first and AI only explicitly")
PY

# ------------------------------------------------------------------
# Apply the same non-AI intelligence to URL/manual/create paths.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/productCreationImport.service.js")
s=p.read_text()

s=s.replace(
"async function enrichImportDraftFully({ shopDomain, draft, useAi = true }) {",
"async function enrichImportDraftFully({ shopDomain, draft, useAi = false }) {"
)
s=s.replace(
"  normalised = await enrichProductDraft({ shopDomain, draft: normalised });",
"  normalised = await enrichProductDraft({ shopDomain, draft: normalised, useAi });"
)
s=s.replace(
"const draft = await enrichImportDraftFully({ shopDomain, draft: extracted, useAi: true });",
"const draft = await enrichImportDraftFully({ shopDomain, draft: extracted, useAi: false });"
)
s=s.replace(
"const normalised = await enrichImportDraftFully({ shopDomain, draft: { ...draft, source: draft?.source || 'manual' }, useAi: true });",
"const normalised = await enrichImportDraftFully({ shopDomain, draft: { ...draft, source: draft?.source || 'manual' }, useAi: false });"
)
s=s.replace(
"const enriched = await enrichProductDraft({ shopDomain, draft: sourceDraft });",
"const enriched = await enrichProductDraft({ shopDomain, draft: sourceDraft, useAi: false });"
)

p.write_text(s)
print("URL/manual/create paths now use non-AI catalogue intelligence")
PY

# ------------------------------------------------------------------
# Batch enrichment: merchant catalogue context always, AI explicit only.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

s=s.replace(
"async function enrichItem({ shopDomain, item, defaults, useAi = true }) {",
"async function enrichItem({ shopDomain, item, defaults, useAi = false }) {"
)
s=s.replace(
"    draft = await applyBrandDirectoryProfile({ shopDomain, draft });",
"    draft = await applyBrandDirectoryProfile({ shopDomain, draft });"
)

# Product service already passes through product enrichment elsewhere; make sure
# the direct enrichment call receives the flag where present.
s=s.replace(
"await enrichProductDraft({ shopDomain, draft });",
"await enrichProductDraft({ shopDomain, draft, useAi });"
)
s=s.replace(
"enrichProductDraft({ shopDomain, draft })",
"enrichProductDraft({ shopDomain, draft, useAi })"
)

p.write_text(s)
print("Batch enrichment AI default disabled")
PY

# ------------------------------------------------------------------
# Routes must not turn absent useAi into true.
# ------------------------------------------------------------------
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/productCreationImport.routes.js")
s=p.read_text()

s=s.replace(
"useAi: body.useAi !== false, autoApproveReady: body.autoApproveReady !== false, autoCreateDrafts: Boolean(body.autoCreateDrafts), batchSize: body.batchSize || 12",
"useAi: body.useAi === true, autoApproveReady: body.autoApproveReady === true, autoCreateDrafts: Boolean(body.autoCreateDrafts), batchSize: body.batchSize || 1"
)
s=s.replace(
"useAi: body.useAi !== false,",
"useAi: body.useAi === true,"
)

p.write_text(s)
print("Routes now require explicit useAi:true")
PY

node --check src/modules/product-creation-import/services/merchantCatalogueContext.service.js
node --check src/modules/product-creation-import/services/productEnrichment.service.js
node --check src/modules/product-creation-import/productCreationImport.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js

echo
echo "Running full preflight..."
npm run deploy:preflight

echo
echo "Shopify catalogue intelligence patch passed."
echo
echo "Files to stage:"
echo "  git add src/modules/product-creation-import/services/merchantCatalogueContext.service.js \\"
echo "          src/modules/product-creation-import/services/productEnrichment.service.js \\"
echo "          src/modules/product-creation-import/productCreationImport.service.js \\"
echo "          src/modules/product-creation-import/productCreationImport.routes.js \\"
echo "          src/modules/product-creation-import/services/productImportBatch.service.js"
echo '  git commit -m "Use Shopify catalogue context for all product imports"'
echo "  git push origin clean-main"

echo
echo "=============================================================="
echo " FINAL STABLE RELEASE CHECK"
echo "=============================================================="
echo

node --check src/modules/product-creation-import/jobs/siteImportAutomation.js
node --check src/modules/product-creation-import/productImportBatch.model.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/services/productEnrichment.service.js
node --check src/modules/product-creation-import/services/merchantCatalogueContext.service.js
node --check src/modules/product-creation-import/productCreationImport.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js

npm run deploy:preflight

echo
echo "=============================================================="
echo " STABLE PRODUCT IMPORT RELEASE READY"
echo "=============================================================="
echo
echo "Before committing, review:"
echo "  git diff --check"
echo "  git diff --stat"
echo
echo "Then commit everything changed by this release:"
echo "  git add src/modules/product-creation-import/jobs/siteImportAutomation.js \"
echo "          src/modules/product-creation-import/productImportBatch.model.js \"
echo "          src/modules/product-creation-import/services/productImportBatch.service.js \"
echo "          src/modules/product-creation-import/services/productEnrichment.service.js \"
echo "          src/modules/product-creation-import/services/merchantCatalogueContext.service.js \"
echo "          src/modules/product-creation-import/productCreationImport.service.js \"
echo "          src/modules/product-creation-import/productCreationImport.routes.js \"
echo "          public/supplier-sites-admin.js"
echo
echo '  git commit -m "Stabilise product imports and add Shopify catalogue intelligence"'
echo "  git push origin clean-main"
echo
echo "AI SAFETY CONTRACT:"
echo "  - No scheduled supplier processing"
echo "  - No automatic retries"
echo "  - Failed means stop"
echo "  - Needs review means stop"
echo "  - AI only runs when useAi:true is explicitly supplied"
echo
