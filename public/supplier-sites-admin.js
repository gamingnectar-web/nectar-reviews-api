(function SupplierSitesAdmin(){
  const API='/admin/product-creation-import';
  const state={batches:[],activeBatch:null,activeItem:null,scanning:false,stop:false,reconciled:new Set(),reconciling:false,cataloguesConsolidated:false,fieldAdvice:null};
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
            <label class="pci-label">Brand / vendor hint <span class="pci-muted">(optional)</span></label>
            <input id="supplier-site-name" class="pci-input" placeholder="Detected from supplier products" value="">
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
                  <button id="supplier-sites-catalogue-settings" class="supplier-catalogue-cog secondary-btn" type="button" title="Catalogue defaults">⚙</button><button id="supplier-sites-check-shopify" class="secondary-btn" type="button">Check Shopify matches</button><button id="supplier-sites-rescan" class="secondary-btn" type="button">Run one pass</button><button id="supplier-sites-ai-rescan" class="secondary-btn supplier-ai-source-btn" type="button" title="Re-read up to 3 unresolved source URLs with AI. No automatic retry.">AI rescan unresolved · max 3</button><button id="supplier-sites-stop" class="secondary-btn" type="button" hidden>Stop</button>
                  <button id="supplier-sites-open-batch" class="primary-btn" type="button">Open in Batch Import</button>
                </div>
              </div>
              <div id="supplier-products-grid" class="supplier-products-grid"></div>
            </div>
          </main>
        </div>
        <!-- ELEV8_SUPPLIER_CATALOGUE_UNIFICATION_V1 -->
        <div id="supplier-catalogue-modal" class="supplier-modal" hidden>
          <div class="supplier-modal-backdrop" data-catalogue-close></div>
          <section class="supplier-modal-panel supplier-catalogue-panel">
            <div class="supplier-modal-head"><div><small class="pci-muted">CATALOGUE DEFAULTS</small><h3 id="scs-heading">Supplier catalogue</h3><p class="pci-muted">Defaults fill empty fields only. Product-level values always win.</p></div><button id="scs-close" class="secondary-btn">Close</button></div>
            <div class="supplier-catalogue-settings-grid">
              <main class="pci-editor-card"><div class="supplier-catalogue-form-grid">
                <div><label class="pci-label">Vendor</label><input id="scs-vendor" class="pci-input"></div>
                <div><label class="pci-label">Product type</label><input id="scs-type" class="pci-input"></div>
                <div><label class="pci-label">Product category</label><input id="scs-category" class="pci-input"></div>
                <div><label class="pci-label">Theme template</label><input id="scs-template" class="pci-input"></div>
                <div class="wide"><label class="pci-label">Collections</label><input id="scs-collections" class="pci-input" placeholder="Comma separated"></div>
                <div class="wide"><label class="pci-label">Metafield defaults</label><textarea id="scs-metafields" class="pci-input supplier-catalogue-metafields" placeholder="core.about_brand = ..."></textarea><small class="pci-muted">One per line: namespace.key = value</small></div>
              </div></main>
              <aside class="pci-editor-card"><div class="supplier-catalogue-rec-head"><div><h4>Shop recommendations</h4><p class="pci-muted">Based on similar products already in Shopify.</p></div><button id="scs-recommend" class="secondary-btn">Analyse shop</button></div><div id="scs-recs"><p class="pci-muted">Run analysis to see recommendations.</p></div></aside>
            </div>
            <div id="scs-status" class="pci-status" hidden></div>
            <div class="supplier-modal-actions"><button id="scs-save" class="primary-btn">Save catalogue defaults</button></div>
          </section>
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


  // ELEV8_SUPPLIER_CATALOGUE_UNIFICATION_V1
  const parseMf=v=>String(v||'').split(/\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const eq=line.indexOf('='),dot=line.slice(0,eq).trim().indexOf('.');if(eq<0||dot<1)return null;const compound=line.slice(0,eq).trim(),d=compound.indexOf('.'),value=line.slice(eq+1).trim();return value?{namespace:compound.slice(0,d),key:compound.slice(d+1),value,type:'single_line_text_field'}:null;}).filter(Boolean);
  const formatMf=rows=>(rows||[]).filter(x=>x?.namespace&&x?.key&&String(x.value??'').trim()).map(x=>x.namespace+'.'+x.key+' = '+x.value).join('\n');
  function closeCatalogue(){if($('supplier-catalogue-modal'))$('supplier-catalogue-modal').hidden=true;document.body.classList.remove('supplier-modal-open');}
  function recHtml(r){if(!r)return '<p class="pci-muted">Run analysis to see recommendations.</p>';const s=r.suggested||{},t=r.text||{};return `<div class="supplier-rec-badges"><span>${Number(r.sampleCount||0)} shop examples</span><span>${esc(r.generatedWith||'deterministic')}</span></div><div class="supplier-rec-grid"><p><b>Vendor</b><br>${esc(s.vendor||'—')}</p><p><b>Product type</b><br>${esc(s.productType||'—')}</p><p><b>Template</b><br>${esc(s.themeTemplate||'—')}</p></div><div class="supplier-copy-patterns"><p><b>Title pattern</b><br>${esc(t.titlePattern||'—')}</p><p><b>Description guidance</b><br>${esc(t.descriptionGuidance||'—')}</p><p><b>SEO title</b><br>${esc(t.seoTitlePattern||'—')}</p><p><b>SEO description</b><br>${esc(t.seoDescriptionPattern||'—')}</p></div><button id="scs-use-recs" class="secondary-btn">Use recommended blanks</button>`;}
  async function openCatalogue(id){
    id=id||state.activeBatch?._id;if(!id)return setStatus('Select a catalogue first.','err');
    const [b,x]=await Promise.all([api('/batches/'+id),api('/batches/'+id+'/catalogue-settings')]);state.activeBatch=b.batch;const p=x.presets||{};
    $('scs-heading').textContent=state.activeBatch.name||'Supplier catalogue';$('scs-vendor').value=p.vendor||state.activeBatch.catalogue?.vendor||'';$('scs-type').value=p.productType||'';$('scs-category').value=p.productCategory||'';$('scs-template').value=p.themeTemplate||'';$('scs-collections').value=(p.collections||[]).join(', ');$('scs-metafields').value=formatMf(p.metafields||[]);$('scs-recs').innerHTML=recHtml(x.recommendations);$('supplier-catalogue-modal').hidden=false;document.body.classList.add('supplier-modal-open');bindUseRecs(x.recommendations);
  }
  function bindUseRecs(r){$('scs-use-recs')?.addEventListener('click',()=>{const s=r?.suggested||{};if(!$('scs-vendor').value&&s.vendor)$('scs-vendor').value=s.vendor;if(!$('scs-type').value&&s.productType)$('scs-type').value=s.productType;if(!$('scs-category').value&&s.productCategory)$('scs-category').value=s.productCategory;if(!$('scs-template').value&&s.themeTemplate)$('scs-template').value=s.themeTemplate;if(!$('scs-metafields').value&&(s.metafields||[]).length)$('scs-metafields').value=formatMf(s.metafields);});}
  async function saveCatalogue(){const id=state.activeBatch?._id;if(!id)return;const p={vendor:$('scs-vendor').value.trim(),productType:$('scs-type').value.trim(),productCategory:$('scs-category').value.trim(),themeTemplate:$('scs-template').value.trim(),collections:$('scs-collections').value.split(',').map(x=>x.trim()).filter(Boolean),metafields:parseMf($('scs-metafields').value)};const x=await api('/batches/'+id+'/catalogue-settings',{method:'PATCH',body:JSON.stringify({presets:p})});state.activeBatch=x.batch;$('scs-status').hidden=false;$('scs-status').textContent='Saved. Product-specific values were preserved.';await loadSites(false);renderProducts();}
  async function recommendCatalogue(){const id=state.activeBatch?._id;if(!id)return;const btn=$('scs-recommend');if(btn)btn.disabled=true;try{const x=await api('/batches/'+id+'/catalogue-recommendations',{method:'POST',body:'{}'});$('scs-recs').innerHTML=recHtml(x.recommendations);bindUseRecs(x.recommendations);}finally{if(btn)btn.disabled=false;}}

  function renderSites(){
    const el=$('supplier-sites-list');if(!el)return;
    if(!state.batches.length){el.innerHTML='<div class="supplier-empty">No supplier sites yet.</div>';return;}
    el.innerHTML=state.batches.map(b=>`<div class="supplier-site-entry ${state.activeBatch?._id===b._id?'active':''}"><button type="button" class="supplier-site-row" data-open-catalogue="${esc(b._id)}"><strong>${esc(b.catalogue?.vendor?b.catalogue.vendor+' Catalogue':(b.name||b.supplierName||'Supplier catalogue'))}</strong><small>${esc(b.supplierUrl||b.defaults?.supplierUrl||'')}</small><span>${b.summary?.total||0} products · ${esc(b.status||'draft')}</span></button><button class="supplier-site-cog" data-cog-catalogue="${esc(b._id)}" title="Catalogue defaults">⚙</button></div>`).join('');
    el.querySelectorAll('[data-open-catalogue]').forEach(btn=>btn.onclick=()=>openBatch(btn.dataset.openCatalogue));
    el.querySelectorAll('[data-cog-catalogue]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openCatalogue(btn.dataset.cogCatalogue);});
  }

  function productStatusDot(item){
    const match=item?.suggestions?.existingProduct||item?.draft?.suggestions?.existingProduct;
    const created=Boolean(item?.shopifyProduct?.id||item?.status==='created');
    const confirmed=Boolean(match?.confirmed===true||match?.matchLevel==='confirmed'||match?.exact===true);
    if(created||confirmed)return {cls:'exists',label:created?'Created / exists in Shopify':`Confirmed Shopify match${match?.title?`: ${match.title}`:''}`};
    const hasError=item?.status==='failed'||Boolean(String(item?.error||'').trim()&&!/already exists|skipped duplicate|exists in shopify/i.test(String(item?.error||'')));
    if(hasError)return {cls:'error',label:'Error present'};
    if(match)return {cls:'review',label:`Possible Shopify match${match.title?`: ${match.title}`:''} — review`};
    return {cls:'review',label:'Review required'};
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
      const statusDot=productStatusDot(item);
      return `
        <button type="button" class="supplier-product-card" data-item-id="${esc(item.itemId)}">
          <span class="supplier-product-status-dot ${statusDot.cls}" title="${esc(statusDot.label)}" aria-label="${esc(statusDot.label)}"></span>
          <div class="supplier-product-image">${img?`<img src="${esc(img)}" alt="">`:'No image'}</div>
          <div>
            <div class="supplier-product-head">
              <strong>${esc(d.title||item.title||'Untitled product')}</strong>
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

  async function loadSites(consolidate=true){
    if(!ensureUi())return;
    try{if(consolidate&&!state.cataloguesConsolidated){await api('/batches/site-imports/consolidate',{method:'POST',body:'{}'}).catch(()=>null);state.cataloguesConsolidated=true;}const data=await api('/batches/site-imports?limit=250');state.batches=data.batches||[];renderSites();}
    catch(e){setStatus('Could not load supplier catalogues: '+esc(e.message),'err');}
  }

  async function reconcileShopifyMatches(manual=false){
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

  async function openBatch(id){
    const data=await api(`/batches/${id}`);
    state.activeBatch=data.batch;
    renderSites();
    renderProducts();
    if(!state.reconciled.has(String(id)))reconcileShopifyMatches(false);
  }


  // ELEV8_EXPLICIT_AI_SOURCE_RESCAN_V1
  function unresolvedAiRescanItems(){
    const items=(state.activeBatch?.items||[]).filter(item =>
      item.sourceUrl &&
      !['created','creating'].includes(item.status) &&
      ['failed','needs_review','queued'].includes(item.status)
    );
    const rank={failed:0,needs_review:1,queued:2};
    return items.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)).slice(0,3);
  }

  async function aiRescanItems(itemIds=[], context='catalogue'){
    if(!state.activeBatch)return null;
    const ids=Array.from(new Set(itemIds.filter(Boolean))).slice(0,3);

    if(!ids.length){
      setStatus('No unresolved supplier products with source URLs are available for AI rescan.','ok');
      return null;
    }

    const toolbarBtn=$('supplier-sites-ai-rescan');
    const modalBtn=$('spm-ai-source-rescan');
    if(toolbarBtn)toolbarBtn.disabled=true;
    if(modalBtn)modalBtn.disabled=true;

    try{
      const maxCalls=ids.length*3;
      const message=ids.length===1
        ? 'AI is re-reading this supplier URL once. Saved merchant overrides are protected; no automatic retry will run.'
        : `AI is re-reading ${ids.length} unresolved supplier URLs. Maximum ~${maxCalls} AI stages for this click; no automatic retry.`;

      if(context==='modal')modalStatus(message,'warn');
      else setStatus(message,'warn');

      const data=await api(`/batches/${state.activeBatch._id}/ai-rescan`,{
        method:'POST',
        body:JSON.stringify({itemIds:ids})
      });

      state.activeBatch=data.batch;
      renderProducts();

      const failed=(data.results||[]).filter(row=>row.status==='failed').length;
      const done=(data.results||[]).length-failed;
      const resultMessage=`AI source rescan finished: ${done} processed, ${failed} failed. No retries were queued. Maximum AI stages for this action: ${Number(data.estimatedMaxAiCalls||maxCalls)}.`;

      if(context==='modal'){
        const activeId=ids[0];
        if(activeId)openItemModal(activeId);
        modalStatus(resultMessage,failed?'warn':'ok');
      }else{
        setStatus(resultMessage,failed?'warn':'ok');
      }

      return data;
    }catch(error){
      const message=`AI source rescan failed: ${esc(error.message||'Unknown error')}. Nothing will retry automatically.`;
      if(context==='modal')modalStatus(message,'err');
      else setStatus(message,'err');
      return null;
    }finally{
      if(toolbarBtn)toolbarBtn.disabled=false;
      if(modalBtn)modalBtn.disabled=false;
    }
  }

  async function aiRescanUnresolved(){
    const items=unresolvedAiRescanItems();
    return aiRescanItems(items.map(item=>item.itemId),'catalogue');
  }

  async function aiRescanItemModal(){
    const id=state.activeItem?.itemId;
    if(!id)return;
    return aiRescanItems([id],'modal');
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
        setStatus(`One-pass scan stopped. ${remaining} queued/failed product(s) remain. Press Run one pass to resume.`,'warn');
      }else if(remaining){
        setStatus(`Repair pass finished: ${processed} repaired, ${failed} could not be repaired in this pass, ${remaining} still queued/failed. You can run it again safely.`,'warn');
      }else{
        setStatus(`One-pass scan finished. ${processed} product(s) repaired. Click any product card to review or create its Shopify draft.`,'ok');
      }
    }finally{
      state.scanning=false;
      if(scanButton) scanButton.disabled=false;
      if(stopButton) stopButton.hidden=true;
    }
  }

  async function runInitialSitePass(batchId,itemIds=[]){
    const onlyNew=new Set(Array.isArray(itemIds)?itemIds:[]);
    // A site scrape is one deliberate user command.
    // Every discovered product may be attempted once during this command.
    // Nothing retries automatically after this function finishes.
    const attempted=new Set();
    let processed=0;
    let failed=0;

    while(true){
      const latest=await api(`/batches/${batchId}`);
      state.activeBatch=latest.batch;
      renderProducts();

      // Initial pass includes queued sitemap discoveries and needs_review
      // structured Shopify products so each gets normal merchant-catalogue
      // enrichment exactly once.
      // Failed products are deliberately excluded here.
      const target=(state.activeBatch.items||[]).find(item =>
        ['queued','needs_review'].includes(item.status) &&
        !attempted.has(item.itemId) &&
        item.status!=='created' &&
        (!onlyNew.size || onlyNew.has(item.itemId))
      );

      if(!target) break;
      attempted.add(target.itemId);

      const remaining=(state.activeBatch.items||[]).filter(item =>
        ['queued','needs_review'].includes(item.status) &&
        !attempted.has(item.itemId) &&
        (!onlyNew.size || onlyNew.has(item.itemId))
      ).length;
      const total=attempted.size+remaining;

      const label=target.draft?.title || target.title || target.sourceUrl || target.itemId;
      setStatus(
        `Initial scrape ${attempted.size} of ${total}: ${esc(label)}. Each product is attempted once only; AI is off.`,
        'warn'
      );

      try{
        const result=await api(`/batches/${batchId}/scan`,{
          method:'POST',
          body:JSON.stringify({
            itemIds:[target.itemId],
            limit:1,
            processAll:false,
            useAi:false
          })
        });
        state.activeBatch=result.batch;
        const row=(result.results||[]).find(x=>x.itemId===target.itemId);
        if(row?.status==='failed') failed+=1;
        else processed+=1;
      }catch(error){
        failed+=1;
        console.warn('[Supplier Sites] initial product scrape failed',target.itemId,error);
      }

      renderProducts();
      await new Promise(resolve=>setTimeout(resolve,100));
    }

    await openBatch(batchId);
    const remainingFailed=(state.activeBatch.items||[]).filter(i=>i.status==='failed').length;

    if(remainingFailed){
      setStatus(
        `Initial scrape finished. ${processed} product(s) processed and ${remainingFailed} failed. Failed products will not retry automatically — press Run one pass only if you want to retry them.`,
        'warn'
      );
    }else{
      setStatus(
        `Initial scrape finished. ${processed} product(s) processed once. No automatic retries will run.`,
        'ok'
      );
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
          rootUrl,name,maxProducts,useAi:false,
          autoApproveReady:false,
          autoCreateDrafts:false,
          batchSize:1
        })
      });
      state.activeBatch=data.batch;
      await loadSites();
      await openBatch(data.batch._id);
      const newIds=Array.isArray(data.newItemIds)?data.newItemIds:[];
      if(data.merged&&!newIds.length)setStatus('Catalogue refreshed. No new supplier products were found; existing drafts were left untouched.','ok');
      else await runInitialSitePass(data.batch._id,newIds);
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


  // ELEV8_IMPORT_FIELD_INTELLIGENCE_V1
  const SOURCE_LABELS={
    product_override:'Product override',
    catalogue_default:'Catalogue default',
    shop_recommendation:'Shop recommendation',
    ai_suggestion:'AI suggestion',
    supplier:'Supplier',
    empty:'Empty'
  };

  const FIELD_INPUTS={
    title:'spm-title',
    descriptionHtml:'spm-description',
    price:'spm-price',
    compareAtPrice:'spm-compare',
    sku:'spm-sku',
    barcode:'spm-barcode',
    vendor:'spm-vendor',
    productType:'spm-type',
    productCategory:'spm-category',
    flavour:'spm-flavour',
    formula:'spm-line',
    'seo.title':'spm-seo-title',
    'seo.description':'spm-seo-description',
    handle:'spm-handle'
  };

  function installSourceBadges(){
    Object.entries(FIELD_INPUTS).forEach(([field,id])=>{
      const input=$(id); if(!input)return;
      const row=input.closest('.supplier-field-map-row');
      const label=row?.previousElementSibling || input.previousElementSibling;
      if(!label || label.tagName!=='LABEL')return;
      label.classList.add('supplier-provenance-label');
      if(!label.querySelector('[data-field-source]')){
        label.insertAdjacentHTML('beforeend',`<span class="supplier-source-chip empty" data-field-source="${esc(field)}">Empty</span>`);
      }
    });
  }

  function renderProvenance(provenance={}){
    installSourceBadges();
    Object.entries(FIELD_INPUTS).forEach(([field])=>{
      const chip=document.querySelector(`[data-field-source="${CSS.escape(field)}"]`);
      if(!chip)return;
      const source=provenance[field]||{key:'empty',label:'Empty',detail:''};
      chip.className=`supplier-source-chip ${esc(source.key||'empty')}`;
      chip.textContent=source.label||SOURCE_LABELS[source.key]||'Unknown';
      chip.title=source.detail||'';
    });

    const values=Object.values(provenance||{}).filter(x=>x?.key&&x.key!=='empty');
    const counts=new Map();
    values.forEach(x=>counts.set(x.key,(counts.get(x.key)||0)+1));
    const summary=[...counts.entries()].map(([key,count])=>`${SOURCE_LABELS[key]||key}: ${count}`).join(' · ');
    if($('spm-source-summary'))$('spm-source-summary').textContent=summary||'No populated field sources yet';
  }

  function recommendationTarget(field){
    return FIELD_INPUTS[field]?$(FIELD_INPUTS[field]):null;
  }

  function applyFieldRecommendation(field,value,source='shop_recommendation'){
    const input=recommendationTarget(field);
    if(!input)return;
    input.value=String(value??'');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const chip=document.querySelector(`[data-field-source="${CSS.escape(field)}"]`);
    if(chip){
      chip.className='supplier-source-chip product_override';
      chip.textContent='Product override';
      chip.title=`Applied from ${SOURCE_LABELS[source]||'recommendation'}; saving will lock it as a product-level merchant choice.`;
    }
    const card=document.querySelector(`[data-advice-field="${CSS.escape(field)}"]`);
    if(card)card.classList.add('applied');
  }

  function renderFieldAdvice(data={}){
    state.fieldAdvice=data;
    renderProvenance(data.provenance||{});

    const list=$('spm-advice-list');
    const summary=$('spm-advice-summary');
    const examples=$('spm-advice-examples');
    if(!list||!summary||!examples)return;

    const rows=data.recommendations||[];
    summary.textContent=`${Number(data.similarProductCount||0)} similar Shopify product(s) checked${data.ai?.requested?' · AI copy refinement requested':''}.`;

    if(!rows.length){
      list.innerHTML='<div class="supplier-advice-empty">No stronger shop-pattern recommendation was found. The current draft remains unchanged.</div>';
    }else{
      list.innerHTML=rows.map(row=>{
        const confidence=Math.round(Number(row.confidence||0)*100);
        const preview=String(row.value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        return `<article class="supplier-advice-card" data-advice-field="${esc(row.field)}">
          <div class="supplier-advice-card-head">
            <div><strong>${esc(row.label||row.field)}</strong><span class="supplier-source-chip ${esc(row.source||'shop_recommendation')}">${esc(SOURCE_LABELS[row.source]||row.source||'Recommendation')}</span></div>
            <span class="supplier-advice-confidence">${confidence}%</span>
          </div>
          <p class="supplier-advice-preview">${esc(preview)}</p>
          <small>${esc(row.reason||'')}</small>
          <button type="button" class="secondary-btn supplier-advice-apply" data-apply-advice="${esc(row.field)}">Apply</button>
        </article>`;
      }).join('');

      list.querySelectorAll('[data-apply-advice]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const row=rows.find(x=>x.field===btn.dataset.applyAdvice);
          if(row)applyFieldRecommendation(row.field,row.value,row.source);
        });
      });
    }

    const sample=(data.examples||[]).slice(0,4);
    examples.innerHTML=sample.length
      ? `<details><summary>Examples used</summary><div>${sample.map(row=>`<p><strong>${esc(row.title||'')}</strong><span>${esc(row.productType||'')}${row.seoTitle?' · '+esc(row.seoTitle):''}</span></p>`).join('')}</div></details>`
      : '';

    if(data.ai?.error){
      examples.insertAdjacentHTML('beforeend',`<p class="supplier-advice-error">AI refinement was unavailable: ${esc(data.ai.error)}</p>`);
    }
  }

  async function loadFieldAdvice(useAi=false){
    if(!state.activeBatch||!state.activeItem)return;
    const btn=useAi?$('spm-advice-ai'):$('spm-shop-recommend');
    if(btn)btn.disabled=true;
    if($('spm-advice-summary'))$('spm-advice-summary').textContent=useAi?'Generating shop-aware copy suggestions…':'Comparing with similar Shopify products…';
    try{
      const data=await api(`/batches/${state.activeBatch._id}/items/${state.activeItem.itemId}/field-recommendations`,{
        method:'POST',
        body:JSON.stringify({useAi:useAi===true})
      });
      renderFieldAdvice(data);
    }catch(error){
      if($('spm-advice-list'))$('spm-advice-list').innerHTML=`<div class="supplier-advice-empty error">${esc(error.message||'Could not load shop recommendations.')}</div>`;
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  function ensureProductModal(){
    if($('supplier-product-modal')) return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="supplier-product-modal" class="supplier-modal" hidden>
        <div class="supplier-modal-backdrop" data-supplier-close></div>
        <div class="supplier-modal-panel">
          <div class="supplier-modal-head">
            <div><span class="pci-muted">SUPPLIER PRODUCT DRAFT</span><h3 id="spm-heading">Product</h3><div id="spm-source-summary" class="supplier-source-summary"></div></div>
            <div class="supplier-modal-head-actions">
              <button id="spm-shop-recommend" type="button" class="secondary-btn supplier-shop-recommend" title="Compare with similar Shopify products and generate reviewable suggestions">Shop suggestions</button>
              <button id="spm-ai-refresh" type="button" class="supplier-ai-refresh" title="AI refresh — one product, one AI call" aria-label="AI refresh this product">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"></path></svg>
              </button>
              <button type="button" class="secondary-btn" data-supplier-close>Close</button>
            </div>
          </div>
          <div id="spm-status" class="pci-status" hidden></div>
          <div class="supplier-modal-grid">
            <main>
              <!-- ELEV8_IMPORT_FIELD_INTELLIGENCE_V1 -->
              <section id="spm-field-advice" class="pci-editor-card supplier-field-advice">
                <div class="pci-editor-card-head">
                  <div><h4>Shop-aware recommendations</h4><span id="spm-advice-summary" class="pci-muted">Comparing this draft with similar products already in Shopify…</span></div>
                  <button id="spm-advice-ai" type="button" class="secondary-btn">AI refine copy</button>
                </div>
                <div id="spm-advice-list" class="supplier-advice-list"></div>
                <div id="spm-advice-examples" class="supplier-advice-examples"></div>
              </section>

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
                <label class="pci-label">Vendor</label><div class="supplier-field-map-row"><input id="spm-vendor" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="vendor" title="Show Shopify field mapping"><span class="supplier-map-state">?</span></button></div>
                <label class="pci-label">Product type</label><div class="supplier-field-map-row"><input id="spm-type" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="productType" title="Show Shopify field mapping"><span class="supplier-map-state">?</span></button></div>
                <label class="pci-label">Product category</label><div class="supplier-field-map-row"><input id="spm-category" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="productCategory" title="Show Shopify field mapping"><span class="supplier-map-state">?</span></button></div>
                <label class="pci-label">Flavour</label><div class="supplier-field-map-row"><input id="spm-flavour" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="flavour" title="Show metafield matches"><span class="supplier-map-state">?</span></button></div>
                <label class="pci-label">Product line / formula</label><div class="supplier-field-map-row"><input id="spm-line" class="pci-input"><button type="button" class="supplier-map-btn" data-map-field="formula" title="Show metafield matches"><span class="supplier-map-state">?</span></button></div>
              </section>
              <section id="spm-map-panel" class="pci-editor-card supplier-map-panel" hidden>
                <div class="pci-editor-card-head">
                  <h4 id="spm-map-title">Field mapping</h4>
                  <button id="spm-map-close" type="button" class="supplier-map-close" aria-label="Close mapping panel">×</button>
                </div>
                <div id="spm-map-content" class="supplier-map-content"></div>
              </section>
              <section class="pci-editor-card">
                <h4>Source</h4>
                <a id="spm-source" target="_blank" rel="noopener"></a>
                <p id="spm-validation" class="pci-muted"></p>
              </section>
            </aside>
          </div>
          <div class="supplier-modal-actions">
            <button id="spm-ai-source-rescan" type="button" class="secondary-btn supplier-ai-source-btn" title="Re-read this supplier URL and run the AI extraction stages once.">AI re-read source</button>
            <button id="spm-enrich" type="button" class="secondary-btn">Enrich this product</button>
            <button id="spm-save" type="button" class="secondary-btn">Save MongoDB draft</button>
            <button id="spm-create" type="button" class="primary-btn">Create Shopify Draft</button>
          </div>
        </div>
      </div>`);
    document.querySelectorAll('[data-supplier-close]').forEach(el=>el.addEventListener('click',closeItemModal));
    $('spm-save').addEventListener('click',saveItemModal);
    $('spm-enrich').addEventListener('click',enrichItemModal);
    $('spm-ai-source-rescan')?.addEventListener('click',aiRescanItemModal);
    $('spm-ai-refresh').addEventListener('click',aiRefreshItemModal);
    $('spm-shop-recommend').addEventListener('click',()=>loadFieldAdvice(false)); // ELEV8_IMPORT_AI_COST_GUARD_V1: deterministic Shopify comparison only
    $('spm-advice-ai').addEventListener('click',()=>loadFieldAdvice(true));
    installSourceBadges();
    $('spm-create').addEventListener('click',()=>createItemShopifyDraft(false));
    document.querySelectorAll('#supplier-product-modal [data-map-field]').forEach(btn=>{
      btn.addEventListener('click',()=>showFieldMapping(btn.dataset.mapField));
    });
    $('spm-map-close')?.addEventListener('click',()=>{$('spm-map-panel').hidden=true;});
  }

  async function refreshMappingIndicators(){
    if(!state.activeBatch||!state.activeItem)return;
    const buttons=[...document.querySelectorAll('#supplier-product-modal [data-map-field]')];
    await Promise.all(buttons.map(async btn=>{
      try{
        const field=btn.dataset.mapField;
        const data=await api(`/batches/${state.activeBatch._id}/items/${state.activeItem.itemId}/field-mappings?field=${encodeURIComponent(field)}`);
        const count=(data.matches||[]).length;
        btn.classList.toggle('mapped',count>0);
        btn.classList.toggle('unmapped',count===0);
        const stateEl=btn.querySelector('.supplier-map-state');
        if(stateEl)stateEl.textContent=count>0?'✓':'×';
        btn.title=count>0?`${count} destination${count===1?'':'s'} mapped`:'Not mapped — click to map';
      }catch(_){}
    }));
  }

  async function showFieldMapping(field){
    if(!state.activeBatch||!state.activeItem)return;
    const panel=$('spm-map-panel');
    const content=$('spm-map-content');
    const title=$('spm-map-title');
    if(!panel||!content||!title)return;
    const names={vendor:'Vendor',productType:'Product type',productCategory:'Product category',flavour:'Flavour',formula:'Product line / formula'};
    panel.hidden=false;
    title.textContent=`${names[field]||field} mapping`;
    content.innerHTML='<div class="pci-muted">Checking Shopify definitions…</div>';
    try{
      await saveItemModal();
      const data=await api(`/batches/${state.activeBatch._id}/items/${state.activeItem.itemId}/field-mappings?field=${encodeURIComponent(field)}`);
      const matches=data.matches||[];
      if(!matches.length){
        content.innerHTML=`<div class="supplier-map-empty">No Shopify destination is currently matched for <strong>${esc(data.value||'this value')}</strong>.<div style="margin-top:10px"><button type="button" class="secondary-btn" id="spm-open-metafield-mapper">Map this field</button></div></div>`;
        setTimeout(()=>$('spm-open-metafield-mapper')?.addEventListener('click',()=>{closeItemModal();window.pciTab?.('metafields');}),0);
        return;
      }
      content.innerHTML=matches.map(match=>`
        <div class="supplier-map-match">
          <div class="supplier-map-match-head">
            <strong>${esc(match.label||match.target)}</strong>
            ${match.canonical?'<span class="supplier-map-badge">Primary</span>':''}
          </div>
          <code>${esc(match.target||'')}</code>
          ${match.type?`<small>${esc(match.type)}</small>`:''}
          ${match.note?`<p>${esc(match.note)}</p>`:''}
          <div class="supplier-map-value">← ${esc(match.value??data.value??'')}</div>
        </div>
      `).join('');
    }catch(error){
      content.innerHTML=`<div class="supplier-map-empty error">${esc(error.message||'Could not load mapping.')}</div>`;
    }
  }

  function showMatchWarning(match){
    const el=$('spm-status'); if(!el||!match)return;
    el.hidden=false; el.className='pci-status warn supplier-match-warning';
    el.innerHTML=`<div><strong>${match.confirmed?'Existing Shopify product':'Possible Shopify match'}</strong><span>${esc(match.title||'Product')} · ${Math.round(Number(match.confidence||0)*100)}% confidence</span></div><div class="supplier-match-actions"><button id="spm-force-create-top" type="button" class="supplier-override-btn">This is different · Create new draft</button></div>`;
    $('spm-force-create-top')?.addEventListener('click',()=>createItemShopifyDraft(true));
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
    const existingMatch=item?.suggestions?.existingProduct||item?.draft?.suggestions?.existingProduct;
    if(existingMatch)showMatchWarning(existingMatch);
    $('supplier-product-modal').hidden=false;
    refreshMappingIndicators();
    loadFieldAdvice(false);
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

  async function aiRefreshItemModal(){
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

  async function enrichItemModal(){
    const id=state.activeItem?.itemId;
    if(!id)return;
    try{
      await saveItemModal();
      modalStatus('Enriching this product only…','warn');
      const data=await api(`/batches/${state.activeBatch._id}/enrich`,{
        method:'POST',
        body:JSON.stringify({itemIds:[id],useAi:false})
      });
      state.activeBatch=data.batch;
      renderProducts();
      openItemModal(id);
      modalStatus('Enrichment complete. Review the fields before creating the Shopify draft.','ok');
    }catch(error){
      modalStatus(error.message||'Product enrichment failed.','err');
    }
  }

  async function createItemShopifyDraft(forceCreate=false){
    const id=state.activeItem?.itemId;
    if(!id)return;
    try{
      await saveItemModal();
      modalStatus(
        forceCreate
          ? 'Override confirmed — creating a NEW unpublished Shopify draft despite the similarity match…'
          : 'Creating an unpublished Shopify draft product…',
        'warn'
      );
      const data=await api(`/batches/${state.activeBatch._id}/create-shopify-drafts`,{
        method:'POST',
        body:JSON.stringify({itemIds:[id],approvedOnly:false,forceCreate:forceCreate===true})
      });
      const result=(data.results||[]).find(x=>x.itemId===id);
      if(!result) throw new Error('Shopify returned no result for this product.');
      if(result.status==='failed') throw new Error(result.error||'Shopify draft creation failed.');

      state.activeBatch=data.batch;
      renderProducts();
      openItemModal(id);

      if(result.status==='skipped'){
        const existing=result.existingProduct;
        if(existing)showMatchWarning(existing);
        else modalStatus('No draft created — Shopify duplicate protection skipped this product.','warn');
        $('spm-validation').textContent='Status: possible existing Shopify match · No duplicate draft created';
        return;
      }

      if(result.status!=='created' || (!result.product?.id && !result.product?.legacyResourceId)){
        throw new Error('Shopify draft creation could not be verified. No success state has been saved.');
      }

      modalStatus(
        forceCreate
          ? `New Shopify draft created after duplicate override: ${result.product.title||$('spm-title').value}.`
          : `Shopify draft created successfully: ${result.product.title||$('spm-title').value}.`,
        'ok'
      );
      $('spm-validation').textContent=forceCreate
        ? 'Status: created in Shopify · duplicate match manually overridden'
        : 'Status: created in Shopify';
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
    $('supplier-sites-catalogue-settings')?.addEventListener('click',()=>openCatalogue());
    $('scs-close')?.addEventListener('click',closeCatalogue);
    document.querySelectorAll('[data-catalogue-close]').forEach(x=>x.addEventListener('click',closeCatalogue));
    $('scs-save')?.addEventListener('click',saveCatalogue);
    $('scs-recommend')?.addEventListener('click',recommendCatalogue);
    $('supplier-site-scrape')?.addEventListener('click',createSite);
    $('supplier-sites-check-shopify')?.addEventListener('click',()=>reconcileShopifyMatches(true));
    $('supplier-sites-rescan')?.addEventListener('click',repairCatalogue);
    $('supplier-sites-ai-rescan')?.addEventListener('click',aiRescanUnresolved);
    $('supplier-sites-stop')?.addEventListener('click',()=>{state.stop=true;});
    $('supplier-sites-open-batch')?.addEventListener('click',openBatchImporter);
    $('supplier-products-search')?.addEventListener('input',renderProducts);
    $('supplier-products-filter')?.addEventListener('change',renderProducts);
  }

  let booted=false;
  function boot(){
    if(booted) return;
    if(!ensureUi()) return;
    booted=true;
    loadSites();
  }

  window.openSupplierImportWorkspace=(mode='build')=>{ window.pciTab?.('supplier-sites'); setTimeout(()=>{ if(mode==='catalogue'){ document.querySelector('.supplier-sites-list-wrap')?.scrollIntoView({behavior:'smooth',block:'start'}); loadSites(); } else { $('supplier-site-url')?.focus(); } },80); };

  document.addEventListener('DOMContentLoaded',boot);
  window.addEventListener('load',boot);
  setTimeout(boot,800);
  setTimeout(boot,1800);
})();
