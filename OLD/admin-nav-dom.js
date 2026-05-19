(function () {
  if (window.__NECTAR_DOM_NAV__) return;
  window.__NECTAR_DOM_NAV__ = true;

  const state = {
    module: 'dashboard',
    sub: 'overview',
    rewardSettingsLoaded: false,
    rewardCodesLoaded: false
  };

  function q(id) {
    return document.getElementById(id);
  }

  function apiBase() {
    return window.API || 'https://nectar-reviews-api.onrender.com/api';
  }

  function shopDomain() {
    if (window.SHOP_DOMAIN) return window.SHOP_DOMAIN;
    const params = new URLSearchParams(window.location.search);
    return params.get('shopDomain') || params.get('shop') || '';
  }

  function installCss() {
    if (q('nr-dom-nav-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-dom-nav-style';
    style.textContent = `
      #nr-primary-tabs {
        display: flex !important;
        align-items: center;
        gap: 10px;
        margin: 0 0 24px;
        padding: 0 0 18px;
        border-bottom: 1px solid var(--border, #e2e8f0);
        position: relative;
        z-index: 999;
      }

      .nr-primary-tab {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border, #e2e8f0);
        background: #ffffff;
        color: var(--text, #0f172a);
        border-radius: 999px;
        padding: 11px 18px;
        font-weight: 900;
        cursor: pointer;
        white-space: nowrap;
      }

      .nr-primary-tab.active {
        background: var(--text, #0f172a);
        color: #ffffff;
        border-color: var(--text, #0f172a);
      }

      .nr-side-title {
        margin: 0 0 10px;
        color: var(--text-light, #64748b);
        text-transform: uppercase;
        letter-spacing: .12em;
        font-size: 11px;
        font-weight: 950;
      }

      .nr-side-tabs {
        display: grid;
        gap: 8px;
      }

      .nr-side-tab {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--text, #0f172a);
        text-align: left;
        padding: 11px 13px;
        border-radius: 10px;
        font-weight: 850;
        cursor: pointer;
      }

      .nr-side-tab:hover,
      .nr-side-tab.active {
        background: #ffffff;
      }

      .nr-discount-subview {
        display: none;
      }

      .nr-discount-subview.active {
        display: block;
      }

      #v-discounts > .nr-tabbar {
        display: none !important;
      }

      .nr-manual-code-grid,
      .nr-email-template-grid {
        display: grid;
        grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
        gap: 18px;
      }

      .nr-manual-result,
      .nr-email-preview {
        border: 1px solid var(--border, #e2e8f0);
        background: #ffffff;
        border-radius: 16px;
        padding: 16px;
        min-height: 160px;
        white-space: pre-wrap;
      }

      .nr-code-output {
        font-size: 28px;
        font-weight: 950;
        letter-spacing: .02em;
        margin: 8px 0 14px;
      }

      @media (max-width: 1000px) {
        #nr-primary-tabs {
          overflow-x: auto;
        }

        .nr-manual-code-grid,
        .nr-email-template-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function contentRoot() {
    const firstView = document.querySelector('.view');
    if (firstView && firstView.parentElement) return firstView.parentElement;

    return (
      document.querySelector('main') ||
      document.querySelector('.main') ||
      document.querySelector('.content') ||
      document.querySelector('.admin-main') ||
      document.body
    );
  }

  function makeButton(label, module, sub, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.dataset.nrModule = module;
    button.dataset.nrSub = sub;
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      select(module, sub);
    });
    return button;
  }

  function ensureTopTabs() {
    let tabs = q('nr-primary-tabs');

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
    document.querySelectorAll('.nr-primary-tab').forEach(button => {
      button.classList.toggle('active', button.dataset.nrModule === state.module);
    });
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach(view => {
      const active = view.id === id;
      view.classList.toggle('active', active);
      view.style.display = active ? '' : 'none';
    });
  }

  function findSidebarGroup() {
    const groups = Array.from(document.querySelectorAll('.nav-group'));

    if (groups.length) {
      const config = groups.find(group => /configuration/i.test(group.textContent || ''));
      const dev = groups.find(group => /developers/i.test(group.textContent || ''));
      return groups.find(group => group !== config && group !== dev) || groups[0];
    }

    const labels = Array.from(document.querySelectorAll('.section-label, .nav-title'));
    const manage = labels.find(el => /manage|dashboard|reviews/i.test(el.textContent || ''));
    return manage ? manage.parentElement : null;
  }

  function sideButton(label, module, sub) {
    const button = makeButton(label, module, sub, 'nr-side-tab');
    if (state.module === module && state.sub === sub) button.classList.add('active');
    return button;
  }

  function renderSidebar() {
    const group = findSidebarGroup();
    if (!group) return;

    const title = document.createElement('p');
    title.className = 'nr-side-title';

    const tabs = document.createElement('div');
    tabs.className = 'nr-side-tabs';

    if (state.module === 'dashboard') {
      title.textContent = 'Dashboard';
      tabs.appendChild(sideButton('Overview', 'dashboard', 'overview'));
    }

    if (state.module === 'reviews') {
      title.textContent = 'Reviews';
      tabs.appendChild(sideButton('Review Manager', 'reviews', 'manager'));
      tabs.appendChild(sideButton('Messaging & Campaigns', 'reviews', 'campaigns'));
      tabs.appendChild(sideButton('Trash', 'reviews', 'trash'));
      tabs.appendChild(sideButton('Import CSV', 'reviews', 'import'));
    }

    if (state.module === 'discounts') {
      title.textContent = 'Discount Rewards';
      tabs.appendChild(sideButton('Settings', 'discounts', 'settings'));
      tabs.appendChild(sideButton('Manual Code', 'discounts', 'manual'));
      tabs.appendChild(sideButton('Generated Codes', 'discounts', 'codes'));
      tabs.appendChild(sideButton('Email Template', 'discounts', 'email'));
      tabs.appendChild(sideButton('Function Outline', 'discounts', 'function'));
    }

    group.replaceChildren(title, tabs);
  }

  function ensureDiscountSection() {
    if (q('v-discounts')) return;

    const manager = q('v-mgr');
    if (!manager) return;

    const section = document.createElement('section');
    section.id = 'v-discounts';
    section.className = 'view';
    section.style.display = 'none';

    const heading = document.createElement('h2');
    heading.className = 'page-title';
    heading.textContent = 'Discount Rewards';

    const settings = document.createElement('div');
    settings.id = 'reward-settings';
    settings.className = 'nr-discount-subview active';
    settings.innerHTML = [
      '<div class="grid-2">',
      '<div class="panel">',
      '<h3 style="margin-top:0;">Review Reward Settings</h3>',
      '<p class="nr-muted">Create unique Shopify discount codes when a customer leaves an eligible review.</p>',
      '<div class="nr-field"><label>Enable reward codes</label><label><input type="checkbox" id="reward-enabled" /> Issue codes automatically</label></div>',
      '<div class="nr-field"><label>Reward percentage</label><input id="reward-percentage" type="number" min="1" max="100" value="5" /></div>',
      '<div class="nr-field"><label>Expiry window, days</label><input id="reward-expiry-days" type="number" min="1" max="365" value="60" /></div>',
      '<div class="nr-field"><label>Code prefix</label><input id="reward-prefix" value="GN" /></div>',
      '<div class="nr-field"><label>Issue when review status is</label><select id="reward-trigger-status"><option value="accepted">Accepted</option><option value="pending">Submitted / Pending</option></select></div>',
      '<div class="nr-field"><label>Verification rule</label><label><input type="checkbox" id="reward-verified-only" checked /> Verified purchases only</label></div>',
      '<h4>Combine with</h4>',
      '<label><input type="checkbox" id="reward-combine-order" checked /> Order discounts</label><br />',
      '<label><input type="checkbox" id="reward-combine-product" checked /> Product / BOGO discounts</label><br />',
      '<label><input type="checkbox" id="reward-combine-shipping" checked /> Free shipping discounts</label><br /><br />',
      '<button class="post-btn" type="button" id="nr-save-reward-settings">Save Reward Settings</button>',
      '</div>',
      '<div class="panel">',
      '<h3 style="margin-top:0;">Reward Email Format</h3>',
      '<div class="nr-field"><label>Email copy</label><textarea id="reward-email-template">Thanks for leaving a review.\\n\\nHere is your unique {{ percentage }}% off code:\\n\\n{{ discount_code }}\\n\\nIt expires in {{ expiry_days }} days and can only be used once.</textarea></div>',
      '</div>',
      '</div>'
    ].join('');

    const manual = document.createElement('div');
    manual.id = 'reward-manual';
    manual.className = 'nr-discount-subview';
    manual.innerHTML = [
      '<div class="nr-manual-code-grid">',
      '<div class="panel">',
      '<h3 style="margin-top:0;">Create Manual Reward Code</h3>',
      '<div class="nr-field"><label>Customer email</label><input id="manual-reward-email" type="email" placeholder="customer@example.com" /></div>',
      '<div class="nr-field"><label>Code prefix</label><input id="manual-reward-prefix" value="GN" /></div>',
      '<div class="nr-field"><label>Custom code, optional</label><input id="manual-reward-code" placeholder="Leave blank to auto-generate" /></div>',
      '<div class="nr-field"><label>Discount percentage</label><input id="manual-reward-percentage" type="number" min="1" max="100" value="5" /></div>',
      '<div class="nr-field"><label>Expiry window, days</label><input id="manual-reward-expiry-days" type="number" min="1" max="365" value="60" /></div>',
      '<button class="post-btn" type="button" id="nr-create-manual-code">Create Manual Code</button>',
      '</div>',
      '<div class="panel"><h3 style="margin-top:0;">Created Code</h3><div id="manual-reward-result" class="nr-manual-result">Create a code to see the email copy here.</div></div>',
      '</div>'
    ].join('');

    const codes = document.createElement('div');
    codes.id = 'reward-codes';
    codes.className = 'nr-discount-subview';
    codes.innerHTML = [
      '<div class="panel">',
      '<h3 style="margin-top:0;">Generated Reward Codes</h3>',
      '<table class="nr-code-table">',
      '<thead><tr><th>Code</th><th>Email</th><th>Status</th><th>Expires</th><th>Review</th></tr></thead>',
      '<tbody id="reward-code-list"><tr><td colspan="5">No codes loaded yet.</td></tr></tbody>',
      '</table>',
      '</div>'
    ].join('');

    const email = document.createElement('div');
    email.id = 'reward-email';
    email.className = 'nr-discount-subview';
    email.innerHTML = [
      '<div class="nr-email-template-grid">',
      '<div class="panel">',
      '<h3 style="margin-top:0;">Reward Email Template</h3>',
      '<div class="nr-field"><label>Email body</label><textarea id="reward-email-template-main">Thanks for leaving a review.\\n\\nHere is your unique {{ percentage }}% off code:\\n\\n{{ discount_code }}\\n\\nIt expires in {{ expiry_days }} days and can only be used once.</textarea></div>',
      '<button class="post-btn" type="button" id="nr-save-email-template">Save Email Template</button>',
      '</div>',
      '<div class="panel"><h3 style="margin-top:0;">Live Preview</h3><div id="reward-email-preview" class="nr-email-preview"></div></div>',
      '</div>'
    ].join('');

    const outline = document.createElement('div');
    outline.id = 'reward-function';
    outline.className = 'nr-discount-subview';
    outline.innerHTML = '<div class="panel"><h3 style="margin-top:0;">Function Outline</h3><p class="nr-muted">The server creates the code; Shopify applies it at checkout.</p></div>';

    section.appendChild(heading);
    section.appendChild(settings);
    section.appendChild(manual);
    section.appendChild(codes);
    section.appendChild(email);
    section.appendChild(outline);

    manager.parentElement.insertBefore(section, manager);
  }

  function showDiscountSub(sub) {
    ensureDiscountSection();

    document.querySelectorAll('.nr-discount-subview').forEach(view => {
      view.classList.toggle('active', view.id === `reward-${sub}`);
    });

    if (sub === 'codes') loadRewardCodes();
    if (sub === 'email') renderRewardEmailPreview();
  }

  function select(module, sub) {
    state.module = module || 'dashboard';
    state.sub = sub || 'overview';

    if (state.module === 'dashboard') {
      state.sub = 'overview';
      showView('v-dash');
      setTimeout(() => window.loadStats && window.loadStats(), 0);
    }

    if (state.module === 'reviews') {
      if (state.sub === 'manager') showView('v-mgr');
      if (state.sub === 'campaigns') showView(q('v-campaigns') ? 'v-campaigns' : 'v-msg');
      if (state.sub === 'trash') showView('v-trash');
      if (state.sub === 'import') showView('v-import');
    }

    if (state.module === 'discounts') {
      ensureDiscountSection();
      showView('v-discounts');
      showDiscountSub(state.sub || 'settings');
      loadRewardSettings();
    }

    updateTopActive();
    renderSidebar();
  }

  function backendApiBase() {
    return window.API || '/api';
  }

  async function loadRewardSettings() {
    try {
      const res = await fetch(`${backendApiBase()}/admin/review-reward-settings?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) return;

      const settings = await res.json();

      if (q('reward-enabled')) q('reward-enabled').checked = !!settings.enabled;
      if (q('reward-percentage')) q('reward-percentage').value = settings.percentage || 5;
      if (q('reward-expiry-days')) q('reward-expiry-days').value = settings.expiryDays || 60;
      if (q('reward-prefix')) q('reward-prefix').value = settings.prefix || 'GN';
      if (q('reward-email-template') && settings.emailTemplate) q('reward-email-template').value = settings.emailTemplate;
      if (q('reward-email-template-main') && settings.emailTemplate) q('reward-email-template-main').value = settings.emailTemplate;

      renderRewardEmailPreview();
    } catch (error) {
      console.warn('Reward settings load failed:', error);
    }
  }

  async function loadRewardCodes() {
    const body = q('reward-code-list');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(`${backendApiBase()}/admin/review-rewards?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Could not load reward codes');

      const rows = await res.json();

      if (!Array.isArray(rows) || !rows.length) {
        body.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      body.innerHTML = rows.map(row => {
        return `<tr><td><strong>${row.code || '—'}</strong></td><td>${row.email || '—'}</td><td>${row.status || 'issued'}</td><td>${row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—'}</td><td>${row.reviewId || '—'}</td></tr>`;
      }).join('');
    } catch (error) {
      body.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
    }
  }

  function renderRewardEmailPreview() {
    const preview = q('reward-email-preview');
    if (!preview) return;

    const templateBox = q('reward-email-template-main') || q('reward-email-template');
    const template = templateBox ? templateBox.value : '';

    preview.textContent = template
      .replaceAll('{{ discount_code }}', 'GN-SAMPLE')
      .replaceAll('{{ expiry_days }}', '60')
      .replaceAll('{{ percentage }}', '5')
      .replaceAll('{{ customer_email }}', 'customer@example.com');
  }

  function hookActions() {
    document.addEventListener('click', function (event) {
      if (event.target && event.target.id === 'nr-save-reward-settings') {
        event.preventDefault();
        saveRewardSettings();
      }

      if (event.target && event.target.id === 'nr-save-email-template') {
        event.preventDefault();
        saveRewardSettings();
      }

      if (event.target && event.target.id === 'nr-create-manual-code') {
        event.preventDefault();
        createManualCode();
      }
    });
  }

  async function saveRewardSettings() {
    const templateBox = q('reward-email-template-main') || q('reward-email-template');

    const payload = {
      shopDomain: shopDomain(),
      enabled: !!q('reward-enabled')?.checked,
      percentage: Number(q('reward-percentage')?.value || 5),
      expiryDays: Number(q('reward-expiry-days')?.value || 60),
      prefix: String(q('reward-prefix')?.value || 'GN').trim().toUpperCase(),
      triggerStatus: q('reward-trigger-status')?.value || 'accepted',
      verifiedOnly: !!q('reward-verified-only')?.checked,
      combinesWith: {
        orderDiscounts: !!q('reward-combine-order')?.checked,
        productDiscounts: !!q('reward-combine-product')?.checked,
        shippingDiscounts: !!q('reward-combine-shipping')?.checked
      },
      emailTemplate: templateBox ? templateBox.value : ''
    };

    const res = await fetch(`${backendApiBase()}/admin/review-reward-settings`, {
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

  async function createManualCode() {
    const email = String(q('manual-reward-email')?.value || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      alert('Enter a valid customer email first.');
      return;
    }

    const result = q('manual-reward-result');
    if (result) result.textContent = 'Creating code...';

    const payload = {
      shopDomain: shopDomain(),
      email,
      code: String(q('manual-reward-code')?.value || '').trim(),
      prefix: String(q('manual-reward-prefix')?.value || 'GN').trim().toUpperCase(),
      percentage: Number(q('manual-reward-percentage')?.value || 5),
      expiryDays: Number(q('manual-reward-expiry-days')?.value || 60)
    };

    try {
      const res = await fetch(`${backendApiBase()}/admin/review-rewards/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || 'Could not create manual reward code');
      }

      const reward = json.reward || {};

      if (result) {
        result.innerHTML = `<div class="nr-muted">Manual reward code created</div><div class="nr-code-output">${reward.code}</div><div><strong>Email:</strong> ${reward.email}</div><div><strong>Discount:</strong> ${reward.percentage || payload.percentage}%</div><div><strong>Status:</strong> ${reward.status || 'issued'}</div>`;
      }
    } catch (error) {
      if (result) result.textContent = error.message;
      alert(error.message);
    }
  }

  window.nrSelectModule = select;
  window.tab = function (viewId) {
    if (viewId === 'v-dash') return select('dashboard', 'overview');
    if (viewId === 'v-mgr') return select('reviews', 'manager');
    if (viewId === 'v-msg' || viewId === 'v-campaigns') return select('reviews', 'campaigns');
    if (viewId === 'v-trash') return select('reviews', 'trash');
    if (viewId === 'v-import') return select('reviews', 'import');
    if (viewId === 'v-discounts') return select('discounts', state.sub || 'settings');
    showView(viewId);
  };

  window.rewardSubTab = function (sub) {
    return select('discounts', sub || 'settings');
  };

  function detectInitialState() {
    const active = document.querySelector('.view.active');

    if (active && active.id === 'v-mgr') {
      state.module = 'reviews';
      state.sub = 'manager';
    } else if (active && active.id === 'v-discounts') {
      state.module = 'discounts';
      state.sub = 'settings';
    } else {
      state.module = 'dashboard';
      state.sub = 'overview';
    }
  }

  function boot() {
    installCss();
    ensureDiscountSection();
    detectInitialState();
    ensureTopTabs();
    renderSidebar();
    updateTopActive();
  }

  hookActions();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  setTimeout(boot, 250);
  setTimeout(boot, 800);
})();
