(function(){
  const esc=(value='')=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let cache=null,activeTab='delivery',emailFilter='all'; // ELEV8_REVIEW_QUEUE_ELIGIBILITY_V1

  function api(path,options={}){
    if(typeof window.api==='function')return window.api(path,options);
    return fetch(`/api${path}`,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options}).then(async(res)=>{
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(body.error||body.detail||`Request failed (${res.status})`);
      return body;
    });
  }
  function date(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d}
  function fmt(value,fallback='—'){const d=date(value);return d?d.toLocaleString():fallback}
  function fmtDate(value,fallback='—'){const d=date(value);return d?d.toLocaleDateString():fallback}
  function humanStatus(value=''){return String(value||'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase())}
  function daysBetween(a,b=new Date()){const x=date(a),y=date(b);if(!x||!y)return null;return Math.max(0,(y-x)/86400000)}
  function countdown(row){
    const delayDays=Math.max(0,Number(row.delayDays??cache?.config?.delayDays??14));
    if(row.sentAt)return{key:'sent',label:'Review sent',detail:`Sent ${fmt(row.sentAt)}`,remaining:0,progress:100,delayDays};
    if(!row.deliveredAt)return{key:'waiting',label:'Waiting for delivery',detail:`The ${delayDays}-day timer has not started.`,remaining:null,progress:0,delayDays};
    const due=date(row.scheduledAt)||new Date(date(row.deliveredAt).getTime()+delayDays*86400000);
    const now=new Date(),total=Math.max(1,delayDays)*86400000;
    const elapsed=Math.max(0,Math.min(total,now-date(row.deliveredAt))),progress=Math.round(elapsed/total*100),ms=due-now;
    if(ms<=0)return{key:'due',label:'Ready to send',detail:`Due ${fmt(due)}`,remaining:0,progress:100,delayDays};
    const days=Math.floor(ms/86400000),hours=Math.floor((ms%86400000)/3600000);
    return{key:'countdown',label:`${days}d ${hours}h to review email`,detail:`Due ${fmt(due)}`,remaining:ms,progress,delayDays};
  }

  function deliveryState(row){
    if(row.deliveredAt)return{key:'delivered',label:'Delivered',detail:`Shopify confirmed ${fmt(row.deliveredAt)}`};
    const raw=String(row.deliveryStatus||'').toUpperCase();
    if(raw.includes('OUT_FOR_DELIVERY'))return{key:'out',label:'Out for delivery',detail:'Carrier has the parcel out for delivery'};
    if(raw.includes('IN_TRANSIT'))return{key:'transit',label:'In transit',detail:'Parcel is moving through the carrier network'};
    if(row.status==='awaiting_delivery')return{key:'waiting',label:'Waiting for delivery',detail:row.blockedReason||'Waiting for Shopify delivery confirmation'};
    return{key:'unknown',label:humanStatus(raw||row.status||'Unknown'),detail:row.blockedReason||''};
  }
  function dispatchAt(row){
    const tracking=Array.isArray(row.deliveryTracking)?row.deliveryTracking:[];
    const candidates=tracking.flatMap(p=>[p.inTransitAt,p.updatedAt]).filter(Boolean).map(date).filter(Boolean).sort((a,b)=>a-b);
    return candidates[0]||date(row.fulfilledAt);
  }
  function trackingSummary(row){
    const tracking=Array.isArray(row.deliveryTracking)?row.deliveryTracking:[];
    if(!tracking.length)return'<span class="review-order-muted">No tracking detail yet</span>';
    return tracking.map(p=>`<div class="review-order-track"><strong>${esc(p.company||'Carrier')}</strong>${p.number?`<code>${esc(p.number)}</code>`:''}<span>${esc(humanStatus(p.displayStatus||p.status||'Tracking'))}</span>${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">Open tracking ↗</a>`:''}</div>`).join('');
  }
  function timelineStep(label,value,state,detail=''){
    return `<div class="review-order-step ${esc(state||'')}"><span class="review-order-dot"></span><div><b>${esc(label)}</b><strong>${esc(value||'—')}</strong>${detail?`<small>${esc(detail)}</small>`:''}</div></div>`;
  }
  function orderCard(row){
    const delivery=deliveryState(row),timer=countdown(row),dispatched=dispatchAt(row);
    const timerLabel=timer.key==='waiting'?'Not started':timer.key==='sent'?'Sent':timer.label;
    return `<article class="review-order-card">
      <div class="review-order-head">
        <div>
          <span class="review-order-kicker">Shopify order</span>
          <h3>${esc(row.orderId||'Order')}</h3>
          <p>${esc(row.email||'')} · ${esc(row.productCount||0)} product(s)</p>
        </div>
        <div class="review-order-head-status">
          <span class="review-ops-status ${esc(delivery.key)}">${esc(delivery.label)}</span>
          <small>Last checked ${esc(fmt(row.lastDeliveryCheckAt,'Not checked yet'))}</small>
        </div>
      </div>

      <div class="review-order-timeline">
        ${timelineStep('Ordered',fmtDate(row.orderCreatedAt||row.createdAt),'complete',fmt(row.orderCreatedAt||row.createdAt))}
        ${timelineStep('Dispatched',dispatched?fmtDate(dispatched):'Not recorded',dispatched?'complete':'pending',dispatched?fmt(dispatched):'Waiting for fulfilment/tracking')}
        ${timelineStep('Delivered',row.deliveredAt?fmtDate(row.deliveredAt):delivery.label,row.deliveredAt?'complete':'current',row.deliveredAt?fmt(row.deliveredAt):delivery.detail)}
        ${timelineStep('Review email',timerLabel,timer.key==='sent'?'complete':timer.key==='due'?'current':row.deliveredAt?'counting':'pending',timer.detail)}
      </div>

      <div class="review-order-countdown ${esc(timer.key)}">
        <div class="review-order-countdown-copy">
          <span>${row.deliveredAt?`${timer.delayDays}-day review countdown`:'Review timer'}</span>
          <strong>${esc(timer.label)}</strong>
          <small>${esc(timer.detail)}</small>
        </div>
        <div class="review-order-progress"><span style="width:${timer.progress}%"></span></div>
      </div>

      <div class="review-order-lower">
        <div>
          <h4>Parcel</h4>
          <div class="review-order-tracking">${trackingSummary(row)}</div>
        </div>
        <div>
          <h4>Automation</h4>
          <dl class="review-order-facts">
            <div><dt>Delivery source</dt><dd>${esc(humanStatus(row.deliverySource||'Not checked'))}</dd></div>
            <div><dt>Review due</dt><dd>${esc(fmt(row.scheduledAt,'Starts after delivery'))}</dd></div>
            <div><dt>Email state</dt><dd>${esc(humanStatus(row.status||'Unknown'))}</dd></div>
          </dl>
        </div>
      </div>
    </article>`;
  }

  function renderSummary(summary={}){
    const el=document.getElementById('review-ops-summary');if(!el)return;
    const delayDays=Number(cache?.config?.delayDays??14);
    const items=[['Waiting for delivery',summary.awaitingDelivery||0],[`${delayDays}-day countdown`,summary.deliveredCooling||0],['Ready to send',summary.dueToSend||0],['Skipped',summary.skipped||0],['Sent',summary.sent||0],['Failed',summary.failed||0]];
    el.innerHTML=items.map(([label,value])=>`<div class="review-ops-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
  }

  function renderDelivery(rows=[]){
    const el=document.getElementById('review-ops-delivery');if(!el)return;
    const real=rows.filter(r=>!r.testMode).sort((a,b)=>new Date(b.orderCreatedAt||b.createdAt||0)-new Date(a.orderCreatedAt||a.createdAt||0));
    el.innerHTML=real.length?`<div class="review-order-list">${real.map(orderCard).join('')}</div>`:'<div class="launch-empty-state"><strong>No review delivery jobs yet.</strong><p>Orders will appear here once Shopify creates a review-request job.</p></div>';
  }
  function sendLabel(row){
    if(row.testMode&&row.status==='sent')return['test','Test sent'];
    if(row.status==='sent')return['sent','SMTP accepted'];
    if(row.status==='failed')return['failed','Failed'];
    if(row.status==='sending')return['sending','Sending'];
    if(row.status==='scheduled')return['scheduled','Scheduled'];
    if(row.status==='skipped')return['skipped','Skipped'];
    if(row.status==='blocked'||row.status==='awaiting_delivery')return['waiting','Not sent'];
    return['waiting',humanStatus(row.status||'Not sent')];
  }
  function queueBucket(row){
    if(row.status==='awaiting_delivery'||row.status==='blocked')return'waiting';
    if(row.status==='scheduled'&&row.scheduledAt&&new Date(row.scheduledAt)<=new Date())return'ready';
    if(row.status==='scheduled')return'scheduled';
    if(row.status==='skipped'||row.status==='cancelled')return'skipped';
    if(row.status==='sent')return'sent';
    if(row.status==='failed')return'failed';
    return'all';
  }
  function renderQueueFilters(rows=[]){
    const counts={all:rows.length,waiting:0,scheduled:0,ready:0,skipped:0,sent:0,failed:0};
    rows.forEach(row=>{const key=queueBucket(row);if(key in counts)counts[key]++});
    return `<div class="review-queue-filters">${[['all','All'],['waiting','Waiting'],['scheduled','Scheduled'],['ready','Ready'],['skipped','Skipped'],['sent','Sent'],['failed','Failed']].map(([key,label])=>`<button type="button" class="review-queue-filter ${emailFilter===key?'active':''}" onclick="window.setReviewEmailFilter?.('${key}')">${label} <span>${counts[key]||0}</span></button>`).join('')}</div>`;
  }
  function queueActions(row){
    const canSkip=!row.testMode&&!['sent','skipped','cancelled'].includes(row.status);
    return `<div class="review-queue-actions"><button type="button" class="secondary-btn compact" onclick="window.previewReviewRequestJob?.('${esc(row.id)}')">Preview email</button>${canSkip?`<button type="button" class="secondary-btn compact danger" onclick="window.skipReviewRequestJob?.('${esc(row.id)}')">Skip</button>`:''}</div>`;
  }
  function renderEmails(rows=[]){
    const el=document.getElementById('review-ops-emails');if(!el)return;
    const real=rows.filter(row=>!row.testMode),filtered=emailFilter==='all'?real:real.filter(row=>queueBucket(row)===emailFilter);
    const sorted=[...filtered].sort((a,b)=>new Date(b.sentAt||b.lastAttemptAt||b.scheduledAt||b.createdAt||0)-new Date(a.sentAt||a.lastAttemptAt||a.scheduledAt||a.createdAt||0));
    const delayDays=Number(cache?.config?.delayDays??14);
    el.innerHTML=`<div class="review-ops-email-note"><strong>This is the live Review Request Queue.</strong><span>Customer sends remain blocked until delivery is confirmed, eligibility passes, and the configured ${delayDays}-day countdown completes.</span></div>${renderQueueFilters(real)}<div class="review-ops-table-wrap"><table class="review-ops-table"><thead><tr><th>Order</th><th>Recipient</th><th>Products</th><th>Delivery</th><th>Send timing</th><th>State / reason</th><th>Actions</th></tr></thead><tbody>${sorted.length?sorted.map(row=>{const[key,label]=sendLabel(row),timer=countdown(row),detail=row.errorMessage||row.blockedReason||(row.status==='sent'?'Provider accepted the send without an application-level error':'Eligible under current queue rules.'),products=(row.products||[]).map(product=>esc(product.title||'Product')).join(', ')||`${row.productCount||0} product(s)`;return `<tr><td><strong>${esc(row.orderId||'Order')}</strong></td><td>${esc(row.email||'')}</td><td><small>${products}</small></td><td>${row.deliveredAt?`Delivered ${esc(fmt(row.deliveredAt))}`:esc(deliveryState(row).label)}</td><td><strong>${esc(timer.label)}</strong><small>${esc(timer.detail)}</small></td><td><span class="review-ops-status ${esc(key)}">${esc(label)}</span><small>${esc(detail||'—')}</small></td><td>${queueActions(row)}</td></tr>`}).join(''):'<tr><td colspan="7"><div class="launch-empty-state"><strong>No messages in this view.</strong><p>Choose another queue filter.</p></div></td></tr>'}</tbody></table></div>`;
  }
  function ensureReviewPreviewModal(){
    let modal=document.getElementById('review-request-preview-modal');if(modal)return modal;
    modal=document.createElement('div');modal.id='review-request-preview-modal';modal.className='review-preview-modal';modal.hidden=true;
    modal.innerHTML=`<div class="review-preview-backdrop" data-review-preview-close></div><section class="review-preview-dialog" role="dialog" aria-modal="true"><header><div><span class="review-order-kicker">Customer send preview</span><h2 id="review-preview-title">Review request</h2><p id="review-preview-subtitle"></p></div><button type="button" class="review-preview-close" data-review-preview-close>×</button></header><div class="review-preview-grid"><aside><div id="review-preview-state"></div><h3>Eligibility checks</h3><div id="review-preview-checks"></div><h3>Products included</h3><div id="review-preview-products"></div><div id="review-preview-excluded"></div></aside><main><div class="review-preview-meta" id="review-preview-meta"></div><iframe id="review-preview-frame" sandbox="" title="Exact review email preview"></iframe><p class="review-preview-note" id="review-preview-note"></p></main></div></section>`;
    document.body.appendChild(modal);modal.querySelectorAll('[data-review-preview-close]').forEach(node=>node.addEventListener('click',()=>{modal.hidden=true}));return modal;
  }
  window.setReviewEmailFilter=function(filter='all'){emailFilter=filter;renderEmails(cache?.rows||[])};
  window.previewReviewRequestJob=async function(jobId){
    const modal=ensureReviewPreviewModal();modal.hidden=false;
    document.getElementById('review-preview-title').textContent='Loading customer email…';
    try{
      const data=await api(`/admin/review-automation/jobs/${encodeURIComponent(jobId)}/preview`);
      document.getElementById('review-preview-title').textContent=`${data.orderId||'Order'} · ${data.state?.label||'Review request'}`;
      document.getElementById('review-preview-subtitle').textContent=`Current primary template: ${data.templateName||'Default'}`;
      document.getElementById('review-preview-state').innerHTML=`<div class="review-preview-decision ${data.eligibility?.eligible?'pass':'fail'}"><strong>${data.eligibility?.eligible?'Eligible under current rules':'Will not send'}</strong><span>${esc(data.eligibility?.reason||'All current eligibility checks pass.')}</span></div>`;
      document.getElementById('review-preview-checks').innerHTML=(data.eligibility?.checks||[]).map(check=>`<div class="review-preview-check ${check.pass?'pass':'fail'}"><span>${check.pass?'✓':'×'}</span><div><strong>${esc(check.label)}</strong><small>${esc(check.detail||'')}</small></div></div>`).join('')||'<p class="muted">No additional checks for this test job.</p>';
      document.getElementById('review-preview-products').innerHTML=(data.products||[]).map(product=>`<div class="review-preview-product">${product.image?`<img src="${esc(product.image)}" alt="">`:''}<span>${esc(product.title||'Product')}</span></div>`).join('')||'<p class="muted">No products will be requested.</p>';
      document.getElementById('review-preview-excluded').innerHTML=(data.excludedProducts||[]).length?`<h3>Excluded</h3>${data.excludedProducts.map(product=>`<div class="review-preview-excluded"><strong>${esc(product.title)}</strong><small>${esc(product.reason)}</small></div>`).join('')}`:'';
      document.getElementById('review-preview-meta').innerHTML=`<strong>${esc(data.subject||'')}</strong><span>From: ${esc(data.fromName||'')} &lt;${esc(data.fromEmail||'')}&gt;</span><span>To: ${esc(data.recipient||'')}</span><span>Scheduled: ${esc(fmt(data.scheduledAt,'Not scheduled'))}</span><span>Delay: ${esc(data.delayDays)} days after delivery</span>`;
      document.getElementById('review-preview-frame').srcdoc=data.html||'<p>No preview HTML available.</p>';
      document.getElementById('review-preview-note').textContent=data.note||'';
    }catch(error){document.getElementById('review-preview-title').textContent='Preview unavailable';document.getElementById('review-preview-state').innerHTML=`<div class="review-preview-decision fail"><strong>Could not build preview</strong><span>${esc(error.message||'Unknown error')}</span></div>`;}
  };
  window.skipReviewRequestJob=async function(jobId){
    const reason=window.prompt('Why should this customer review request be skipped?','Manually excluded from review request queue.');if(reason===null)return;
    if(!window.confirm('Skip this review request? It will not be emailed automatically.'))return;
    try{await api(`/admin/review-automation/jobs/${encodeURIComponent(jobId)}/skip`,{method:'POST',body:JSON.stringify({reason})});await window.loadReviewOperations();}catch(error){alert(error.message||'Could not skip review request')}
  };

  function render(){if(!cache)return;renderSummary(cache.summary||{});renderDelivery(cache.rows||[]);renderEmails(cache.rows||[])}
  window.setReviewOperationsTab=function(tab){activeTab=tab==='emails'?'emails':'delivery';document.querySelectorAll('[data-review-ops-tab]').forEach(b=>b.classList.toggle('active',b.dataset.reviewOpsTab===activeTab));document.querySelectorAll('.review-ops-panel').forEach(p=>p.classList.toggle('active',p.id===`review-ops-${activeTab}`));};
  window.loadReviewOperations=async function(){if(!document.getElementById('v-review-operations'))return;try{cache=await api('/admin/review-operations?limit=300');render()}catch(error){const el=document.getElementById('review-ops-delivery');if(el)el.innerHTML=`<div class="launch-empty-state"><strong>Could not load Review operations.</strong><p>${esc(error.message)}</p></div>`}};
  window.runReviewOperationsDeliveryCheck=async function(){const btn=document.querySelector('#v-review-operations .primary-btn');if(btn){btn.disabled=true;btn.textContent='Checking Shopify…'}try{await api('/admin/review-automation/delivery-monitor/run',{method:'POST',body:JSON.stringify({limit:100})});await window.loadReviewOperations();window.loadReviewsLaunchChecklist?.()}catch(error){alert(error.message||'Delivery check failed')}finally{if(btn){btn.disabled=false;btn.textContent='Run delivery check now'}}};
  document.addEventListener('DOMContentLoaded',()=>{const original=window.tab;if(typeof original==='function'&&!window.__reviewOpsTabWrapped){window.__reviewOpsTabWrapped=true;window.tab=function(id){const result=original.apply(this,arguments);if(id==='v-review-operations')setTimeout(()=>window.loadReviewOperations?.(),0);return result}}});
})();