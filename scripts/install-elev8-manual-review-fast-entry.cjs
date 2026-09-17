const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

// BACKEND: allow "Save & add another" to keep appending into the same manual batch.
let route=R('src','routes','manualReviews.js');
const oldBatch="    const id=newBatchId(), docs=[], errors=[];";
const newBatch=`    const requestedBatchId=String(req.body?.batchId||'').trim();
    const id=/^manual-\\d{10,}-[a-f0-9]{6,}$/i.test(requestedBatchId)?requestedBatchId:newBatchId(), docs=[], errors=[];`;
if(route.includes(oldBatch)) route=route.replace(oldBatch,newBatch);
else if(!route.includes('requestedBatchId')) throw new Error('Could not find manual batch id creation block');
W(['src','routes','manualReviews.js'],route);

// NEW MANUAL ADD UX
let ui=R('public','manual-review-import.js');

if(!ui.includes("let activeManualBatchId=''")){
  ui=ui.replace(
    "  const esc=v=>String(v??'').replace(/[&<>\\\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;',\\\"'\\\":'&#39;'}[m]));",
    "  const esc=v=>String(v??'').replace(/[&<>\\\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;',\\\"'\\\":'&#39;'}[m]));\\n  let activeManualBatchId='';"
  );
}

ui=ui.replace(
  '<div><button id="mr-cancel" type="button" class="mr-secondary">Close</button><button id="mr-save" type="button" class="mr-primary">Save batch as draft</button></div>',
  '<div><button id="mr-cancel" type="button" class="mr-secondary">Close</button><button id="mr-save" type="button" class="mr-secondary">Save draft</button><button id="mr-save-add" type="button" class="mr-primary">Save & add another</button></div>'
);

ui=ui.replace(
  "    $('mr-save').onclick=saveBatch;",
  "    $('mr-save').onclick=()=>saveBatch({continueAdding:false});\\n    $('mr-save-add').onclick=()=>saveBatch({continueAdding:true});"
);

const oldSave=`  async function saveBatch(){
    const reviews=collect();const status=$('mr-status'),btn=$('mr-save');
    btn.disabled=true;btn.textContent='Saving…';status.textContent='';
    try{
      const data=await api('/batches',{method:'POST',body:JSON.stringify({reviews})});
      status.textContent=\`✓ \${data.saved} review\${data.saved===1?'':'s'} saved as draft.\`;
      status.className='ok';
      switchTab('drafts');
      loadDrafts();
    }catch(error){
      status.textContent=error.message;status.className='error';
    }finally{btn.disabled=false;btn.textContent='Save batch as draft'}
  }`;

const newSave=`  async function saveBatch({continueAdding=false}={}){
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
      status.textContent=\`✓ \${data.saved} review\${data.saved===1?'':'s'} added to this draft batch.\`;
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
  }`;

if(ui.includes(oldSave)) ui=ui.replace(oldSave,newSave);
else if(!ui.includes('continueAdding=false')) throw new Error('Could not find saveBatch() block');

// Make star rating materially easier to hit/read.
ui=ui.replace(
  ".mr-stars button{border:0;background:none;padding:0;font-size:27px;color:#d8dde5;cursor:pointer}",
  ".mr-stars{gap:6px!important;align-items:center}.mr-stars button{border:0;background:none;padding:2px 1px;font-size:40px;line-height:1;color:#d8dde5;cursor:pointer;transition:transform .12s ease,color .12s ease}.mr-stars button:hover{transform:scale(1.08)}"
);

// Footer feels like a fast-entry workflow.
ui=ui.replace(
  ".mr-foot>div{display:flex;gap:8px}",
  ".mr-foot>div{display:flex;gap:8px;align-items:center}.mr-foot .mr-primary{min-width:165px}.mr-foot .mr-secondary{white-space:nowrap}"
);

W(['public','manual-review-import.js'],ui);

// HISTORICAL / MANUAL EDIT MODAL: bigger stars and nicer review-card Edit button.
let edit=R('public','manual-review-edit.js');
edit=edit.replace(
  ".ire-stars{display:flex;gap:3px}.ire-stars button{border:0;background:none;font-size:27px;color:#d8dde5;padding:0;cursor:pointer}",
  ".ire-stars{display:flex;gap:6px;align-items:center}.ire-stars button{border:0;background:none;font-size:40px;line-height:1;color:#d8dde5;padding:2px 1px;cursor:pointer;transition:transform .12s ease,color .12s ease}.ire-stars button:hover{transform:scale(1.08)}"
);

if(!edit.includes('.manual-import-edit-btn{')){
  edit=edit.replace(
    ".ire-foot .error{color:#a72b20;font-weight:700}",
    `.ire-foot .error{color:#a72b20;font-weight:700}
    .manual-import-edit-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #b9dfe5!important;background:#eef9fb!important;color:#0c5f70!important;border-radius:10px!important;padding:8px 11px!important;font-weight:800!important;box-shadow:0 1px 2px rgba(15,29,50,.04);cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .12s ease}
    .manual-import-edit-btn:hover{background:#dff4f7!important;border-color:#8fcbd4!important;transform:translateY(-1px)}
    .manual-import-edit-btn:active{transform:translateY(0)}`
  );
}
W(['public','manual-review-edit.js'],edit);

console.log('✓ Larger stars in Manual Add and Edit Import');
console.log('✓ Added Save & add another fast-entry action');
console.log('✓ Consecutive saves stay in one draft batch');
console.log('✓ Restyled Edit import action');
