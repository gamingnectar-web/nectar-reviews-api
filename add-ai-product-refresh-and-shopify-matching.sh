#!/usr/bin/env bash
set -euo pipefail

FILES=(
  "src/modules/product-creation-import/services/productEnrichment.service.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "public/supplier-sites-admin.js"
  "public/supplier-sites-admin.css"
)
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

# ---------- Product enrichment: explicit one-call AI refresh ----------
p=Path("src/modules/product-creation-import/services/productEnrichment.service.js")
s=p.read_text()

if "async function aiRefreshProductDraft(" not in s:
    marker="module.exports = { getProductImportMetadata, suggestProductProfile, enrichProductDraft, CORE_PROFILE_METAFIELDS, isLikelyDrinkProduct, isClearlyNonDrinkProduct, filterMetafieldsForProductKind };"
    if marker not in s:
        raise SystemExit("Could not find productEnrichment module.exports")

    fn = r"""
async function aiRefreshProductDraft({ shopDomain, draft = {} }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured. Add the AI licence/key before using AI Refresh.');
    error.status = 412;
    throw error;
  }

  let base = normaliseDraftProduct(draft || {});
  base = await applyMerchantCatalogueContext({ shopDomain, draft: base });
  const metadata = await getProductImportMetadata({ shopDomain });
  const catalogueContext = await buildCatalogueReferenceContext({ shopDomain, draft: base }).catch(() => null);
  const model = process.env.OPENAI_PRODUCT_IMPORT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';

  const existingSeoExamples = (metadata.seoExamples || [])
    .filter((row) => !base.vendor || valueKey(row.vendor || '') === valueKey(base.vendor || ''))
    .slice(0, 20);

  const prompt = `You are performing ONE explicit quality-control pass on ONE Shopify product draft.

Return ONLY valid JSON with these keys:
title, descriptionHtml, vendor, productType, productCategory, themeTemplate, handle,
seoTitle, seoDescription, collections, recommendedTags,
productFlavour, flavourFamily, flavourProfile, formulaVersion, groupedProfiles,
sweetness, sourness, notes.

Rules:
- Conform the draft to the merchant's EXISTING Shopify catalogue.
- Replace weak supplier labels such as "Tub" with the merchant's established product type when supported.
- Follow existing naming and SEO structure rather than generic ecommerce wording.
- title is the customer-facing product title. Do not stuff vendor, type or location into it unless the catalogue does.
- seoTitle and handle should follow the merchant's established pattern.
- seoDescription must be natural and product-specific. Do not use generic "available from Gaming Nectar" copy.
- descriptionHtml should preserve useful factual supplier copy while cleaning broken/meta HTML. Do not invent claims.
- For consumables, identify the ACTUAL flavour separately from the collaboration/product name.
- For G FUEL current Energy Formula 2.0 / New & Improved / 40-serving energy tubs, formulaVersion should be GF-EN2.0 when supported.
- For G FUEL Hydration, use GF-HY when supported.
- Do not add flavour/formula fields to shakers, accessories, apparel or other non-consumables.
- Do not invent barcode, SKU, price, nutrition, ingredients or claims.
- collections and recommendedTags may only use existing merchant values.
- This remains an editable draft.

Merchant product types:
${(metadata.productTypes || []).slice(0,80).map((x)=>x.productType || x).join(' | ')}

Merchant categories:
${(metadata.productCategories || []).slice(0,80).map((x)=>x.category || x.title || x).join(' | ')}

Existing same-vendor SEO examples:
${JSON.stringify(existingSeoExamples).slice(0,6000)}

Merchant catalogue reference:
${JSON.stringify(catalogueContext || {}).slice(0,6000)}

Current draft:
${JSON.stringify({
  title: base.title,
  descriptionHtml: base.descriptionHtml,
  vendor: base.vendor,
  productType: base.productType,
  productCategory: base.productCategory,
  themeTemplate: base.themeTemplate,
  handle: base.handle,
  seo: base.seo,
  collections: base.collections,
  tags: base.tags,
  recommendedTags: base.recommendedTags,
  metafields: base.metafields,
  sourceUrl: base.sourceUrl,
  images: (base.images || []).slice(0,8).map((img)=>({src:img.src,alt:img.alt}))
}).slice(0,12000)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You calibrate one Shopify product draft against the merchant catalogue. Output JSON only.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error?.message || `OpenAI product refresh failed (${response.status})`);
    error.status = 502;
    throw error;
  }

  let ai = {};
  try { ai = JSON.parse(stripJsonFence(json.choices?.[0]?.message?.content || '{}')); }
  catch (_) {
    const error = new Error('AI Refresh returned invalid JSON.');
    error.status = 502;
    throw error;
  }

  const core = [
    ['product_flavour', ai.productFlavour],
    ['flavour_family', ai.flavourFamily],
    ['flavour_profile', ai.flavourProfile],
    ['formula_version', ai.formulaVersion],
    ['grouped_profiles', ai.groupedProfiles],
    ['sweetness', ai.sweetness],
    ['sourness', ai.sourness]
  ].filter(([,value]) => value !== undefined && value !== null && String(value).trim() !== '')
   .map(([key,value]) => ({
      namespace:'core',
      key,
      type:'single_line_text_field',
      value:String(value).trim(),
      source:'explicit-ai-refresh',
      confidence:0.9
   }));

  const candidate = normaliseDraftProduct({
    ...base,
    title: cleanText(ai.title || base.title, 220),
    descriptionHtml: String(ai.descriptionHtml || base.descriptionHtml || '').slice(0,20000),
    vendor: exactSiteValue(ai.vendor || base.vendor, metadata.vendors || [], 'vendor'),
    productType: exactSiteValue(ai.productType || base.productType, metadata.productTypes || [], 'productType'),
    productCategory: cleanText(ai.productCategory || base.productCategory || '', 180),
    themeTemplate: cleanText(ai.themeTemplate || base.themeTemplate || '', 80),
    handle: slugify(ai.handle || base.handle || ai.title || base.title),
    collections: filterToExistingCollections(
      [...parseTags(base.collections || []), ...parseTags(ai.collections || [])],
      metadata.collections || [],
      base.collections || []
    ),
    recommendedTags: filterToExistingTags(
      [...parseTags(base.recommendedTags || []), ...parseTags(ai.recommendedTags || [])],
      metadata.tags || []
    ),
    seo: {
      title: cleanText(ai.seoTitle || base.seo?.title || '', 70),
      description: cleanText(ai.seoDescription || base.seo?.description || '', 155).replace(/[,:;\s]+$/, '.')
    },
    metafields: normaliseCoreGaugeMetafields(
      filterMetafieldsForProductKind(
        mergeMetafields(base.metafields || [], core),
        { ...base, productType: ai.productType || base.productType, title: ai.title || base.title }
      )
    )
  });

  const next = applySettingsToDraft(candidate, metadata.settings || {});
  return normaliseDraftProduct({
    ...next,
    enrichment: {
      ...(base.enrichment || {}),
      aiRefresh: {
        ranAt:new Date().toISOString(),
        model,
        oneShot:true,
        notes:cleanText(ai.notes || '',600)
      }
    }
  });
}

"""
    s=s.replace(marker, fn + "module.exports = { getProductImportMetadata, suggestProductProfile, enrichProductDraft, aiRefreshProductDraft, CORE_PROFILE_METAFIELDS, isLikelyDrinkProduct, isClearlyNonDrinkProduct, filterMetafieldsForProductKind };")

p.write_text(s)

# ---------- Batch service: stronger Shopify matching + explicit AI refresh ----------
p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

s=s.replace(
"const { enrichProductDraft, getProductImportMetadata } = require('./productEnrichment.service');",
"const { enrichProductDraft, getProductImportMetadata, aiRefreshProductDraft } = require('./productEnrichment.service');"
)

start=s.find("async function detectExistingProduct({ shopDomain, draft }) {")
end=s.find("\nasync function enrichItem(", start)
if start == -1 or end == -1:
    raise SystemExit("Could not locate detectExistingProduct()")

replacement=r"""function duplicateNorm(value=''){
  return cleanText(value,240).toLowerCase()
    .replace(/\bg\s*fuel\b/g,'gfuel')
    .replace(/\b2\.0\b/g,'')
    .replace(/\b(new|improved|formula|energy|hydration|powder|tub|drink|40|servings?|uk|stock)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function duplicateTokens(value=''){
  return new Set(duplicateNorm(value).split(' ').filter(x=>x.length>1));
}

function tokenSimilarity(a='',b=''){
  const aa=duplicateTokens(a),bb=duplicateTokens(b);
  if(!aa.size||!bb.size)return 0;
  let hit=0;
  aa.forEach(x=>{if(bb.has(x))hit+=1;});
  return hit/Math.max(aa.size,bb.size);
}

function imageFingerprint(value=''){
  try{
    const url=new URL(String(value||''));
    return decodeURIComponent(url.pathname.split('/').pop()||'')
      .toLowerCase()
      .replace(/\.(jpg|jpeg|png|webp|gif)$/i,'')
      .replace(/[_-](pico|icon|thumb|small|compact|medium|large|grande|master|\d+x\d*|\d+x)$/i,'')
      .replace(/[^a-z0-9]+/g,'');
  }catch(_){
    return String(value||'').toLowerCase().split('?')[0].split('/').pop()?.replace(/[^a-z0-9]+/g,'')||'';
  }
}

function draftImageFingerprints(draft={}){
  return new Set((draft.images||[]).map(img=>imageFingerprint(typeof img==='string'?img:img?.src)).filter(x=>x.length>8));
}

function candidateImageHit(candidate={},wanted=new Set()){
  if(!wanted.size)return false;
  return [candidate.image,...(candidate.images||[])].map(imageFingerprint).filter(Boolean).some(value=>wanted.has(value));
}

async function detectExistingProduct({ shopDomain, draft }) {
  const title=cleanText(draft.title||'',180);
  const sku=cleanText(draft.sku||'',120);
  const barcode=cleanText(draft.barcode||'',120);
  const handle=cleanText(draft.handle||'',180);
  const vendor=duplicateNorm(draft.vendor||'');
  const wantedImages=draftImageFingerprints(draft);
  const queries=[barcode,sku,title,handle].filter(Boolean);
  const byKey=new Map();

  for(const q of queries.slice(0,4)){
    const rows=await searchShopifyProducts({shopDomain,q,first:12}).catch(()=>[]);
    for(const row of rows){
      const key=row.id||row.legacyResourceId||row.handle||row.title;
      if(key&&!byKey.has(key))byKey.set(key,row);
    }
  }

  let best=null;
  for(const product of byKey.values()){
    const signals=[];
    let score=0;

    if(barcode&&product.barcode&&barcode.toLowerCase()===String(product.barcode).toLowerCase()){
      score=1;signals.push('barcode');
    }
    if(sku&&product.sku&&sku.toLowerCase()===String(product.sku).toLowerCase()){
      score=Math.max(score,.995);signals.push('sku');
    }
    if(handle&&product.handle&&duplicateNorm(handle)===duplicateNorm(product.handle)){
      score=Math.max(score,.985);signals.push('handle');
    }

    const titleExact=title&&duplicateNorm(title)===duplicateNorm(product.title||'');
    const titleScore=tokenSimilarity(title,product.title||'');
    const vendorHit=!vendor||!product.vendor||vendor===duplicateNorm(product.vendor||'');
    const imageHit=candidateImageHit(product,wantedImages);

    if(titleExact&&vendorHit){score=Math.max(score,.98);signals.push('title','vendor');}
    else if(titleExact){score=Math.max(score,.94);signals.push('title');}

    if(vendorHit&&titleScore>=.84){
      score=Math.max(score,.94);signals.push('near-title','vendor');
    }else if(titleScore>=.93){
      score=Math.max(score,.91);signals.push('near-title');
    }

    if(imageHit&&vendorHit&&titleScore>=.45){
      score=Math.max(score,.96);signals.push('image','vendor','title');
    }else if(imageHit&&titleScore>=.7){
      score=Math.max(score,.93);signals.push('image','title');
    }

    if(!best||score>best.score)best={product,score,signals:[...new Set(signals)]};
  }

  if(!best||best.score<.90)return null;
  return {
    exact:best.score>=.98,
    confidence:Number(best.score.toFixed(3)),
    id:best.product.id,
    legacyResourceId:best.product.legacyResourceId||'',
    title:best.product.title,
    handle:best.product.handle,
    vendor:best.product.vendor||'',
    sku:best.product.sku||'',
    barcode:best.product.barcode||'',
    image:best.product.image||'',
    signals:best.signals,
    reason:`Shopify match (${Math.round(best.score*100)}%): ${best.signals.join(' + ')}.`
  };
}
"""
s=s[:start]+replacement+s[end:]

if "async function aiRefreshBatchItem(" not in s:
    marker="\nasync function setBatchItemApproval("
    pos=s.find(marker)
    if pos==-1:
        raise SystemExit("Could not find setBatchItemApproval anchor")

    fn=r"""
async function aiRefreshBatchItem({ shopDomain, batchId, itemId }) {
  const { batch } = await getBatch({ shopDomain, batchId });
  const item = batch.items.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    const error = new Error('Batch item not found.');
    error.status = 404;
    throw error;
  }

  const draft = await aiRefreshProductDraft({ shopDomain, draft: item.draft || {} });
  const existingProduct = await detectExistingProduct({ shopDomain, draft });

  item.draft = draft;
  item.title = draft.title;
  item.vendor = draft.vendor;
  item.productType = draft.productType;
  item.productCategory = draft.productCategory;
  item.templateSuffix = draft.themeTemplate || '';
  item.metafieldPlan = normaliseMetafields(draft.metafields || []);
  item.suggestions = { ...(item.suggestions || {}), ...(draft.suggestions || {}) };

  if(existingProduct){
    item.suggestions.existingProduct=existingProduct;
    item.status='skipped';
    item.approvalStatus='rejected';
    item.error='';
  }else{
    if(item.suggestions?.existingProduct) delete item.suggestions.existingProduct;
    item.status='needs_review';
    item.approvalStatus='pending';
    item.error='';
  }

  const metadata=await getProductImportMetadata({shopDomain}).catch(()=>({}));
  item.completeness=completeness({draft:item.draft||{},item,metadata});
  item.validation=validateDraft(item.draft||{},item);
  item.updatedAt=new Date();
  refreshBatchSummary(batch);
  await batch.save();

  return { batch, item, existingProduct, aiCalls:1 };
}

"""
    s=s[:pos]+fn+s[pos:]

if "  aiRefreshBatchItem," not in s:
    s=s.replace("  updateBatchItem,\n", "  updateBatchItem,\n  aiRefreshBatchItem,\n")

p.write_text(s)

# ---------- Route ----------
p=Path("src/modules/product-creation-import/productCreationImport.routes.js")
s=p.read_text()

if "  aiRefreshBatchItem," not in s:
    s=s.replace("  updateBatchItem,\n", "  updateBatchItem,\n  aiRefreshBatchItem,\n")

if "items/:itemId/ai-refresh" not in s:
    anchor="""router.patch('/batches/:batchId/items/:itemId', asyncRoute(async (req, res) => {
  const result = await updateBatchItem({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId, itemId: req.params.itemId, patch: req.body || {} });
  res.json(result);
}));
"""
    if anchor not in s:
        raise SystemExit("Could not find item PATCH route")
    route=anchor+"""
router.post('/batches/:batchId/items/:itemId/ai-refresh', asyncRoute(async (req, res) => {
  const result = await aiRefreshBatchItem({
    shopDomain: shopDomainFromReq(req),
    batchId: req.params.batchId,
    itemId: req.params.itemId
  });
  res.json(result);
}));
"""
    s=s.replace(anchor,route)

p.write_text(s)

# ---------- UI ----------
p=Path("public/supplier-sites-admin.js")
s=p.read_text()

old="""            <div><span class="pci-muted">SUPPLIER PRODUCT DRAFT</span><h3 id="spm-heading">Product</h3></div>
            <button type="button" class="secondary-btn" data-supplier-close>Close</button>"""
new="""            <div><span class="pci-muted">SUPPLIER PRODUCT DRAFT</span><h3 id="spm-heading">Product</h3></div>
            <div class="supplier-modal-head-actions">
              <button id="spm-ai-refresh" type="button" class="supplier-ai-refresh" title="AI refresh — one product, one AI call" aria-label="AI refresh this product">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"></path></svg>
              </button>
              <button type="button" class="secondary-btn" data-supplier-close>Close</button>
            </div>"""
if old in s:
    s=s.replace(old,new)
elif "spm-ai-refresh" not in s:
    raise SystemExit("Could not add AI refresh button")

wire_old="""    $('spm-save').addEventListener('click',saveItemModal);
    $('spm-enrich').addEventListener('click',enrichItemModal);
    $('spm-create').addEventListener('click',createItemShopifyDraft);"""
wire_new="""    $('spm-save').addEventListener('click',saveItemModal);
    $('spm-enrich').addEventListener('click',enrichItemModal);
    $('spm-ai-refresh').addEventListener('click',aiRefreshItemModal);
    $('spm-create').addEventListener('click',createItemShopifyDraft);"""
if wire_old in s:
    s=s.replace(wire_old,wire_new)

start=s.find("  function productStatusDot(item){")
end=s.find("\n  function renderProducts(){",start)
if start==-1 or end==-1:
    raise SystemExit("Could not find productStatusDot()")

status_fn="""  function productStatusDot(item){
    const existing = Boolean(
      item?.shopifyProduct?.id ||
      item?.status === 'created' ||
      item?.suggestions?.existingProduct?.id ||
      item?.suggestions?.existingProduct?.exact ||
      item?.draft?.suggestions?.existingProduct?.id ||
      item?.draft?.suggestions?.existingProduct?.exact
    );
    if(existing) return { cls:'exists', label:'Exists in Shopify' };

    const hasError = item?.status === 'failed' || Boolean(
      String(item?.error || '').trim() &&
      !/already exists|skipped duplicate|exists in shopify/i.test(String(item?.error || ''))
    );
    if(hasError) return { cls:'error', label:'Error present' };

    return { cls:'review', label:'Review required' };
  }
"""
s=s[:start]+status_fn+s[end:]

if "async function aiRefreshItemModal(" not in s:
    marker="  async function enrichItemModal(){"
    pos=s.find(marker)
    if pos==-1:
        raise SystemExit("Could not find enrichItemModal()")

    fn="""  async function aiRefreshItemModal(){
    const id=state.activeItem?.itemId;
    if(!id||!state.activeBatch)return;

    const btn=$('spm-ai-refresh');
    if(btn?.disabled)return;

    try{
      if(btn){
        btn.disabled=true;
        btn.classList.add('is-running');
      }

      await saveItemModal();
      modalStatus('AI refreshing this product once against your Shopify catalogue…','warn');

      const data=await api(`/batches/${state.activeBatch._id}/items/${id}/ai-refresh`,{
        method:'POST',
        body:JSON.stringify({})
      });

      state.activeBatch=data.batch;
      state.activeItem=data.item;
      renderProducts();
      openItemModal(id);

      const match=data.existingProduct;
      modalStatus(
        match
          ? `AI refresh complete. Shopify match found: ${match.title} (${Math.round(Number(match.confidence||0)*100)}%).`
          : 'AI refresh complete. One AI call used; review the updated fields before creating the Shopify draft.',
        'ok'
      );
    }catch(error){
      modalStatus(error.message||'AI refresh failed. No automatic retry will occur.','err');
    }finally{
      const active=$('spm-ai-refresh');
      if(active){
        active.disabled=false;
        active.classList.remove('is-running');
      }
    }
  }

"""
    s=s[:pos]+fn+s[pos:]

p.write_text(s)

# ---------- CSS ----------
p=Path("public/supplier-sites-admin.css")
s=p.read_text()
css="""

.supplier-modal-head-actions{display:flex;align-items:center;gap:8px}
.supplier-ai-refresh{
  width:42px;height:42px;border:1px solid #d9e0ea;border-radius:12px;background:#fff;
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
  transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease
}
.supplier-ai-refresh:hover{transform:translateY(-1px);border-color:#b8c3d3;box-shadow:0 5px 14px rgba(15,23,42,.08)}
.supplier-ai-refresh svg{width:20px;height:20px;fill:currentColor}
.supplier-ai-refresh:disabled{opacity:.55;cursor:wait}
.supplier-ai-refresh.is-running svg{animation:supplier-ai-spin .9s linear infinite}
@keyframes supplier-ai-spin{to{transform:rotate(360deg)}}
"""
if ".supplier-ai-refresh{" not in s:
    s += css
p.write_text(s)

print("Applied one-click AI refresh and stronger Shopify matching")
PY

node --check src/modules/product-creation-import/services/productEnrichment.service.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js

echo
echo "Running full deploy preflight..."
npm run deploy:preflight

echo
echo "AI refresh + Shopify matching patch passed."
echo
echo "Commit:"
echo "  git add src/modules/product-creation-import/services/productEnrichment.service.js \"
echo "          src/modules/product-creation-import/services/productImportBatch.service.js \"
echo "          src/modules/product-creation-import/productCreationImport.routes.js \"
echo "          public/supplier-sites-admin.js \"
echo "          public/supplier-sites-admin.css"
echo '  git commit -m "Add one-click AI product refresh and improve Shopify matching"'
echo "  git push origin clean-main"
