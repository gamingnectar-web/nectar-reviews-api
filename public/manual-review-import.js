(function Elev8ManualReviewImport(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  let activeManualBatchId='';

  async function api(path,options={}){
    if(window.adminFetch) return window.adminFetch(`/admin/manual-reviews${path}`,options);
    throw new Error('Admin session unavailable');
  }

  function rowTemplate(index){
    const today=new Date().toISOString().slice(0,10);
    return `<div class="mr-row" data-index="${index}">
      <div class="mr-card-head">
        <div><strong>Review ${index+1}</strong><span class="mr-draft-badge">Draft</span></div>
        <button type="button" class="mr-remove" title="Remove review">×</button>
      </div>

      <div class="mr-grid two">
        <label><span>Product</span>
          <div class="mr-product-search-wrap">
            <input class="mr-product-search" placeholder="Search Shopify products…" autocomplete="off">
            <input class="mr-product-id" type="hidden">
            <input class="mr-product-title" type="hidden">
            <input class="mr-product-handle" type="hidden">
            <input class="mr-product-image" type="hidden">
            <div class="mr-product-results"></div>
          </div>
        </label>
        <label><span>Review date</span><input class="mr-date" type="date" value="${today}"></label>
      </div>

      <div class="mr-grid three">
        <label><span>Reviewer name</span><input class="mr-name" placeholder="Steven S."></label>
        <label><span>Email <small>optional</small></span><input class="mr-email" type="email" placeholder="customer@example.com"></label>
        <label><span>Order # <small>optional</small></span><input class="mr-order" placeholder="#1195135775"></label>
      </div>

      <div class="mr-grid two mr-reason-grid">
        <label><span>Reason for manual add <b>required</b></span><select class="mr-import-reason"><option value="">Choose a reason…</option><option value="historical_migration">Historical review migration</option><option value="platform_export">Imported from previous review platform</option><option value="customer_record">Existing customer review transcribed from records</option><option value="manual_recovery">Manual recovery / reconstruction</option><option value="other">Other – explain below</option></select></label>
        <label><span>Reason note <small>optional unless Other</small></span><input class="mr-import-reason-detail" placeholder="e.g. migrated from Yotpo before plan expired"></label>
      </div>

      <div class="mr-grid rating-row">
        <label><span>Star rating</span>
          <div class="mr-stars" data-rating="5">
            ${[1,2,3,4,5].map(n=>`<button type="button" data-star="${n}" class="on">★</button>`).join('')}
          </div>
        </label>
        <label class="mr-check"><input class="mr-verified" type="checkbox"><span>Verified buyer</span></label>
      </div>

      <label><span>Review headline</span><div class="mr-headline-row"><input class="mr-headline" placeholder="Great flavour and fast delivery"><button type="button" class="mr-ai-title">✨ AI generate title</button></div><small class="mr-ai-help">Summarises only the review text below; it will not invent flavour or product claims.</small></label>
      <label><span>Review</span><textarea class="mr-comment" rows="4" placeholder="Write the review exactly as you want it to appear…"></textarea></label>

      <div class="mr-attributes">
        <strong>Review attributes <small>optional</small></strong>
        <div class="mr-attr-grid">
          <label class="mr-score-card"><span><input class="mr-score-live mr-sour-live" type="checkbox"> Include Sourness score</span><div class="mr-score-control is-off"><span>Sourness <b class="mr-val">5</b>/10</span><input class="mr-sour" type="range" min="1" max="10" value="5" disabled></div></label>
          <label class="mr-score-card"><span><input class="mr-score-live mr-sweet-live" type="checkbox"> Include Sweetness score</span><div class="mr-score-control is-off"><span>Sweetness <b class="mr-val">5</b>/10</span><input class="mr-sweet" type="range" min="1" max="10" value="5" disabled></div></label>
          <label class="mr-score-card"><span><input class="mr-score-live mr-flavour-live" type="checkbox"> Include Flavour score</span><div class="mr-score-control is-off"><span>Flavour <b class="mr-val">5</b>/10</span><input class="mr-flavour" type="range" min="1" max="10" value="5" disabled></div></label>
        </div>
      </div>
    </div>`;
  }

  function modal(){
    activeManualBatchId='';
    $('mr-backdrop')?.remove();
    const el=document.createElement('div');el.id='mr-backdrop';el.className='mr-backdrop';
    el.innerHTML=`<div class="mr-modal">
      <div class="mr-head">
        <div><h2>Manual Add Reviews</h2><p>Add one or many reviews using the same fields customers see. Everything saves as <b>Pending</b> until you approve the batch.</p></div>
        <button id="mr-x" type="button">×</button>
      </div>
      <div class="mr-tabs">
        <button class="active" data-tab="add">Add reviews</button>
        <button data-tab="drafts">Draft batches</button>
      </div>
      <div class="mr-body">
        <section id="mr-pane-add" class="mr-pane active">
          <div id="mr-rows"></div>
          <button id="mr-add-row" type="button" class="mr-secondary">+ Add another review</button>
        </section>
        <section id="mr-pane-drafts" class="mr-pane"><div id="mr-drafts">Loading…</div></section>
      </div>
      <div class="mr-foot">
        <span id="mr-status"></span>
        <div><button id="mr-cancel" type="button" class="mr-secondary">Close</button><button id="mr-save" type="button" class="mr-secondary">Save draft</button><button id="mr-save-add" type="button" class="mr-primary">Save & add another</button></div>
      </div>
    </div>`;
    document.body.appendChild(el);
    $('mr-x').onclick=$('mr-cancel').onclick=()=>el.remove();
    $('mr-add-row').onclick=()=>addRow();
    $('mr-save').onclick=()=>saveBatch({continueAdding:false});
    $('mr-save-add').onclick=()=>saveBatch({continueAdding:true});
    el.querySelectorAll('.mr-tabs button').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.tab));
    addRow();
  }

  function addRow(){
    const box=$('mr-rows');const index=box.children.length;
    box.insertAdjacentHTML('beforeend',rowTemplate(index));
    wireRow(box.lastElementChild);
  }

  function wireRow(row){
    row.querySelector('.mr-remove').onclick=()=>{
      if($('mr-rows').children.length===1)return;
      row.remove();renumber();
    };
    row.querySelectorAll('.mr-stars button').forEach(btn=>btn.onclick=()=>{
      const n=Number(btn.dataset.star);const stars=row.querySelector('.mr-stars');stars.dataset.rating=n;
      stars.querySelectorAll('button').forEach(x=>x.classList.toggle('on',Number(x.dataset.star)<=n));
    });
    row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{
      const valueNode=input.closest('.mr-score-control')?.querySelector('.mr-val');
      if(valueNode)valueNode.textContent=input.value;
    });
    row.querySelectorAll('.mr-score-live').forEach(toggle=>toggle.addEventListener('change',()=>{const card=toggle.closest('.mr-score-card'),slider=card?.querySelector('input[type=range]');if(slider)slider.disabled=!toggle.checked;card?.querySelector('.mr-score-control')?.classList.toggle('is-off',!toggle.checked)}));
    row.querySelector('.mr-ai-title')?.addEventListener('click',async()=>{const btn=row.querySelector('.mr-ai-title'),comment=row.querySelector('.mr-comment').value.trim();if(comment.length<8)return window.showToast?.('Add the review description first');const old=btn.textContent;btn.disabled=true;btn.textContent='Generating…';try{const result=await api('/generate-title',{method:'POST',body:JSON.stringify({comment,productTitle:row.querySelector('.mr-product-title').value||row.querySelector('.mr-product-search').value,rating:Number(row.querySelector('.mr-stars').dataset.rating||5)})});row.querySelector('.mr-headline').value=result.title||''}catch(error){window.showToast?.(error.message||'Could not generate title')}finally{btn.disabled=false;btn.textContent=old}});

    let timer;
    const input=row.querySelector('.mr-product-search');
    input.addEventListener('input',()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>searchProducts(row,input.value.trim()),250);
    });
  }

  function renumber(){
    [...$('mr-rows').children].forEach((row,i)=>{
      row.dataset.index=i;row.querySelector('.mr-card-head strong').textContent=`Review ${i+1}`;
    });
  }

  async function searchProducts(row,q){
    const box=row.querySelector('.mr-product-results');
    if(q.length<2){box.innerHTML='';box.classList.remove('open');return}
    box.innerHTML='<div class="mr-result muted">Searching…</div>';box.classList.add('open');
    try{
      const {products=[]}=await api(`/products?q=${encodeURIComponent(q)}`);
      box.innerHTML=products.length?products.map(p=>`<button type="button" class="mr-result" data-id="${esc(p.id)}" data-title="${esc(p.title)}" data-handle="${esc(p.handle)}" data-image="${esc(p.image)}">
        ${p.image?`<img src="${esc(p.image)}" alt="">`:''}<span><strong>${esc(p.title)}</strong><small>${esc(p.handle)}</small></span>
      </button>`).join(''):'<div class="mr-result muted">No products found.</div>';
      box.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
        row.querySelector('.mr-product-search').value=btn.dataset.title;
        row.querySelector('.mr-product-id').value=btn.dataset.id;
        row.querySelector('.mr-product-title').value=btn.dataset.title;
        row.querySelector('.mr-product-handle').value=btn.dataset.handle;
        row.querySelector('.mr-product-image').value=btn.dataset.image;
        box.classList.remove('open');
      });
    }catch(error){box.innerHTML=`<div class="mr-result muted">${esc(error.message)}</div>`}
  }

  function collect(){
    return [...document.querySelectorAll('#mr-rows .mr-row')].map(row=>({
      itemId:row.querySelector('.mr-product-id').value,
      productTitle:row.querySelector('.mr-product-title').value,
      productHandle:row.querySelector('.mr-product-handle').value,
      productImage:row.querySelector('.mr-product-image').value,
      reviewerName:row.querySelector('.mr-name').value.trim(),
      email:row.querySelector('.mr-email').value.trim(),
      orderId:row.querySelector('.mr-order').value.trim(),
      createdAt:row.querySelector('.mr-date').value,
      rating:Number(row.querySelector('.mr-stars').dataset.rating||5),
      headline:row.querySelector('.mr-headline').value.trim(),
      comment:row.querySelector('.mr-comment').value.trim(),
      verifiedPurchase:row.querySelector('.mr-verified').checked,
      importReason:row.querySelector('.mr-import-reason').value,
      importReasonDetail:row.querySelector('.mr-import-reason-detail').value.trim(),
      attributes:{
        ...(row.querySelector('.mr-sour-live').checked?{sourness:Number(row.querySelector('.mr-sour').value)}:{}),
        ...(row.querySelector('.mr-sweet-live').checked?{sweetness:Number(row.querySelector('.mr-sweet').value)}:{}),
        ...(row.querySelector('.mr-flavour-live').checked?{flavour:Number(row.querySelector('.mr-flavour').value)}:{})
      }
    }));
  }

  async function saveBatch({continueAdding=false}={}){
    const reviews=collect();
    const status=$('mr-status'),saveBtn=$('mr-save'),addBtn=$('mr-save-add');
    saveBtn.disabled=true;addBtn.disabled=true;
    const oldSave=saveBtn.textContent,oldAdd=addBtn.textContent;
    (continueAdding?addBtn:saveBtn).textContent='Saving…';
    status.textContent='';
    try{
      const data=await api('/batches',{method:'POST',body:JSON.stringify({
        reviews,
        ...(activeManualBatchId?{batchId:activeManualBatchId}:{})
      })});
      activeManualBatchId=data.batchId||activeManualBatchId;
      status.textContent=`✓ ${data.saved} review${data.saved===1?'':'s'} added to this draft batch.`;
      status.className='ok';

      if(continueAdding){
        const rows=$('mr-rows');
        rows.innerHTML='';
        addRow();
        rows.querySelector('.mr-product-search')?.focus();
        window.scrollTo?.({top:0,behavior:'smooth'});
      }else{
        switchTab('drafts');
        loadDrafts();
      }
    }catch(error){
      status.textContent=error.message;status.className='error';
    }finally{
      saveBtn.disabled=false;addBtn.disabled=false;
      saveBtn.textContent=oldSave;addBtn.textContent=oldAdd;
    }
  }

  function switchTab(name){
    document.querySelectorAll('.mr-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.mr-pane').forEach(p=>p.classList.toggle('active',p.id===`mr-pane-${name}`));
    $('mr-save').style.display=name==='add'?'inline-flex':'none';
    $('mr-save-add').style.display=name==='add'?'inline-flex':'none';
    if(name==='drafts')loadDrafts();
  }

  async function loadDrafts(){
    const box=$('mr-drafts');if(!box)return;
    box.innerHTML='<div class="mr-empty">Loading draft batches…</div>';
    try{
      const {batches=[]}=await api('/batches');
      box.innerHTML=batches.length?batches.map(b=>`<div class="mr-batch">
        <div><strong>${b.pending?`${b.pending} pending`:`${b.count} reviews`}</strong><small>${new Date(b.lastCreatedAt).toLocaleString('en-GB')} · ${esc((b.products||[]).filter(Boolean).slice(0,3).join(', ')||'Manual reviews')}</small></div>
        <div class="mr-batch-actions">
          ${b.pending?`<button type="button" class="mr-approve" data-id="${esc(b._id)}">Approve batch</button><button type="button" class="mr-delete" data-id="${esc(b._id)}">Delete drafts</button>`:'<span class="mr-approved">Approved</span>'}
        </div>
      </div>`).join(''):'<div class="mr-empty">No manual review batches yet.</div>';
      box.querySelectorAll('.mr-approve').forEach(btn=>btn.onclick=()=>approve(btn.dataset.id));
      box.querySelectorAll('.mr-delete').forEach(btn=>btn.onclick=()=>deleteBatch(btn.dataset.id));
    }catch(error){box.innerHTML=`<div class="mr-empty error">${esc(error.message)}</div>`}
  }

  async function approve(id){
    if(!confirm('Approve every pending review in this batch and make them live?'))return;
    const data=await api(`/batches/${encodeURIComponent(id)}/approve`,{method:'POST',body:'{}'});
    $('mr-status').textContent=`✓ ${data.approved} review(s) approved.`;
    loadDrafts();refreshManager();
  }
  async function deleteBatch(id){
    if(!confirm('Delete all pending reviews in this batch?'))return;
    await api(`/batches/${encodeURIComponent(id)}/delete`,{method:'POST',body:'{}'});
    loadDrafts();refreshManager();
  }

  function refreshManager(){
    [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh')?.click();
  }

  function injectButton(){
    const headings=[...document.querySelectorAll('h1,h2,h3')];
    const heading=headings.find(h=>/review manager/i.test(h.textContent||''));
    if(!heading||$('mr-open'))return;

    const view=heading.closest('.view')||heading.parentElement?.parentElement||document;
    const tabButtons=[...view.querySelectorAll('button')].filter(btn=>{
      const text=String(btn.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
      return ['reviews','approval rules','trash'].includes(text);
    });

    const btn=document.createElement('button');
    btn.id='mr-open';
    btn.type='button';
    btn.className='mr-open mr-open-inline';
    btn.textContent='+ Manual Add';
    btn.onclick=modal;

    if(tabButtons.length){
      const tabsParent=tabButtons[0].parentElement;
      if(tabsParent){
        tabsParent.classList.add('mr-review-tabs-row');
        tabsParent.appendChild(btn);
        return;
      }
    }

    const parent=heading.parentElement;
    if(parent){
      parent.classList.add('mr-titlebar');
      parent.appendChild(btn);
    }
  }

  const style=document.createElement('style');
  style.textContent=`
    .mr-titlebar{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.mr-review-tabs-row{display:flex!important;align-items:center!important;gap:18px!important;flex-wrap:wrap}.mr-review-tabs-row .mr-open-inline{margin-left:auto!important;white-space:nowrap}.mr-open,.mr-primary{background:#0f1d32;color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer}.mr-secondary{background:#fff;border:1px solid #d6dce5;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}
    .mr-backdrop{position:fixed;inset:0;background:rgba(15,29,50,.45);z-index:100002;display:flex;align-items:center;justify-content:center;padding:18px}.mr-modal{width:min(1050px,97vw);max-height:92vh;background:#f7f9fb;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 90px rgba(15,29,50,.25)}
    .mr-head{background:#fff;padding:20px 22px;border-bottom:1px solid #e5e9ef;display:flex;justify-content:space-between;gap:16px}.mr-head h2{margin:0}.mr-head p{margin:5px 0 0;color:#667085}.mr-head>button{border:0;background:none;font-size:30px;cursor:pointer}.mr-tabs{background:#fff;padding:0 22px;border-bottom:1px solid #e5e9ef;display:flex;gap:18px}.mr-tabs button{border:0;background:none;padding:13px 0;font-weight:800;color:#667085;border-bottom:3px solid transparent;cursor:pointer}.mr-tabs button.active{color:#0f1d32;border-bottom-color:#0f1d32}
    .mr-body{padding:18px;overflow:auto}.mr-pane{display:none}.mr-pane.active{display:block}.mr-row{background:#fff;border:1px solid #dde3eb;border-radius:16px;padding:17px;margin-bottom:14px}.mr-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.mr-card-head>div{display:flex;gap:8px;align-items:center}.mr-draft-badge{font-size:11px;background:#fff5d9;color:#8a6500;border-radius:999px;padding:4px 7px}.mr-remove{border:0;background:#fff0ee;color:#a72b20;border-radius:50%;width:30px;height:30px;font-size:20px;cursor:pointer}
    .mr-grid{display:grid;gap:12px}.mr-grid.two{grid-template-columns:2fr 1fr}.mr-grid.three{grid-template-columns:1fr 1fr 1fr}.mr-grid.rating-row{grid-template-columns:1fr auto;align-items:end}label{display:block}.mr-row label>span{display:block;font-size:12px;font-weight:800;color:#4b5563;margin:0 0 6px}.mr-row input,.mr-row textarea{width:100%;box-sizing:border-box;border:1px solid #ccd4df;border-radius:10px;padding:10px 11px;font:inherit;background:#fff}.mr-row textarea{resize:vertical}.mr-check{display:flex!important;align-items:center;gap:7px;padding-bottom:9px}.mr-check input{width:auto}.mr-check span{margin:0!important}
    .mr-stars{display:flex;gap:3px}.mr-stars{gap:6px!important;align-items:center}.mr-stars button{border:0;background:none;padding:2px 1px;font-size:40px;line-height:1;color:#d8dde5;cursor:pointer;transition:transform .12s ease,color .12s ease}.mr-stars button:hover{transform:scale(1.08)}.mr-stars button.on{color:#ffb400}.mr-product-search-wrap{position:relative}.mr-product-results{display:none;position:absolute;left:0;right:0;top:100%;z-index:10;background:#fff;border:1px solid #d8dee7;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.12);max-height:260px;overflow:auto}.mr-product-results.open{display:block}.mr-result{width:100%;border:0;background:#fff;padding:9px;text-align:left;display:flex;gap:9px;align-items:center;cursor:pointer;border-bottom:1px solid #eef1f4}.mr-result img{width:42px;height:42px;object-fit:cover;border-radius:7px}.mr-result span{display:flex;flex-direction:column}.mr-result small,.muted{color:#7b8493}
    .mr-attributes{margin-top:14px;border-top:1px solid #edf0f4;padding-top:14px}.mr-attributes>strong{font-size:13px}.mr-attributes small{font-weight:500;color:#7b8493}.mr-attr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:10px}.mr-attr-grid input{padding:0;border:0}.mr-foot{background:#fff;border-top:1px solid #e5e9ef;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px}.mr-foot>div{display:flex;gap:8px;align-items:center}.mr-foot .mr-primary{min-width:165px}.mr-foot .mr-secondary{white-space:nowrap}.mr-foot .ok{color:#167642;font-weight:700}.mr-foot .error{color:#a72b20;font-weight:700}
    .mr-batch{background:#fff;border:1px solid #dfe5ec;border-radius:12px;padding:13px;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:9px}.mr-batch>div:first-child{display:flex;flex-direction:column}.mr-batch small{color:#737d8c;margin-top:4px}.mr-batch-actions{display:flex;gap:7px}.mr-approve{border:0;background:#0b8a68;color:#fff;border-radius:9px;padding:8px 10px;font-weight:800;cursor:pointer}.mr-delete{border:1px solid #ffc9c3;background:#fff7f6;color:#b33225;border-radius:9px;padding:8px 10px;font-weight:800;cursor:pointer}.mr-approved{background:#e9f8ef;color:#167642;border-radius:999px;padding:5px 9px;font-weight:800}.mr-empty{padding:18px;text-align:center;color:#737d8c}
    @media(max-width:760px){.mr-grid.two,.mr-grid.three,.mr-grid.rating-row,.mr-attr-grid{grid-template-columns:1fr}.mr-batch{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(injectButton,400));
  window.addEventListener('load',()=>setTimeout(injectButton,650));
  setInterval(injectButton,1200);

  function addDraft(draft={}){
    const box=$('mr-rows');
    if(!box)return null;

    let row=[...box.querySelectorAll('.mr-row')].find(candidate=>{
      return !candidate.querySelector('.mr-comment')?.value.trim()
        && !candidate.querySelector('.mr-product-id')?.value
        && !candidate.querySelector('.mr-name')?.value.trim();
    });
    if(!row){addRow();row=box.lastElementChild}

    row.querySelector('.mr-product-search').value=draft.productTitle||'';
    row.querySelector('.mr-product-id').value=draft.itemId||'';
    row.querySelector('.mr-product-title').value=draft.productTitle||'';
    row.querySelector('.mr-product-handle').value=draft.productHandle||'';
    row.querySelector('.mr-product-image').value=draft.productImage||'';
    row.querySelector('.mr-name').value=draft.reviewerName||'';
    row.querySelector('.mr-email').value=draft.email||'';
    row.querySelector('.mr-order').value=draft.orderId||'';
    row.querySelector('.mr-date').value=draft.createdAt||new Date().toISOString().slice(0,10);
    row.querySelector('.mr-headline').value=draft.headline||'';
    row.querySelector('.mr-comment').value=draft.comment||'';
    row.querySelector('.mr-verified').checked=Boolean(draft.verifiedPurchase);
    row.querySelector('.mr-import-reason').value=draft.importReason||'historical_migration';
    row.querySelector('.mr-import-reason-detail').value=draft.importReasonDetail||'';

    const rating=Math.max(1,Math.min(5,Number(draft.rating||5)));
    const stars=row.querySelector('.mr-stars');
    stars.dataset.rating=rating;
    stars.querySelectorAll('button').forEach(btn=>btn.classList.toggle('on',Number(btn.dataset.star)<=rating));

    const scoreMap=[
      ['sourness','.mr-sour-live','.mr-sour'],
      ['sweetness','.mr-sweet-live','.mr-sweet'],
      ['flavour','.mr-flavour-live','.mr-flavour']
    ];
    scoreMap.forEach(([key,toggleSel,rangeSel])=>{
      const has=draft.attributes?.[key]!==undefined&&draft.attributes?.[key]!==null;
      const toggle=row.querySelector(toggleSel),range=row.querySelector(rangeSel);
      toggle.checked=has;
      range.disabled=!has;
      if(has)range.value=Number(draft.attributes[key]);
      const control=range.closest('.mr-score-control');
      control?.classList.toggle('is-off',!has);
      const valueNode=control?.querySelector('.mr-val');
      if(valueNode)valueNode.textContent=range.value;
    });
    row.scrollIntoView({behavior:'smooth',block:'center'});
    return row;
  }

  window.Elev8ManualReviewImport={
    ...(window.Elev8ManualReviewImport||{}),
    addDraft,
    addRow,
    loadDrafts,
    switchTab,
    saveBatch
  };
})();