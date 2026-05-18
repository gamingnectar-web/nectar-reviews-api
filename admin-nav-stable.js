(function () {
  if (window.__NECTAR_STABLE_NAV__) return;
  window.__NECTAR_STABLE_NAV__ = true;

  const state = { module: 'dashboard', sub: 'overview' };

  function q(id) {
    return document.getElementById(id);
  }

  function installCss() {
    if (q('nr-stable-nav-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-stable-nav-style';
    style.textContent = `
      .nr-primary-tabs {
        display: flex !important;
        align-items: center;
        gap: 10px;
        margin: 0 0 24px;
        padding: 0 0 18px;
        border-bottom: 1px solid var(--border, #e2e8f0);
        position: relative;
        z-index: 50;
      }

      .nr-primary-tab {
        display: inline-flex !important;
        border: 1px solid var(--border, #e2e8f0);
        background: #fff;
        color: var(--text, #0f172a);
        border-radius: 999px;
        padding: 11px 18px;
        font-weight: 900;
        cursor: pointer;
        white-space: nowrap;
      }

      .nr-primary-tab.active {
        background: var(--text, #0f172a);
        color: #fff;
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
        background: #fff;
      }

      #v-discounts > .nr-tabbar {
        display: none !important;
      }

      .nr-discount-subview {
        display: none;
      }

      .nr-discount-subview.active {
        display: block;
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
        background: #fff;
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
    `;
    document.head.appendChild(style);
  }

  function contentRoot() {
    const firstView = document.querySelector('.view');
    return firstView && firstView.parentElement ? firstView.parentElement : document.body;
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach(view => {
      const active = view.id === id;
      view.classList.toggle('active', active);
      view.style.display = active ? '' : 'none';
    });
  }

  function ensureTopTabs() {
    let tabs = q('nr-primary-tabs');

    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'nr-primary-tabs';
      tabs.className = 'nr-primary-tabs';

      const root = contentRoot();
      const firstView = root.querySelector('.view');

      if (firstView) root.insertBefore(tabs, firstView);
      else root.insertBefore(tabs, root.firstChild);
    }

    tabs.innerHTML = `
      <button type="button" class="nr-primary-tab" data-nr-module="dashboard" data-nr-sub="overview">Dashboard</button>
      <button type="button" class="nr-primary-tab" data-nr-module="reviews" data-nr-sub="manager">Reviews</button>
      <button type="button" class="nr-primary-tab" data-nr-module="discounts" data-nr-sub="settings">Discount Rewards</button>
    `;

    updateTopActive();
  }

  function updateTopActive() {
    document.querySelectorAll('.nr-primary-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nrModule === state.module);
    });
  }

  function findSidebarGroup() {
    const groups = Array.from(document.querySelectorAll('.nav-group'));

    if (groups.length) {
      const configuration = groups.find(g => /configuration/i.test(g.textContent || ''));
      const developers = groups.find(g => /developers/i.test(g.textContent || ''));
      return groups.find(g => g !== configuration && g !== developers) || groups[0];
    }

    const labels = Array.from(document.querySelectorAll('.section-label, .nav-title'));
    const manage = labels.find(el => /manage|dashboard|reviews/i.test(el.textContent || ''));
    return manage ? manage.parentElement : null;
  }

  function sideButton(label, module, sub) {
    const active = state.module === module && state.sub === sub ? ' active' : '';
    return `<button type="button" class="nr-side-tab${active}" data-nr-module="${module}" data-nr-sub="${sub}">${label}</button>`;
  }

  function renderSidebar() {
    const group = findSidebarGroup();
    if (!group) return;

    let title = 'Dashboard';
    let buttons = sideButton('Overview', 'dashboard', 'overview');

    if (state.module === 'reviews') {
      title = 'Reviews';
      buttons = [
        sideButton('Review Manager', 'reviews', 'manager'),
        sideButton('Messaging & Campaigns', 'reviews', 'campaigns'),
        sideButton('Trash', 'reviews', 'trash'),
        sideButton('Import CSV', 'reviews', 'import')
      ].join('');
    }

    if (state.module === 'discounts') {
      title = 'Discount Rewards';
      buttons = [
        sideButton('Settings', 'discounts', 'settings'),
        sideButton('Manual Code', 'discounts', 'manual'),
        sideButton('Generated Codes', 'discounts', 'codes'),
        sideButton('Email Template', 'discounts', 'email'),
        sideButton('Function Outline', 'discounts', 'function')
      ].join('');
    }

    group.innerHTML = `<p class="nr-side-title">${title}</p><div class="nr-side-tabs">${buttons}</div>`;
  }

  function ensureDiscountSection() {
    if (q('v-discounts')) return;

    const manager = q('v-mgr');
    if (!manager) return;

    manager.insertAdjacentHTML('beforebegin', `
      <section id="v-discounts" class="view" style="display:none;">
        <h2 class="page-title">Discount Rewards</h2>

        <div id="reward-settings" class="nr-discount-subview active">
          <div class="grid-2">
            <div class="panel">
              <h3 style="margin-top:0;">Review Reward Settings</h3>
              <p class="nr-muted">Create unique Shopify discount codes when a customer leaves an eligible review.</p>

              <div class="nr-field"><label>Enable reward codes</label><label><input type="checkbox" id="reward-enabled" /> Issue codes automatically</label></div>
              <div class="nr-field"><label>Reward percentage</label><input id="reward-percentage" type="number" min="1" max="100" value="5" /></div>
              <div class="nr-field"><label>Expiry window, days</label><input id="reward-expiry-days" type="number" min="1" max="365" value="60" /></div>
              <div class="nr-field"><label>Code prefix</label><input id="reward-prefix" value="GN" /></div>
              <div class="nr-field"><label>Issue when review status is</label><select id="reward-trigger-status"><option value="accepted">Accepted</option><option value="pending">Submitted / Pending</option></select></div>
              <div class="nr-field"><label>Verification rule</label><label><input type="checkbox" id="reward-verified-only" checked /> Verified purchases only</label></div>

              <h4>Combine with</h4>
              <label><input type="checkbox" id="reward-combine-order" checked /> Order discounts</label><br />
              <label><input type="checkbox" id="reward-combine-product" checked /> Product / BOGO discounts</label><br />
              <label><input type="checkbox" id="reward-combine-shipping" checked /> Free shipping discounts</label><br /><br />

              <button class="post-btn" type="button" data-nr-action="save-settings">Save Reward Settings</button>
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

        <div id="reward-manual" class="nr-discount-subview">
          <div class="nr-manual-code-grid">
            <div class="panel">
              <h3 style="margin-top:0;">Create Manual Reward Code</h3>
              <div class="nr-field"><label>Customer email</label><input id="manual-reward-email" type="email" placeholder="customer@example.com" /></div>
              <div class="nr-field"><label>Code prefix</label><input id="manual-reward-prefix" value="GN" /></div>
              <div class="nr-field"><label>Custom code, optional</label><input id="manual-reward-code" placeholder="Leave blank to auto-generate" /></div>
              <div class="nr-field"><label>Discount percentage</label><input id="manual-reward-percentage" type="number" min="1" max="100" value="5" /></div>
              <div class="nr-field"><label>Expiry window, days</label><input id="manual-reward-expiry-days" type="number" min="1" max="365" value="60" /></div>
              <button class="post-btn" type="button" data-nr-action="create-manual-code">Create Manual Code</button>
            </div>

            <div class="panel">
              <h3 style="margin-top:0;">Created Code</h3>
              <div id="manual-reward-result" class="nr-manual-result">Create a code to see the email copy here.</div>
            </div>
          </div>
        </div>

        <div id="reward-codes" class="nr-discount-subview">
          <div class="panel">
            <h3 style="margin-top:0;">Generated Reward Codes</h3>
            <table class="nr-code-table">
              <thead><tr><th>Code</th><th>Email</th><th>Status</th><th>Expires</th><th>Review</th></tr></thead>
              <tbody id="reward-code-list"><tr><td colspan="5">No codes loaded yet.</td></tr></tbody>
            </table>
          </div>
        </div>

        <div id="reward-email" class="nr-discount-subview">
          <div class="nr-email-template-grid">
            <div class="panel">
              <h3 style="margin-top:0;">Reward Email Template</h3>
              <div class="nr-field"><label>Email body</label><textarea id="reward-email-template-main">Thanks for leaving a review.

Here is your unique {{ percentage }}% off code:

{{ discount_code }}

It expires in {{ expiry_days }} days and can only be used once.</textarea></div>
              <button class="post-btn" type="button" data-nr-action="save-settings">Save Email Template</button>
            </div>

            <div class="panel">
              <h3 style="margin-top:0;">Live Preview</h3>
              <div id="reward-email-preview" class="nr-email-preview"></div>
            </div>
          </div>
        </div>

        <div id="reward-function" class="nr-discount-subview">
          <div class="panel">
            <h3 style="margin-top:0;">Function Outline</h3>
            <p class="nr-muted">The server creates the code; Shopify applies it at checkout.</p>
          </div>
        </div>
      </section>
    `);
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

  function apiBase() {
    return window.API || '/api';
  }

  function shopDomain() {
    return window.SHOP_DOMAIN || new URLSearchParams(window.location.search).get('shop') || '';
  }

  async function loadRewardSettings() {
    try {
      const res = await fetch(`${apiBase()}/admin/review-reward-settings?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) return;
      const s = await res.json();

      if (q('reward-enabled')) q('reward-enabled').checked = !!s.enabled;
      if (q('reward-percentage')) q('reward-percentage').value = s.percentage || 5;
      if (q('reward-expiry-days')) q('reward-expiry-days').value = s.expiryDays || 60;
      if (q('reward-prefix')) q('reward-prefix').value = s.prefix || 'GN';
      if (q('reward-email-template') && s.emailTemplate) q('reward-email-template').value = s.emailTemplate;
      if (q('reward-email-template-main') && s.emailTemplate) q('reward-email-template-main').value = s.emailTemplate;

      renderRewardEmailPreview();
    } catch (e) {
      console.warn('Reward settings load failed:', e);
    }
  }

  async function loadRewardCodes() {
    const tbody = q('reward-code-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(`${apiBase()}/admin/review-rewards?shopDomain=${encodeURIComponent(shopDomain())}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Could not load codes');
      const rows = await res.json();

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(row => `
        <tr>
          <td><strong>${row.code || '—'}</strong></td>
          <td>${row.email || '—'}</td>
          <td>${row.status || 'issued'}</td>
          <td>${row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—'}</td>
          <td>${row.reviewId || '—'}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
    }
  }

  function templateValue() {
    return (q('reward-email-template-main') || q('reward-email-template'))?.value || '';
  }

  function renderRewardEmailPreview() {
    const preview = q('reward-email-preview');
    if (!preview) return;

    preview.textContent = templateValue()
      .replaceAll('{{ discount_code }}', 'GN-SAMPLE')
      .replaceAll('{{ expiry_days }}', '60')
      .replaceAll('{{ percentage }}', '5')
      .replaceAll('{{ customer_email }}', 'customer@example.com');
  }

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nr-module][data-nr-sub]');
    if (nav) {
      event.preventDefault();
      select(nav.dataset.nrModule, nav.dataset.nrSub);
      return;
    }
  }, true);

  function detectInitialState() {
    const activeView = document.querySelector('.view.active');

    if (activeView?.id === 'v-mgr') {
      state.module = 'reviews';
      state.sub = 'manager';
    } else if (activeView?.id === 'v-discounts') {
      state.module = 'discounts';
      state.sub = 'settings';
    } else {
      state.module = 'dashboard';
      state.sub = 'overview';
    }
  }

  function boot() {
    installCss();
    detectInitialState();
    ensureDiscountSection();
    ensureTopTabs();
    renderSidebar();
    updateTopActive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  setTimeout(boot, 250);
})();
