(function () {
  if (window.__NECTAR_ADMIN_HOTFIX_NAV__) return;
  window.__NECTAR_ADMIN_HOTFIX_NAV__ = true;

  const API_BASE = 'https://nectar-reviews-api.onrender.com/api';
  const state = { module: 'dashboard', sub: 'overview' };

  const $ = (id) => document.getElementById(id);

  function shopDomain() {
    const params = new URLSearchParams(window.location.search);
    return params.get('shopDomain') || params.get('shop') || 'your-dev-store.myshopify.com';
  }

  function css() {
    if ($('nr-hotfix-style')) return;

    const s = document.createElement('style');
    s.id = 'nr-hotfix-style';
    s.textContent = `
      #nr-primary-tabs {
        display:flex!important;
        gap:10px;
        align-items:center;
        margin:0 0 24px;
        padding:0 0 18px;
        border-bottom:1px solid var(--border,#e2e8f0);
        position:relative;
        z-index:99999;
      }

      .nr-primary-tab {
        display:inline-flex!important;
        border:1px solid var(--border,#e2e8f0);
        background:#fff;
        color:var(--text,#0f172a);
        border-radius:999px;
        padding:11px 18px;
        font-weight:900;
        cursor:pointer;
        white-space:nowrap;
      }

      .nr-primary-tab.active {
        background:var(--text,#0f172a);
        color:#fff;
        border-color:var(--text,#0f172a);
      }

      .nr-side-title {
        margin:0 0 10px;
        color:var(--text-light,#64748b);
        text-transform:uppercase;
        letter-spacing:.12em;
        font-size:11px;
        font-weight:950;
      }

      .nr-side-tabs {
        display:grid;
        gap:8px;
      }

      .nr-side-tab {
        width:100%;
        border:0;
        background:transparent;
        text-align:left;
        padding:11px 13px;
        border-radius:10px;
        font-weight:850;
        cursor:pointer;
      }

      .nr-side-tab:hover,
      .nr-side-tab.active {
        background:#fff;
      }

      #v-discounts > .nr-tabbar {
        display:none!important;
      }

      .nr-discount-subview {
        display:none;
      }

      .nr-discount-subview.active {
        display:block;
      }

      .nr-manual-code-grid,
      .nr-email-template-grid {
        display:grid;
        grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);
        gap:18px;
      }

      .nr-manual-result,
      .nr-email-preview {
        border:1px solid var(--border,#e2e8f0);
        background:#fff;
        border-radius:16px;
        padding:16px;
        min-height:160px;
        white-space:pre-wrap;
      }

      .nr-code-output {
        font-size:28px;
        font-weight:950;
        letter-spacing:.02em;
        margin:8px 0 14px;
      }
    `;
    document.head.appendChild(s);
  }

  function contentRoot() {
    const firstView = document.querySelector('.view');
    return firstView && firstView.parentElement ? firstView.parentElement : document.body;
  }

  function makeBtn(label, module, sub, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = className;
    b.dataset.module = module;
    b.dataset.sub = sub;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      select(module, sub);
    });
    return b;
  }

  function topTabs() {
    let tabs = $('nr-primary-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'nr-primary-tabs';
      const root = contentRoot();
      const firstView = root.querySelector('.view');
      root.insertBefore(tabs, firstView || root.firstChild);
    }

    tabs.replaceChildren(
      makeBtn('Dashboard', 'dashboard', 'overview', 'nr-primary-tab'),
      makeBtn('Reviews', 'reviews', 'manager', 'nr-primary-tab'),
      makeBtn('Discount Rewards', 'discounts', 'settings', 'nr-primary-tab')
    );

    document.querySelectorAll('.nr-primary-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.module === state.module);
    });
  }

  function sidebarGroup() {
    const groups = Array.from(document.querySelectorAll('.nav-group'));
    if (groups.length) {
      const config = groups.find(g => /configuration/i.test(g.textContent || ''));
      const dev = groups.find(g => /developers/i.test(g.textContent || ''));
      return groups.find(g => g !== config && g !== dev) || groups[0];
    }

    const labels = Array.from(document.querySelectorAll('.section-label,.nav-title'));
    const manage = labels.find(el => /manage|dashboard/i.test(el.textContent || ''));
    return manage ? manage.parentElement : null;
  }

  function sideBtn(label, module, sub) {
    const b = makeBtn(label, module, sub, 'nr-side-tab');
    b.classList.toggle('active', state.module === module && state.sub === sub);
    return b;
  }

  function sidebar() {
    const group = sidebarGroup();
    if (!group) return;

    const title = document.createElement('p');
    title.className = 'nr-side-title';

    const list = document.createElement('div');
    list.className = 'nr-side-tabs';

    if (state.module === 'dashboard') {
      title.textContent = 'Dashboard';
      list.appendChild(sideBtn('Overview', 'dashboard', 'overview'));
    }

    if (state.module === 'reviews') {
      title.textContent = 'Reviews';
      list.appendChild(sideBtn('Review Manager', 'reviews', 'manager'));
      list.appendChild(sideBtn('Messaging & Campaigns', 'reviews', 'campaigns'));
      list.appendChild(sideBtn('Trash', 'reviews', 'trash'));
      list.appendChild(sideBtn('Import CSV', 'reviews', 'import'));
    }

    if (state.module === 'discounts') {
      title.textContent = 'Discount Rewards';
      list.appendChild(sideBtn('Settings', 'discounts', 'settings'));
      list.appendChild(sideBtn('Manual Code', 'discounts', 'manual'));
      list.appendChild(sideBtn('Generated Codes', 'discounts', 'codes'));
      list.appendChild(sideBtn('Email Template', 'discounts', 'email'));
      list.appendChild(sideBtn('Function Outline', 'discounts', 'function'));
    }

    group.replaceChildren(title, list);
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach(v => {
      const on = v.id === id;
      v.classList.toggle('active', on);
      v.style.display = on ? '' : 'none';
    });
  }

  function ensureDiscountExtras() {
    const discount = $('v-discounts');
    if (!discount) return;

    if (!$('reward-manual')) {
      discount.insertAdjacentHTML('beforeend', `
        <div id="reward-manual" class="nr-discount-subview">
          <div class="nr-manual-code-grid">
            <div class="panel">
              <h3 style="margin-top:0;">Create Manual Reward Code</h3>
              <div class="nr-field"><label>Customer email</label><input id="manual-reward-email" type="email" placeholder="customer@example.com"></div>
              <div class="nr-field"><label>Code prefix</label><input id="manual-reward-prefix" value="GN"></div>
              <div class="nr-field"><label>Custom code, optional</label><input id="manual-reward-code" placeholder="Leave blank to auto-generate"></div>
              <div class="nr-field"><label>Discount percentage</label><input id="manual-reward-percentage" type="number" min="1" max="100" value="5"></div>
              <div class="nr-field"><label>Expiry window, days</label><input id="manual-reward-expiry-days" type="number" min="1" max="365" value="60"></div>
              <button class="post-btn" type="button" id="nr-create-manual-code">Create Manual Code</button>
            </div>
            <div class="panel">
              <h3 style="margin-top:0;">Created Code</h3>
              <div id="manual-reward-result" class="nr-manual-result">Create a code to see the email copy here.</div>
            </div>
          </div>
        </div>
      `);
    }

    if (!$('reward-email')) {
      discount.insertAdjacentHTML('beforeend', `
        <div id="reward-email" class="nr-discount-subview">
          <div class="nr-email-template-grid">
            <div class="panel">
              <h3 style="margin-top:0;">Reward Email Template</h3>
              <div class="nr-field">
                <label>Email body</label>
                <textarea id="reward-email-template-main">Thanks for leaving a review.

Here is your unique {{ percentage }}% off code:

{{ discount_code }}

It expires in {{ expiry_days }} days and can only be used once.</textarea>
              </div>
              <button class="post-btn" type="button" id="nr-save-email-template">Save Email Template</button>
            </div>
            <div class="panel">
              <h3 style="margin-top:0;">Live Preview</h3>
              <div id="reward-email-preview" class="nr-email-preview"></div>
            </div>
          </div>
        </div>
      `);
    }
  }

  function showDiscountSub(sub) {
    ensureDiscountExtras();
    document.querySelectorAll('.nr-discount-subview').forEach(v => {
      v.classList.toggle('active', v.id === `reward-${sub}`);
    });

    if (sub === 'codes') loadRewardCodes();
    if (sub === 'email') renderEmailPreview();
  }

  function select(module, sub) {
    state.module = module;
    state.sub = sub;

    if (module === 'dashboard') {
      state.sub = 'overview';
      showView('v-dash');
      setTimeout(() => window.loadStats && window.loadStats(), 0);
    }

    if (module === 'reviews') {
      if (sub === 'manager') showView('v-mgr');
      if (sub === 'campaigns') showView($('v-campaigns') ? 'v-campaigns' : 'v-msg');
      if (sub === 'trash') showView('v-trash');
      if (sub === 'import') showView('v-import');
    }

    if (module === 'discounts') {
      showView('v-discounts');
      showDiscountSub(sub || 'settings');
      loadRewardSettings();
    }

    topTabs();
    sidebar();
  }

  async function loadRewardSettings() {
    try {
      const res = await fetch(`${API_BASE}/admin/review-reward-settings?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) return;
      const s = await res.json();

      if ($('reward-enabled')) $('reward-enabled').checked = !!s.enabled;
      if ($('reward-percentage')) $('reward-percentage').value = s.percentage || 5;
      if ($('reward-expiry-days')) $('reward-expiry-days').value = s.expiryDays || 60;
      if ($('reward-prefix')) $('reward-prefix').value = s.prefix || 'GN';
      if ($('reward-email-template') && s.emailTemplate) $('reward-email-template').value = s.emailTemplate;
      if ($('reward-email-template-main') && s.emailTemplate) $('reward-email-template-main').value = s.emailTemplate;

      renderEmailPreview();
    } catch (e) {
      console.warn('Reward settings load failed:', e);
    }
  }

  async function saveRewardSettings() {
    const template = $('reward-email-template-main') || $('reward-email-template');

    const payload = {
      shopDomain: shopDomain(),
      enabled: !!$('reward-enabled')?.checked,
      percentage: Number($('reward-percentage')?.value || 5),
      expiryDays: Number($('reward-expiry-days')?.value || 60),
      prefix: String($('reward-prefix')?.value || 'GN').trim().toUpperCase(),
      triggerStatus: $('reward-trigger-status')?.value || 'accepted',
      verifiedOnly: !!$('reward-verified-only')?.checked,
      combinesWith: {
        orderDiscounts: !!$('reward-combine-order')?.checked,
        productDiscounts: !!$('reward-combine-product')?.checked,
        shippingDiscounts: !!$('reward-combine-shipping')?.checked
      },
      emailTemplate: template ? template.value : ''
    };

    const res = await fetch(`${API_BASE}/admin/review-reward-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Could not save reward settings');
      return;
    }

    if (window.showToast) window.showToast('Reward settings saved');
  }

  async function loadRewardCodes() {
    const body = $('reward-code-list');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(`${API_BASE}/admin/review-rewards?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) throw new Error();
      const rows = await res.json();

      if (!Array.isArray(rows) || !rows.length) {
        body.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      body.innerHTML = rows.map(row => `
        <tr>
          <td><strong>${row.code || '—'}</strong></td>
          <td>${row.email || '—'}</td>
          <td>${row.status || 'issued'}</td>
          <td>${row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—'}</td>
          <td>${row.reviewId || '—'}</td>
        </tr>
      `).join('');
    } catch {
      body.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
    }
  }

  async function createManualCode() {
    const email = String($('manual-reward-email')?.value || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      alert('Enter a valid customer email first.');
      return;
    }

    const result = $('manual-reward-result');
    if (result) result.textContent = 'Creating code...';

    const payload = {
      shopDomain: shopDomain(),
      email,
      code: String($('manual-reward-code')?.value || '').trim(),
      prefix: String($('manual-reward-prefix')?.value || 'GN').trim().toUpperCase(),
      percentage: Number($('manual-reward-percentage')?.value || 5),
      expiryDays: Number($('manual-reward-expiry-days')?.value || 60)
    };

    try {
      const res = await fetch(`${API_BASE}/admin/review-rewards/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not create manual reward code');

      const reward = json.reward || {};
      if (result) {
        result.innerHTML = `
          <div class="nr-muted">Manual reward code created</div>
          <div class="nr-code-output">${reward.code}</div>
          <div><strong>Email:</strong> ${reward.email}</div>
          <div><strong>Discount:</strong> ${reward.percentage || payload.percentage}%</div>
          <div><strong>Status:</strong> ${reward.status || 'issued'}</div>
        `;
      }
    } catch (e) {
      if (result) result.textContent = e.message;
      alert(e.message);
    }
  }

  function renderEmailPreview() {
    const preview = $('reward-email-preview');
    if (!preview) return;

    const template = ($('reward-email-template-main') || $('reward-email-template'))?.value || '';

    preview.textContent = template
      .replaceAll('{{ discount_code }}', 'GN-SAMPLE')
      .replaceAll('{{ expiry_days }}', '60')
      .replaceAll('{{ percentage }}', '5')
      .replaceAll('{{ customer_email }}', 'customer@example.com');
  }

  document.addEventListener('click', function (e) {
    if (e.target?.id === 'nr-save-reward-settings' || e.target?.id === 'nr-save-email-template') {
      e.preventDefault();
      saveRewardSettings();
    }

    if (e.target?.id === 'nr-create-manual-code') {
      e.preventDefault();
      createManualCode();
    }
  });

  window.nrSelectModule = select;
  window.rewardSubTab = sub => select('discounts', sub || 'settings');

  window.tab = function (viewId) {
    if (viewId === 'v-dash') return select('dashboard', 'overview');
    if (viewId === 'v-mgr') return select('reviews', 'manager');
    if (viewId === 'v-msg' || viewId === 'v-campaigns') return select('reviews', 'campaigns');
    if (viewId === 'v-trash') return select('reviews', 'trash');
    if (viewId === 'v-import') return select('reviews', 'import');
    if (viewId === 'v-discounts') return select('discounts', state.sub || 'settings');
    showView(viewId);
  };

  function boot() {
    css();
    ensureDiscountExtras();
    topTabs();
    sidebar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  setTimeout(boot, 250);
  setTimeout(boot, 800);
})();
