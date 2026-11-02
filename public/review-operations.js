(function(){
  const esc=(value='')=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let cache=null,activeTab='delivery',emailFilter='all',queueModalFilter='all',queueModalSearch='',queueModalSelected=''; // ELEV8_REVIEW_SEND_QUEUE_MODAL_V1 // ELEV8_REVIEW_QUEUE_ELIGIBILITY_V1

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
    try{await api(`/admin/review-automation/jobs/${encodeURIComponent(jobId)}/skip`,{method:'POST',body:JSON.stringify({reason})});await window.loadReviewOperations();await window.refreshReviewSendQueue?.();}catch(error){alert(error.message||'Could not skip review request')}
  };


  /* ELEV8_REVIEW_SEND_QUEUE_MODAL_V1 */
  function queueModalSort(rows=[]){
    const rank={ready:0,scheduled:1,waiting:2,failed:3,skipped:4,sent:5,all:6};
    return [...rows].sort((a,b)=>{
      const ar=rank[queueBucket(a)]??9, br=rank[queueBucket(b)]??9;
      if(ar!==br)return ar-br;
      const ad=new Date(a.scheduledAt||a.deliveredAt||a.createdAt||0).getTime();
      const bd=new Date(b.scheduledAt||b.deliveredAt||b.createdAt||0).getTime();
      return ad-bd;
    });
  }

  function reviewJourneyStages(row={}){
    const delayDays=Math.max(0,Number(row.delayDays??cache?.config?.delayDays??14));
    const now=new Date();
    const due=row.scheduledAt?new Date(row.scheduledAt):null;
    const sent=Boolean(row.sentAt||row.status==='sent');
    const skipped=['skipped','cancelled'].includes(row.status);
    const delivered=Boolean(row.deliveredAt);
    const dispatched=Boolean(row.fulfilledAt);
    const ready=Boolean(row.status==='scheduled'&&due&&!Number.isNaN(due.getTime())&&due<=now);
    const completion=row.completion||{};
    const completionStatus=completion.status||'none';
    const requestedCount=Number(completion.requestedCount||row.productCount||0);
    const reviewedCount=Number(completion.reviewedCount||0);
    const reviewStage=completionStatus==='complete'
      ? {key:'review',label:'Review complete',detail:completion.completedAt?fmt(completion.completedAt):`${reviewedCount} of ${requestedCount} products reviewed`,state:'complete'}
      : completionStatus==='partial'
        ? {key:'review',label:`Review ${reviewedCount}/${requestedCount}`,detail:`${reviewedCount} of ${requestedCount} products reviewed`,state:'active'}
        : {key:'review',label:'Review',detail:sent?'Waiting for customer':'Not started',state:'pending'};
    return [
      {key:'order',label:'Order',detail:row.orderCreatedAt?fmt(row.orderCreatedAt):'Order captured',state:'complete'},
      {key:'dispatch',label:'Dispatched',detail:dispatched?fmt(row.fulfilledAt):'Waiting',state:dispatched?'complete':'pending'},
      {key:'delivery',label:'Delivered',detail:delivered?fmt(row.deliveredAt):(row.deliveryStatus||'Waiting'),state:delivered?'complete':(row.status==='awaiting_delivery'?'active':'pending')},
      {key:'delay',label:`${delayDays}-day wait`,detail:delivered?(ready||sent||skipped?'Completed':countdown(row).label):'Not started',state:delivered?(ready||sent||skipped?'complete':'active'):'pending'},
      {key:'send',label:skipped?'Skipped':sent?'Sent':ready?'Ready':'Email',detail:skipped?(row.blockedReason||'Suppressed'):sent?fmt(row.sentAt):ready?'Ready to send':row.scheduledAt?fmt(row.scheduledAt):'Not scheduled',state:skipped?'failed':sent?'complete':ready?'active':'pending'},
      reviewStage,
    ];
  }

  function ensureReviewSendQueueModal(){
    let modal=document.getElementById('review-send-queue-modal');
    if(modal)return modal;

    modal=document.createElement('div');
    modal.id='review-send-queue-modal';
    modal.className='review-send-queue-modal';
    modal.hidden=true;
    modal.innerHTML=`
      <div class="review-send-queue-backdrop" data-review-queue-close></div>
      <section class="review-send-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="review-send-queue-title">
        <header class="review-send-queue-header">
          <div>
            <span class="review-order-kicker">Reviews automation</span>
            <h2 id="review-send-queue-title">Review Send Queue</h2>
            <p>See who will receive a review request, where each order is in the journey, and exactly what will be sent.</p>
          </div>
          <div class="review-send-queue-header-actions">
            <button type="button" class="secondary-btn compact" onclick="window.refreshReviewSendQueue?.()">Refresh</button>
            <button type="button" class="review-preview-close" data-review-queue-close aria-label="Close">×</button>
          </div>
        </header>

        <div id="review-send-queue-summary" class="review-send-queue-summary"></div>

        <div class="review-send-queue-body">
          <aside class="review-send-queue-list-pane">
            <div class="review-send-queue-search">
              <input id="review-send-queue-search" class="premium-input" type="search" placeholder="Search order, customer or email…">
            </div>
            <div id="review-send-queue-filters" class="review-queue-filters"></div>
            <div id="review-send-queue-list" class="review-send-queue-list"><p class="muted">Loading queue…</p></div>
          </aside>

          <main id="review-send-queue-detail" class="review-send-queue-detail">
            <div class="review-send-queue-empty">
              <strong>Select an order</strong>
              <p>Choose someone from the queue to see the delivery stages and exact email that will be sent.</p>
            </div>
          </main>
        </div>
      </section>`;

    document.body.appendChild(modal);
    modal.querySelectorAll('[data-review-queue-close]').forEach(node=>node.addEventListener('click',()=>{modal.hidden=true}));
    document.getElementById('review-send-queue-search')?.addEventListener('input',(event)=>{
      queueModalSearch=String(event.target.value||'').trim().toLowerCase();
      renderReviewSendQueueModal();
    });
    return modal;
  }

  function renderReviewSendQueueSummary(rows=[]){
    const target=document.getElementById('review-send-queue-summary');
    if(!target)return;
    const real=rows.filter(row=>!row.testMode);
    const counts={waiting:0,scheduled:0,ready:0,skipped:0,sent:0,failed:0};
    real.forEach(row=>{const key=queueBucket(row);if(key in counts)counts[key]++});
    const delayDays=Number(cache?.config?.delayDays??14);
    target.innerHTML=`
      <div><strong>${counts.waiting}</strong><span>Waiting delivery</span></div>
      <div><strong>${counts.scheduled}</strong><span>Scheduled</span></div>
      <div><strong>${counts.ready}</strong><span>Ready</span></div>
      <div><strong>${counts.skipped}</strong><span>Skipped</span></div>
      <div><strong>${counts.sent}</strong><span>Sent</span></div>
      <div class="review-send-queue-config"><strong>${delayDays} days</strong><span>After delivery</span></div>`;
  }

  function renderReviewSendQueueFilters(rows=[]){
    const target=document.getElementById('review-send-queue-filters');
    if(!target)return;
    const real=rows.filter(row=>!row.testMode);
    const counts={all:real.length,waiting:0,scheduled:0,ready:0,skipped:0,sent:0,failed:0};
    real.forEach(row=>{const key=queueBucket(row);if(key in counts)counts[key]++});
    target.innerHTML=[['all','All'],['waiting','Waiting'],['scheduled','Scheduled'],['ready','Ready'],['skipped','Skipped'],['sent','Sent'],['failed','Failed']]
      .map(([key,label])=>`<button type="button" class="review-queue-filter ${queueModalFilter===key?'active':''}" data-review-queue-filter="${key}">${label} <span>${counts[key]||0}</span></button>`).join('');
    target.querySelectorAll('[data-review-queue-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      queueModalFilter=btn.dataset.reviewQueueFilter||'all';
      renderReviewSendQueueModal();
    }));
  }

  function renderReviewSendQueueList(rows=[]){
    const target=document.getElementById('review-send-queue-list');
    if(!target)return;

    let list=rows.filter(row=>!row.testMode);
    if(queueModalFilter!=='all')list=list.filter(row=>queueBucket(row)===queueModalFilter);
    if(queueModalSearch){
      list=list.filter(row=>[row.orderId,row.customer,row.email,(row.products||[]).map(p=>p.title).join(' '),row.blockedReason,row.deliveryStatus]
        .filter(Boolean).join(' ').toLowerCase().includes(queueModalSearch));
    }
    list=queueModalSort(list);

    target.innerHTML=list.length?list.map(row=>{
      const bucket=queueBucket(row),timer=countdown(row),selected=queueModalSelected===row.id;
      const stage=deliveryState(row);
      const products=(row.products||[]).slice(0,2).map(p=>p.title).filter(Boolean).join(', ');
      return `<button type="button" class="review-send-queue-person ${selected?'selected':''}" data-review-queue-job="${esc(row.id)}">
        <div class="review-send-queue-person-top">
          <strong>${esc(row.orderId||'Order')}</strong>
          <span class="review-ops-status ${esc(bucket)}">${esc(bucket==='waiting'?'Waiting':bucket.charAt(0).toUpperCase()+bucket.slice(1))}</span>
        </div>
        <div class="review-send-queue-person-recipient">${esc(row.email||row.customer||'Customer')}</div>
        <div class="review-send-queue-person-stage">${esc(stage.label)} · ${esc(timer.label)}</div>
        <small>${esc(products||`${row.productCount||0} product(s)`)}${row.completion?.status==='complete'?' · Review complete':row.completion?.status==='partial'?` · ${row.completion.reviewedCount}/${row.completion.requestedCount} reviewed`:''}</small>
      </button>`;
    }).join(''):'<div class="review-send-queue-empty"><strong>No matching review requests.</strong><p>Try another filter or search.</p></div>';

    target.querySelectorAll('[data-review-queue-job]').forEach(btn=>btn.addEventListener('click',()=>window.selectReviewSendQueueJob?.(btn.dataset.reviewQueueJob)));
  }

  function renderReviewSendQueueModal(){
    if(!cache)return;
    const rows=cache.rows||[];
    renderReviewSendQueueSummary(rows);
    renderReviewSendQueueFilters(rows);
    renderReviewSendQueueList(rows);
  }

  function reviewJourneyHtml(row={}){
    return `<div class="review-send-journey">${reviewJourneyStages(row).map(stage=>`
      <div class="review-send-stage ${stage.state}">
        <span class="review-send-stage-dot">${stage.state==='complete'?'✓':stage.state==='failed'?'×':''}</span>
        <strong>${esc(stage.label)}</strong>
        <small>${esc(stage.detail||'')}</small>
      </div>`).join('')}</div>`;
  }

  window.selectReviewSendQueueJob=async function(jobId){
    queueModalSelected=jobId;
    renderReviewSendQueueList(cache?.rows||[]);
    const row=(cache?.rows||[]).find(item=>item.id===jobId);
    const detail=document.getElementById('review-send-queue-detail');
    if(!detail||!row)return;

    detail.innerHTML=`
      <div class="review-send-detail-loading">
        <h3>${esc(row.orderId||'Order')}</h3>
        ${reviewJourneyHtml(row)}
        <p class="muted">Loading current Shopify order, eligibility and exact email…</p>
      </div>`;

    try{
      const data=await api(`/admin/review-automation/jobs/${encodeURIComponent(jobId)}/preview`);
      const canSkip=!row.testMode&&!['sent','skipped','cancelled'].includes(row.status);
      detail.innerHTML=`
        <div class="review-send-detail-header">
          <div>
            <span class="review-order-kicker">Review request</span>
            <h3>${esc(data.orderId||row.orderId||'Order')}</h3>
            <p>${esc(data.recipient||row.email||'')}</p>
          </div>
          <div class="review-send-detail-actions">
            ${canSkip?`<button type="button" class="secondary-btn danger" onclick="window.skipReviewRequestJob?.('${esc(jobId)}')">Skip request</button>`:''}
          </div>
        </div>

        ${reviewJourneyHtml(row)}

        <div class="review-send-detail-grid">
          <section class="review-send-detail-eligibility">
            <div class="review-preview-decision ${data.eligibility?.eligible?'pass':'fail'}">
              <strong>${data.eligibility?.eligible?'Eligible to send':'Will not send'}</strong>
              <span>${esc(data.eligibility?.reason||'All current eligibility checks pass.')}</span>
            </div>

            <h4>Eligibility</h4>
            <div class="review-send-check-list">
              ${(data.eligibility?.checks||[]).map(check=>`<div class="review-preview-check ${check.pass?'pass':'fail'}"><span>${check.pass?'✓':'×'}</span><div><strong>${esc(check.label)}</strong><small>${esc(check.detail||'')}</small></div></div>`).join('')}
            </div>

            <h4>Products being requested</h4>
            <div class="review-send-products">
              ${(data.products||[]).map(product=>`<div class="review-preview-product">${product.image?`<img src="${esc(product.image)}" alt="">`:''}<span>${esc(product.title||'Product')}</span></div>`).join('')||'<p class="muted">No products will be requested.</p>'}
            </div>

            ${(data.excludedProducts||[]).length?`<h4>Excluded</h4>${data.excludedProducts.map(product=>`<div class="review-preview-excluded"><strong>${esc(product.title)}</strong><small>${esc(product.reason)}</small></div>`).join('')}`:''}
          </section>

          <section class="review-send-detail-email">
            <div class="review-preview-meta">
              <strong>${esc(data.subject||'')}</strong>
              <span>Template: ${esc(data.templateName||'Default')}</span>
              <span>From: ${esc(data.fromName||'')} &lt;${esc(data.fromEmail||'')}&gt;</span>
              <span>To: ${esc(data.recipient||'')}</span>
              <span>Scheduled: ${esc(fmt(data.scheduledAt,'Not scheduled'))}</span>
              <span>Delay: ${esc(data.delayDays)} days after delivery</span>
            </div>
            <iframe class="review-send-email-frame" sandbox="" title="Exact review request email"></iframe>
            <p class="review-preview-note">${esc(data.note||'')}</p>
          </section>
        </div>`;

      const frame=detail.querySelector('.review-send-email-frame');
      if(frame)frame.srcdoc=data.html||'<p>No email preview available.</p>';
    }catch(error){
      detail.innerHTML=`
        <div class="review-send-detail-error">
          <h3>${esc(row.orderId||'Order')}</h3>
          ${reviewJourneyHtml(row)}
          <div class="review-preview-decision fail"><strong>Could not build live email preview</strong><span>${esc(error.message||'Unknown error')}</span></div>
        </div>`;
    }
  };

  window.refreshReviewSendQueue=async function(){
    try{
      cache=await api('/admin/review-operations?limit=300');
      renderReviewSendQueueModal();
      if(queueModalSelected&&(cache.rows||[]).some(row=>row.id===queueModalSelected))window.selectReviewSendQueueJob(queueModalSelected);
    }catch(error){
      const list=document.getElementById('review-send-queue-list');
      if(list)list.innerHTML=`<div class="review-send-queue-empty"><strong>Could not load queue.</strong><p>${esc(error.message||'Unknown error')}</p></div>`;
    }
  };

  window.openReviewSendQueue=async function(){
    const modal=ensureReviewSendQueueModal();
    modal.hidden=false;
    if(!cache){
      await window.refreshReviewSendQueue();
    }else{
      renderReviewSendQueueModal();
    }
    if(!queueModalSelected){
      const first=queueModalSort((cache?.rows||[]).filter(row=>!row.testMode))[0];
      if(first)window.selectReviewSendQueueJob(first.id);
    }
  };

  function render(){if(!cache)return;renderSummary(cache.summary||{});renderDelivery(cache.rows||[]);renderEmails(cache.rows||[])}
  window.setReviewOperationsTab=function(tab){activeTab=tab==='emails'?'emails':'delivery';document.querySelectorAll('[data-review-ops-tab]').forEach(b=>b.classList.toggle('active',b.dataset.reviewOpsTab===activeTab));document.querySelectorAll('.review-ops-panel').forEach(p=>p.classList.toggle('active',p.id===`review-ops-${activeTab}`));};
  window.loadReviewOperations=async function(){if(!document.getElementById('v-review-operations'))return;try{cache=await api('/admin/review-operations?limit=300');render()}catch(error){const el=document.getElementById('review-ops-delivery');if(el)el.innerHTML=`<div class="launch-empty-state"><strong>Could not load Review operations.</strong><p>${esc(error.message)}</p></div>`}};
  window.runReviewOperationsDeliveryCheck=async function(){const btn=document.querySelector('#v-review-operations .primary-btn');if(btn){btn.disabled=true;btn.textContent='Checking Shopify…'}try{await api('/admin/review-automation/delivery-monitor/run',{method:'POST',body:JSON.stringify({limit:100})});await window.loadReviewOperations();window.loadReviewsLaunchChecklist?.()}catch(error){alert(error.message||'Delivery check failed')}finally{if(btn){btn.disabled=false;btn.textContent='Run delivery check now'}}};
  document.addEventListener('DOMContentLoaded',()=>{const original=window.tab;if(typeof original==='function'&&!window.__reviewOpsTabWrapped){window.__reviewOpsTabWrapped=true;window.tab=function(id){const result=original.apply(this,arguments);if(id==='v-review-operations')setTimeout(()=>window.loadReviewOperations?.(),0);return result}}});
})();