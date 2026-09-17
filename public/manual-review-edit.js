(function Elev8ImportedReviewEditor(){
  if(window.__ELEV8_IMPORTED_REVIEW_EDITOR__)return;window.__ELEV8_IMPORTED_REVIEW_EDITOR__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const reasons=[
    ['historical_migration','Historical review migration'],
    ['platform_export','Imported from previous review platform'],
    ['customer_record','Existing customer review transcribed from records'],
    ['manual_recovery','Manual recovery / reconstruction'],
    ['other','Other – explain below']
  ];
  async function api(path,options={}){if(window.adminFetch)return window.adminFetch(`/admin/manual-reviews${path}`,options);throw new Error('Admin session unavailable')}
  function attr(review,key){const a=review.attributes||{};return Number(a[key]??a[String(key)]??5)}
  function hasAttr(review,key){const a=review.attributes||{};return a[key]!==undefined&&a[key]!==null}

  async function open(id){
    let review;try{({review}=await api(`/reviews/${encodeURIComponent(id)}`))}catch(e){return window.showToast?.(e.message)}
    $('ire-backdrop')?.remove();
    const el=document.createElement('div');el.id='ire-backdrop';el.className='ire-backdrop';
    el.innerHTML=`<div class="ire-modal">
      <div class="ire-head"><div><h2>Edit imported review</h2><p>${esc(review.sourceLabel||review.sourcePlatform||review.source||'Imported review')} · Changes update this review directly.</p></div><button id="ire-x">×</button></div>
      <div class="ire-body">
        <div class="ire-grid three">
          <label><span>Reviewer name</span><input id="ire-name" value="${esc(review.userId||'')}"></label>
          <label><span>Email <small>optional</small></span><input id="ire-email" type="email" value="${esc(review.email||'')}"></label>
          <label><span>Review date</span><input id="ire-date" type="date" value="${new Date(review.createdAt||Date.now()).toISOString().slice(0,10)}"></label>
        </div>
        <div class="ire-grid two">
          <label><span>Reason this review exists in ELEV8 <b>required</b></span><select id="ire-reason"><option value="">Choose a reason…</option>${reasons.map(([v,l])=>`<option value="${v}" ${review.importReason===v?'selected':''}>${l}</option>`).join('')}</select></label>
          <label><span>Reason note <small>optional unless Other</small></span><input id="ire-reason-detail" value="${esc(review.importReasonDetail||'')}" placeholder="e.g. migrated from Yotpo before plan expired"></label>
        </div>
        <div class="ire-grid rating-row"><label><span>Star rating</span><div id="ire-stars" class="ire-stars" data-rating="${Number(review.rating||5)}">${[1,2,3,4,5].map(n=>`<button type="button" data-star="${n}" class="${n<=Number(review.rating||5)?'on':''}">★</button>`).join('')}</div></label><label class="ire-check"><input id="ire-verified" type="checkbox" ${review.verifiedPurchase?'checked':''}><span>Verified buyer</span></label></div>
        <label><span>Review headline</span><div class="ire-headline-row"><input id="ire-headline" value="${esc(review.headline||'')}"><button id="ire-ai" type="button">✨ AI generate title</button></div><small>AI summarises only the review text; it does not invent flavour or product claims.</small></label>
        <label><span>Review</span><textarea id="ire-comment" rows="5">${esc(review.comment||'')}</textarea></label>
        <div class="ire-attributes"><strong>Attribute scores <small>only make live the scores the historic review actually supports</small></strong><div class="ire-attr-grid">
          ${scoreHtml('sourness','Sourness',hasAttr(review,'sourness'),attr(review,'sourness'))}
          ${scoreHtml('sweetness','Sweetness',hasAttr(review,'sweetness'),attr(review,'sweetness'))}
          ${scoreHtml('flavour','Flavour',hasAttr(review,'flavour'),attr(review,'flavour'))}
        </div></div>
      </div>
      <div class="ire-foot"><span id="ire-status"></span><div><button id="ire-close" class="ire-secondary">Close</button><button id="ire-save" class="ire-primary">Save changes</button></div></div>
    </div>`;
    document.body.appendChild(el);
    $('ire-x').onclick=$('ire-close').onclick=()=>el.remove();
    el.querySelectorAll('#ire-stars button').forEach(btn=>btn.onclick=()=>{const n=Number(btn.dataset.star);$('ire-stars').dataset.rating=n;el.querySelectorAll('#ire-stars button').forEach(x=>x.classList.toggle('on',Number(x.dataset.star)<=n))});
    el.querySelectorAll('.ire-score-live').forEach(toggle=>toggle.onchange=()=>{const card=toggle.closest('.ire-score-card'),slider=card.querySelector('input[type=range]');slider.disabled=!toggle.checked;card.querySelector('.ire-score-control').classList.toggle('is-off',!toggle.checked)});
    el.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>input.closest('.ire-score-control').querySelector('.ire-val').textContent=input.value);
    $('ire-ai').onclick=async()=>{const comment=$('ire-comment').value.trim();if(comment.length<8)return window.showToast?.('Add more review text first');const btn=$('ire-ai'),old=btn.textContent;btn.disabled=true;btn.textContent='Generating…';try{const r=await api('/generate-title',{method:'POST',body:JSON.stringify({comment,productTitle:review.productTitle||'',rating:Number($('ire-stars').dataset.rating||5)})});$('ire-headline').value=r.title||''}catch(e){window.showToast?.(e.message)}finally{btn.disabled=false;btn.textContent=old}};
    $('ire-save').onclick=()=>save(review,el);
  }
  function scoreHtml(key,label,on,value){return `<label class="ire-score-card"><span><input class="ire-score-live" data-key="${key}" type="checkbox" ${on?'checked':''}> Include ${label} score</span><div class="ire-score-control ${on?'':'is-off'}"><span>${label} <b class="ire-val">${value}</b>/10</span><input type="range" min="1" max="10" value="${value}" ${on?'':'disabled'}></div></label>`}
  async function save(review,el){
    const reason=$('ire-reason').value,detail=$('ire-reason-detail').value.trim();
    if(!reason){$('ire-status').textContent='Choose why this review was imported.';$('ire-status').className='error';return}
    if(reason==='other'&&!detail){$('ire-status').textContent='Add a note for the Other reason.';$('ire-status').className='error';return}
    const attributes={};el.querySelectorAll('.ire-score-card').forEach(card=>{const toggle=card.querySelector('.ire-score-live');if(toggle.checked)attributes[toggle.dataset.key]=Number(card.querySelector('input[type=range]').value)});
    const btn=$('ire-save');btn.disabled=true;btn.textContent='Saving…';
    try{
      await api(`/reviews/${encodeURIComponent(review._id)}`,{method:'PATCH',body:JSON.stringify({userId:$('ire-name').value.trim(),email:$('ire-email').value.trim(),createdAt:$('ire-date').value,rating:Number($('ire-stars').dataset.rating||5),headline:$('ire-headline').value.trim(),comment:$('ire-comment').value.trim(),verifiedPurchase:$('ire-verified').checked,attributes,importReason:reason,importReasonDetail:detail})});
      window.showToast?.('Imported review updated');el.remove();await window.load?.();
    }catch(e){$('ire-status').textContent=e.message;$('ire-status').className='error'}finally{btn.disabled=false;btn.textContent='Save changes'}
  }
  window.openImportedReviewEditor=open;
  const s=document.createElement('style');s.textContent=`.ire-backdrop{position:fixed;inset:0;background:rgba(15,29,50,.45);z-index:100020;display:flex;align-items:center;justify-content:center;padding:18px}.ire-modal{width:min(900px,97vw);max-height:92vh;background:#f7f9fb;border-radius:20px;overflow:hidden;display:flex;flex-direction:column}.ire-head,.ire-foot{padding:18px 20px;background:#fff;border-bottom:1px solid #e3e8ef;display:flex;justify-content:space-between;gap:12px}.ire-foot{border-top:1px solid #e3e8ef;border-bottom:0;align-items:center}.ire-head h2{margin:0}.ire-head p{margin:4px 0;color:#667085}.ire-head>button{border:0;background:none;font-size:28px;cursor:pointer}.ire-body{padding:18px;overflow:auto}.ire-grid{display:grid;gap:12px}.ire-grid.two{grid-template-columns:1fr 1fr}.ire-grid.three{grid-template-columns:1fr 1fr 1fr}.ire-grid.rating-row{grid-template-columns:1fr auto;align-items:end}.ire-body label{display:block;margin-bottom:12px}.ire-body label>span{display:block;font-size:12px;font-weight:800;color:#526071;margin-bottom:6px}.ire-body input,.ire-body select,.ire-body textarea{width:100%;box-sizing:border-box;border:1px solid #ccd4df;border-radius:9px;padding:9px;font:inherit;background:#fff}.ire-stars{display:flex;gap:3px}.ire-stars button{border:0;background:none;font-size:27px;color:#d8dde5;padding:0;cursor:pointer}.ire-stars button.on{color:#ffb400}.ire-check{display:flex!important;align-items:center;gap:7px;padding-bottom:9px}.ire-check input{width:auto}.ire-check span{margin:0!important}.ire-headline-row{display:flex;gap:8px}.ire-headline-row input{flex:1}.ire-headline-row button,.ire-secondary,.ire-primary{border:1px solid #d6dce5;background:#fff;border-radius:9px;padding:9px 11px;font-weight:800;cursor:pointer}.ire-primary{background:#0f1d32;color:#fff;border-color:#0f1d32}.ire-attributes{border-top:1px solid #e3e8ef;padding-top:14px}.ire-attr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.ire-score-card{border:1px solid #e1e6ed;border-radius:11px;padding:10px}.ire-score-card>span{display:flex!important;gap:6px;align-items:center}.ire-score-card>span input{width:auto}.ire-score-control.is-off{opacity:.35}.ire-score-control span{display:block;font-size:11px;margin-bottom:5px}.ire-score-control input{padding:0;border:0}.ire-foot>div{display:flex;gap:8px}.ire-foot .error{color:#a72b20;font-weight:700}@media(max-width:760px){.ire-grid.two,.ire-grid.three,.ire-grid.rating-row,.ire-attr-grid{grid-template-columns:1fr}}`;document.head.appendChild(s);
})();