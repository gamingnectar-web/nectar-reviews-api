(function(){
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const api = (path, options={}) => window.adminFetch ? window.adminFetch(path, options) : fetch(`/api${path}`, { headers:{'Content-Type':'application/json'}, ...options }).then(async r=>{const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Request failed'); return j;});
  const toast = (msg) => (window.showToast || console.log)(msg);
  const statusText = (status) => ({ready:'Ready', blocked:'Blocked', warning:'Warning', manual:'Manual', info:'Info'}[status] || status || 'Info');
  const statusIcon = (status) => ({ready:'✓', blocked:'!', warning:'⚠', manual:'↗', info:'i'}[status] || '•');
  const webhookStatusText = (status) => ({verified:'Verified in Shopify', received:'Received by Nectar', manual_ready:'Manual finalised', missing:'Missing', manual_unverified:'Manual / unverified', attention:'Needs attention', unknown:'Unknown'}[status] || status || 'Unknown');
  const webhookStatusIcon = (status) => ({verified:'✓', received:'✓', manual_ready:'✓', missing:'!', manual_unverified:'?', attention:'⚠', unknown:'?'}[status] || '•');

  function ensureWebhookStyles(){
    if (document.getElementById('nectar-webhook-registry-styles')) return;
    const style = document.createElement('style');
    style.id = 'nectar-webhook-registry-styles';
    style.textContent = `
      .webhook-registry-summary{border:1px solid #d9e0ea;background:#fbfdff;border-radius:14px;padding:12px 14px;margin:8px 0 14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.webhook-registry-summary strong{display:block;margin-bottom:3px}.webhook-registry-summary p{margin:0;color:#667085}.webhook-registry-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.webhook-registry-item{border:1px solid #e5e7eb;background:#fff;border-radius:16px;padding:14px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;box-shadow:0 8px 18px rgba(15,23,42,.035)}.webhook-registry-item[data-status=verified],.webhook-registry-item[data-status=received],.webhook-registry-item[data-status=manual_ready]{border-color:#abefc6;background:#f6fef9}.webhook-registry-item[data-status=missing]{border-color:#fecdd6;background:#fff7f7}.webhook-registry-item[data-status=manual_unverified]{border-color:#fedf89;background:#fffcf5}.webhook-registry-dot{width:30px;height:30px;border-radius:999px;display:grid;place-items:center;font-weight:900;background:#f2f4f7;color:#344054}.webhook-registry-item[data-status=verified] .webhook-registry-dot,.webhook-registry-item[data-status=received] .webhook-registry-dot,.webhook-registry-item[data-status=manual_ready] .webhook-registry-dot{background:#039855;color:white}.webhook-registry-item[data-status=missing] .webhook-registry-dot{background:#d92d20;color:white}.webhook-registry-item[data-status=manual_unverified] .webhook-registry-dot{background:#f79009;color:#111827}.webhook-registry-copy strong{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.webhook-registry-copy em{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-style:normal;color:#667085}.webhook-registry-copy p{margin:5px 0;color:#475467;line-height:1.45}.webhook-registry-copy code{display:block;background:#fff;border:1px solid #edf0f3;border-radius:9px;padding:7px 8px;font-size:12px;word-break:break-all;margin-top:8px}.webhook-registry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.webhook-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.52);z-index:9999;display:grid;place-items:center;padding:20px}.webhook-modal{max-width:760px;width:min(760px,100%);max-height:86vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(15,23,42,.28);border:1px solid #e5e7eb}.webhook-modal header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid #edf0f3}.webhook-modal header h3{margin:0}.webhook-modal header p{margin:6px 0 0;color:#667085}.webhook-modal-body{padding:18px 20px;display:grid;gap:12px}.webhook-modal-grid{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px 12px}.webhook-modal-grid span{color:#667085;font-weight:800}.webhook-modal-grid code{word-break:break-all;background:#f8fafc;border:1px solid #edf0f3;border-radius:8px;padding:6px}.webhook-modal-close{border:0;background:#f2f4f7;border-radius:999px;width:34px;height:34px;font-size:20px;cursor:pointer}@media(max-width:900px){.webhook-registry-list,.webhook-modal-grid{grid-template-columns:1fr}.webhook-registry-summary{align-items:flex-start}}`;
    document.head.appendChild(style);
  }

  let lastChecklist = null;

  function targetButton(check){
    if (check.key === 'orders_fulfilled_webhook' && check.status !== 'ready') {
      return `<div class="launch-actions-stack"><button class="primary-btn compact" type="button" onclick="window.confirmManualReviewWebhook?.()">Finalise manual setup</button><button class="secondary-btn compact" type="button" onclick="window.copyManualWebhookUrls?.()">Copy webhook URLs</button><button class="secondary-btn compact" type="button" onclick="window.registerReviewWebhook?.()">Try automatic</button></div>`;
    }
    if (!check.target) return '';
    const [view, sub] = String(check.target).split(':');
    return `<button class="secondary-btn compact" type="button" onclick="window.goReviewLaunchTarget('${esc(view)}','${esc(sub||'')}')">Go there</button>`;
  }

  function renderChecks(checks=[]){
    const box = document.getElementById('review-launch-checks');
    if (!box) return;
    box.innerHTML = checks.map((check)=>`
      <div class="launch-check" data-status="${esc(check.status)}">
        <span class="launch-check-icon">${esc(statusIcon(check.status))}</span>
        <div class="launch-check-copy">
          <strong>${esc(check.label)} <em>${esc(statusText(check.status))}</em></strong>
          <p>${esc(check.detail)}</p>
          ${check.action ? `<small>Next step: ${esc(check.action)}</small>` : ''}
        </div>
        <div class="launch-check-action">${targetButton(check)}</div>
      </div>
    `).join('') || '<p class="muted">No checks returned.</p>';
  }

  function renderPath(path=[]){
    const box = document.getElementById('review-launch-path');
    if (!box) return;
    box.innerHTML = path.map((item)=>`<li>${esc(item)}</li>`).join('') || '<li>No path returned.</li>';
  }

  function renderJobs(jobs=[]){
    const box = document.getElementById('review-launch-jobs');
    if (!box) return;
    box.innerHTML = jobs.map((job)=>{
      const date = job.sentAt ? `Sent ${new Date(job.sentAt).toLocaleString()}` : job.scheduledAt ? `Scheduled ${new Date(job.scheduledAt).toLocaleString()}` : 'No schedule yet';
      const reason = job.blockedReason ? `<p class="launch-job-error">${esc(job.blockedReason)}</p>` : '';
      return `<div class="launch-job" data-status="${esc(job.status)}"><div><strong>${esc(job.orderId || 'Order')}</strong><p>${esc(job.email || 'No email')} · ${esc(job.productCount || 0)} product(s) · ${esc(date)}</p>${reason}</div><span>${esc(job.testMode ? 'test · ' : '')}${esc(job.status || '')}</span></div>`;
    }).join('') || '<p class="muted">No review request jobs yet. Run a fake-order test to create one without touching live orders.</p>';
  }


  function renderWebhookRegistry(registry){
    ensureWebhookStyles();
    const box = document.getElementById('review-webhook-registry');
    if (!box) return;
    if (!registry) {
      box.innerHTML = '<p class="muted">Webhook status has not loaded yet.</p>';
      return;
    }
    const summary = registry.summary || {};
    const checkedAt = registry.checkedAt ? new Date(registry.checkedAt).toLocaleString() : 'Not checked yet';
    const hooks = registry.webhooks || [];
    box.innerHTML = `
      <div class="webhook-registry-summary" data-status="${esc(summary.status || 'unknown')}">
        <div><strong>${esc(summary.message || 'Webhook status unknown.')}</strong><p>${esc(summary.verifiedCount || 0)} of ${esc(summary.expectedCount || hooks.length || 0)} verified in Shopify · Last checked ${esc(checkedAt)}</p></div>
        <div class="webhook-registry-actions"><button class="secondary-btn compact" type="button" onclick="window.verifyReviewWebhooks?.()">Refresh from Shopify</button><button class="secondary-btn compact" type="button" onclick="window.open('https://help.shopify.com/en/manual/fulfillment/setup/notifications/webhooks','_blank','noopener')">Shopify docs</button></div>
      </div>
      <div class="webhook-registry-list">
        ${hooks.map((hook, index)=>`
          <div class="webhook-registry-item" data-status="${esc(hook.status)}">
            <span class="webhook-registry-dot">${esc(webhookStatusIcon(hook.status))}</span>
            <div class="webhook-registry-copy">
              <strong>${esc(hook.name)} <em>${esc(webhookStatusText(hook.status))}</em></strong>
              <p>${esc(hook.purpose || '')}</p>
              <code>${esc(hook.topic)} → ${esc(hook.endpoint || hook.address)}</code>
              <div class="webhook-registry-actions"><button class="secondary-btn compact" type="button" onclick="window.showReviewWebhookDetails?.(${index})">View details</button></div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  window.showReviewWebhookDetails = function(index){
    const hook = lastChecklist?.webhookRegistry?.webhooks?.[index];
    if (!hook) return;
    ensureWebhookStyles();
    const actual = hook.actual || {};
    const overlay = document.createElement('div');
    overlay.className = 'webhook-modal-overlay';
    overlay.innerHTML = `<div class="webhook-modal" role="dialog" aria-modal="true">
      <header><div><h3>${esc(hook.name)}</h3><p>${esc(webhookStatusText(hook.status))} · ${esc(hook.reason || '')}</p></div><button class="webhook-modal-close" type="button" aria-label="Close">×</button></header>
      <div class="webhook-modal-body">
        <p>${esc(hook.customerJourneyStep || hook.purpose || '')}</p>
        <div class="webhook-modal-grid">
          <span>Expected topic</span><code>${esc(hook.topic)}</code>
          <span>Expected URL</span><code>${esc(hook.address)}</code>
          <span>Expected format</span><div>${esc(String(hook.format || 'json').toUpperCase())}</div>
          <span>Expected API version</span><div>${esc(hook.apiVersion || '')}</div>
          <span>Verified in Shopify</span><div>${hook.verifiedInShopify ? 'Yes' : 'No'}</div>
          <span>Nectar stored setup</span><div>${hook.storedInNectar ? 'Yes' : 'No'}</div>
          <span>Received by Nectar</span><div>${hook.receivedByNectar ? `Yes${hook.lastReceivedAt ? ` · ${new Date(hook.lastReceivedAt).toLocaleString()}` : ''}` : 'Not yet'}</div>
          <span>Receipt count</span><div>${esc(hook.receivedCount || 0)}</div>
          <span>Last order seen</span><div>${esc(hook.lastReceivedOrderName || hook.lastReceivedOrderId || 'Not available')}</div>
          <span>Shopify webhook ID</span><div>${esc(actual.id || hook.webhookId || 'Not available')}</div>
          <span>Shopify API version</span><div>${esc(actual.apiVersion || 'Not available')}</div>
          <span>Created in Shopify</span><div>${esc(actual.createdAt ? new Date(actual.createdAt).toLocaleString() : 'Not available')}</div>
          <span>Updated in Shopify</span><div>${esc(actual.updatedAt ? new Date(actual.updatedAt).toLocaleString() : 'Not available')}</div>
        </div>
        ${hook.otherAddressesForTopic?.length ? `<div><strong>Other Shopify webhooks for this topic</strong>${hook.otherAddressesForTopic.map((item)=>`<code>${esc(item.address || '')}</code>`).join('')}</div>` : ''}
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.webhook-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (event)=>{ if (event.target === overlay) close(); });
  };

  window.loadReviewsLaunchChecklist = async function(){
    if (!document.getElementById('v-review-launch')) return;
    try {
      const data = await api('/admin/review-launch-checklist');
      lastChecklist = data;
      renderChecks(data.checks || []);
      renderPath(data.livePath || []);
      renderJobs(data.recentJobs || []);
      renderWebhookRegistry(data.webhookRegistry || null);
      window.loadAllReviewsPageSetup?.();
      const banner = document.querySelector('.launch-mode-banner');
      if (banner) banner.dataset.ready = data.summary?.ready ? 'ready' : 'blocked';
      const dot = document.getElementById('nav-status-reviews');
      if (dot) { dot.className = `tab-status-dot ${data.summary?.ready ? 'live' : 'warning'}`; dot.title = data.summary?.ready ? 'Reviews live-ready: launch checks passed' : 'Reviews enabled but launch checks still need attention'; }
      window.updateProductNavStatuses?.(data);
    } catch (error) {
      renderChecks([{ status:'blocked', label:'Could not load launch checklist', detail:error.message || 'Refresh the page and try again.', action:'Check the API logs in Render.' }]);
    }
  };

  window.verifyReviewWebhooks = async function(){
    try {
      const result = await api('/admin/review-automation/verify-webhooks', { method:'POST', body: JSON.stringify({}) });
      lastChecklist = { ...(lastChecklist || {}), webhookRegistry: result };
      renderWebhookRegistry(result);
      toast(result.summary?.message || 'Webhook verification refreshed.');
      await window.loadReviewsLaunchChecklist?.();
    } catch (error) {
      toast(error.message || 'Could not verify Shopify webhooks. If you use shopify.app.toml, run Shopify app deploy and refresh again.');
    }
  };

  window.registerReviewWebhook = async function(){
    try {
      const result = await api('/admin/review-automation/register-webhook', { method:'POST', body: JSON.stringify({}) });
      if (result.ok) toast('Shopify order webhooks registered. Refreshing checks…');
      else toast(result.result?.results?.find?.((r)=>!r.ok)?.reason || result.result?.reason || 'Automatic webhook creation did not complete. Use manual setup, then click Finalise manual setup.');
      await window.loadReviewsLaunchChecklist?.();
      await window.NectarAdminProductContext?.refreshStatuses?.();
    } catch (error) {
      toast(error.message || 'Automatic webhook creation failed. Use manual setup, then click Finalise manual setup.');
      await window.loadReviewsLaunchChecklist?.();
    }
  };

  window.confirmManualReviewWebhook = async function(){
    const ok = confirm('Only continue if Shopify Admin already has BOTH webhooks saved: Order fulfillment → /api/webhooks/shopify/orders-fulfilled and Order update → /api/webhooks/shopify/orders-updated. Nectar will now finalise the internal connection flags/settings that manual Shopify setup cannot update. Continue?');
    if (!ok) return;
    try {
      const result = await api('/admin/review-automation/confirm-manual-webhook', { method:'POST', body: JSON.stringify({}) });
      const verified = result.verifiedInShopify ? ' Verified in Shopify.' : ' Marked as manual setup; Shopify read verification was not available.';
      toast(`Manual webhook setup finalised in Nectar.${verified} Refreshing checks…`);
      await window.loadReviewsLaunchChecklist?.();
      await window.NectarAdminProductContext?.refreshStatuses?.();
    } catch (error) {
      toast(error.message || 'Could not confirm manual webhooks.');
    }
  };

  window.goReviewLaunchTarget = function(view, sub){
    if (view) window.tab?.(view);
    setTimeout(()=>{
      if (view === 'v-msg' && sub === 'delivery') {
        const btn = document.querySelector('[data-msg-tab="delivery"], [data-request-tab="delivery"], button[onclick*="emailDelivery"]');
        btn?.click();
        (btn || document.getElementById('nr-messaging-campaigns-mount'))?.scrollIntoView({ behavior:'smooth', block:'center' });
      }
      if (view === 'v-loyalty' && sub) {
        const btn = document.querySelector(`#v-loyalty [data-loyalty-tab="${CSS.escape(sub)}"]`);
        btn?.click();
        btn?.scrollIntoView({ behavior:'smooth', block:'center' });
      }
      if (view === 'v-review-launch') {
        const register = Array.from(document.querySelectorAll('button')).find((button)=>/register shopify fulfilled-order webhook|register shopify webhook|register now/i.test(button.textContent || ''));
        register?.scrollIntoView({ behavior:'smooth', block:'center' });
        if (sub === 'register-webhook') setTimeout(()=>register?.click(), 160);
      }
      if (view === 'v-style') document.getElementById('v-style')?.scrollIntoView({ behavior:'smooth', block:'start' });
      if (view === 'v-settings') document.getElementById('widget-render-names')?.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 120);
  };

  window.runReviewLaunchFakeOrder = async function(){
    const email = prompt('Send the fake-order review request to which email?', 'you@example.com');
    if (!email) return;
    try {
      const result = await api('/admin/review-automation/fake-order', { method:'POST', body: JSON.stringify({ email, sendNow: true, delayDays: 0, orderId: `NECTAR-LAUNCH-${Date.now().toString().slice(-6)}` }) });
      toast(result.sent ? 'Fake order created and review email sent.' : 'Fake order created. Check job status below.');
      await window.loadReviewsLaunchChecklist?.();
    } catch (error) {
      toast(error.message || 'Fake-order test failed.');
      await window.loadReviewsLaunchChecklist?.();
    }
  };

  window.forceRunDueReviewJobs = async function(){
    try {
      const result = await api('/admin/review-automation/run-due', { method:'POST', body: JSON.stringify({}) });
      toast(`Due review jobs processed: ${result.count || 0}`);
      await window.loadReviewsLaunchChecklist?.();
    } catch (error) {
      toast(error.message || 'Could not run scheduled jobs.');
    }
  };


  window.loadAllReviewsPageSetup = async function(){
    const box = document.getElementById('all-reviews-page-setup');
    if (!box) return;
    try {
      const data = await api('/admin/all-reviews-page-setup');
      const checks = Array.isArray(data.pageChecks) ? data.pageChecks : [];
      const pageCards = checks.map((page)=>{
        const cls = page.status === 'ready' ? 'verified' : page.status === 'missing' ? 'missing' : 'manual_unverified';
        const label = page.status === 'ready' ? 'Verified' : page.status === 'missing' ? 'Missing' : 'Needs check';
        return `<div class="webhook-card ${cls}"><div class="webhook-card-head"><div><strong>${esc(page.label || 'Storefront page')}</strong><p>/pages/${esc(page.handle || '')}</p></div><span>${label}</span></div><div class="webhook-card-body"><p>${esc(page.detail || '')}</p><code>${esc(page.url || '')}</code>${page.url ? `<div class="launch-actions-stack" style="margin-top:12px;"><button type="button" class="secondary-btn" data-open-page="${esc(page.url)}">Open page</button></div>` : ''}</div></div>`;
      }).join('');
      box.innerHTML = `<div class="webhook-registry-summary"><div><strong>Review storefront pages</strong><p>${Number(data.acceptedReviews || 0)} accepted live review(s), ${Number(data.pendingReviews || 0)} pending. These pages must exist before customer links go live.</p></div><button type="button" class="secondary-btn" data-refresh-page-checks>Refresh pages</button></div><div class="webhook-registry-grid">${pageCards}<div class="webhook-card ${Number(data.acceptedReviews || 0) ? 'verified' : 'manual_unverified'}"><div class="webhook-card-head"><div><strong>All Reviews SEO block</strong><p>Theme block and API feed for the public reviews page.</p></div><span>${Number(data.acceptedReviews || 0) ? 'Ready' : 'Needs reviews'}</span></div><div class="webhook-card-body"><p><strong>Recommended Shopify page:</strong> /pages/${esc(data.recommendedPageHandle || 'reviews')}</p><p><strong>Theme app block:</strong> ${esc(data.themeBlockName || 'All Reviews SEO Page')}</p><p><strong>API endpoint:</strong></p><code>${esc(data.apiEndpoint || '')}</code><div class="launch-actions-stack" style="margin-top:12px;"><button type="button" class="secondary-btn" data-copy-all-reviews-snippet>Copy Liquid snippet</button><button type="button" class="secondary-btn" data-open-all-reviews-api>Open API preview</button></div></div></div></div>`;
      box.querySelector('[data-copy-all-reviews-snippet]')?.addEventListener('click', async()=>{ await navigator.clipboard.writeText(data.liquidSnippet || "{% render 'all_reviews_seo_page' %}"); toast('All Reviews Liquid snippet copied.'); });
      box.querySelector('[data-open-all-reviews-api]')?.addEventListener('click', ()=>{ if (data.apiEndpoint) window.open(data.apiEndpoint, '_blank', 'noopener'); });
      box.querySelector('[data-refresh-page-checks]')?.addEventListener('click', ()=>window.loadAllReviewsPageSetup?.());
      box.querySelectorAll('[data-open-page]').forEach((btn)=>btn.addEventListener('click',()=>window.open(btn.dataset.openPage, '_blank', 'noopener')));
    } catch (error) {
      box.innerHTML = `<div class="webhook-card missing"><strong>Could not load All Reviews setup</strong><p>${esc(error.message || 'Check Render logs.')}</p></div>`;
    }
  };

  const tourContent = {
    'v-dash': { title:'Reviews dashboard', text:'Start here to check review volume, pending approvals and live reviews. This is your health snapshot after launch.' },
    'v-mgr': { title:'Review Manager', text:'Approve, hold, reject, trash, verify and reply to reviews here. Test reviews should stay blocked from storefront output.' },
    'v-msg': { title:'Messaging & Campaigns', text:'Set up the Reviews email sender, email design and analytics. For launch, Email Delivery must show a saved provider marked Primary: Reviews.' },
    'v-style': { title:'Reviews Visual Customiser', text:'Design the customer-facing review block, product-card stars and global carousel. This is review-specific styling, not loyalty or discount configuration.' },
    'v-import': { title:'Import CSV', text:'Use this when migrating existing reviews from another platform. Imported reviews can be kept pending until you approve them.' },
    'v-settings': { title:'App settings', text:'Shared configuration and Shopify Liquid render snippets live here. Do not turn Discounts or Loyalty on for the live review launch until their tests pass.' },
    'v-review-launch': { title:'Reviews Launch Checklist', text:'This is the go/no-go screen. A live store should pass email provider, signed links, Shopify connection, webhook and native scheduler checks before migration.' },
    'v-test-centre': { title:'Real-world Test Centre', text:'Use this for fake-order journeys. It is safer than ad-hoc test emails because it simulates the customer path.' },
  };

  function showTourFor(view){
    const item = tourContent[view];
    if (!item) return;
    const key = `nectar-tour-seen:${view}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const overlay = document.createElement('div');
    overlay.className = 'launch-tour-overlay';
    overlay.innerHTML = `<div class="launch-tour-card"><button type="button" class="launch-tour-close" aria-label="Close">×</button><span>Quick guide</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><div class="launch-tour-actions"><button type="button" class="secondary-btn">Do not show again</button><button type="button" class="primary-btn">Got it</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.launch-tour-close')?.addEventListener('click', close);
    overlay.querySelectorAll('button').forEach((btn)=>btn.addEventListener('click', close));
  }

  const originalTab = window.tab;
  window.tab = function(id){
    const result = originalTab ? originalTab.apply(this, arguments) : undefined;
    setTimeout(()=>{
      if (id === 'v-review-launch') window.loadReviewsLaunchChecklist?.();
      showTourFor(id);
    }, 60);
    return result;
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    if (document.getElementById('v-review-launch')) window.loadReviewsLaunchChecklist?.();
    setTimeout(()=>showTourFor(document.querySelector('.view.active')?.id || 'v-dash'), 900);
  });
})();
