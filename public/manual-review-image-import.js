(function Elev8ManualReviewImageImport(){
  if(window.__ELEV8_MANUAL_IMAGE_IMPORT__)return;window.__ELEV8_MANUAL_IMAGE_IMPORT__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const VAULT_IMAGE='/images/elev8-vault-tub.png';
  let batchId='',items=[];
  let manualDraftBatchId='';

  async function api(path,options={}){
    if(!window.adminFetch)throw new Error('Admin session unavailable');
    return window.adminFetch(`/admin/manual-review-image-imports${path}`,options);
  }
  async function manualApi(path,options={}){
    if(!window.adminFetch)throw new Error('Admin session unavailable');
    return window.adminFetch(`/admin/manual-reviews${path}`,options);
  }
  function ensureManualDraftBatchId(){
    if(manualDraftBatchId)return manualDraftBatchId;
    const bytes=new Uint8Array(3);
    crypto.getRandomValues(bytes);
    const suffix=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
    manualDraftBatchId=`manual-${Date.now()}-${suffix}`;
    return manualDraftBatchId;
  }
  async function compress(file){
    if(!file)throw new Error('No image file was provided.');
    if(!/^image\/(png|jpeg|jpg|webp)$/i.test(String(file.type||'')))throw new Error(`Unsupported image type for ${file.name||'image'}`);
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(new Error(`Could not read ${file.name||'image'}`));
      reader.readAsDataURL(file);
    });
    const img=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error(`Could not decode ${file.name||'image'}`));
      image.src=dataUrl;
    });
    const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Browser image canvas is unavailable.');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.75);
  }

  function ensureTab(){
    const tabs=document.querySelector('#mr-backdrop .mr-tabs');
    if(!tabs||tabs.querySelector('[data-tab="images"]'))return;
    const btn=document.createElement('button');btn.type='button';btn.dataset.tab='images';btn.textContent='Import from images';
    tabs.appendChild(btn);
    const body=document.querySelector('#mr-backdrop .mr-body');
    const pane=document.createElement('section');pane.id='mr-pane-images';pane.className='mr-pane';
    pane.innerHTML=`<div class="mri-shell">
      <div class="mri-intro"><div><h3>Import reviews from screenshots</h3><p>Upload any number of screenshots. ELEV8 transcribes each review, suggests a title and tries to map the product. Anything it cannot confidently place stays in this image batch until you resolve it.</p></div><span class="mri-ai-badge">AI assisted</span></div>
      <div class="mri-grid2">
        <label><span>Reason for import <b>required</b></span><select id="mri-reason"><option value="">Choose a reason…</option><option value="historical_migration">Historical review migration</option><option value="platform_export">Imported from previous review platform</option><option value="customer_record">Existing customer review transcribed from records</option><option value="manual_recovery">Manual recovery / reconstruction</option><option value="other">Other – explain below</option></select></label>
        <label><span>Reason note</span><input id="mri-reason-detail" placeholder="e.g. screenshots exported from Yotpo / Weebly"></label>
      </div>
      <div id="mri-drop" class="mri-drop" tabindex="0">
        <input id="mri-files" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
        <div class="mri-drop-icon">▧</div>
        <strong>Drop review screenshots here</strong>
        <span>or click to choose PNG, JPG or WEBP files</span>
        <small>Images are compressed in your browser before AI analysis.</small>
      </div>
      <div class="mri-toolbar"><span id="mri-summary">No images analysed yet.</span><div><button id="mri-analyse" type="button" class="mr-primary">Analyse selected images</button><button id="mri-add-ready" type="button" class="mr-secondary" disabled>Add ready drafts to Manual Add</button></div></div>
      <div id="mri-queue" class="mri-queue"></div>
    </div>`;
    body.appendChild(pane);

    tabs.querySelectorAll('button').forEach(tab=>tab.onclick=()=>{
      tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===tab));
      document.querySelectorAll('#mr-backdrop .mr-pane').forEach(p=>p.classList.toggle('active',p.id===`mr-pane-${tab.dataset.tab}`));
      const addMode=tab.dataset.tab==='add';
      $('mr-save').style.display=addMode?'inline-flex':'none';
      $('mr-save-add').style.display=addMode?'inline-flex':'none';
      if(tab.dataset.tab==='drafts'&&window.Elev8ManualReviewImport?.loadDrafts)window.Elev8ManualReviewImport.loadDrafts();
    });

    const drop=$('mri-drop'),files=$('mri-files');
    drop.onclick=()=>files.click();
    drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging')};
    drop.ondragleave=()=>drop.classList.remove('dragging');
    drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');files.files=e.dataTransfer.files;renderSelected(files.files)};
    files.onchange=()=>renderSelected(files.files);
    $('mri-analyse').onclick=analyseSelected;
    $('mri-add-ready').onclick=addReady;
  }

  function renderSelected(fileList){
    const names=[...fileList].map(f=>f.name);
    $('mri-summary').textContent=names.length?`${names.length} image${names.length===1?'':'s'} selected`:'No images selected.';
  }

  async function analyseSelected(){
    const files=[...($('mri-files')?.files||[])];
    const reason=$('mri-reason').value,detail=$('mri-reason-detail').value.trim();
    if(!files.length)return window.showToast?.('Choose at least one review image');
    if(!reason)return window.showToast?.('Choose why these screenshots are being imported');
    if(reason==='other'&&!detail)return window.showToast?.('Add a note for the Other reason');

    const btn=$('mri-analyse');btn.disabled=true;const old=btn.textContent;
    try{
      for(let i=0;i<files.length;i++){
        btn.textContent=`Analysing ${i+1} / ${files.length}…`;
        const dataUrl=await compress(files[i]);
        const result=await api('/analyse',{method:'POST',body:JSON.stringify({batchId,filename:files[i].name,dataUrl,importReason:reason,importReasonDetail:detail})});
        batchId=result.batchId;items.push(result.item);renderQueue();
      }
      $('mri-files').value='';
      $('mri-summary').textContent=`${items.length} image draft${items.length===1?'':'s'} in this batch`;
    }catch(error){window.showToast?.(error.message||'Image analysis failed')}
    finally{btn.disabled=false;btn.textContent=old}
  }

  function stars(n){return '★'.repeat(Math.max(1,Math.min(5,Number(n||5))))}
  function matchCard(p={}){
    const img=p.image||VAULT_IMAGE;
    const meta=p.isVault?'Vault placeholder':`${p.status||'Shopify'}${p.vendor?` · ${p.vendor}`:''}`;
    return `<div class="mri-product-match ${p.isVault?'vault':''}">
      <img src="${esc(img)}" alt="">
      <div><b>${esc(p.title||'Archived product')}</b><small>${esc(meta)}</small></div>
    </div>`;
  }

  function renderQueue(){
    const box=$('mri-queue');if(!box)return;
    box.innerHTML=items.length?items.map((item,index)=>{
      const d=item.draft||{},p=item.matchedProduct,status=p?(p.isVault?'vault_ready':'ready'):'needs_mapping';
      return `<div class="mri-card" data-index="${index}">
        <div class="mri-card-head">
          <div><strong>${esc(item.filename||`Image ${index+1}`)}</strong><span class="mri-state ${status}">${p?(p.isVault?'Vault product':'Ready'):'Needs product mapping'}</span></div>
          <span class="mri-confidence">${Math.round(Number(d.confidence||0)*100)}% extraction confidence</span>
        </div>
        <div class="mri-review-grid">
          <div class="mri-review-main">
            <div class="mri-stars">${stars(d.rating)}</div>
            <input class="mri-headline" value="${esc(d.headline||'')}" placeholder="Review headline">
            <textarea class="mri-comment" rows="4" placeholder="Transcribed review">${esc(d.reviewText||'')}</textarea>
            <div class="mri-meta-row"><input class="mri-name" value="${esc(d.reviewerName||'')}" placeholder="Reviewer name"><input class="mri-date" type="date" value="${esc(d.reviewDate||'')}"></div>
            ${(d.notes||[]).length?`<div class="mri-notes">${d.notes.map(n=>`<span>${esc(n)}</span>`).join('')}</div>`:''}
          </div>

          <div class="mri-map">
            <label><span>Detected product</span><input class="mri-product-hint" value="${esc(d.productHint||'')}" placeholder="Product name"></label>
            <div class="mri-map-search-row">
              <input class="mri-map-search-input" value="${esc(d.productHint||'')}" placeholder="Search all Shopify products">
              <button type="button" class="mri-search-btn">Search</button>
            </div>
            <div class="mri-search-results"></div>

            ${p?matchCard(p):`<div class="mri-unmapped">
              <p>No confident Shopify product match yet.</p>
              <p>Search manually. If the product no longer exists in Shopify, move it to the ELEV8 Vault instead.</p>
            </div>`}

            <button type="button" class="mri-vault-btn">${p?.isVault?'✓ Using Vault placeholder':'Use Vault / discontinued product'}</button>
            <div class="mri-attrs">${['sourness','sweetness','flavour'].map(k=>d.attributes?.[k]!=null?`<span>${esc(k)} ${d.attributes[k]}/10</span>`:'').join('')}</div>
          </div>
        </div>
        <div class="mri-card-foot">
          <span>${d.headlineGenerated?'AI title generated · ':''}${d.verifiedPurchase?'Verified buyer shown in source':''}</span>
          <button type="button" class="mri-add-one ${item.addedToManualDraft?'is-added':''}" ${(p&&!item.addedToManualDraft)?'':'disabled'}>${item.addedToManualDraft?'✓ Added to draft':'Add this draft to Draft Reviews'}</button>
        </div>
      </div>`;
    }).join(''):'<div class="mri-empty">Analysed image drafts will appear here.</div>';

    box.querySelectorAll('.mri-card').forEach(card=>{
      const index=Number(card.dataset.index),item=items[index];

      card.querySelectorAll('[data-pick]').forEach(btn=>btn.onclick=()=>pickProduct(index,btn.dataset.pick));

      card.querySelector('.mri-search-btn')?.addEventListener('click',()=>searchProducts(index));
      card.querySelector('.mri-map-search-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchProducts(index)}});
      card.querySelector('.mri-vault-btn')?.addEventListener('click',()=>useVault(index));
      card.querySelector('.mri-add-one')?.addEventListener('click',()=>addItem(index));
    });

    updateReadySummary();
  }

  async function searchProducts(index){
    syncAllCardsIntoItems();
    const item=items[index],card=document.querySelector(`.mri-card[data-index="${index}"]`);
    if(!item||!card)return;
    const q=card.querySelector('.mri-map-search-input').value.trim();
    const results=card.querySelector('.mri-search-results');
    if(q.length<2){results.innerHTML='<p class="mri-search-help">Type at least 2 characters.</p>';return}
    results.innerHTML='<p class="mri-search-help">Searching Shopify…</p>';
    try{
      const data=await api(`/products/search?q=${encodeURIComponent(q)}`);
      const products=data.products||[];
      item.suggestions=products;
      results.innerHTML=products.length?products.map(p=>`<button type="button" class="mri-search-result" data-pick="${esc(p.id)}">
        <img src="${esc(p.image||VAULT_IMAGE)}" alt="">
        <span><strong>${esc(p.title)}</strong><small>${esc((p.status||'Shopify')+(p.vendor?` · ${p.vendor}`:''))}</small></span>
      </button>`).join(''):'<div class="mri-search-empty"><b>No Shopify products found.</b><span>If this was discontinued, use the Vault placeholder below.</span></div>';
      results.querySelectorAll('[data-pick]').forEach(btn=>btn.onclick=()=>pickProduct(index,btn.dataset.pick));
    }catch(error){results.innerHTML=`<div class="mri-search-empty">${esc(error.message||'Product search failed')}</div>`}
  }

  async function pickProduct(index,id){
    syncAllCardsIntoItems();
    const item=items[index],product=(item.suggestions||[]).find(p=>String(p.id)===String(id));
    if(!item||!product)return;
    try{
      const result=await api(`/batches/${batchId}/items/${item._id}`,{method:'PATCH',body:JSON.stringify({matchedProduct:product,draft:item.draft})});
      items[index]=result.item;renderQueue();
    }catch(error){window.showToast?.(error.message||'Could not map product')}
  }

  async function useVault(index){
    syncAllCardsIntoItems();
    const item=items[index],card=document.querySelector(`.mri-card[data-index="${index}"]`);
    if(!item||!card)return;
    const title=card.querySelector('.mri-product-hint').value.trim()||item.draft?.productHint||'Archived product';
    try{
      await persistItemDraft(index);
      const result=await api(`/batches/${batchId}/items/${item._id}/vault`,{method:'POST',body:JSON.stringify({title})});
      items[index]=result.item;renderQueue();
    }catch(error){window.showToast?.(error.message||'Could not move product to Vault')}
  }

  function syncCardIntoItem(index){
    const item=items[index],card=document.querySelector(`.mri-card[data-index="${index}"]`);
    if(!item||!card)return item;
    const d={...(item.draft||{})};
    d.headline=card.querySelector('.mri-headline')?.value.trim()||'';
    d.reviewText=card.querySelector('.mri-comment')?.value.trim()||'';
    d.reviewerName=card.querySelector('.mri-name')?.value.trim()||'';
    d.reviewDate=card.querySelector('.mri-date')?.value||'';
    d.productHint=card.querySelector('.mri-product-hint')?.value.trim()||'';
    item.draft=d;
    return item;
  }

  function syncAllCardsIntoItems(){
    document.querySelectorAll('.mri-card').forEach(card=>{
      const index=Number(card.dataset.index);
      if(Number.isFinite(index))syncCardIntoItem(index);
    });
  }

  async function persistItemDraft(index){
    const item=syncCardIntoItem(index);
    if(!item||!batchId)return item;
    const result=await api(`/batches/${batchId}/items/${item._id}`,{
      method:'PATCH',
      body:JSON.stringify({draft:item.draft})
    });
    items[index]=result.item;
    return result.item;
  }

  function currentDraft(index){
    syncCardIntoItem(index);
    return {...(items[index]?.draft||{})};
  }

  function toManualDraft(item,index){
    const d=currentDraft(index),p=item.matchedProduct||{},isVault=Boolean(p.isVault);
    return {
      itemId:p.id||'',
      productTitle:p.title||d.productHint||'',
      productHandle:p.handle||'',
      productImage:p.image||(isVault?VAULT_IMAGE:''),
      archivedProduct:isVault,
      reviewerName:d.reviewerName||'',
      email:d.email||'',
      orderId:d.orderId||'',
      createdAt:d.reviewDate||new Date().toISOString().slice(0,10),
      rating:Number(d.rating||5),
      headline:d.headline||'',
      comment:d.reviewText||'',
      verifiedPurchase:Boolean(d.verifiedPurchase),
      importReason:$('mri-reason').value,
      importReasonDetail:$('mri-reason-detail').value.trim(),
      attributes:d.attributes||{}
    };
  }

  async function addItem(index){
    syncAllCardsIntoItems();
    const item=items[index];
    if(!item?.matchedProduct||item.addedToManualDraft)return;

    const card=document.querySelector(`.mri-card[data-index="${index}"]`);
    const btn=card?.querySelector('.mri-add-one');
    if(btn){btn.disabled=true;btn.textContent='Saving draft…'}

    try{
      await persistItemDraft(index);
      const review=toManualDraft(items[index],index);
      const data=await manualApi('/batches',{
        method:'POST',
        body:JSON.stringify({
          batchId:ensureManualDraftBatchId(),
          reviews:[review]
        })
      });

      item.addedToManualDraft=true;
      item.manualReviewBatchId=data.batchId||manualDraftBatchId;
      item.manualReviewSavedAt=new Date().toISOString();

      // Persist conversion metadata on the image-import item without rebuilding the whole queue.
      await api(`/batches/${batchId}/items/${item._id}`,{
        method:'PATCH',
        body:JSON.stringify({
          draft:item.draft,
          addedToManualDraft:true,
          manualReviewBatchId:item.manualReviewBatchId,
          manualReviewSavedAt:item.manualReviewSavedAt
        })
      }).catch(()=>{});

      if(btn){
        btn.textContent='✓ Added to draft';
        btn.classList.add('is-added');
        btn.disabled=true;
      }
      const state=card?.querySelector('.mri-state');
      if(state){state.textContent='Added to draft';state.className='mri-state drafted'}
      window.showToast?.('Review added to Draft Reviews — keep working through this batch');
      updateReadySummary();
    }catch(error){
      if(btn){btn.disabled=false;btn.textContent='Add this draft to Draft Reviews'}
      window.showToast?.(error.message||'Could not save review draft');
    }
  }

  function updateReadySummary(){
    const available=items.filter(x=>x.matchedProduct&&!x.addedToManualDraft).length;
    const added=items.filter(x=>x.addedToManualDraft).length;
    const bulk=$('mri-add-ready');
    if(bulk){
      bulk.disabled=available===0;
      bulk.textContent=available
        ? `Add ${available} ready draft${available===1?'':'s'}`
        : (added?`${added} added to Draft Reviews`:'Add ready drafts');
    }
  }

  async function addReady(){
    syncAllCardsIntoItems();
    const indexes=items.map((item,index)=>({item,index}))
      .filter(x=>x.item.matchedProduct&&!x.item.addedToManualDraft)
      .map(x=>x.index);
    if(!indexes.length)return;

    const btn=$('mri-add-ready'),old=btn.textContent;
    btn.disabled=true;
    try{
      for(let i=0;i<indexes.length;i++){
        btn.textContent=`Saving ${i+1} / ${indexes.length}…`;
        await addItem(indexes[i]);
      }
      window.showToast?.(`${indexes.length} review draft${indexes.length===1?'':'s'} saved — you can continue mapping here`);
    }finally{
      updateReadySummary();
      if(!items.some(x=>x.matchedProduct&&!x.addedToManualDraft)&&!items.some(x=>x.addedToManualDraft)){
        btn.textContent=old;
      }
    }
  }

  document.addEventListener('click',e=>{if(e.target.closest('#mr-open'))setTimeout(ensureTab,60)});
  setInterval(()=>{if($('mr-backdrop'))ensureTab()},1000);
})();