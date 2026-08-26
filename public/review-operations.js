(function(){
  const esc = (value='') => String(value ?? '').replace(/[&<>\"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let cache = null;
  let activeTab = 'delivery';

  function api(path, options={}) {
    if (typeof window.api === 'function') return window.api(path, options);
    return fetch(`/api${path}`, { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options }).then(async (res)=>{
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error || body.detail || `Request failed (${res.status})`);
      return body;
    });
  }
  function fmt(value, fallback='—') { if (!value) return fallback; const d=new Date(value); return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString(); }
  function humanStatus(value='') { return String(value||'').replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase()); }
  function deliveryState(row){
    if (row.deliveredAt) return { key:'delivered', label:'Delivered', detail:`Delivered ${fmt(row.deliveredAt)}` };
    const raw=String(row.deliveryStatus||'').toUpperCase();
    if (raw.includes('OUT_FOR_DELIVERY')) return {key:'out',label:'Out for delivery',detail:'Carrier has the parcel out for delivery'};
    if (raw.includes('IN_TRANSIT')) return {key:'transit',label:'In transit',detail:'Parcel is moving through the carrier network'};
    if (row.status==='awaiting_delivery') return {key:'waiting',label:'Waiting for delivery',detail:row.blockedReason||'Waiting for Shopify/Track123 delivery confirmation'};
    return {key:'unknown',label:humanStatus(raw||row.status||'Unknown'),detail:row.blockedReason||''};
  }
  function parcelSummary(row){
    const tracking=Array.isArray(row.deliveryTracking)?row.deliveryTracking:[];
    if (!tracking.length) return '<span class="review-ops-muted">No parcel/tracking detail returned yet</span>';
    return tracking.map((p)=>{
      const stat=humanStatus(p.displayStatus||p.status||'Tracking');
      const num=p.number ? `<code>${esc(p.number)}</code>` : '<span>No tracking number</span>';
      return `<div class="review-ops-parcel"><strong>${esc(p.company||'Carrier')}</strong>${num}<span>${esc(stat)}</span>${p.deliveredAt?`<span>Delivered ${esc(fmt(p.deliveredAt))}</span>`:''}</div>`;
    }).join('');
  }
  function renderSummary(summary={}){
    const el=document.getElementById('review-ops-summary'); if(!el) return;
    const items=[['Awaiting delivery',summary.awaitingDelivery||0],['Delivered / cooling',summary.deliveredCooling||0],['Due to send',summary.dueToSend||0],['Successfully sent',summary.sent||0],['Failed',summary.failed||0],['Test sends',summary.tests||0]];
    el.innerHTML=items.map(([label,value])=>`<div class="review-ops-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
  }
  function renderDelivery(rows=[]){
    const el=document.getElementById('review-ops-delivery'); if(!el) return;
    const real=rows.filter((r)=>!r.testMode).sort((a,b)=>new Date(b.orderCreatedAt||b.createdAt||0)-new Date(a.orderCreatedAt||a.createdAt||0));
    el.innerHTML=`<div class="review-ops-table-wrap"><table class="review-ops-table"><thead><tr><th>Order</th><th>Order date</th><th>Delivery</th><th>Tracking / parcel</th><th>Review timer</th><th>Last checked</th></tr></thead><tbody>${real.map((row)=>{
      const state=deliveryState(row);
      const timer=row.sentAt?`Sent ${fmt(row.sentAt)}`:row.scheduledAt?`Due ${fmt(row.scheduledAt)}`:'Not started';
      return `<tr><td><strong>${esc(row.orderId||'Order')}</strong><span>${esc(row.email||'')}</span><small>${esc(row.productCount||0)} product(s)</small></td><td>${esc(fmt(row.orderCreatedAt||row.createdAt,'Unavailable'))}</td><td><span class="review-ops-status ${esc(state.key)}">${esc(state.label)}</span><small>${esc(state.detail)}</small><small>Source: ${esc(humanStatus(row.deliverySource||'Not checked'))}</small></td><td><div class="review-ops-parcels">${parcelSummary(row)}</div></td><td>${esc(timer)}</td><td>${esc(fmt(row.lastDeliveryCheckAt,'Not checked yet'))}</td></tr>`;
    }).join('')}</tbody></table></div>${real.length?'':'<div class="launch-empty-state"><strong>No review delivery jobs yet.</strong><p>New Shopify review-request jobs will appear here automatically.</p></div>'}`;
  }
  function sendLabel(row){
    if(row.testMode && row.status==='sent') return ['test','Test sent'];
    if(row.status==='sent') return ['sent','SMTP accepted'];
    if(row.status==='failed') return ['failed','Failed'];
    if(row.status==='sending') return ['sending','Sending'];
    if(row.status==='scheduled') return ['scheduled','Scheduled'];
    if(row.status==='skipped') return ['skipped','Skipped'];
    if(row.status==='blocked'||row.status==='awaiting_delivery') return ['waiting','Not sent'];
    return ['waiting',humanStatus(row.status||'Not sent')];
  }
  function renderEmails(rows=[]){
    const el=document.getElementById('review-ops-emails'); if(!el) return;
    const sorted=[...rows].sort((a,b)=>new Date(b.sentAt||b.lastAttemptAt||b.scheduledAt||b.createdAt||0)-new Date(a.sentAt||a.lastAttemptAt||a.scheduledAt||a.createdAt||0));
    el.innerHTML=`<div class="review-ops-email-note"><strong>“SMTP accepted” means Nectar successfully handed the message to the configured email provider.</strong><span>It does not claim inbox delivery unless the provider supplies a delivery event.</span></div><div class="review-ops-table-wrap"><table class="review-ops-table"><thead><tr><th>Order</th><th>Recipient</th><th>Order / delivery</th><th>Email state</th><th>Scheduled</th><th>Attempt / sent</th><th>Detail</th></tr></thead><tbody>${sorted.map((row)=>{
      const [key,label]=sendLabel(row);
      const detail=row.errorMessage||row.blockedReason||(row.status==='sent'?'Provider accepted the send without an application-level error':'');
      return `<tr><td><strong>${esc(row.orderId||'Order')}</strong>${row.testMode?'<span class="review-ops-test">TEST</span>':''}<small>${esc(row.productCount||0)} product(s)</small></td><td>${esc(row.email||'')}</td><td><span>Ordered ${esc(fmt(row.orderCreatedAt||row.createdAt,'Unavailable'))}</span><small>${row.deliveredAt?`Delivered ${esc(fmt(row.deliveredAt))}`:'Delivery not confirmed'}</small></td><td><span class="review-ops-status ${esc(key)}">${esc(label)}</span><small>${esc(row.attempts||0)} attempt(s)</small></td><td>${esc(fmt(row.scheduledAt,'—'))}</td><td>${row.sentAt?`Sent ${esc(fmt(row.sentAt))}`:row.lastAttemptAt?`Attempted ${esc(fmt(row.lastAttemptAt))}`:'No send attempt'}</td><td><small>${esc(detail||'—')}</small></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function render(){ if(!cache) return; renderSummary(cache.summary||{}); renderDelivery(cache.rows||[]); renderEmails(cache.rows||[]); }
  window.setReviewOperationsTab=function(tab){ activeTab=tab==='emails'?'emails':'delivery'; document.querySelectorAll('[data-review-ops-tab]').forEach((b)=>b.classList.toggle('active',b.dataset.reviewOpsTab===activeTab)); document.querySelectorAll('.review-ops-panel').forEach((p)=>p.classList.toggle('active',p.id===`review-ops-${activeTab}`)); };
  window.loadReviewOperations=async function(){ if(!document.getElementById('v-review-operations')) return; try{ cache=await api('/admin/review-operations?limit=300'); render(); }catch(error){ const el=document.getElementById('review-ops-delivery'); if(el) el.innerHTML=`<div class="launch-empty-state"><strong>Could not load Review operations.</strong><p>${esc(error.message)}</p></div>`; } };
  window.runReviewOperationsDeliveryCheck=async function(){ const btn=document.querySelector('#v-review-operations .primary-btn'); if(btn){btn.disabled=true;btn.textContent='Checking Shopify…';} try{ await api('/admin/review-automation/delivery-monitor/run',{method:'POST',body:JSON.stringify({limit:100})}); await window.loadReviewOperations(); window.loadReviewsLaunchChecklist?.(); }catch(error){ alert(error.message||'Delivery check failed'); } finally{ if(btn){btn.disabled=false;btn.textContent='Run delivery check now';} } };
  document.addEventListener('DOMContentLoaded',()=>{ const original=window.tab; if(typeof original==='function'&&!window.__reviewOpsTabWrapped){ window.__reviewOpsTabWrapped=true; window.tab=function(id){ const result=original.apply(this,arguments); if(id==='v-review-operations') setTimeout(()=>window.loadReviewOperations?.(),0); return result; }; } });
})();
