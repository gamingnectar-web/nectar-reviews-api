(function(){
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const api = (path, options={}) => window.adminFetch ? window.adminFetch(path, options) : fetch(`/api${path}`, { headers:{'Content-Type':'application/json'}, ...options }).then(async r=>{const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Request failed'); return j;});
  const toast = (msg) => (window.showToast || console.log)(msg);
  const statusText = (status) => ({ready:'Ready', blocked:'Blocked', warning:'Warning', manual:'Manual', info:'Info'}[status] || status || 'Info');
  const statusIcon = (status) => ({ready:'✓', blocked:'!', warning:'⚠', manual:'↗', info:'i'}[status] || '•');
  const webhookStatusText = (status) => ({verified:'Verified in Shopify', received:'Received by Nectar', manual_ready:'Manual finalised', missing:'Missing', manual_unverified:'Manual / unverified', attention:'Needs attention', unknown:'Unknown'}[status] || status || 'Unknown');
  const webhookStatusIcon = (status) => ({verified:'✓', received:'✓', manual_ready:'?', missing:'!', manual_unverified:'?', attention:'⚠', unknown:'?'}[status] || '•');

  function ensureWebhookStyles(){
    if (document.getElementById('nectar-webhook-registry-styles')) return;
    const style = document.createElement('style');
    style.id = 'nectar-webhook-registry-styles';
    style.textContent = `
      .webhook-registry-summary{border:1px solid #d9e0ea;background:#fbfdff;border-radius:14px;padding:12px 14px;margin:8px 0 14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.webhook-registry-summary strong{display:block;margin-bottom:3px}.webhook-registry-summary p{margin:0;color:#667085}.webhook-registry-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.webhook-registry-item{border:1px solid #e5e7eb;background:#fff;border-radius:16px;padding:14px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;box-shadow:0 8px 18px rgba(15,23,42,.035)}.webhook-registry-item[data-status=verified],.webhook-registry-item[data-status=received]{border-color:#abefc6;background:#f6fef9}.webhook-registry-item[data-status=manual_ready]{border-color:#fedf89;background:#fffcf5}.webhook-registry-item[data-status=missing]{border-color:#fecdd6;background:#fff7f7}.webhook-registry-item[data-status=manual_unverified]{border-color:#fedf89;background:#fffcf5}.webhook-registry-dot{width:30px;height:30px;border-radius:999px;display:grid;place-items:center;font-weight:900;background:#f2f4f7;color:#344054}.webhook-registry-item[data-status=verified] .webhook-registry-dot,.webhook-registry-item[data-status=received] .webhook-registry-dot{background:#039855;color:white}.webhook-registry-item[data-status=manual_ready] .webhook-registry-dot{background:#f79009;color:#111827}.webhook-registry-item[data-status=missing] .webhook-registry-dot{background:#d92d20;color:white}.webhook-registry-item[data-status=manual_unverified] .webhook-registry-dot{background:#f79009;color:#111827}.webhook-registry-copy strong{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.webhook-registry-copy em{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-style:normal;color:#667085}.webhook-registry-copy p{margin:5px 0;color:#475467;line-height:1.45}.webhook-registry-copy code{display:block;background:#fff;border:1px solid #edf0f3;border-radius:9px;padding:7px 8px;font-size:12px;word-break:break-all;margin-top:8px}.webhook-registry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.webhook-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.52);z-index:9999;display:grid;place-items:center;padding:20px}.webhook-modal{max-width:760px;width:min(760px,100%);max-height:86vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(15,23,42,.28);border:1px solid #e5e7eb}.webhook-modal header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid #edf0f3}.webhook-modal header h3{margin:0}.webhook-modal header p{margin:6px 0 0;color:#667085}.webhook-modal-body{padding:18px 20px;display:grid;gap:12px}.webhook-modal-grid{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px 12px}.webhook-modal-grid span{color:#667085;font-weight:800}.webhook-modal-grid code{word-break:break-all;background:#f8fafc;border:1px solid #edf0f3;border-radius:8px;padding:6px}.webhook-modal-close{border:0;background:#f2f4f7;border-radius:999px;width:34px;height:34px;font-size:20px;cursor:pointer}.webhook-manual-steps{border:1px solid #dbeafe;background:#eff6ff;border-radius:14px;padding:14px}.webhook-manual-steps ol{margin:8px 0 12px 20px;color:#344054}.webhook-manual-steps li{margin:4px 0;line-height:1.45}.launch-job-age-safety{margin:6px 0 0;font-size:12px;font-weight:800;color:#475467}.launch-job-age-safety[data-status=ready]{color:#027a48}.launch-job-age-safety[data-status=blocked]{color:#b42318}.review-safety-gate{margin-top:14px;border:1px solid #dbe4ee;background:#fbfdff;border-radius:16px;padding:16px}.review-safety-gate h4{margin:0 0 5px}.review-safety-gate p{margin:0 0 12px;color:#667085}.review-safety-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr)) auto;gap:12px;align-items:end}.review-safety-grid label{display:grid;gap:6px;font-size:12px;font-weight:800;color:#344054}.review-safety-grid input{min-height:42px;border:1px solid #d0d5dd;border-radius:10px;padding:9px 11px;background:#fff}.review-safety-status{margin-top:9px;font-size:12px;color:#667085}@media(max-width:900px){.webhook-registry-list,.webhook-modal-grid,.review-safety-grid{grid-template-columns:1fr}.webhook-registry-summary{align-items:flex-start}}`;
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

  function checkByKey(data, key) {
    return (data?.checks || []).find((check) => check.key === key) || {};
  }

  function compactCheckLabel(check) {
    if (!check?.status) return 'Not checked yet';
    if (check.status === 'ready') return 'Ready';
    if (check.status === 'warning') return 'Needs proof';
    if (check.status === 'blocked') return 'Blocked';
    if (check.status === 'manual') return 'Manual step';
    return statusText(check.status);
  }

  function markTechnicalPanels() {
    const root = document.getElementById('v-review-launch');
    if (!root) return;
    root.classList.add('reviews-simple-mode');
    [
      root.querySelector('.launch-grid'),
      document.getElementById('review-webhook-registry')?.closest('.launch-card'),
      document.getElementById('all-reviews-page-setup')?.closest('.launch-card'),
      root.querySelector('.launch-note'),
    ].filter(Boolean).forEach((node) => node.classList.add('reviews-technical-panel'));
  }

  function renderSimplePortal(data = {}) {
    const root = document.getElementById('v-review-launch');
    if (!root) return;
    const header = root.querySelector('.dash-header');
    const title = header?.querySelector('.page-title');
    const subtitle = header?.querySelector('.dash-subtitle');
    if (title) title.textContent = 'Reviews Portal';
    if (subtitle) subtitle.textContent = 'Simple launch view: prove the sender works, prove Shopify orders are seen, then let the 14-day delivery timer do the rest.';
    const topPrimary = header?.querySelector('.dash-actions .primary-btn');
    if (topPrimary) topPrimary.textContent = 'Send shop proof email';

    let shell = document.getElementById('review-simple-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'review-simple-shell';
      header?.insertAdjacentElement('afterend', shell);
    }
    const summary = data.summary || {};
    const email = checkByKey(data, 'email_provider');
    const webhook = checkByKey(data, 'orders_fulfilled_webhook');
    const scheduler = checkByKey(data, 'native_scheduler');
    const links = checkByKey(data, 'signed_links');
    const proofRecipient = summary.proofRecipient || '';
    const blockers = Number(summary.blockers || 0);
    const warnings = Number(summary.warnings || 0);
    const outstanding = data.outstanding || {
      dueNow: Number(summary.outstandingDueNow || 0),
      failed: Number(summary.outstandingFailed || 0),
      blocked: Number(summary.outstandingBlocked || 0),
      awaitingDelivery: Number(summary.outstandingAwaitingDelivery || 0),
      actionable: Number(summary.outstandingActionable || 0),
    };
    const outstandingActionable = Number(outstanding.actionable || 0) > 0
      || Number(outstanding.failed || 0) > 0
      || Number(outstanding.blocked || 0) > 0
      || Number(outstanding.dueNow || 0) > 0;
    const outstandingAttention = Number(outstanding.failed || 0) + Number(outstanding.blocked || 0) + Number(outstanding.dueNow || 0);
    const outstandingLabel = outstandingAttention > 0
      ? `${outstandingAttention} need attention`
      : Number(outstanding.awaitingDelivery || 0) > 0
        ? `${Number(outstanding.awaitingDelivery || 0)} waiting delivery`
        : 'Nothing outstanding';
    const readyCopy = blockers ? `${blockers} blocker${blockers === 1 ? '' : 's'} to fix` : warnings ? `${warnings} warning${warnings === 1 ? '' : 's'} to prove` : 'Ready to test live flow';
    shell.innerHTML = `
      <div class="review-simple-hero" data-ready="${esc(summary.ready ? 'ready' : 'not-ready')}">
        <div class="review-simple-main">
          <span class="review-simple-eyebrow">Reviews automation</span>
          <h3>${esc(readyCopy)}</h3>
          <p>Customers stay untouched while you test. Proof emails are locked to the saved shop email${proofRecipient ? `: ${esc(proofRecipient)}` : ''}.</p>
          <div class="review-simple-actions">
            <button class="primary-btn" type="button" onclick="window.sendLatestReviewProof?.()">Send shop proof email</button>
            <button class="secondary-btn" type="button" onclick="window.toggleReviewAdvanced?.()">Show technical setup</button>
            <button class="secondary-btn" type="button" onclick="window.goReviewLaunchTarget?.('v-msg','delivery')">Email settings</button>
            <button class="secondary-btn reviews-outstanding-main" type="button" onclick="window.openReviewOutstandingPanel?.()">${esc(outstandingLabel)}</button>
          </div>
        </div>
        <div class="review-simple-grid">
          <div class="review-simple-tile" data-status="${esc(email.status || 'blocked')}"><span>Email sender</span><strong>${esc(compactCheckLabel(email))}</strong><p>${esc(email.detail || 'Save the email provider first.')}</p></div>
          <div class="review-simple-tile" data-status="${esc(webhook.status || 'blocked')}"><span>Shopify orders</span><strong>${esc(compactCheckLabel(webhook))}</strong><p>${esc(webhook.status === 'ready' ? 'Orders can create review jobs automatically.' : 'Register or prove the order webhook.')}</p></div>
          <div class="review-simple-tile" data-status="${esc(scheduler.status || 'blocked')}"><span>Delay timer</span><strong>${esc(Number(summary.delayDays ?? 14))} days</strong><p>${esc(scheduler.detail || 'Nectar waits after delivery before sending.')}</p></div>
          <div class="review-simple-tile" data-status="${esc(links.status || 'blocked')}"><span>Review links</span><strong>${esc(compactCheckLabel(links))}</strong><p>One-use signed links protect verified review requests.</p></div>
          <div class="review-simple-tile review-simple-tile-wide" data-status="${outstandingActionable ? 'warning' : 'ready'}"><span>Outstanding sends</span><strong>${esc(outstandingLabel)}</strong><p>${esc(Number(outstanding.failed || 0))} failed · ${esc(Number(outstanding.dueNow || 0))} due now · ${esc(Number(outstanding.awaitingDelivery || 0))} waiting delivery</p><button class="secondary-btn compact" type="button" onclick="window.processOutstandingReviewSends?.()">Run outstanding sends</button></div>
        </div>
        <div class="review-safety-gate">
          <h4>Old-order safety cutoff</h4>
          <p>Prevent historic orders from ever receiving a review request. Either rule can block a send; using both gives the strongest protection.</p>
          <div class="review-safety-grid">
            <label>Do not send for orders placed before
              <input id="review-order-cutoff-date" type="date" value="${esc(summary.orderCutoffDate || '')}">
            </label>
            <label>Maximum order age (days)
              <input id="review-max-order-age-days" type="number" min="0" max="3650" step="1" value="${esc(Number(summary.maxOrderAgeDays || 0))}" placeholder="e.g. 30">
            </label>
            <button class="secondary-btn" type="button" onclick="window.saveReviewOrderSafety?.()">Save safety rule</button>
          </div>
          <div class="review-safety-status">${summary.orderCutoffDate || Number(summary.maxOrderAgeDays || 0) > 0 ? `Active${summary.orderCutoffDate ? ` · before ${esc(summary.orderCutoffDate)} blocked` : ''}${Number(summary.maxOrderAgeDays || 0) > 0 ? ` · older than ${esc(Number(summary.maxOrderAgeDays))} days blocked` : ''}` : 'Not configured yet.'}</div>
        </div>
      </div>
    `;
    markTechnicalPanels();
  }

  function restoreTechnicalPanels() {
    const root = document.getElementById('v-review-launch');
    if (!root) return;
    root.classList.remove('reviews-simple-mode');
    root.querySelectorAll('.reviews-technical-panel').forEach((node) => node.classList.remove('reviews-technical-panel'));
  }

  function jobStage(job) {
    if (job.sentAt || job.status === 'sent') return 'sent';
    if (job.scheduledAt || job.status === 'scheduled') return 'scheduled';
    if (job.status === 'awaiting_delivery') return 'awaiting_delivery';
    if (job.status === 'failed' || job.status === 'blocked') return 'failed';
    return job.status || 'received';
  }

  function jobAgeSafety(job) {
    if (!job?.orderCreatedAt) return { label: 'Order date unavailable', status: 'unknown' };
    const created = new Date(job.orderCreatedAt);
    if (Number.isNaN(created.getTime())) return { label: 'Order date unavailable', status: 'unknown' };
    const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
    const summary = lastChecklist?.summary || {};
    const cutoff = summary.orderCutoffDate ? new Date(`${summary.orderCutoffDate}T00:00:00Z`) : null;
    const maxAge = Number(summary.maxOrderAgeDays || 0);
    if (job.status === 'skipped') return { label: `Will not send · ${job.blockedReason || 'blocked by safety rule'}`, status: 'blocked' };
    if (cutoff && !Number.isNaN(cutoff.getTime()) && created < cutoff) return { label: `Will not send · order is before ${summary.orderCutoffDate}`, status: 'blocked' };
    if (maxAge > 0 && days > maxAge) return { label: `Will not send · ${days} days old exceeds ${maxAge}-day limit`, status: 'blocked' };
    return { label: `Order ${days} day${days === 1 ? '' : 's'} old · eligible under current safety rules`, status: 'ready' };
  }

  function deliveryStatusHuman(job = {}) {
    const raw = String(job.deliveryStatus || '').trim();
    if (job.deliveredAt || job.status === 'scheduled' || job.status === 'sent') return raw || 'Delivered';
    if (raw) return raw.replace(/_/g, ' ');
    return job.status === 'awaiting_delivery' ? 'Waiting for Shopify delivery update' : 'Not currently waiting';
  }

  function renderDeliveryMonitor(jobs = []) {
    const box = document.getElementById('review-delivery-monitor');
    if (!box) return;
    const realJobs = jobs.filter((job) => !job.testMode);
    const waiting = realJobs.filter((job) => job.status === 'awaiting_delivery');
    const delivered = realJobs.filter((job) => job.deliveredAt || ['scheduled','sent'].includes(job.status));
    const checked = realJobs.filter((job) => job.lastDeliveryCheckAt);
    const latestCheck = checked.sort((a,b)=>new Date(b.lastDeliveryCheckAt)-new Date(a.lastDeliveryCheckAt))[0]?.lastDeliveryCheckAt || null;
    const rows = realJobs.slice(0, 20).map((job) => {
      const tracking = Array.isArray(job.deliveryTracking) ? job.deliveryTracking : [];
      const deliveredParcels = tracking.filter((item) => String(item.status || item.displayStatus || '').toLowerCase().includes('deliver')).length;
      const parcelLabel = tracking.length ? `${deliveredParcels}/${tracking.length} parcel${tracking.length === 1 ? '' : 's'} delivered` : 'No parcel detail returned yet';
      const checkedAt = job.lastDeliveryCheckAt ? new Date(job.lastDeliveryCheckAt).toLocaleString() : 'Not checked yet';
      const source = job.deliverySource ? job.deliverySource.replace(/_/g, ' ') : 'Awaiting first monitor check';
      return `<div class="webhook-registry-item" data-status="${job.status === 'awaiting_delivery' ? 'warning' : 'ready'}">
        <span class="webhook-registry-dot">${job.status === 'awaiting_delivery' ? '○' : '✓'}</span>
        <div class="webhook-registry-copy">
          <strong>${esc(job.orderId || 'Order')} <em>${esc(deliveryStatusHuman(job))}</em></strong>
          <p>${esc(parcelLabel)} · Last checked ${esc(checkedAt)}</p>
          <code>${esc(source)}</code>
        </div>
      </div>`;
    }).join('');
    box.innerHTML = `<div class="webhook-registry-summary" data-status="${waiting.length ? 'warning' : 'ready'}">
      <div><strong>${waiting.length ? `${waiting.length} order${waiting.length === 1 ? '' : 's'} waiting for delivery` : 'No tracked orders are currently waiting for delivery'}</strong>
      <p>${delivered.length} delivered/scheduled · ${checked.length} checked${latestCheck ? ` · Latest ${new Date(latestCheck).toLocaleString()}` : ''}</p></div>
      <div class="webhook-registry-actions"><button class="primary-btn compact" type="button" onclick="window.runReviewDeliveryMonitor?.()">Run check now</button></div>
    </div><div class="webhook-registry-list">${rows || '<div class="launch-empty-state"><strong>No real review jobs yet.</strong><p>Once Shopify fulfilment creates a review job, its delivery status will appear here.</p></div>'}</div>`;
  }

  function renderJobs(jobs=[]){
    const box = document.getElementById('review-launch-jobs');
    if (!box) return;
    const proofRecipient = lastChecklist?.summary?.proofRecipient || '';
    box.innerHTML = jobs.map((job)=>{
      const date = job.sentAt ? `Sent ${new Date(job.sentAt).toLocaleString()}` : job.scheduledAt ? `Scheduled ${new Date(job.scheduledAt).toLocaleString()}` : 'No schedule yet';
      const stage = jobStage(job);
      const reason = job.blockedReason ? `<p class="launch-job-error">${esc(job.blockedReason)}</p>` : '';
      const ageSafety = jobAgeSafety(job);
      const ageSafetyHtml = `<p class="launch-job-age-safety" data-status="${esc(ageSafety.status)}">${esc(ageSafety.label)}</p>`;
      const proofDisabled = !proofRecipient || job.testMode ? 'disabled' : '';
      const proofTitle = proofRecipient ? `Send a safe copy to ${proofRecipient}. The customer will not be emailed.` : 'Save an email sender first.';
      const proofButton = job.testMode ? '' : `<button class="secondary-btn compact launch-proof-btn" type="button" ${proofDisabled} title="${esc(proofTitle)}" onclick="window.sendReviewJobProof?.('${esc(job.id)}')">Send proof to shop email</button>`;
      const manualButton = job.testMode || job.status === 'sent' ? '' : ['failed','blocked','scheduled','awaiting_delivery'].includes(String(job.status || '')) ? `<button class="primary-btn compact launch-manual-send-btn" type="button" onclick="window.manualSendReviewJob?.('${esc(job.id)}','${esc(job.status || '')}')">${job.status === 'awaiting_delivery' ? 'Mark delivered + send' : 'Send customer now'}</button>` : '';
      return `<div class="launch-job launch-job-v2" data-status="${esc(job.status)}" data-stage="${esc(stage)}">
        <div class="launch-job-main">
          <div class="launch-job-head"><strong>${esc(job.orderId || 'Order')}</strong><span>${esc(job.testMode ? 'TEST' : (job.status || ''))}</span></div>
          <p>${esc(job.email || 'No customer email')} · ${esc(job.productCount || 0)} product(s) · ${esc(date)}</p>
          ${reason}
          ${ageSafetyHtml}
          <div class="launch-job-steps" aria-label="Review automation progress">
            <b class="${['awaiting_delivery','scheduled','sent'].includes(stage) ? 'active' : ''}">Order seen</b>
            <b class="${stage === 'awaiting_delivery' ? 'active current' : ['scheduled','sent'].includes(stage) ? 'active' : ''}">Wait for delivery</b>
            <b class="${stage === 'scheduled' ? 'active current' : stage === 'sent' ? 'active' : ''}">14-day timer</b>
            <b class="${stage === 'sent' ? 'active current' : ''}">Email sent</b>
          </div>
        </div>
        <div class="launch-job-actions">${manualButton}${proofButton}</div>
      </div>`;
    }).join('') || '<div class="launch-empty-state"><strong>No review request jobs yet.</strong><p>Click “Send shop proof email” to create a safe sample proof without touching a customer.</p><button class="primary-btn compact" type="button" onclick="window.sendLatestReviewProof?.()">Send shop proof email</button></div>';
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
        <div class="webhook-manual-steps">
          <strong>Manual Shopify setup</strong>
          <ol>
            <li>Open Shopify Admin → Settings → Notifications → Webhooks.</li>
            <li>Create or edit the webhook with the event/topic shown below.</li>
            <li>Set Format to JSON and API version to ${esc(hook.apiVersion || '2026-04')}.</li>
            <li>Paste the exact Nectar URL below, save, then send Shopify's test notification.</li>
            <li>Return here and click Refresh from Shopify. The card turns green only when Shopify verifies it or Nectar receives the event.</li>
          </ol>
          <div class="webhook-modal-grid">
            <span>Shopify event</span><code>${esc(hook.name)}</code>
            <span>Topic</span><code>${esc(hook.topic)}</code>
            <span>URL to copy</span><code>${esc(hook.address)}</code>
          </div>
        </div>
        ${hook.otherAddressesForTopic?.length ? `<div><strong>Other Shopify webhooks for this topic</strong>${hook.otherAddressesForTopic.map((item)=>`<code>${esc(item.address || '')}</code>`).join('')}</div>` : ''}
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.webhook-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (event)=>{ if (event.target === overlay) close(); });
  };

  window.saveReviewOrderSafety = async function(){
    const cutoff = document.getElementById('review-order-cutoff-date')?.value || '';
    const maxAgeRaw = Number(document.getElementById('review-max-order-age-days')?.value || 0);
    const maxOrderAgeDays = Number.isFinite(maxAgeRaw) ? Math.max(0, Math.min(3650, Math.round(maxAgeRaw))) : 0;
    try {
      const current = await api('/admin/review-automation');
      const cfg = current.config || {};
      await api('/admin/review-automation', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: cfg.enabled !== false,
          mode: cfg.mode || 'native',
          nativeEnabled: cfg.nativeEnabled !== false,
          flowEnabled: Boolean(cfg.flowEnabled),
          trigger: cfg.trigger || 'orders/fulfilled',
          deliveryTagRequired: cfg.deliveryTagRequired !== false,
          deliveryTag: cfg.deliveryTag || 'delivered',
          deliveryAnchor: cfg.deliveryAnchor || 'delivered_tag',
          delayDays: Number(cfg.delayDays ?? 14),
          sendWindowHour: Number(cfg.sendWindowHour ?? 10),
          sendWindowTimezone: cfg.sendWindowTimezone || 'store',
          campaign: cfg.campaign || 'native_review_request',
          subject: cfg.subject || 'How was your recent order?',
          orderCutoffDate: cutoff,
          maxOrderAgeDays,
        }),
      });
      toast(`Review safety rule saved${cutoff ? ` · cutoff ${cutoff}` : ''}${maxOrderAgeDays ? ` · max age ${maxOrderAgeDays} days` : ''}.`);
      await window.loadReviewsLaunchChecklist?.();
    } catch (error) {
      toast(`Could not save review safety rule: ${error.message}`);
    }
  };

  window.loadReviewsLaunchChecklist = async function(){
    if (!document.getElementById('v-review-launch')) return;
    try {
      const data = await api('/admin/review-launch-checklist');
      lastChecklist = data;
      renderSimplePortal(data);
      renderChecks(data.checks || []);
      renderPath(data.livePath || []);
      renderJobs(data.recentJobs || []);
      renderDeliveryMonitor(data.recentJobs || []);
      renderWebhookRegistry(data.webhookRegistry || null);
      window.loadAllReviewsPageSetup?.();
      const banner = document.querySelector('.launch-mode-banner');
      if (banner) banner.dataset.ready = data.summary?.ready ? 'ready' : 'blocked';
      const dot = document.getElementById('nav-status-reviews');
      if (dot) { dot.className = `tab-status-dot ${data.summary?.ready ? 'live' : 'warning'}`; dot.title = data.summary?.ready ? 'Reviews live-ready: launch checks passed' : 'Reviews enabled but launch checks still need attention'; }
      window.updateProductNavStatuses?.(data);
    } catch (error) {
      console.error('Reviews launch checklist failed:', error);
      restoreTechnicalPanels();
      renderChecks([{ status:'blocked', label:'Could not load launch checklist', detail:error.message || 'Refresh the page and try again.', action:'Check the browser console/API logs in Render.' }]);
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

  window.toggleReviewAdvanced = function(){
    const root = document.getElementById('v-review-launch');
    if (!root) return;
    root.classList.toggle('reviews-show-advanced');
    const btn = document.querySelector('#review-simple-shell button[onclick*="toggleReviewAdvanced"]');
    if (btn) btn.textContent = root.classList.contains('reviews-show-advanced') ? 'Hide technical setup' : 'Show technical setup';
  };

  window.sendReviewJobProof = async function(jobId){
    const proofRecipient = lastChecklist?.summary?.proofRecipient || 'the saved shop email';
    if (!jobId) return;
    const ok = confirm(`Send a safe review-request proof for this order to ${proofRecipient}? The customer will not be emailed and the proof job will be marked as a test.`);
    if (!ok) return;
    try {
      const result = await api(`/admin/review-automation/jobs/${encodeURIComponent(jobId)}/send-proof`, { method:'POST', body: JSON.stringify({}) });
      const d = result.diagnostics || {}; toast(`Proof sent to ${result.proofRecipient || proofRecipient}. ${d.productCount || 0} products · ${d.withImages || 0} images · ${d.withTags || 0} tagged · ${d.sliderRuleCount || 0} slider rules.`);
      await window.loadReviewsLaunchChecklist?.();
    } catch (error) {
      toast(error.message || 'Could not send the shop proof email.');
      await window.loadReviewsLaunchChecklist?.();
    }
  };

  window.sendLatestReviewProof = async function(){
    const proofRecipient = lastChecklist?.summary?.proofRecipient || 'the saved shop email';
    const ok = confirm(`Send a safe review-request proof to ${proofRecipient}? Nectar will use the latest real Shopify order job, refresh its product context, mask the customer display, and never email the customer.`);
    if (!ok) return;
    try {
      const result = await api('/admin/review-automation/send-proof-latest', { method:'POST', body: JSON.stringify({}) });
      const d = result.diagnostics || {}; toast(`Proof sent to ${result.proofRecipient || proofRecipient}. ${d.productCount || 0} products · ${d.withImages || 0} images · ${d.withTags || 0} tagged · ${d.sliderRuleCount || 0} slider rules.`);
      await window.loadReviewsLaunchChecklist?.();
    } catch (error) {
      toast(error.message || 'Could not send the shop proof email.');
      await window.loadReviewsLaunchChecklist?.();
    }
  };

  window.runReviewLaunchFakeOrder = window.sendLatestReviewProof;

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
        const createButton = page.status === 'missing' ? `<button type="button" class="primary-btn compact" data-create-shopify-page="${esc(page.handle || '')}" data-page-type="${String(page.handle || '').includes('review') && !String(page.handle || '').includes('reviews') ? 'leave_review' : 'all_reviews'}">Create Shopify page</button>` : '';
        return `<div class="webhook-card ${cls}"><div class="webhook-card-head"><div><strong>${esc(page.label || 'Storefront page')}</strong><p>/pages/${esc(page.handle || '')}</p></div><span>${label}</span></div><div class="webhook-card-body"><p>${esc(page.detail || '')}</p><code>${esc(page.url || '')}</code><div class="launch-actions-stack" style="margin-top:12px;">${page.url ? `<button type="button" class="secondary-btn" data-open-page="${esc(page.url)}">Open page</button>` : ''}${createButton}</div></div></div>`;
      }).join('');
      box.innerHTML = `<div class="webhook-registry-summary"><div><strong>Review storefront pages</strong><p>${Number(data.acceptedReviews || 0)} accepted live review(s), ${Number(data.pendingReviews || 0)} pending. These pages must exist before customer links go live.</p></div><button type="button" class="secondary-btn" data-refresh-page-checks>Refresh pages</button></div><div class="webhook-registry-grid">${pageCards}<div class="webhook-card ${Number(data.acceptedReviews || 0) ? 'verified' : 'manual_unverified'}"><div class="webhook-card-head"><div><strong>All Reviews SEO block</strong><p>Theme block and API feed for the public reviews page.</p></div><span>${Number(data.acceptedReviews || 0) ? 'Ready' : 'Needs reviews'}</span></div><div class="webhook-card-body"><p><strong>Recommended Shopify page:</strong> /pages/${esc(data.recommendedPageHandle || 'reviews')}</p><p><strong>Theme app block:</strong> ${esc(data.themeBlockName || 'All Reviews SEO Page')}</p><p><strong>API endpoint:</strong></p><code>${esc(data.apiEndpoint || '')}</code><div class="launch-actions-stack" style="margin-top:12px;"><button type="button" class="secondary-btn" data-copy-all-reviews-snippet>Copy Liquid snippet</button><button type="button" class="secondary-btn" data-open-all-reviews-api>Open API preview</button></div></div></div></div>`;
      box.querySelector('[data-copy-all-reviews-snippet]')?.addEventListener('click', async()=>{ await navigator.clipboard.writeText(data.liquidSnippet || "{% render 'all_reviews_seo_page' %}"); toast('All Reviews Liquid snippet copied.'); });
      box.querySelector('[data-open-all-reviews-api]')?.addEventListener('click', ()=>{ if (data.apiEndpoint) window.open(data.apiEndpoint, '_blank', 'noopener'); });
      box.querySelector('[data-refresh-page-checks]')?.addEventListener('click', ()=>window.loadAllReviewsPageSetup?.());
      box.querySelectorAll('[data-open-page]').forEach((btn)=>btn.addEventListener('click',()=>window.open(btn.dataset.openPage, '_blank', 'noopener')));
      box.querySelectorAll('[data-create-shopify-page]').forEach((btn)=>btn.addEventListener('click', async()=>{ try { const result = await api('/admin/storefront-pages/create', { method:'POST', body: JSON.stringify({ handle: btn.dataset.createShopifyPage, type: btn.dataset.pageType || 'leave_review' }) }); toast(result.message || 'Shopify page created.'); await window.loadAllReviewsPageSetup?.(); } catch (error) { toast(error.message || 'Could not create Shopify page. Add content scopes and reconnect the app.'); } }));
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
