(function SupplierSitesAdmin(){
  const API='/admin/product-creation-import';
  const state={batches:[],activeBatch:null,scanning:false};
  const $=id=>document.getElementById(id);
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  async function api(path,options={}){
    if(typeof window.adminFetch==='function'){
      const res=await window.adminFetch(`${API}${path}`,options);
      const json=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(json.error||json.message||`Request failed (${res.status})`);
      return json;
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
                  <button id="supplier-sites-rescan" class="secondary-btn" type="button">Scan missing / failed</button>
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
        <article class="supplier-product-card">
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
        </article>`;
    }).join('')||'<div class="supplier-empty">No products match this view.</div>';
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

  async function scanBatch(id){
    if(state.scanning) return;
    state.scanning=true;
    try{
      let total=0;
      for(let i=0;i<100;i++){
        setStatus(`Scanning catalogue… ${total} products processed. Filling descriptions, barcodes, images, flavour, product line, SEO and metafields.`,'warn');
        const data=await api(`/batches/${id}/scan`,{
          method:'POST',
          body:JSON.stringify({limit:12,processAll:false,useAi:true})
        });
        total+=Number(data.processed||0);
        state.activeBatch=data.batch;
        renderProducts();
        if(!data.processed||Number(data.remaining||0)<=0) break;
      }
      setStatus(`Catalogue scan complete. ${total} product drafts processed. Review anything marked Needs review before Shopify creation.`,'ok');
      await loadSites();
    }catch(e){ setStatus(`Catalogue scan failed: ${esc(e.message)}`,'err'); }
    finally{ state.scanning=false; }
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
      await scanBatch(data.batch._id);
    }catch(e){ setStatus(`Supplier scrape failed: ${esc(e.message)}`,'err'); }
    finally{ btn.disabled=false; }
  }

  function openBatchImporter(){
    window.pciTab?.('batch');
  }

  function wire(){
    $('supplier-sites-refresh')?.addEventListener('click',loadSites);
    $('supplier-site-scrape')?.addEventListener('click',createSite);
    $('supplier-sites-rescan')?.addEventListener('click',()=>state.activeBatch&&scanBatch(state.activeBatch._id));
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
