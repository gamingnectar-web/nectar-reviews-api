const fs=require('fs'),path=require('path');
const root=process.cwd();
const file=path.join(root,'public','manual-review-image-import.js');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let src=fs.readFileSync(file,'utf8');

// Add a Manual Review API helper and a stable draft batch id for this image-import session.
if(!src.includes('let manualDraftBatchId=')){
  src=src.replace(
    "  let batchId='',items=[];",
    "  let batchId='',items=[];\n  let manualDraftBatchId='';"
  );
}
if(!src.includes('async function manualApi(')){
  src=src.replace(
    "  async function api(path,options={}){\n    if(!window.adminFetch)throw new Error('Admin session unavailable');\n    return window.adminFetch(`/admin/manual-review-image-imports${path}`,options);\n  }",
    "  async function api(path,options={}){\n    if(!window.adminFetch)throw new Error('Admin session unavailable');\n    return window.adminFetch(`/admin/manual-review-image-imports${path}`,options);\n  }\n  async function manualApi(path,options={}){\n    if(!window.adminFetch)throw new Error('Admin session unavailable');\n    return window.adminFetch(`/admin/manual-reviews${path}`,options);\n  }\n  function ensureManualDraftBatchId(){\n    if(manualDraftBatchId)return manualDraftBatchId;\n    const bytes=new Uint8Array(3);\n    crypto.getRandomValues(bytes);\n    const suffix=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');\n    manualDraftBatchId=`manual-${Date.now()}-${suffix}`;\n    return manualDraftBatchId;\n  }"
  );
}

// Insert DOM -> state preservation helpers before currentDraft().
if(!src.includes('function syncCardIntoItem(')){
  const anchor="  function currentDraft(index){";
  if(!src.includes(anchor))throw new Error('currentDraft() anchor missing');
  const helpers=`  function syncCardIntoItem(index){
    const item=items[index],card=document.querySelector(\`.mri-card[data-index="\${index}"]\`);
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
    const result=await api(\`/batches/\${batchId}/items/\${item._id}\`,{
      method:'PATCH',
      body:JSON.stringify({draft:item.draft})
    });
    items[index]=result.item;
    return result.item;
  }

`;
  src=src.replace(anchor,helpers+anchor);
}

// Make currentDraft use state after syncing, not stale DOM only.
src=src.replace(
  /  function currentDraft\(index\)\{[\s\S]*?\n  \}\n\n  function toManualDraft/,
`  function currentDraft(index){
    syncCardIntoItem(index);
    return {...(items[index]?.draft||{})};
  }

  function toManualDraft`
);

// Before full queue rerenders caused by mapping/vault, preserve every edited card.
src=src.replace(
  "  async function pickProduct(index,id){\n    const item=items[index],product=(item.suggestions||[]).find(p=>String(p.id)===String(id));",
  "  async function pickProduct(index,id){\n    syncAllCardsIntoItems();\n    const item=items[index],product=(item.suggestions||[]).find(p=>String(p.id)===String(id));"
);
src=src.replace(
  "body:JSON.stringify({matchedProduct:product})",
  "body:JSON.stringify({matchedProduct:product,draft:item.draft})"
);

src=src.replace(
  "  async function useVault(index){\n    const item=items[index],card=document.querySelector(`.mri-card[data-index=\"${index}\"]`);",
  "  async function useVault(index){\n    syncAllCardsIntoItems();\n    const item=items[index],card=document.querySelector(`.mri-card[data-index=\"${index}\"]`);"
);

// Replace useVault request so draft edits persist too.
src=src.replace(
  "const result=await api(`/batches/${batchId}/items/${item._id}/vault`,{method:'POST',body:JSON.stringify({title})});",
  "await persistItemDraft(index);\n      const result=await api(`/batches/${batchId}/items/${item._id}/vault`,{method:'POST',body:JSON.stringify({title})});"
);

// Searching should preserve all current edits in local state even though it doesn't rerender yet.
src=src.replace(
  "  async function searchProducts(index){\n    const item=items[index],card=document.querySelector(`.mri-card[data-index=\"${index}\"]`);",
  "  async function searchProducts(index){\n    syncAllCardsIntoItems();\n    const item=items[index],card=document.querySelector(`.mri-card[data-index=\"${index}\"]`);"
);

// Change card button text/status for items already AJAX-added.
src=src.replace(
  "<button type=\"button\" class=\"mri-add-one\" ${p?'':'disabled'}>Add this draft to Manual Add</button>",
  "<button type=\"button\" class=\"mri-add-one ${item.addedToManualDraft?'is-added':''}\" ${(p&&!item.addedToManualDraft)?'':'disabled'}>${item.addedToManualDraft?'✓ Added to draft':'Add this draft to Draft Reviews'}</button>"
);

// Replace addItem() so it saves by AJAX and stays on image tab.
src=src.replace(
/  function addItem\(index\)\{[\s\S]*?\n  \}\n\n  async function addReady\(\)\{/,
`  async function addItem(index){
    syncAllCardsIntoItems();
    const item=items[index];
    if(!item?.matchedProduct||item.addedToManualDraft)return;

    const card=document.querySelector(\`.mri-card[data-index="\${index}"]\`);
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
      await api(\`/batches/\${batchId}/items/\${item._id}\`,{
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
        ? \`Add \${available} ready draft\${available===1?'':'s'}\`
        : (added?\`\${added} added to Draft Reviews\`:'Add ready drafts');
    }
  }

  async function addReady(){`
);

// Replace bulk addReady to AJAX sequentially and stay put.
src=src.replace(
/  async function addReady\(\)\{[\s\S]*?\n  \}\n\n  document\.addEventListener/,
`  async function addReady(){
    syncAllCardsIntoItems();
    const indexes=items.map((item,index)=>({item,index}))
      .filter(x=>x.item.matchedProduct&&!x.item.addedToManualDraft)
      .map(x=>x.index);
    if(!indexes.length)return;

    const btn=$('mri-add-ready'),old=btn.textContent;
    btn.disabled=true;
    try{
      for(let i=0;i<indexes.length;i++){
        btn.textContent=\`Saving \${i+1} / \${indexes.length}…\`;
        await addItem(indexes[i]);
      }
      window.showToast?.(\`\${indexes.length} review draft\${indexes.length===1?'':'s'} saved — you can continue mapping here\`);
    }finally{
      updateReadySummary();
      if(!items.some(x=>x.matchedProduct&&!x.addedToManualDraft)&&!items.some(x=>x.addedToManualDraft)){
        btn.textContent=old;
      }
    }
  }

  document.addEventListener`
);

// Replace ready summary at end of renderQueue to use helper after it's defined at runtime.
src=src.replace(
  "    const ready=items.filter(x=>x.matchedProduct).length;\n    $('mri-add-ready').disabled=ready===0;\n    $('mri-add-ready').textContent=ready?`Add ${ready} ready draft${ready===1?'':'s'} to Manual Add`:'Add ready drafts to Manual Add';",
  "    updateReadySummary();"
);

fs.writeFileSync(file,src);
console.log('✓ Preserves edits across product mapping/search rerenders');
console.log('✓ Add-to-draft now saves by AJAX and stays on Import from images');
console.log('✓ Bulk add-to-draft also stays in place');
console.log('✓ Uses one pending Manual Review batch for the whole image-import session');
