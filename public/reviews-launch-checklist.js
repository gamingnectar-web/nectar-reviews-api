(function(){
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const api = (path, options={}) => window.adminFetch ? window.adminFetch(path, options) : fetch(`/api${path}`, { headers:{'Content-Type':'application/json'}, ...options }).then(async r=>{const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Request failed'); return j;});
  const toast = (msg) => (window.showToast || console.log)(msg);
  const statusText = (status) => ({ready:'Ready', blocked:'Blocked', warning:'Warning', manual:'Manual', info:'Info'}[status] || status || 'Info');
  const statusIcon = (status) => ({ready:'✓', blocked:'!', warning:'⚠', manual:'↗', info:'i'}[status] || '•');

  let lastChecklist = null;

  function targetButton(check){
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

  window.loadReviewsLaunchChecklist = async function(){
    if (!document.getElementById('v-review-launch')) return;
    try {
      const data = await api('/admin/review-launch-checklist');
      lastChecklist = data;
      renderChecks(data.checks || []);
      renderPath(data.livePath || []);
      renderJobs(data.recentJobs || []);
      const banner = document.querySelector('.launch-mode-banner');
      if (banner) banner.dataset.ready = data.summary?.ready ? 'ready' : 'blocked';
    } catch (error) {
      renderChecks([{ status:'blocked', label:'Could not load launch checklist', detail:error.message || 'Refresh the page and try again.', action:'Check the API logs in Render.' }]);
    }
  };

  window.goReviewLaunchTarget = function(view, sub){
    if (view) window.tab?.(view);
    if (view === 'v-msg' && sub === 'delivery') setTimeout(()=>document.querySelector('[data-msg-tab="delivery"], [data-request-tab="delivery"], button[onclick*="emailDelivery"]')?.click(), 80);
    if (view === 'v-loyalty' && sub) setTimeout(()=>document.querySelector(`#v-loyalty [data-loyalty-tab="${CSS.escape(sub)}"]`)?.click(), 80);
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
