(function SupplierSitesAdmin(){
  const API='/admin/product-creation-import';
  const state={batches:[],activeBatch:null,activeItem:null,scanning:false,stop:false};
  const $=id=>document.getElementById(id);
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  async function api(path,options={}){
    if(typeof window.adminFetch==='function'){
      return window.adminFetch(`${API}${path}`,options);
    }
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(window.SHOP_DOMAIN) headers['x-shop-domain']=window.SHOP_DOMAIN;
    const res=await fetch(`/api${API}${path}`,{...options,headers});
    const json=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(json.error||json.message||`Request failed (${res.status})`);
    return json;
  }

  function ensureUi(){
    const root=document.querySelector('#v-product-creation-import');
    const tabs=root?.querySelector('.pci-tabs');
    if(!root||!tabs) return false;

    if(!tabs.querySelector('[data-pci-tab="supplier-sites"]')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='pci-tab';
      btn.dataset.pciTab='supplier-sites';
      btn.textContent='Supplier Sites';
      btn.onclick=()=>{ window.pciTab?.('supplier-sites'); loadSites(); };
      const brand=[...tabs.querySelectorAll('.pci-tab')].find(x=>/brand directory/i.test(x.textContent||''));
      if(brand) brand.insertAdjacentElement('afterend',btn); else tabs.appendChild(btn);
    }

    if(!$('pci-pane-supplier-sites')){
      const pane=document.createElement('div');
      pane.id='pci-pane-supplier-sites';
      pane.className='pci-card pci-pane pci-full-product-pane';
      pane.innerHTML=`
        <div class="pci-pane-head">
          <div>
            <h3>Supplier Sites</h3>
            <p>Scrape a complete supplier website into MongoDB product drafts. Nothing is created in Shopify until you review and approve it.</p>
          </div>
          <div class="pci-actions compact">
            <button id="supplier-sites-refresh" class="secondary-btn" type="button">Refresh catalogues</button>
          </div>
        </div>

        <div class="supplier-site-create">
          <div>
            <label class="pci-label">Supplier website</label>
            <input id="supplier-site-url" class="pci-input" value="https://x-zero.co.uk">
          </div>
          <div>
            <label class="pci-label">Catalogue name</label>
            <input id="supplier-site-name" class="pci-input" value="X-Zero catalogue">
          </div>
          <div>
            <label class="pci-label">Maximum products</label>
            <input id="supplier-site-limit" class="pci-input" type="number" min="1" max="500" value="500">
          </div>
          <div>
            <button id="supplier-site-scrape" class="primary-btn" type="button">Scrape website into drafts</button>
          </div>
        </div>

        <div id="supplier-site-status" class="pci-status">Choose a supplier site or start a new scrape.</div>

        <div class="supplier-sites-layout">
          <aside class="supplier-sites-list-wrap">
            <h4>Saved supplier catalogues</h4>
            <div id="supplier-sites-list"></div>
          </aside>

          <main class="supplier-products-wrap">
            <div id="supplier-products-empty" class="supplier-empty">
              <strong>No catalogue selected.</strong>
              <span>Select a supplier catalogue to view its drafts.</span>
            </div>

            <div id="supplier-products-workspace" hidden>
              <div class="supplier-products-toolbar">
                <div>
                  <h4 id="supplier-products-title"></h4>
                  <p id="supplier-products-meta" class="pci-muted"></p>
                </div>
                <div class="pci-actions compact">
                  <input id="supplier-products-search" class="pci-input" placeholder="Search title, SKU, barcode, flavour…">
                  <select id="supplier-products-filter" class="pci-input">
                    <option value="">All states</option>
                    <option value="queued">Queued</option>
                    <option value="analysed">Analysed</option>
                    <option value="needs_review">Needs review</option>
                    <option value="approved">Approved</option>
                    <option value="created">Created</option>
                    <option value="failed">Failed</option>
                  </select>
                  <button id="supplier-sites-rescan" class="secondary-btn" type="button">Scan missing / failed</button><button id="supplier-sites-stop" class="secondary-btn" type="button" hidden>Stop</button>
                  <button id="supplier-sites-open-batch" class="primary-btn" type="button">Open in Batch Import</button>
                </div>
              </div>
              <div id="supplier-products-grid" class="supplier-products-grid"></div>
            </div>
          </main>
        </div>
      `;
      root.appendChild(pane);
      wire();
    }
    return true;
  }

  function setStatus(msg,kind=''){
    const el=$('supplier-site-status');
    if(!el) return;
    el.className=`pci-status ${kind}`.trim();
    el.innerHTML=msg;
  }

  function getMeta(item,key){
    const rows=[...(item.metafieldPlan||[]),...(item.draft?.metafields||[])];
    const hit=rows.find(m=>`${m.namespace}.${m.key}`===key||m.key===key);
    return hit?.value||'';
  }

  function image(item){
    const list=item.selectedImages?.length?item.selectedImages:(item.draft?.images||[]);
    const first=list[0];
    return typeof first==='string'?first:(first?.src||'');
  }

  function searchText(item){
    const d=item.draft||{};
    return [
      d.title,item.title,d.sku,d.barcode,d.vendor,d.productType,d.productCategory,
      getMeta(item,'core.product_flavour'),getMeta(item,'core.flavour_profile'),
      getMeta(item,'core.formula_version'),item.nutrition?.flavour,item.nutrition?.productLine
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function renderSites(){
    const el=$('supplier-sites-list');
    if(!el) return;
    if(!state.batches.length){
      el.innerHTML='<div class="supplier-empty">No supplier sites yet.</div>';
      return;
    }
    el.innerHTML=state.batches.map(b=>`
      <button type="button" class="supplier-site-row ${state.activeBatch?._id===b._id?'active':''}" data-id="${esc(b._id)}">
        <strong>${esc(b.name||b.supplierName||'Supplier catalogue')}</strong>
        <small>${esc(b.supplierUrl||b.defaults?.supplierUrl||'')}</small>
        <span>${b.summary?.total||b.items?.length||0} products · ${esc(b.status||'draft')}</span>
      </button>
    `).join('');
    el.querySelectorAll('[data-id]').forEach(btn=>btn.onclick=()=>openBatch(btn.dataset.id));
  }

  function renderProducts(){
    const batch=state.activeBatch;
    $('supplier-products-empty').hidden=!!batch;
    $('supplier-products-workspace').hidden=!batch;
    if(!batch) return;

    $('supplier-products-title').textContent=batch.name||'Supplier catalogue';
    $('supplier-products-meta').textContent=`${batch.items?.length||0} products · ${batch.supplierUrl||batch.defaults?.supplierUrl||''}`;

    const q=($('supplier-products-search')?.value||'').toLowerCase().trim();
    const filter=$('supplier-products-filter')?.value||'';

    const items=(batch.items||[]).filter(item=>{
      if(filter && item.status!==filter && item.approvalStatus!==filter) return false;
      return !q||searchText(item).includes(q);
    });

    $('supplier-products-grid').innerHTML=items.map(item=>{
      const d=item.draft||{};
      const flavour=getMeta(item,'core.product_flavour')||item.nutrition?.flavour||getMeta(item,'core.flavour_profile')||'—';
      const line=getMeta(item,'core.formula_version')||item.nutrition?.productLine||d.productType||'—';
      const img=image(item);
      const ready=item.completeness?.ready===true||item.validation?.status==='ready';
      return `
        <button type="button" class="supplier-product-card" data-item-id="${esc(item.itemId)}">
          <div class="supplier-product-image">${img?`<img src="${esc(img)}" alt="">`:'No image'}</div>
          <div>
            <div class="supplier-product-head">
              <strong>${esc(d.title||item.title||'Untitled product')}</strong>
              <span class="pci-pill ${item.status==='created'?'ok':item.status==='failed'?'err':ready?'ok':'warn'}">${esc(item.status||'queued')}</span>
            </div>
            <small>${esc(d.vendor||item.vendor||'')}</small>
            <div class="supplier-product-facts">
              <span><b>SKU</b>${esc(d.sku||'—')}</span>
              <span><b>Barcode</b>${esc(d.barcode||'—')}</span>
              <span><b>Price</b>${esc(d.price?`£${d.price}`:'—')}</span>
              <span><b>Flavour</b>${esc(flavour)}</span>
              <span><b>Product line</b>${esc(line)}</span>
              <span><b>Images</b>${(item.selectedImages||d.images||[]).length}</span>
            </div>
            <p>${esc(String(d.descriptionHtml||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180)||'Description not yet extracted.')}</p>
          </div>
        </button>`;
    }).join('')||'<div class="supplier-empty">No products match this view.</div>';
    bindProductCards();
  }

  async function loadSites(){
    if(!ensureUi()) return;
    try{
      const data=await api('/batches?limit=100');
      state.batches=(data.batches||[]).filter(b=>b.automation?.siteImport);
      renderSites();
      if(state.activeBatch?._id) await openBatch(state.activeBatch._id);
    }catch(e){ setStatus(`Could not load supplier catalogues: ${esc(e.message)}`,'err'); }
  }

  async function openBatch(id){
    const data=await api(`/batches/${id}`);
    state.activeBatch=data.batch;
    renderSites();
    renderProducts();
  }

  async function repairCatalogue(){
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

  async function createSite(){
    const rootUrl=$('supplier-site-url').value.trim();
    const name=$('supplier-site-name').value.trim();
    const maxProducts=Math.max(1,Math.min(500,Number($('supplier-site-limit').value||500)));
    if(!rootUrl) return setStatus('Enter a supplier website first.','err');

    const btn=$('supplier-site-scrape');
    btn.disabled=true;
    try{
      setStatus('Discovering all product URLs on the supplier site…','warn');
      const data=await api('/batches/site-import',{
        method:'POST',
        body:JSON.stringify({
          rootUrl,name,maxProducts,useAi:true,
          autoApproveReady:false,
          autoCreateDrafts:false,
          batchSize:12
        })
      });
      state.activeBatch=data.batch;
      await loadSites();
      await openBatch(data.batch._id);
      await repairCatalogue();
    }catch(e){ setStatus(`Supplier scrape failed: ${esc(e.message)}`,'err'); }
    finally{ btn.disabled=false; }
  }

  function openBatchImporter(){
    window.pciTab?.('batch');
  }


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

  function wire(){
    $('supplier-sites-refresh')?.addEventListener('click',loadSites);
    $('supplier-site-scrape')?.addEventListener('click',createSite);
    $('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);
    $('supplier-sites-stop')?.addEventListener('click',()=>{state.stop=true;});
    $('supplier-sites-open-batch')?.addEventListener('click',openBatchImporter);
    $('supplier-products-search')?.addEventListener('input',renderProducts);
    $('supplier-products-filter')?.addEventListener('change',renderProducts);
  }

  function boot(){
    if(!ensureUi()) return;
    loadSites();
  }

  document.addEventListener('DOMContentLoaded',boot);
  window.addEventListener('load',boot);
  setTimeout(boot,800);
  setTimeout(boot,1800);
})();
