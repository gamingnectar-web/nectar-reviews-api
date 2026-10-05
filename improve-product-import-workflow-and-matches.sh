#!/usr/bin/env bash
set -euo pipefail

REQ=(
  "src/modules/product-creation-import/services/shopifyProduct.service.js"
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "public/supplier-sites-admin.js"
  "public/supplier-sites-admin.css"
  "public/admin.html"
  "public/product-creation-import.css"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path
import re

# 1. Fast Shopify catalogue fetch for matching.
p=Path('src/modules/product-creation-import/services/shopifyProduct.service.js')
s=p.read_text()
if 'async function listShopifyProductsForMatching(' not in s:
    marker="\nfunction isValidJsonString(value = '') {"
    pos=s.find(marker)
    if pos==-1: raise SystemExit('Could not find Shopify insertion point')
    fn=r'''
async function listShopifyProductsForMatching({ shopDomain, maxProducts = 2500 }) {
  const wanted=Math.max(1,Math.min(Number(maxProducts)||2500,2500));
  const products=[];
  let page=1;
  while(products.length<wanted && page<=10){
    const data=await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&page=${page}&fields=id,title,handle,image,images,variants,tags,vendor,product_type,status`,{shopDomain});
    const rows=data?.products||[];
    if(!rows.length)break;
    for(const product of rows){
      products.push(restProductToCard(product,{
        status:product.status||'',
        skus:(product.variants||[]).map(v=>cleanText(v.sku||'',120)).filter(Boolean),
        barcodes:(product.variants||[]).map(v=>cleanText(v.barcode||'',120)).filter(Boolean),
      }));
      if(products.length>=wanted)break;
    }
    if(rows.length<250)break;
    page+=1;
  }
  return products;
}

'''
    s=s[:pos]+fn+s[pos:]
if '  listShopifyProductsForMatching,' not in s:
    s=s.replace('  searchShopifyProducts,\n  createShopifyProductFromDraft,','  searchShopifyProducts,\n  listShopifyProductsForMatching,\n  createShopifyProductFromDraft,')
p.write_text(s)

# 2. Batch match classification + bulk reconcile.
p=Path('src/modules/product-creation-import/services/productImportBatch.service.js')
s=p.read_text()
s=s.replace("const { searchShopifyProducts } = require('./shopifyProduct.service');","const { searchShopifyProducts, listShopifyProductsForMatching } = require('./shopifyProduct.service');")
if 'function strictDuplicateNorm(' not in s:
    s=s.replace("function duplicateNorm(value=''){",r'''function strictDuplicateNorm(value=''){
  return cleanText(value,240).toLowerCase()
    .replace(/\bg\s*fuel\b/g,'gfuel')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function duplicateNorm(value=''){''')

old=r'''  if(!best||best.score<.90)return null;
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
}'''
new=r'''  if(!best||best.score<.90)return null;
  const strictTitleMatch=strictDuplicateNorm(title)&&strictDuplicateNorm(title)===strictDuplicateNorm(best.product.title||'');
  const strongIdentifier=best.signals.some(signal=>['barcode','sku','handle'].includes(signal));
  const confirmed=Boolean(strongIdentifier||(strictTitleMatch&&best.signals.includes('vendor')));
  return {
    exact:confirmed,
    confirmed,
    matchLevel:confirmed?'confirmed':'possible',
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
    reason:`Shopify ${confirmed?'confirmed':'possible'} match (${Math.round(best.score*100)}%): ${best.signals.join(' + ')}.`
  };
}'''
if old in s: s=s.replace(old,new)

if 'function matchDraftAgainstCatalogue(' not in s:
    marker='\nasync function enrichItem('
    pos=s.find(marker)
    if pos==-1: raise SystemExit('Could not find enrichItem')
    fn=r'''
function matchDraftAgainstCatalogue(draft={},catalogue=[]){
  const title=cleanText(draft.title||'',180);
  const sku=cleanText(draft.sku||'',120).toLowerCase();
  const barcode=cleanText(draft.barcode||'',120).toLowerCase();
  const handle=cleanText(draft.handle||'',180);
  const vendor=duplicateNorm(draft.vendor||'');
  const wantedImages=draftImageFingerprints(draft);
  let best=null;
  for(const product of catalogue||[]){
    const signals=[]; let score=0;
    const skus=[product.sku,...(product.skus||[])].filter(Boolean).map(x=>String(x).toLowerCase());
    const barcodes=[product.barcode,...(product.barcodes||[])].filter(Boolean).map(x=>String(x).toLowerCase());
    if(barcode&&barcodes.includes(barcode)){score=1;signals.push('barcode');}
    if(sku&&skus.includes(sku)){score=Math.max(score,.995);signals.push('sku');}
    if(handle&&product.handle&&duplicateNorm(handle)===duplicateNorm(product.handle)){score=Math.max(score,.985);signals.push('handle');}
    const strictTitleMatch=strictDuplicateNorm(title)&&strictDuplicateNorm(title)===strictDuplicateNorm(product.title||'');
    const looseTitleMatch=title&&duplicateNorm(title)===duplicateNorm(product.title||'');
    const titleScore=tokenSimilarity(title,product.title||'');
    const vendorHit=!vendor||!product.vendor||vendor===duplicateNorm(product.vendor||'');
    const imageHit=candidateImageHit(product,wantedImages);
    if(strictTitleMatch&&vendorHit){score=Math.max(score,.99);signals.push('strict-title','vendor');}
    else if(looseTitleMatch&&vendorHit){score=Math.max(score,.94);signals.push('near-title','vendor');}
    else if(titleScore>=.93&&vendorHit){score=Math.max(score,.93);signals.push('near-title','vendor');}
    if(imageHit&&vendorHit&&titleScore>=.45){score=Math.max(score,.97);signals.push('image','vendor','title');}
    const confirmed=signals.some(signal=>['barcode','sku','handle'].includes(signal))||(strictTitleMatch&&vendorHit);
    if(!best||score>best.score)best={product,score,signals:[...new Set(signals)],confirmed};
  }
  if(!best||best.score<.90)return null;
  return {exact:best.confirmed,confirmed:best.confirmed,matchLevel:best.confirmed?'confirmed':'possible',confidence:Number(best.score.toFixed(3)),id:best.product.id,legacyResourceId:best.product.legacyResourceId||'',title:best.product.title,handle:best.product.handle,vendor:best.product.vendor||'',sku:best.product.sku||'',barcode:best.product.barcode||'',image:best.product.image||'',signals:best.signals,reason:`Shopify ${best.confirmed?'confirmed':'possible'} match (${Math.round(best.score*100)}%): ${best.signals.join(' + ')}.`};
}

async function reconcileBatchShopifyMatches({shopDomain,batchId,maxProducts=2500}){
  const {batch}=await getBatch({shopDomain,batchId});
  const catalogue=await listShopifyProductsForMatching({shopDomain,maxProducts});
  let confirmed=0,possible=0,unmatched=0;
  for(const item of batch.items||[]){
    if(item.status==='created'||item.shopifyProduct?.id)continue;
    const match=matchDraftAgainstCatalogue(item.draft||{},catalogue);
    const suggestions={...(item.suggestions||{})};
    if(match){
      suggestions.existingProduct=match; item.suggestions=suggestions;
      if(match.confirmed){confirmed+=1;item.status='skipped';item.approvalStatus='rejected';item.error='';}
      else {possible+=1;if(item.status==='skipped')item.status='needs_review';if(item.approvalStatus==='rejected')item.approvalStatus='pending';}
    }else{
      unmatched+=1; if(suggestions.existingProduct)delete suggestions.existingProduct; item.suggestions=suggestions;
      if(item.status==='skipped')item.status='needs_review';if(item.approvalStatus==='rejected')item.approvalStatus='pending';
    }
    item.updatedAt=new Date();
  }
  refreshBatchSummary(batch); await batch.save();
  return {batch,shopifyProducts:catalogue.length,confirmed,possible,unmatched};
}

'''
    s=s[:pos]+fn+s[pos:]
if '  reconcileBatchShopifyMatches,' not in s:
    s=s.replace('  getBatchItemFieldMappings,\n  aiRefreshBatchItem,','  getBatchItemFieldMappings,\n  reconcileBatchShopifyMatches,\n  aiRefreshBatchItem,')
p.write_text(s)

# 3. Route.
p=Path('src/modules/product-creation-import/productCreationImport.routes.js')
s=p.read_text()
if '  reconcileBatchShopifyMatches,' not in s:
    s=s.replace('  getBatchItemFieldMappings,\n  aiRefreshBatchItem,','  getBatchItemFieldMappings,\n  reconcileBatchShopifyMatches,\n  aiRefreshBatchItem,')
if 'reconcile-shopify' not in s:
    anchor="""router.get('/batches/:batchId', asyncRoute(async (req, res) => {
  const result = await getBatch({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId });
  res.json(result);
}));
"""
    route=anchor+"""router.post('/batches/:batchId/reconcile-shopify', asyncRoute(async (req, res) => {
  const result = await reconcileBatchShopifyMatches({ shopDomain: shopDomainFromReq(req), batchId: req.params.batchId, maxProducts: req.body?.maxProducts || 2500 });
  res.json(result);
}));

"""
    if anchor not in s: raise SystemExit('Could not find batch GET route')
    s=s.replace(anchor,route)
p.write_text(s)

# 4. Supplier UI.
p=Path('public/supplier-sites-admin.js')
s=p.read_text()
s=s.replace('const state={batches:[],activeBatch:null,activeItem:null,scanning:false,stop:false};','const state={batches:[],activeBatch:null,activeItem:null,scanning:false,stop:false,reconciled:new Set(),reconciling:false};')
s=s.replace('<button id="supplier-sites-rescan" class="secondary-btn" type="button">Run one pass</button><button id="supplier-sites-stop" class="secondary-btn" type="button" hidden>Stop</button>','<button id="supplier-sites-check-shopify" class="secondary-btn" type="button">Check Shopify matches</button><button id="supplier-sites-rescan" class="secondary-btn" type="button">Run one pass</button><button id="supplier-sites-stop" class="secondary-btn" type="button" hidden>Stop</button>')
start=s.find('  function productStatusDot(item){'); end=s.find('\n  function renderProducts(){',start)
if start==-1 or end==-1: raise SystemExit('Could not find productStatusDot')
s=s[:start]+'''  function productStatusDot(item){
    const match=item?.suggestions?.existingProduct||item?.draft?.suggestions?.existingProduct;
    const created=Boolean(item?.shopifyProduct?.id||item?.status==='created');
    const confirmed=Boolean(match?.confirmed===true||match?.matchLevel==='confirmed'||match?.exact===true);
    if(created||confirmed)return {cls:'exists',label:created?'Created / exists in Shopify':`Confirmed Shopify match${match?.title?`: ${match.title}`:''}`};
    const hasError=item?.status==='failed'||Boolean(String(item?.error||'').trim()&&!/already exists|skipped duplicate|exists in shopify/i.test(String(item?.error||'')));
    if(hasError)return {cls:'error',label:'Error present'};
    if(match)return {cls:'review',label:`Possible Shopify match${match.title?`: ${match.title}`:''} — review`};
    return {cls:'review',label:'Review required'};
  }
'''+s[end:]
if 'async function reconcileShopifyMatches(' not in s:
    marker='  async function openBatch(id){'; pos=s.find(marker)
    fn='''  async function reconcileShopifyMatches(manual=false){
    if(!state.activeBatch||state.reconciling)return;
    state.reconciling=true;
    const btn=$('supplier-sites-check-shopify'); if(btn)btn.disabled=true;
    try{
      if(manual)setStatus('Checking this supplier catalogue against Shopify…','warn');
      const data=await api(`/batches/${state.activeBatch._id}/reconcile-shopify`,{method:'POST',body:JSON.stringify({maxProducts:2500})});
      state.activeBatch=data.batch; state.reconciled.add(String(data.batch._id)); renderProducts();
      if(manual)setStatus(`Shopify check complete: ${data.confirmed||0} confirmed existing, ${data.possible||0} possible matches to review, ${data.unmatched||0} unmatched.`,'ok');
    }catch(error){if(manual)setStatus(`Shopify match check failed: ${esc(error.message)}`,'err');}
    finally{state.reconciling=false;if(btn)btn.disabled=false;}
  }

'''
    s=s[:pos]+fn+s[pos:]
s=s.replace("  async function openBatch(id){\n    const data=await api(`/batches/${id}`);\n    state.activeBatch=data.batch;\n    renderSites();\n    renderProducts();\n  }","  async function openBatch(id){\n    const data=await api(`/batches/${id}`);\n    state.activeBatch=data.batch;\n    renderSites();\n    renderProducts();\n    if(!state.reconciled.has(String(id)))reconcileShopifyMatches(false);\n  }")
# remove footer override button and wiring
s=s.replace('            <button id="spm-override-create" type="button" class="supplier-override-btn" hidden>Override match & create draft</button>\n','')
s=s.replace("    $('spm-override-create').addEventListener('click',()=>createItemShopifyDraft(true));\n",'')
s=re.sub(r"\n\s*const existingMatch=item\?\.suggestions\?\.existingProduct\|\|item\?\.draft\?\.suggestions\?\.existingProduct;\n\s*const overrideBtn=\$\('spm-override-create'\);\n\s*if\(overrideBtn\) overrideBtn\.hidden=!existingMatch \|\| item\.status==='created';",'',s)
s=s.replace("        const overrideBtn=$('spm-override-create');\n        if(overrideBtn) overrideBtn.hidden=false;\n",'')
s=s.replace("      const overrideBtn=$('spm-override-create');\n      if(overrideBtn) overrideBtn.hidden=true;\n",'')
if 'function showMatchWarning(' not in s:
    marker="  function modalStatus(message,kind=''){"; pos=s.find(marker)
    fn='''  function showMatchWarning(match){
    const el=$('spm-status'); if(!el||!match)return;
    el.hidden=false; el.className='pci-status warn supplier-match-warning';
    el.innerHTML=`<div><strong>${match.confirmed?'Existing Shopify product':'Possible Shopify match'}</strong><span>${esc(match.title||'Product')} · ${Math.round(Number(match.confidence||0)*100)}% confidence</span></div><div class="supplier-match-actions"><button id="spm-force-create-top" type="button" class="supplier-override-btn">This is different · Create new draft</button></div>`;
    $('spm-force-create-top')?.addEventListener('click',()=>createItemShopifyDraft(true));
  }

'''
    s=s[:pos]+fn+s[pos:]
s=s.replace("    $('spm-status').hidden=true;\n    $('supplier-product-modal').hidden=false;","    $('spm-status').hidden=true;\n    const existingMatch=item?.suggestions?.existingProduct||item?.draft?.suggestions?.existingProduct;\n    if(existingMatch)showMatchWarning(existingMatch);\n    $('supplier-product-modal').hidden=false;")
s=s.replace("        modalStatus(\n          existing\n            ? `No draft created — this matches existing Shopify product \"${existing.title}\" (${Math.round(Number(existing.confidence||0)*100)}% match).`\n            : 'No draft created — Shopify duplicate protection skipped this product.',\n          'warn'\n        );","        if(existing)showMatchWarning(existing);\n        else modalStatus('No draft created — Shopify duplicate protection skipped this product.','warn');")
s=s.replace("    $('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);","    $('supplier-sites-check-shopify')?.addEventListener('click',()=>reconcileShopifyMatches(true));\n    $('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);")
if 'window.openSupplierImportWorkspace' not in s:
    marker="  document.addEventListener('DOMContentLoaded',boot);"
    s=s.replace(marker,"  window.openSupplierImportWorkspace=(mode='build')=>{ window.pciTab?.('supplier-sites'); setTimeout(()=>{ if(mode==='catalogue'){ document.querySelector('.supplier-sites-list-wrap')?.scrollIntoView({behavior:'smooth',block:'start'}); loadSites(); } else { $('supplier-site-url')?.focus(); } },80); };\n\n"+marker)
p.write_text(s)

# 5. Product Import launcher.
p=Path('public/admin.html')
s=p.read_text()
old='''          <div class="pci-card">
            <h3>Create products from URLs, invoices or manual data</h3>
            <p>Scan an external product page, upload an invoice image, match invoice lines to existing Shopify products, or create new Shopify draft products safely. Products are created as drafts first so they can be checked before publishing.</p>
            <div class="pci-tabs" role="tablist">
              <button type="button" class="pci-tab active" data-pci-tab="url" onclick="window.pciTab('url')">URL Import</button>
              <button type="button" class="pci-tab" data-pci-tab="batch" onclick="window.pciTab('batch')">Batch Import</button>
              <button type="button" class="pci-tab" data-pci-tab="invoice" onclick="window.pciTab('invoice')">Invoice Import</button>
              <button type="button" class="pci-tab" data-pci-tab="manual" onclick="window.pciTab('manual')">Manual Create</button>
              <button type="button" class="pci-tab" data-pci-tab="metafields" onclick="window.pciTab('metafields')">Metafield Mapper</button>
              <button type="button" class="pci-tab" data-pci-tab="settings" onclick="window.pciTab('settings')">Settings</button>
              <button type="button" class="pci-tab" data-pci-tab="po" onclick="window.pciTab('po')">PO Drafts</button>
              <button type="button" class="pci-tab" data-pci-tab="history" onclick="window.pciTab('history')">History</button>
            </div>
          </div>'''
new='''          <div class="pci-card pci-import-launcher">
            <span class="pci-launch-kicker">START HERE</span>
            <h3>What are you importing?</h3>
            <p>Start with the workflow, not the tool. Build or review a brand catalogue when you want the whole range; use single or multiple import when you already know the products.</p>
            <div class="pci-import-launch-grid">
              <button type="button" class="pci-import-launch-card" onclick="window.pciTab('url')"><span class="pci-launch-number">01</span><strong>Import single product</strong><small>Paste one product URL, review the draft and create it in Shopify.</small><b>Start single import →</b></button>
              <button type="button" class="pci-import-launch-card" onclick="window.pciTab('batch')"><span class="pci-launch-number">02</span><strong>Import multiple products</strong><small>Bring in a known list of product URLs and review them together.</small><b>Open batch import →</b></button>
              <button type="button" class="pci-import-launch-card featured" onclick="window.openSupplierImportWorkspace?.('build')"><span class="pci-launch-number">03</span><strong>Build brand catalogue</strong><small>Give us a supplier or brand site once. Discover the range and identify what is genuinely new.</small><b>Build catalogue →</b></button>
              <button type="button" class="pci-import-launch-card" onclick="window.openSupplierImportWorkspace?.('catalogue')"><span class="pci-launch-number">04</span><strong>Brand product catalogue</strong><small>Open saved brand catalogues, cross-check Shopify and work only on missing products.</small><b>Review catalogues →</b></button>
            </div>
            <div class="pci-launch-tools"><span>More tools</span><div class="pci-tabs" role="tablist">
              <button type="button" class="pci-tab active" data-pci-tab="url" onclick="window.pciTab('url')">Single</button>
              <button type="button" class="pci-tab" data-pci-tab="batch" onclick="window.pciTab('batch')">Multiple</button>
              <button type="button" class="pci-tab" data-pci-tab="invoice" onclick="window.pciTab('invoice')">Invoice</button>
              <button type="button" class="pci-tab" data-pci-tab="manual" onclick="window.pciTab('manual')">Manual</button>
              <button type="button" class="pci-tab" data-pci-tab="metafields" onclick="window.pciTab('metafields')">Metafields</button>
              <button type="button" class="pci-tab" data-pci-tab="settings" onclick="window.pciTab('settings')">Settings</button>
              <button type="button" class="pci-tab" data-pci-tab="po" onclick="window.pciTab('po')">PO Drafts</button>
              <button type="button" class="pci-tab" data-pci-tab="history" onclick="window.pciTab('history')">History</button>
            </div></div>
          </div>'''
if old in s: s=s.replace(old,new)
elif 'pci-import-launch-grid' not in s: raise SystemExit('Could not replace Product Import launcher')
s=re.sub(r'/supplier-sites-admin\.js\?v=[^"\']+','/supplier-sites-admin.js?v=supplier-sites-10',s)
s=re.sub(r'/supplier-sites-admin\.css\?v=[^"\']+','/supplier-sites-admin.css?v=supplier-sites-10',s)
s=re.sub(r'/product-creation-import\.css\?v=[^"\']+','/product-creation-import.css?v=pci-v42',s)
p.write_text(s)

# 6. CSS.
p=Path('public/supplier-sites-admin.css'); s=p.read_text()
if '.supplier-match-warning{' not in s:
    s+='''\n.supplier-match-warning{display:flex;align-items:center;justify-content:space-between;gap:14px}\n.supplier-match-warning>div:first-child{display:grid;gap:2px}\n.supplier-match-warning>div:first-child span{font-weight:600}\n.supplier-match-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}\n@media(max-width:760px){.supplier-match-warning{align-items:stretch;flex-direction:column}.supplier-match-actions{width:100%;flex-wrap:wrap}}\n'''
p.write_text(s)

p=Path('public/product-creation-import.css'); s=p.read_text()
if '.pci-import-launch-grid{' not in s:
    s+='''\n.pci-import-launcher{padding:20px}.pci-launch-kicker{display:block;font-size:11px;font-weight:900;letter-spacing:.12em;color:#64748b;margin-bottom:5px}.pci-import-launch-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.pci-import-launch-card{appearance:none;text-align:left;display:flex;flex-direction:column;min-height:158px;border:1px solid #dbe2ea;border-radius:14px;background:#fff;padding:15px;cursor:pointer;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease}.pci-import-launch-card:hover{transform:translateY(-2px);border-color:#94a3b8;box-shadow:0 8px 24px rgba(15,23,42,.08)}.pci-import-launch-card.featured{background:#f8fafc;border-color:#94a3b8}.pci-launch-number{font-size:11px;font-weight:900;color:#94a3b8;margin-bottom:12px}.pci-import-launch-card strong{font-size:14px;color:#0f172a;margin-bottom:6px}.pci-import-launch-card small{display:block;color:#64748b;line-height:1.45;flex:1}.pci-import-launch-card b{font-size:12px;color:#0f172a;margin-top:13px}.pci-launch-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb}.pci-launch-tools>span{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}.pci-launch-tools .pci-tabs{margin:0}@media(max-width:1150px){.pci-import-launch-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.pci-import-launch-grid{grid-template-columns:1fr}.pci-import-launch-card{min-height:132px}}\n'''
p.write_text(s)

print('Applied guided Product Import layout + Shopify reconciliation + contextual override')
PY

node --check src/modules/product-creation-import/services/shopifyProduct.service.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js
npm run deploy:preflight

echo
echo "Product Import workflow update passed."
echo "Commit:"
echo "  git add src/modules/product-creation-import/services/shopifyProduct.service.js src/modules/product-creation-import/services/productImportBatch.service.js src/modules/product-creation-import/productCreationImport.routes.js public/supplier-sites-admin.js public/supplier-sites-admin.css public/admin.html public/product-creation-import.css"
echo '  git commit -m "Guide product import workflow and reconcile Shopify matches"'
echo "  git push origin clean-main"
