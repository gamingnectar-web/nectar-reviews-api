(function(){
  const esc=(value='')=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let cache=null,activeTab='delivery';

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
    if(row.sentAt)return{key:'sent',label:'Review sent',detail:`Sent ${fmt(row.sentAt)}`,remaining:0,progress:100};
    if(!row.deliveredAt)return{key:'waiting',label:'Waiting for delivery',detail:'The 7-day timer has not started.',remaining:null,progress:0};
    const due=date(row.scheduledAt)||new Date(date(row.deliveredAt).getTime()+7*86400000);
    const now=new Date();
    const total=7*86400000;
    const elapsed=Math.max(0,Math.min(total,now-date(row.deliveredAt)));
    const progress=Math.round(elapsed/total*100);
    const ms=due-now;
    if(ms<=0)return{key:'due',label:'Ready to send',detail:`Due ${fmt(due)}`,remaining:0,progress:100};
    const days=Math.floor(ms/86400000);
    const hours=Math.floor((ms%86400000)/3600000);
    return{key:'countdown',label:`${days}d ${hours}h to review email`,detail:`Due ${fmt(due)}`,remaining:ms,progress};
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
          <span>${row.deliveredAt?'7-day review countdown':'Review timer'}</span>
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
    const items=[
      ['Waiting for delivery',summary.awaitingDelivery||0],
      ['7-day countdown',summary.deliveredCooling||0],
      ['Ready to send',summary.dueToSend||0],
      ['Sent',summary.sent||0],
      ['Failed',summary.failed||0]
    ];
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
  function renderEmails(rows=[]){
    const el=document.getElementById('review-ops-emails');if(!el)return;
    const sorted=[...rows].sort((a,b)=>new Date(b.sentAt||b.lastAttemptAt||b.scheduledAt||b.createdAt||0)-new Date(a.sentAt||a.lastAttemptAt||a.scheduledAt||a.createdAt||0));
    el.innerHTML=`<div class="review-ops-email-note"><strong>“SMTP accepted” means ELEV8 handed the message to the configured provider.</strong><span>The send remains blocked until Shopify has confirmed delivery and the 7-day countdown has completed.</span></div><div class="review-ops-table-wrap"><table class="review-ops-table"><thead><tr><th>Order</th><th>Recipient</th><th>Delivery</th><th>Countdown / send</th><th>Email state</th><th>Detail</th></tr></thead><tbody>${sorted.map(row=>{
      const[key,label]=sendLabel(row),timer=countdown(row);
      const detail=row.errorMessage||row.blockedReason||(row.status==='sent'?'Provider accepted the send without an application-level error':'');
      return `<tr><td><strong>${esc(row.orderId||'Order')}</strong>${row.testMode?'<span class="review-ops-test">TEST</span>':''}</td><td>${esc(row.email||'')}</td><td>${row.deliveredAt?`Delivered ${esc(fmt(row.deliveredAt))}`:esc(deliveryState(row).label)}</td><td><strong>${esc(timer.label)}</strong><small>${esc(timer.detail)}</small></td><td><span class="review-ops-status ${esc(key)}">${esc(label)}</span></td><td><small>${esc(detail||'—')}</small></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function render(){if(!cache)return;renderSummary(cache.summary||{});renderDelivery(cache.rows||[]);renderEmails(cache.rows||[])}
  window.setReviewOperationsTab=function(tab){activeTab=tab==='emails'?'emails':'delivery';document.querySelectorAll('[data-review-ops-tab]').forEach(b=>b.classList.toggle('active',b.dataset.reviewOpsTab===activeTab));document.querySelectorAll('.review-ops-panel').forEach(p=>p.classList.toggle('active',p.id===`review-ops-${activeTab}`));};
  window.loadReviewOperations=async function(){if(!document.getElementById('v-review-operations'))return;try{cache=await api('/admin/review-operations?limit=300');render()}catch(error){const el=document.getElementById('review-ops-delivery');if(el)el.innerHTML=`<div class="launch-empty-state"><strong>Could not load Review operations.</strong><p>${esc(error.message)}</p></div>`}};
  window.runReviewOperationsDeliveryCheck=async function(){const btn=document.querySelector('#v-review-operations .primary-btn');if(btn){btn.disabled=true;btn.textContent='Checking Shopify…'}try{await api('/admin/review-automation/delivery-monitor/run',{method:'POST',body:JSON.stringify({limit:100})});await window.loadReviewOperations();window.loadReviewsLaunchChecklist?.()}catch(error){alert(error.message||'Delivery check failed')}finally{if(btn){btn.disabled=false;btn.textContent='Run delivery check now'}}};
  document.addEventListener('DOMContentLoaded',()=>{const original=window.tab;if(typeof original==='function'&&!window.__reviewOpsTabWrapped){window.__reviewOpsTabWrapped=true;window.tab=function(id){const result=original.apply(this,arguments);if(id==='v-review-operations')setTimeout(()=>window.loadReviewOperations?.(),0);return result}}});
})();