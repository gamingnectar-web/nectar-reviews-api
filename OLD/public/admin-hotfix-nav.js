
(function () {
  if (window.__NECTAR_ADMIN_HOTFIX_NAV__) return;
  window.__NECTAR_ADMIN_HOTFIX_NAV__ = true;

  const API_BASE = window.API || 'https://nectar-reviews-api.onrender.com/api';

  const state = {
    module: 'dashboard',
    sub: 'overview',
    rewardSettingsLoaded: false,
    lastManualReward: null
  };

  const $ = (id) => document.getElementById(id);

  function shopDomain() {
    if (window.SHOP_DOMAIN) return window.SHOP_DOMAIN;
    const params = new URLSearchParams(window.location.search);
    return params.get('shopDomain') || params.get('shop') || 'your-dev-store.myshopify.com';
  }

  function notify(message) {
    if (window.showToast) window.showToast(message);
    else console.log(message);
  }

  function installCss() {
    if ($('nr-hotfix-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-hotfix-style';
    style.textContent = `
      #nr-primary-tabs {
        display:flex!important;
        align-items:center;
        gap:10px;
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
        color:var(--text,#0f172a);
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

      .nr-form-grid,
      .nr-manual-code-grid,
      .nr-email-template-grid {
        display:grid;
        grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);
        gap:18px;
      }

      .nr-field {
        margin-bottom:15px;
      }

      .nr-field label {
        display:block;
        font-weight:850;
        margin-bottom:7px;
      }

      .nr-field input,
      .nr-field select,
      .nr-field textarea {
        width:100%;
        border:1px solid var(--border,#e2e8f0);
        border-radius:12px;
        padding:12px;
        font:inherit;
        background:#fff;
      }

      .nr-field textarea {
        min-height:180px;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
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

      .nr-code-table {
        width:100%;
        border-collapse:collapse;
      }

      .nr-code-table th,
      .nr-code-table td {
        text-align:left;
        padding:12px;
        border-bottom:1px solid var(--border,#e2e8f0);
        font-size:13px;
      }

      .nr-code-output {
        font-size:28px;
        font-weight:950;
        letter-spacing:.02em;
        margin:8px 0 14px;
      }

      @media (max-width:1000px) {
        #nr-primary-tabs { overflow-x:auto; }
        .nr-form-grid,
        .nr-manual-code-grid,
        .nr-email-template-grid { grid-template-columns:1fr; }
      }
    `;

    document.head.appendChild(style);
  }

  function contentRoot() {
    const firstView = document.querySelector('.view');
    if (firstView && firstView.parentElement) return firstView.parentElement;
    return document.querySelector('main') || document.querySelector('.main') || document.body;
  }

  function makeButton(label, module, sub, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.dataset.nrModule = module;
    button.dataset.nrSub = sub;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      select(module, sub);
    });
    return button;
  }

  function ensureTopTabs() {
    let tabs = $('nr-primary-tabs');

    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'nr-primary-tabs';

      const root = contentRoot();
      const firstView = root.querySelector('.view');

      if (firstView) root.insertBefore(tabs, firstView);
      else root.insertBefore(tabs, root.firstChild);
    }

    tabs.replaceChildren(
      makeButton('Dashboard', 'dashboard', 'overview', 'nr-primary-tab'),
      makeButton('Reviews', 'reviews', 'manager', 'nr-primary-tab'),
      makeButton('Discount Rewards', 'discounts', 'settings', 'nr-primary-tab')
    );

    updateTopActive();
  }

  function updateTopActive() {
    document.querySelectorAll('.nr-primary-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.nrModule === state.module);
    });
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach((view) => {
      const active = view.id === id;
      view.classList.toggle('active', active);
      view.style.display = active ? '' : 'none';
    });
  }

  function sidebarGroup() {
    const groups = Array.from(document.querySelectorAll('.nav-group'));

    if (groups.length) {
      const config = groups.find((group) => /configuration/i.test(group.textContent || ''));
      const dev = groups.find((group) => /developers/i.test(group.textContent || ''));
      return groups.find((group) => group !== config && group !== dev) || groups[0];
    }

    const labels = Array.from(document.querySelectorAll('.section-label,.nav-title'));
    const manage = labels.find((el) => /manage|dashboard/i.test(el.textContent || ''));
    return manage ? manage.parentElement : null;
  }

  function sideButton(label, module, sub) {
    const button = makeButton(label, module, sub, 'nr-side-tab');
    button.classList.toggle('active', state.module === module && state.sub === sub);
    return button;
  }

  function renderSidebar() {
    const group = sidebarGroup();
    if (!group) return;

    const title = document.createElement('p');
    title.className = 'nr-side-title';

    const list = document.createElement('div');
    list.className = 'nr-side-tabs';

    if (state.module === 'dashboard') {
      title.textContent = 'Dashboard';
      list.appendChild(sideButton('Overview', 'dashboard', 'overview'));
    }

    if (state.module === 'reviews') {
      title.textContent = 'Reviews';
      list.appendChild(sideButton('Review Manager', 'reviews', 'manager'));
      list.appendChild(sideButton('Messaging & Campaigns', 'reviews', 'campaigns'));
      list.appendChild(sideButton('Trash', 'reviews', 'trash'));
      list.appendChild(sideButton('Import CSV', 'reviews', 'import'));
    }

    if (state.module === 'discounts') {
      title.textContent = 'Discount Rewards';
      list.appendChild(sideButton('Settings', 'discounts', 'settings'));
      list.appendChild(sideButton('Manual Code', 'discounts', 'manual'));
      list.appendChild(sideButton('Generated Codes', 'discounts', 'codes'));
      list.appendChild(sideButton('Email Template', 'discounts', 'email'));
      list.appendChild(sideButton('Function Outline', 'discounts', 'function'));
    }

    group.replaceChildren(title, list);
  }

  function ensureDiscountSection() {
    let discount = $('v-discounts');
    if (discount) {
      ensureDiscountExtras(discount);
      return;
    }

    const manager = $('v-mgr');
    if (!manager || !manager.parentElement) return;

    discount = document.createElement('section');
    discount.id = 'v-discounts';
    discount.className = 'view';
    discount.style.display = 'none';

    discount.innerHTML = `
      <h2 class="page-title">Discount Rewards</h2>

      <div id="reward-settings" class="nr-discount-subview active">
        <div class="grid-2">
          <div class="panel">
            <h3 style="margin-top:0;">Review Reward Settings</h3>
            <p class="nr-muted">Create unique Shopify discount codes when a customer leaves an eligible review.</p>

            <div class="nr-form-grid">
              <div class="nr-field">
                <label>Enable reward codes</label>
                <label><input type="checkbox" id="reward-enabled" /> Issue codes automatically</label>
              </div>

              <div class="nr-field">
                <label>Reward percentage</label>
                <input id="reward-percentage" type="number" min="1" max="100" value="5" />
              </div>

              <div class="nr-field">
                <label>Expiry window, days</label>
                <input id="reward-expiry-days" type="number" min="1" max="365" value="60" />
              </div>

              <div class="nr-field">
                <label>Code prefix</label>
                <input id="reward-prefix" value="GN" />
              </div>

              <div class="nr-field">
                <label>Issue when review status is</label>
                <select id="reward-trigger-status">
                  <option value="accepted">Accepted</option>
                  <option value="pending">Submitted / Pending</option>
                </select>
              </div>

              <div class="nr-field">
                <label>Verification rule</label>
                <label><input type="checkbox" id="reward-verified-only" checked /> Verified purchases only</label>
              </div>
            </div>

            <h4>Combine with</h4>
            <label><input type="checkbox" id="reward-combine-order" checked /> Order discounts</label><br />
            <label><input type="checkbox" id="reward-combine-product" checked /> Product / BOGO discounts</label><br />
            <label><input type="checkbox" id="reward-combine-shipping" checked /> Free shipping discounts</label><br /><br />

            <button class="post-btn" type="button" id="nr-save-reward-settings">Save Reward Settings</button>
          </div>

          <div class="panel">
            <h3 style="margin-top:0;">Reward Email Format</h3>
            <div class="nr-field">
              <label>Email copy</label>
              <textarea id="reward-email-template">Thanks for leaving a review.

Here is your unique {{ percentage }}% off code:

{{ discount_code }}

It expires in {{ expiry_days }} days and can only be used once.</textarea>
            </div>
          </div>
        </div>
      </div>

      <div id="reward-codes" class="nr-discount-subview">
        <div class="panel">
          <h3 style="margin-top:0;">Generated Reward Codes</h3>
          <table class="nr-code-table">
            <thead>
              <tr><th>Code</th><th>Email</th><th>Status</th><th>Expires</th><th>Review</th></tr>
            </thead>
            <tbody id="reward-code-list">
              <tr><td colspan="5">No codes loaded yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="reward-function" class="nr-discount-subview">
        <div class="panel">
          <h3 style="margin-top:0;">Function Outline</h3>
          <p class="nr-muted">The app creates the code. Shopify applies it at checkout.</p>
        </div>
      </div>
    `;

    manager.parentElement.insertBefore(discount, manager);
    ensureDiscountExtras(discount);
  }

  function ensureDiscountExtras(discount) {
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
    ensureDiscountSection();

    document.querySelectorAll('.nr-discount-subview').forEach((view) => {
      view.classList.toggle('active', view.id === `reward-${sub}`);
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

      if (!state.rewardSettingsLoaded) {
        state.rewardSettingsLoaded = true;
        loadRewardSettings();
      }
    }

    ensureTopTabs();
    renderSidebar();
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
      if ($('reward-trigger-status')) $('reward-trigger-status').value = s.triggerStatus || 'accepted';
      if ($('reward-verified-only')) $('reward-verified-only').checked = s.verifiedOnly !== false;
      if ($('reward-combine-order')) $('reward-combine-order').checked = s.combinesWith?.orderDiscounts !== false;
      if ($('reward-combine-product')) $('reward-combine-product').checked = s.combinesWith?.productDiscounts !== false;
      if ($('reward-combine-shipping')) $('reward-combine-shipping').checked = s.combinesWith?.shippingDiscounts !== false;

      if ($('reward-email-template') && s.emailTemplate) $('reward-email-template').value = s.emailTemplate;
      if ($('reward-email-template-main') && s.emailTemplate) $('reward-email-template-main').value = s.emailTemplate;

      renderEmailPreview();
    } catch (error) {
      console.warn('Reward settings load failed:', error);
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

    state.rewardSettingsLoaded = false;
    notify('Reward settings saved');
  }

  async function loadRewardCodes() {
    const body = $('reward-code-list');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(`${API_BASE}/admin/review-rewards?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Could not load reward codes');

      const rows = await res.json();

      if (!Array.isArray(rows) || !rows.length) {
        body.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      body.innerHTML = rows.map((row) => `
        <tr>
          <td><strong>${row.code || '—'}</strong></td>
          <td>${row.email || '—'}</td>
          <td>${row.status || 'issued'}</td>
          <td>${row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—'}</td>
          <td>${row.reviewId || '—'}</td>
        </tr>
      `).join('');
    } catch (error) {
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
      state.lastManualReward = {
        code: reward.code,
        email: reward.email,
        percentage: reward.percentage || payload.percentage,
        expiryDays: payload.expiryDays
      };

      if (result) {
        result.innerHTML = `
          <div class="nr-muted">Manual reward code created</div>
          <div class="nr-code-output">${reward.code}</div>
          <div><strong>Email:</strong> ${reward.email}</div>
          <div><strong>Discount:</strong> ${reward.percentage || payload.percentage}%</div>
          <div><strong>Status:</strong> ${reward.status || 'issued'}</div>
        `;
      }

      notify('Manual reward code created');
    } catch (error) {
      if (result) result.textContent = error.message;
      alert(error.message);
    }
  }

  function renderEmailPreview() {
    const preview = $('reward-email-preview');
    if (!preview) return;

    const template = ($('reward-email-template-main') || $('reward-email-template'))?.value || '';

    const reward = state.lastManualReward || {
      code: 'GN-SAMPLE',
      expiryDays: 60,
      percentage: 5,
      email: 'customer@example.com'
    };

    preview.textContent = template
      .replaceAll('{{ discount_code }}', reward.code)
      .replaceAll('{{ expiry_days }}', String(reward.expiryDays))
      .replaceAll('{{ percentage }}', String(reward.percentage))
      .replaceAll('{{ customer_email }}', reward.email);
  }

  document.addEventListener('click', (event) => {
    if (event.target?.id === 'nr-save-reward-settings' || event.target?.id === 'nr-save-email-template') {
      event.preventDefault();
      saveRewardSettings();
    }

    if (event.target?.id === 'nr-create-manual-code') {
      event.preventDefault();
      createManualCode();
    }
  });

  window.nrSelectModule = select;
  window.rewardSubTab = (sub) => select('discounts', sub || 'settings');

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
    installCss();
    ensureDiscountSection();
    ensureTopTabs();
    renderSidebar();
    updateTopActive();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  setTimeout(boot, 250);
  setTimeout(boot, 800);
})();
