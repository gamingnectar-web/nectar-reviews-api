#!/usr/bin/env bash
set -euo pipefail

FILE="public/supplier-sites-admin.js"
CSS="public/supplier-sites-admin.css"

[ -f "$FILE" ] || { echo "Missing $FILE"; exit 1; }
[ -f "$CSS" ] || { echo "Missing $CSS"; exit 1; }

cp "$FILE" "$FILE.bak-v3"
cp "$CSS" "$CSS.bak-v3"

python3 - <<'PY'
from pathlib import Path
p=Path("public/supplier-sites-admin.js")
s=p.read_text()

# Replace the current scan loop with a one-item-per-request resilient scanner.
start=s.find("  async function scanBatch(id){")
if start < 0:
    start=s.find("  async function repairCatalogue(){")
if start < 0:
    raise SystemExit("Could not find scan/repair function in supplier-sites-admin.js")

# Find next function after this block.
next_markers=[
    "  async function createSite(){",
    "  function openBatchImporter(){",
    "  function wire(){"
]
end=-1
for m in next_markers:
    i=s.find(m,start+20)
    if i>=0 and (end<0 or i<end):
        end=i
if end<0:
    raise SystemExit("Could not find end of scan function")

new_scan=r"""  async function repairCatalogue(){
    if(state.scanning || !state.activeBatch) return;

    state.scanning=true;
    state.stop=false;
    const attempted=new Set();
    const scanButton=$('supplier-sites-rescan');
    const stopButton=$('supplier-sites-stop');
    if(scanButton) scanButton.disabled=true;
    if(stopButton) stopButton.hidden=false;

    let processed=0;
    let failed=0;

    try{
      while(!state.stop){
        // Reload every turn so the page always reflects what MongoDB actually saved.
        const latest=await api(`/batches/${state.activeBatch._id}`);
        state.activeBatch=latest.batch;
        renderProducts();

        const target=(state.activeBatch.items||[]).find(item =>
          ['queued','failed'].includes(item.status) && !attempted.has(item.itemId)
        );

        if(!target) break;
        attempted.add(target.itemId);

        const label=target.draft?.title || target.title || target.sourceUrl || target.itemId;
        setStatus(
          `Repairing ${processed+failed+1} of ${attempted.size + (state.activeBatch.items||[]).filter(i=>['queued','failed'].includes(i.status) && !attempted.has(i.itemId)).length}: ${esc(label)}. One product is processed per request so the catalogue can safely resume.`,
          'warn'
        );

        try{
          const result=await api(`/batches/${state.activeBatch._id}/scan`,{
            method:'POST',
            body:JSON.stringify({
              itemIds:[target.itemId],
              limit:1,
              processAll:false,
              useAi:false
            })
          });
          state.activeBatch=result.batch;
          processed += Number(result.processed || 1);
        }catch(error){
          failed += 1;
          // Do not terminate the whole catalogue because one supplier product failed.
          console.warn('[Supplier Sites] product repair failed', target.itemId, error);
        }

        renderProducts();
        await new Promise(resolve=>setTimeout(resolve,250));
      }

      await openBatch(state.activeBatch._id);
      const remaining=(state.activeBatch.items||[]).filter(i=>['queued','failed'].includes(i.status)).length;

      if(state.stop){
        setStatus(`Catalogue repair stopped. ${remaining} queued/failed product(s) remain. Press Repair queued / failed to resume.`,'warn');
      }else if(remaining){
        setStatus(`Repair pass finished: ${processed} repaired, ${failed} could not be repaired in this pass, ${remaining} still queued/failed. You can run it again safely.`,'warn');
      }else{
        setStatus(`Catalogue repair finished. ${processed} product(s) repaired. Click any product card to review or create its Shopify draft.`,'ok');
      }
    }finally{
      state.scanning=false;
      if(scanButton) scanButton.disabled=false;
      if(stopButton) stopButton.hidden=true;
    }
  }

"""
s=s[:start]+new_scan+s[end:]

# Ensure the stop button exists in the toolbar.
needle='<button id="supplier-sites-rescan" class="secondary-btn"'
idx=s.find(needle)
if idx>=0 and 'id="supplier-sites-stop"' not in s:
    close=s.find('</button>',idx)
    if close>=0:
        close += len('</button>')
        s=s[:close]+'<button id="supplier-sites-stop" class="secondary-btn" type="button" hidden>Stop</button>'+s[close:]

# Rename old scan handler usages to repairCatalogue.
s=s.replace("scanBatch(state.activeBatch._id)","repairCatalogue()")
s=s.replace("scanUntilComplete(state.activeBatch._id)","repairCatalogue()")
s=s.replace("scanUntilComplete(result.batch._id)","repairCatalogue()")
s=s.replace("scanBatch(data.batch._id)","repairCatalogue()")
s=s.replace("addEventListener('click',scanBatch)","addEventListener('click',repairCatalogue)")
s=s.replace("addEventListener('click',()=>state.activeBatch&&scanBatch(state.activeBatch._id))","addEventListener('click',repairCatalogue)")
s=s.replace("addEventListener('click',()=>state.activeBatch&&scanUntilComplete(state.activeBatch._id))","addEventListener('click',repairCatalogue)")

# Make sure state has stop.
s=s.replace(
    "const state={batches:[],activeBatch:null,scanning:false};",
    "const state={batches:[],activeBatch:null,activeItem:null,scanning:false,stop:false};"
)
s=s.replace(
    "const state = { batches: [], activeBatch: null, scanning: false };",
    "const state = { batches: [], activeBatch: null, activeItem: null, scanning: false, stop: false };"
)

# Make cards clickable if the existing renderer uses supplier-product-card.
card_token='<article class="supplier-product-card">'
if card_token in s:
    s=s.replace(card_token,'<button type="button" class="supplier-product-card" data-item-id="${esc(item.itemId)}">')
    s=s.replace('</article>`;','</button>`;',1)

# Inject modal helpers before wire().
wire_pos=s.find("  function wire(){")
if wire_pos<0:
    raise SystemExit("Could not find wire()")

modal_code=r"""
  function itemMetafield(item,key){
    const rows=[...(item?.metafieldPlan||[]),...(item?.draft?.metafields||[])];
    return rows.find(m=>`${m.namespace}.${m.key}`===key||m.key===key)?.value||'';
  }

  function itemImages(item){
    const draft=item?.draft||{};
    const rows=item?.selectedImages?.length ? item.selectedImages : (draft.images||[]);
    return rows.map(x=>typeof x==='string'?x:x?.src).filter(Boolean);
  }

  function ensureProductModal(){
    if($('supplier-product-modal')) return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="supplier-product-modal" class="supplier-modal" hidden>
        <div class="supplier-modal-backdrop" data-supplier-close></div>
        <div class="supplier-modal-panel">
          <div class="supplier-modal-head">
            <div><span class="pci-muted">SUPPLIER PRODUCT DRAFT</span><h3 id="spm-heading">Product</h3></div>
            <button type="button" class="secondary-btn" data-supplier-close>Close</button>
          </div>
          <div id="spm-status" class="pci-status" hidden></div>
          <div class="supplier-modal-grid">
            <main>
              <section class="pci-editor-card">
                <label class="pci-label">Title</label><input id="spm-title" class="pci-input">
                <label class="pci-label">Description</label><textarea id="spm-description" class="pci-textarea supplier-desc"></textarea>
              </section>
              <section class="pci-editor-card">
                <div class="pci-editor-card-head"><h4>Images</h4><span class="pci-muted">One URL per line.</span></div>
                <div id="spm-image-preview" class="supplier-modal-images"></div>
                <textarea id="spm-images" class="pci-textarea"></textarea>
              </section>
              <section class="pci-editor-card">
                <h4>SEO</h4>
                <label class="pci-label">Page title</label><input id="spm-seo-title" class="pci-input">
                <label class="pci-label">Meta description</label><textarea id="spm-seo-description" class="pci-textarea"></textarea>
                <label class="pci-label">URL handle</label><input id="spm-handle" class="pci-input">
              </section>
            </main>
            <aside>
              <section class="pci-editor-card">
                <h4>Commercial</h4>
                <label class="pci-label">Price</label><input id="spm-price" class="pci-input">
                <label class="pci-label">Compare-at price</label><input id="spm-compare" class="pci-input">
                <label class="pci-label">SKU</label><input id="spm-sku" class="pci-input">
                <label class="pci-label">Barcode / GTIN</label><input id="spm-barcode" class="pci-input">
              </section>
              <section class="pci-editor-card">
                <h4>Organisation</h4>
                <label class="pci-label">Vendor</label><input id="spm-vendor" class="pci-input">
                <label class="pci-label">Product type</label><input id="spm-type" class="pci-input">
                <label class="pci-label">Product category</label><input id="spm-category" class="pci-input">
                <label class="pci-label">Flavour</label><input id="spm-flavour" class="pci-input">
                <label class="pci-label">Product line / formula</label><input id="spm-line" class="pci-input">
              </section>
              <section class="pci-editor-card">
                <h4>Source</h4>
                <a id="spm-source" target="_blank" rel="noopener"></a>
                <p id="spm-validation" class="pci-muted"></p>
              </section>
            </aside>
          </div>
          <div class="supplier-modal-actions">
            <button id="spm-enrich" type="button" class="secondary-btn">Enrich this product</button>
            <button id="spm-save" type="button" class="secondary-btn">Save MongoDB draft</button>
            <button id="spm-create" type="button" class="primary-btn">Create Shopify Draft</button>
          </div>
        </div>
      </div>`);
    document.querySelectorAll('[data-supplier-close]').forEach(el=>el.addEventListener('click',closeItemModal));
    $('spm-save').addEventListener('click',saveItemModal);
    $('spm-enrich').addEventListener('click',enrichItemModal);
    $('spm-create').addEventListener('click',createItemShopifyDraft);
  }

  function modalStatus(message,kind=''){
    const el=$('spm-status'); if(!el)return;
    el.hidden=false; el.className=`pci-status ${kind}`.trim(); el.textContent=message;
  }

  function openItemModal(itemId){
    ensureProductModal();
    const item=(state.activeBatch?.items||[]).find(x=>x.itemId===itemId);
    if(!item)return;
    state.activeItem=item;
    const d=item.draft||{};
    const images=itemImages(item);
    $('spm-heading').textContent=d.title||item.title||'Product draft';
    $('spm-title').value=d.title||item.title||'';
    $('spm-description').value=d.descriptionHtml||'';
    $('spm-price').value=d.price||'';
    $('spm-compare').value=d.compareAtPrice||'';
    $('spm-sku').value=d.sku||'';
    $('spm-barcode').value=d.barcode||'';
    $('spm-vendor').value=d.vendor||item.vendor||'';
    $('spm-type').value=d.productType||item.productType||'';
    $('spm-category').value=d.productCategory||item.productCategory||'';
    $('spm-flavour').value=itemMetafield(item,'core.product_flavour')||'';
    $('spm-line').value=itemMetafield(item,'core.formula_version')||item.nutrition?.productLine||'';
    $('spm-seo-title').value=d.seo?.title||'';
    $('spm-seo-description').value=d.seo?.description||'';
    $('spm-handle').value=d.handle||'';
    $('spm-images').value=images.join('\n');
    $('spm-image-preview').innerHTML=images.slice(0,12).map(src=>`<img src="${esc(src)}" alt="">`).join('')||'<span class="pci-muted">No images selected.</span>';
    $('spm-source').href=item.sourceUrl||d.sourceUrl||'#';
    $('spm-source').textContent=item.sourceUrl||d.sourceUrl||'No source URL';
    $('spm-validation').textContent=`Status: ${item.status||'queued'} · ${(item.validation?.issues||[]).join(' · ')||item.error||'No validation message'}`;
    $('spm-status').hidden=true;
    $('supplier-product-modal').hidden=false;
    document.body.classList.add('supplier-modal-open');
  }

  function closeItemModal(){
    const modal=$('supplier-product-modal');
    if(modal) modal.hidden=true;
    document.body.classList.remove('supplier-modal-open');
    state.activeItem=null;
  }

  function mergeCore(rows,key,value,label){
    const next=[...(rows||[])].filter(m=>!(m.namespace==='core'&&m.key===key));
    if(String(value||'').trim()) next.push({namespace:'core',key,type:'single_line_text_field',value:String(value).trim(),label,source:'merchant-edit'});
    return next;
  }

  function readModalDraft(){
    const d=state.activeItem?.draft||{};
    let metafields=[...(d.metafields||[])];
    metafields=mergeCore(metafields,'product_flavour',$('spm-flavour').value,'Product Flavour');
    metafields=mergeCore(metafields,'formula_version',$('spm-line').value,'Formula / Product Line');
    const images=$('spm-images').value.split(/\n|,/).map(x=>x.trim()).filter(Boolean).map((src,index)=>({src,alt:index?`${$('spm-title').value} product image ${index+1}`:$('spm-title').value}));
    return {
      ...d,
      title:$('spm-title').value.trim(),
      descriptionHtml:$('spm-description').value,
      price:$('spm-price').value.trim(),
      compareAtPrice:$('spm-compare').value.trim(),
      sku:$('spm-sku').value.trim(),
      barcode:$('spm-barcode').value.trim(),
      vendor:$('spm-vendor').value.trim(),
      productType:$('spm-type').value.trim(),
      productCategory:$('spm-category').value.trim(),
      handle:$('spm-handle').value.trim(),
      images,
      metafields,
      seo:{title:$('spm-seo-title').value.trim(),description:$('spm-seo-description').value.trim()}
    };
  }

  async function saveItemModal(){
    if(!state.activeBatch||!state.activeItem)return null;
    try{
      const draft=readModalDraft();
      const data=await api(`/batches/${state.activeBatch._id}/items/${state.activeItem.itemId}`,{
        method:'PATCH',
        body:JSON.stringify({draft,selectedImages:draft.images})
      });
      state.activeBatch=data.batch;
      state.activeItem=data.item;
      renderProducts();
      modalStatus('Saved to the MongoDB draft.','ok');
      return data.item;
    }catch(error){
      modalStatus(error.message||'Could not save product draft.','err');
      throw error;
    }
  }

  async function enrichItemModal(){
    const id=state.activeItem?.itemId;
    if(!id)return;
    try{
      await saveItemModal();
      modalStatus('Enriching this product only…','warn');
      const data=await api(`/batches/${state.activeBatch._id}/enrich`,{
        method:'POST',
        body:JSON.stringify({itemIds:[id],useAi:true})
      });
      state.activeBatch=data.batch;
      renderProducts();
      openItemModal(id);
      modalStatus('Enrichment complete. Review the fields before creating the Shopify draft.','ok');
    }catch(error){
      modalStatus(error.message||'Product enrichment failed.','err');
    }
  }

  async function createItemShopifyDraft(){
    const id=state.activeItem?.itemId;
    if(!id)return;
    try{
      await saveItemModal();
      modalStatus('Creating an unpublished Shopify draft product…','warn');
      const data=await api(`/batches/${state.activeBatch._id}/create-shopify-drafts`,{
        method:'POST',
        body:JSON.stringify({itemIds:[id],approvedOnly:false})
      });
      const failed=(data.results||[]).find(x=>x.itemId===id&&x.status==='failed');
      if(failed) throw new Error(failed.error||'Shopify draft creation failed.');
      state.activeBatch=data.batch;
      renderProducts();
      modalStatus('Shopify draft product created successfully.','ok');
      $('spm-validation').textContent='Status: created';
    }catch(error){
      modalStatus(error.message||'Could not create Shopify draft.','err');
    }
  }

  function bindProductCards(){
    document.querySelectorAll('#supplier-products-grid [data-item-id]').forEach(el=>{
      el.onclick=()=>openItemModal(el.dataset.itemId);
    });
  }

"""
s=s[:wire_pos]+modal_code+s[wire_pos:]

# Ensure renderProducts binds cards after rendering.
render_end_token="    }).join('')"
pos=s.find(render_end_token)
if pos>=0:
    # Find semicolon after this join assignment and append bind call only if absent nearby.
    semi=s.find(";",pos)
    if semi>=0 and "bindProductCards();" not in s[semi:semi+200]:
        s=s[:semi+1]+"\n    bindProductCards();"+s[semi+1:]

# Add stop button event and correct repair click event inside wire.
s=s.replace(
    "$('supplier-sites-rescan')?.addEventListener('click',()=>state.activeBatch&&repairCatalogue());",
    "$('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);"
)
s=s.replace(
    "$('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);",
    "$('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);\n    $('supplier-sites-stop')?.addEventListener('click',()=>{state.stop=true;});",
    1
)

p.write_text(s)
print("Updated",p)
PY

cat >> "$CSS" <<'EOF'

/* Supplier Sites v3 modal */
.supplier-product-card{appearance:none;width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit}
.supplier-product-card:hover{border-color:#0f172a;box-shadow:0 3px 14px rgba(15,23,42,.08)}
.supplier-modal[hidden]{display:none!important}
.supplier-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-start;justify-content:center;padding:22px;overflow:auto}
.supplier-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px)}
.supplier-modal-panel{position:relative;width:min(1180px,96vw);margin:auto;background:#f8fafc;border-radius:18px;box-shadow:0 24px 80px rgba(15,23,42,.3);padding:18px}
.supplier-modal-head{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px}
.supplier-modal-head h3{margin:4px 0 0}
.supplier-modal-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:14px}
.supplier-modal-grid main,.supplier-modal-grid aside{display:grid;gap:12px;align-content:start}
.supplier-modal-grid .pci-editor-card{background:#fff}
.supplier-modal-grid .pci-label{display:block;margin-top:10px}
.supplier-desc{min-height:220px}
.supplier-modal-images{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0}
.supplier-modal-images img{width:100%;aspect-ratio:1;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
.supplier-modal-actions{display:flex;justify-content:flex-end;gap:10px;position:sticky;bottom:0;margin:16px -18px -18px;padding:14px 18px;background:rgba(255,255,255,.97);border-top:1px solid #e2e8f0;border-radius:0 0 18px 18px}
body.supplier-modal-open{overflow:hidden}
@media(max-width:850px){
  .supplier-modal{padding:8px}
  .supplier-modal-panel{width:100%;padding:12px}
  .supplier-modal-grid{grid-template-columns:1fr}
  .supplier-modal-images{grid-template-columns:repeat(3,1fr)}
  .supplier-modal-actions{margin:12px -12px -12px;flex-wrap:wrap}
}
EOF

node --check "$FILE"

echo
echo "Supplier Sites v3 patch installed."
echo "Run:"
echo "  npm run deploy:preflight"
echo "  git add public/supplier-sites-admin.js public/supplier-sites-admin.css"
echo '  git commit -m "Make supplier catalogue scan resumable and add product draft modal"'
echo "  git push origin clean-main"


echo
echo "== Applying production safety fixes =="

# 1) Prefer Shopify catalogue JSON for full-site imports and retain structured records.
cat > src/modules/product-creation-import/services/siteCatalogDiscovery.service.js <<'EOF'
const { cleanUrl } = require('../utils/safe');
const { supplierDefaultsForUrl } = require('./supplierProfile.service');

function xmlLocs(xml=''){ return Array.from(String(xml).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)).map(m=>m[1].trim()); }
function productUrl(url=''){ try{return /\/products\/[^/?#]+\/?$/.test(new URL(url).pathname);}catch(_){return false;} }

async function fetchText(url,timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      headers:{'User-Agent':'Mozilla/5.0 ELEV8 Product Importer/2.0','Accept':'application/json,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8'},
      redirect:'follow',
      signal:controller.signal
    });
    if(!response.ok) throw new Error(`Discovery fetch failed ${response.status} for ${url}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function discoverShopifyCatalogue(rootUrl,maxProducts=500){
  const root=new URL(rootUrl);
  const products=[];
  for(let page=1; products.length<maxProducts && page<=10; page+=1){
    let json;
    try{ json=JSON.parse(await fetchText(`${root.origin}/products.json?limit=250&page=${page}`)); }
    catch(_){ break; }
    const rows=Array.isArray(json.products)?json.products:[];
    if(!rows.length) break;
    for(const product of rows){
      if(product?.handle) products.push(product);
      if(products.length>=maxProducts) break;
    }
    if(rows.length<250) break;
  }
  return products.slice(0,maxProducts);
}

async function discoverFromSitemap(rootUrl,maxProducts=500){
  const root=new URL(rootUrl);
  const main=await fetchText(`${root.origin}/sitemap.xml`);
  const locs=xmlLocs(main);
  const direct=locs.filter(productUrl);
  const childMaps=locs.filter(url=>/sitemap.*\.xml/i.test(url));
  const products=[...direct];
  for(const mapUrl of childMaps){
    if(products.length>=maxProducts) break;
    if(!/product/i.test(mapUrl)&&childMaps.some(x=>/product/i.test(x))) continue;
    try{
      const xml=await fetchText(mapUrl);
      for(const url of xmlLocs(xml)){
        if(productUrl(url)) products.push(url);
        if(products.length>=maxProducts) break;
      }
    }catch(error){ console.warn('[site-import] sitemap child skipped:',mapUrl,error.message); }
  }
  return Array.from(new Set(products)).slice(0,maxProducts);
}

async function discoverShopifyProductsJson(rootUrl,maxProducts=500){
  const root=new URL(rootUrl);
  const products=await discoverShopifyCatalogue(rootUrl,maxProducts);
  return products.map(product=>`${root.origin}/products/${product.handle}`);
}

async function discoverSiteProducts({rootUrl,maxProducts=500}){
  const safe=cleanUrl(rootUrl);
  if(!safe) throw new Error('A valid supplier website URL is required.');
  const root=new URL(safe);

  const structured=await discoverShopifyCatalogue(safe,maxProducts).catch(()=>[]);
  if(structured.length){
    return {
      rootUrl:safe,
      method:'shopify-products-json',
      urls:structured.map(product=>`${root.origin}/products/${product.handle}`),
      products:structured,
      count:structured.length,
      supplierDefaults:supplierDefaultsForUrl(safe)
    };
  }

  let urls=[];
  try{ urls=await discoverFromSitemap(safe,maxProducts); }
  catch(error){ console.warn('[site-import] sitemap discovery failed:',error.message); }
  if(!urls.length) throw new Error('No product URLs could be discovered from this site.');

  return {rootUrl:safe,method:'sitemap',urls,products:[],count:urls.length,supplierDefaults:supplierDefaultsForUrl(safe)};
}

module.exports={discoverSiteProducts,discoverFromSitemap,discoverShopifyProductsJson,discoverShopifyCatalogue};
EOF

# 2) Seed site imports from structured Shopify data and add final duplicate guard.
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

old="""async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = true, autoApproveReady = true, autoCreateDrafts = false, batchSize = 12 }) {
  const discovery = await discoverSiteProducts({ rootUrl, maxProducts });
  const defaults = { ...discovery.supplierDefaults, ...supplierDefaultsForUrl(rootUrl) };
  const result = await createBatch({ shopDomain, name: name || `${defaults.vendor || defaults.supplierName || 'Supplier'} full site import`, defaults, links: discovery.urls });
  result.batch.automation = { siteImport: true, supplierProfile: profileForUrl(rootUrl), useAi: useAi !== false, autoApproveReady: autoApproveReady !== false, autoCreateDrafts: Boolean(autoCreateDrafts), batchSize: Math.max(1, Math.min(Number(batchSize || 12), 25)), discoveryMethod: discovery.method, discoveredCount: discovery.count };
  await result.batch.save();
  return { ...result, discovery: { method: discovery.method, count: discovery.count, rootUrl: discovery.rootUrl } };
}"""

new=r"""function siteShopifyDraft(product = {}, sourceUrl = '', defaults = {}) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const first = variants.find(v => v && v.available !== false) || variants[0] || {};
  const bodyHtml = String(product.body_html || product.description || '');
  const images = (Array.isArray(product.images) ? product.images : []).map((image,index)=>({
    src: typeof image === 'string' ? image : (image?.src || ''),
    alt: cleanText(typeof image === 'object' ? image?.alt || '' : '', 180) || `${product.title || 'Product'} image ${index+1}`,
    originalIndex: Number.isFinite(Number(image?.position)) ? Number(image.position)-1 : index,
    source: 'shopify-products-json'
  })).filter(x=>x.src);

  let draft = normaliseDraftProduct({
    ...defaults,
    source:'shopify-products-json',
    sourceUrl,
    title:product.title || '',
    handle:product.handle || '',
    descriptionHtml:bodyHtml,
    vendor:product.vendor || defaults.vendor || defaults.brand || '',
    productType:product.product_type || product.type || defaults.productType || '',
    price:first.price || '',
    compareAtPrice:first.compare_at_price || '',
    sku:(variants.find(v=>v?.sku)?.sku || first.sku || ''),
    barcode:(variants.find(v=>v?.barcode)?.barcode || first.barcode || ''),
    weight:Number(first.grams || 0)>0 ? String(first.grams) : '',
    weightUnit:'g',
    images,
    tags:Array.isArray(product.tags) ? product.tags : String(product.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
    seo:{title:product.title || '',description:cleanText(bodyHtml.replace(/<[^>]+>/g,' '),160)}
  });

  draft = applySupplierProfile(draft);
  return normaliseDraftProduct(draft);
}

async function createSiteImportBatch({ shopDomain, rootUrl, name = '', maxProducts = 500, useAi = true, autoApproveReady = true, autoCreateDrafts = false, batchSize = 12 }) {
  const discovery = await discoverSiteProducts({ rootUrl, maxProducts });
  const defaults = { ...discovery.supplierDefaults, ...supplierDefaultsForUrl(rootUrl) };
  const result = await createBatch({
    shopDomain,
    name: name || `${defaults.vendor || defaults.supplierName || 'Supplier'} full site import`,
    defaults,
    links: discovery.urls
  });

  if (Array.isArray(discovery.products) && discovery.products.length) {
    const byHandle = new Map(discovery.products.map(product => [String(product.handle || '').toLowerCase(), product]));
    for (const item of result.batch.items) {
      let handle='';
      try{ handle=new URL(item.sourceUrl).pathname.split('/products/')[1]?.split('/')[0]?.toLowerCase() || ''; }catch(_){}
      const product=byHandle.get(handle);
      if(!product) continue;

      const draft=siteShopifyDraft(product,item.sourceUrl,defaults);
      item.title=draft.title;
      item.vendor=draft.vendor;
      item.productType=draft.productType;
      item.productCategory=draft.productCategory;
      item.templateSuffix=draft.themeTemplate || '';
      item.draft=draft;
      item.extractedData={
        source:'shopify-products-json',
        sourceProductId:product.id || '',
        handle:product.handle || '',
        rawSupplierProduct:product,
        sourceVariants:product.variants || [],
        sourceOptions:product.options || [],
        imageCount:draft.images?.length || 0
      };
      item.imageCandidates=draft.images || [];
      item.selectedImages=draft.images || [];
      item.metafieldPlan=draft.metafields || [];
      item.confidence=0.99;
      item.status='needs_review';
      item.approvalStatus='pending';
      item.error='';
      item.updatedAt=new Date();
    }
  }

  result.batch.automation = {
    siteImport:true,
    supplierProfile:profileForUrl(rootUrl),
    useAi:useAi !== false,
    autoApproveReady:autoApproveReady !== false,
    autoCreateDrafts:Boolean(autoCreateDrafts),
    batchSize:Math.max(1,Math.min(Number(batchSize || 12),25)),
    discoveryMethod:discovery.method,
    discoveredCount:discovery.count
  };
  refreshBatchSummary(result.batch);
  await result.batch.save();
  return {...result,discovery:{method:discovery.method,count:discovery.count,rootUrl:discovery.rootUrl,structuredSeeded:Boolean(discovery.products?.length)}};
}"""

if old not in s:
    raise SystemExit("Could not patch createSiteImportBatch; current file differs from expected clean-main.")
s=s.replace(old,new)

old_create="""      const product = await createShopifyProductFromDraft({ shopDomain, draft: item.draft });
      item.shopifyProduct = product;"""

new_create="""      const existing = await detectExistingProduct({ shopDomain, draft: item.draft });
      if (existing) {
        item.status = 'skipped';
        item.approvalStatus = 'rejected';
        item.error = `Skipped duplicate: ${existing.title || item.draft?.title || 'product'} already exists in Shopify.`;
        results.push({ itemId: item.itemId, status: 'skipped', existingProduct: existing });
        continue;
      }

      const product = await createShopifyProductFromDraft({
        shopDomain,
        draft: {
          ...(item.draft || {}),
          sourceVariants: item.extractedData?.sourceVariants || item.extractedData?.rawSupplierProduct?.variants || [],
          sourceOptions: item.extractedData?.sourceOptions || item.extractedData?.rawSupplierProduct?.options || []
        }
      });
      item.shopifyProduct = product;"""

if old_create not in s:
    raise SystemExit("Could not patch Shopify create call.")
s=s.replace(old_create,new_create)

p.write_text(s)
print("Patched productImportBatch.service.js")
PY

# 3) Fix protocol-relative supplier image URLs.
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/extractors/urlProductExtractor.js")
s=p.read_text()
s=s.replace("function shopifyImageList(product = {}, title = '') {","function shopifyImageList(product = {}, title = '', baseUrl = '') {")
s=s.replace("return { src:image, alt:index===0?title:`${title} product image ${index+1}`, source:'shopify-public-json', originalIndex:index };",
            "return { src:absolutizeUrl(image, baseUrl), alt:index===0?title:`${title} product image ${index+1}`, source:'shopify-public-json', originalIndex:index };")
s=s.replace("src:image?.src || image?.url || '',",
            "src:absolutizeUrl(image?.src || image?.url || '', baseUrl),")
s=s.replace("const images=shopifyImageList(product,title);","const images=shopifyImageList(product,title,sourceUrl);")
p.write_text(s)
print("Patched protocol-relative Shopify images")
PY

# 4) Give X-Zero a visible product-line/formula metafield.
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/services/supplierProfiles/xZero.profile.js")
s=p.read_text()
needle="""  const standardMetafields = [
    meta('core','product_flavour','single_line_text_field',flavour,'Product Flavour',0.99),"""
replacement="""  const standardMetafields = [
    meta('core','product_flavour','single_line_text_field',flavour,'Product Flavour',0.99),
    meta('core','formula_version','single_line_text_field',defaults.facts.product_family || defaults.productType || family,'Product Line / Formula',0.99),"""
if needle not in s:
    raise SystemExit("Could not patch X-Zero product line metafield.")
s=s.replace(needle,replacement)
p.write_text(s)
print("Patched X-Zero product line")
PY

# 5) Preserve real supplier variants/options when creating a Shopify draft.
python3 - <<'PY'
from pathlib import Path
p=Path("src/modules/product-creation-import/services/shopifyProduct.service.js")
s=p.read_text()

needle="""async function createShopifyProductFromDraft({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const tags = Array.isArray(normalised.tags) ? normalised.tags.join(', ') : String(normalised.tags || '');
  const variant = {
    price: toMoney(normalised.price) || '0.00',
    compare_at_price: toMoney(normalised.compareAtPrice) || undefined,
    sku: normalised.sku || undefined,
    barcode: normalised.barcode || undefined,
    weight: normalised.weight ? Number(normalised.weight) : undefined,
    weight_unit: normalised.weight ? (normalised.weightUnit || 'g') : undefined,
    inventory_management: 'shopify',
    option1: 'Default Title',
  };"""

replacement=r"""async function createShopifyProductFromDraft({ shopDomain, draft }) {
  const sourceVariants = Array.isArray(draft?.sourceVariants) ? draft.sourceVariants : [];
  const sourceOptions = Array.isArray(draft?.sourceOptions) ? draft.sourceOptions : [];
  const normalised = normaliseDraftProduct(draft || {});
  const tags = Array.isArray(normalised.tags) ? normalised.tags.join(', ') : String(normalised.tags || '');

  const sourceMoney = (value, fallback='0.00') => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'number' && Number.isFinite(value)) return (value / 100).toFixed(2);
    return toMoney(value) || fallback;
  };

  const fallbackVariant = {
    price: toMoney(normalised.price) || '0.00',
    compare_at_price: toMoney(normalised.compareAtPrice) || undefined,
    sku: normalised.sku || undefined,
    barcode: normalised.barcode || undefined,
    weight: normalised.weight ? Number(normalised.weight) : undefined,
    weight_unit: normalised.weight ? (normalised.weightUnit || 'g') : undefined,
    inventory_management: 'shopify',
    option1: 'Default Title',
  };

  const variants = sourceVariants.length > 1 ? sourceVariants.slice(0,100).map((source,index) => {
    const grams = Number(source?.grams || 0);
    return {
      price: sourceMoney(source?.price, toMoney(normalised.price) || '0.00'),
      compare_at_price: sourceMoney(source?.compare_at_price, '') || undefined,
      sku: cleanText(source?.sku || '',120) || undefined,
      barcode: cleanText(source?.barcode || '',120) || undefined,
      weight: grams > 0 ? grams : (source?.weight ? Number(source.weight) : undefined),
      weight_unit: grams > 0 ? 'g' : (source?.weight_unit || source?.weightUnit || undefined),
      inventory_management: 'shopify',
      option1: source?.option1 || source?.title || `Option ${index+1}`,
      option2: source?.option2 || undefined,
      option3: source?.option3 || undefined,
    };
  }) : [fallbackVariant];

  const options = sourceVariants.length > 1 ? sourceOptions.map((option,index) => {
    if (typeof option === 'string') return { name: option || `Option ${index+1}` };
    const name = cleanText(option?.name || `Option ${index+1}`,120);
    const values = Array.isArray(option?.values) ? option.values.map(value => typeof value === 'string' ? value : (value?.name || value?.value || '')).filter(Boolean) : [];
    return { name, ...(values.length ? { values } : {}) };
  }).filter(option => option.name && !/^title$/i.test(option.name)) : [];"""

if needle not in s:
    raise SystemExit("Could not patch createShopifyProductFromDraft variant setup.")
s=s.replace(needle,replacement)

old="""    variants: [variant],
    // Shopify's product SEO fields are stored through the legacy global SEO fields."""

new="""    variants,
    ...(options.length ? { options } : {}),
    // Shopify's product SEO fields are stored through the legacy global SEO fields."""

if old not in s:
    raise SystemExit("Could not patch Shopify product variants payload.")
s=s.replace(old,new)

p.write_text(s)
print("Patched Shopify multi-variant creation")
PY

node --check src/modules/product-creation-import/services/siteCatalogDiscovery.service.js
node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/extractors/urlProductExtractor.js
node --check src/modules/product-creation-import/services/supplierProfiles/xZero.profile.js
node --check src/modules/product-creation-import/services/shopifyProduct.service.js
node --check public/supplier-sites-admin.js

echo
echo "== Running repo preflight =="
npm run deploy:preflight

echo
echo "Production safety patch passed local syntax/preflight."
echo "Review git diff before pushing:"
echo "  git diff --check"
echo "  git diff --stat"
echo
echo "Then:"
echo "  git add public/supplier-sites-admin.js public/supplier-sites-admin.css \\"
echo "    src/modules/product-creation-import/services/siteCatalogDiscovery.service.js \\"
echo "    src/modules/product-creation-import/services/productImportBatch.service.js \\"
echo "    src/modules/product-creation-import/extractors/urlProductExtractor.js \\"
echo "    src/modules/product-creation-import/services/supplierProfiles/xZero.profile.js \\"
echo "    src/modules/product-creation-import/services/shopifyProduct.service.js"
echo '  git commit -m "Harden supplier site imports for production use"'
echo "  git push origin clean-main"
