(function Elev8ManualReviewImageImport(){
  if(window.__ELEV8_MANUAL_IMAGE_IMPORT__)return;window.__ELEV8_MANUAL_IMAGE_IMPORT__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let batchId='',items=[];

  async function api(path,options={}){
    if(!window.adminFetch)throw new Error('Admin session unavailable');
    return window.adminFetch(`/admin/manual-review-image-imports${path}`,options);
  }
  async function compress(file){
    const img=await new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(`Could not read ${file.name}`))};
      image.src=url;
    });
    const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
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
      <div class="mri-intro"><div><h3>Import reviews from screenshots</h3><p>Upload any number of screenshots. ELEV8 transcribes each review, suggests a title and tries to map the product. Anything it cannot confidently place stays in this image batch for you to resolve.</p></div><span class="mri-ai-badge">AI assisted</span></div>
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
  function renderQueue(){
    const box=$('mri-queue');if(!box)return;
    box.innerHTML=items.length?items.map((item,index)=>{
      const d=item.draft||{},p=item.matchedProduct,status=p?'ready':'needs_mapping';
      return `<div class="mri-card" data-index="${index}">
        <div class="mri-card-head"><div><strong>${esc(item.filename||`Image ${index+1}`)}</strong><span class="mri-state ${status}">${p?'Ready':'Needs product mapping'}</span></div><span class="mri-confidence">${Math.round(Number(d.confidence||0)*100)}% extraction confidence</span></div>
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
            ${p?`<div class="mri-product-match">${p.image?`<img src="${esc(p.image)}" alt="">`:''}<div><b>${esc(p.title)}</b><small>Mapped automatically</small></div></div>`:
            `<div class="mri-suggestions">${(item.suggestions||[]).map(s=>`<button type="button" data-pick="${esc(s.id)}">${s.image?`<img src="${esc(s.image)}" alt="">`:''}<span>${esc(s.title)}</span></button>`).join('')||'<p>No confident Shopify product match. Leave this item batched until you map it.</p>'}</div>`}
            <div class="mri-attrs">${['sourness','sweetness','flavour'].map(k=>d.attributes?.[k]!=null?`<span>${esc(k)} ${d.attributes[k]}/10</span>`:'').join('')}</div>
          </div>
        </div>
        <div class="mri-card-foot"><span>${d.headlineGenerated?'AI title generated · ':''}${d.verifiedPurchase?'Verified buyer shown in source':''}</span><button type="button" class="mri-add-one" ${p?'':'disabled'}>Add this draft to Manual Add</button></div>
      </div>`;
    }).join(''):'<div class="mri-empty">Analysed image drafts will appear here.</div>';

    box.querySelectorAll('.mri-card').forEach(card=>{
      const index=Number(card.dataset.index),item=items[index];
      card.querySelectorAll('[data-pick]').forEach(btn=>btn.onclick=async()=>{
        const product=(item.suggestions||[]).find(p=>String(p.id)===btn.dataset.pick);if(!product)return;
        const result=await api(`/batches/${batchId}/items/${item._id}`,{method:'PATCH',body:JSON.stringify({matchedProduct:product})});
        items[index]=result.item;renderQueue();
      });
      card.querySelector('.mri-add-one')?.addEventListener('click',()=>addItem(index));
    });
    const ready=items.filter(x=>x.matchedProduct).length;
    $('mri-add-ready').disabled=ready===0;
    $('mri-add-ready').textContent=ready?`Add ${ready} ready draft${ready===1?'':'s'} to Manual Add`:'Add ready drafts to Manual Add';
  }

  function currentDraft(index){
    const item=items[index],card=document.querySelector(`.mri-card[data-index="${index}"]`),d={...(item.draft||{})};
    if(card){d.headline=card.querySelector('.mri-headline').value.trim();d.reviewText=card.querySelector('.mri-comment').value.trim();d.reviewerName=card.querySelector('.mri-name').value.trim();d.reviewDate=card.querySelector('.mri-date').value}
    return d;
  }
  function toManualDraft(item,index){
    const d=currentDraft(index),p=item.matchedProduct||{};
    return {
      itemId:p.id||'',productTitle:p.title||d.productHint||'',productHandle:p.handle||'',productImage:p.image||'',
      reviewerName:d.reviewerName||'',email:d.email||'',orderId:d.orderId||'',createdAt:d.reviewDate||new Date().toISOString().slice(0,10),
      rating:Number(d.rating||5),headline:d.headline||'',comment:d.reviewText||'',verifiedPurchase:Boolean(d.verifiedPurchase),
      importReason:$('mri-reason').value,importReasonDetail:$('mri-reason-detail').value.trim(),attributes:d.attributes||{}
    };
  }
  function addItem(index){
    const item=items[index];if(!item?.matchedProduct)return;
    window.Elev8ManualReviewImport?.addDraft?.(toManualDraft(item,index));
    const addTab=document.querySelector('#mr-backdrop .mr-tabs [data-tab="add"]');addTab?.click();
    window.showToast?.('Image draft added to Manual Add');
  }
  async function addReady(){
    const ready=items.map((x,i)=>({item:x,index:i})).filter(x=>x.item.matchedProduct);
    ready.forEach(({item,index})=>window.Elev8ManualReviewImport?.addDraft?.(toManualDraft(item,index)));
    if(batchId)await api(`/batches/${batchId}/complete`,{method:'POST',body:'{}'}).catch(()=>{});
    document.querySelector('#mr-backdrop .mr-tabs [data-tab="add"]')?.click();
    window.showToast?.(`${ready.length} image draft${ready.length===1?'':'s'} added to Manual Add`);
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#mr-open'))setTimeout(ensureTab,60);
  });
  setInterval(()=>{if($('mr-backdrop'))ensureTab()},1000);
})();