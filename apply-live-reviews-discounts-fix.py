from pathlib import Path
import re

root = Path.cwd()
public_dir = root / "public"
public_dir.mkdir(exist_ok=True)

admin_html_path = root / "admin.html"
server_path = root / "server.js"
nav_path = public_dir / "admin-hotfix-nav.js"

# ---------------------------------------------------------------------------
# 1. Stable admin navigation + discounts frontend
# ---------------------------------------------------------------------------

nav_js = r"""
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
"""

nav_path.write_text(nav_js)

# ---------------------------------------------------------------------------
# 2. Ensure admin.html loads base admin.js and the hotfix nav script
# ---------------------------------------------------------------------------

html = admin_html_path.read_text()

# Remove older experimental nav scripts.
html = re.sub(r'\s*<script[^>]+admin-nav-stable\.js[^>]*></script>\s*', '\n', html)
html = re.sub(r'\s*<script[^>]+admin-nav-top-buttons-fix\.js[^>]*></script>\s*', '\n', html)
html = re.sub(r'\s*<script[^>]+admin-nav-dom\.js[^>]*></script>\s*', '\n', html)
html = re.sub(r'\s*<script[^>]+admin-hotfix-nav\.js[^>]*></script>\s*', '\n', html)

scripts = []
if not re.search(r'<script[^>]+admin\.js[^>]*></script>', html):
    scripts.append('<script src="/admin.js?v=base-live-1"></script>')

scripts.append('<script src="/admin-hotfix-nav.js?v=live-ready-1"></script>')
script_block = '  ' + '\n  '.join(scripts) + '\n'

if '</body>' in html:
    html = html.replace('</body>', script_block + '</body>')
else:
    html += '\n' + script_block

admin_html_path.write_text(html)

# ---------------------------------------------------------------------------
# 3. Add missing reward discount backend routes
# ---------------------------------------------------------------------------

server = server_path.read_text()

if "const crypto = require('crypto')" not in server and 'const crypto = require("crypto")' not in server:
    # Put it near the top, safely.
    first_require = re.search(r'const\s+.+?=\s+require\(.+?\);\s*', server)
    if first_require:
        insert_at = first_require.end()
        server = server[:insert_at] + "\nconst crypto = require('crypto');" + server[insert_at:]
    else:
        server = "const crypto = require('crypto');\n" + server

backend_marker = "/* Nectar reward discount live backend */"

backend = r"""
/* -------------------------------------------------------------------------- */
/* Nectar reward discount live backend                                        */
/* -------------------------------------------------------------------------- */

const reviewRewardSettingSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  percentage: { type: Number, default: 5 },
  expiryDays: { type: Number, default: 60 },
  prefix: { type: String, default: 'GN' },
  triggerStatus: { type: String, enum: ['pending', 'accepted'], default: 'accepted' },
  verifiedOnly: { type: Boolean, default: true },
  combinesWith: {
    orderDiscounts: { type: Boolean, default: true },
    productDiscounts: { type: Boolean, default: true },
    shippingDiscounts: { type: Boolean, default: true }
  },
  emailTemplate: {
    type: String,
    default: 'Thanks for leaving a review.\n\nHere is your unique {{ percentage }}% off code:\n\n{{ discount_code }}\n\nIt expires in {{ expiry_days }} days and can only be used once.'
  }
}, { timestamps: true });

const ReviewRewardSetting =
  mongoose.models.ReviewRewardSetting ||
  mongoose.model('ReviewRewardSetting', reviewRewardSettingSchema, 'review_reward_settings');

const reviewRewardCodeSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  code: { type: String, required: true, unique: true, index: true },
  shopifyDiscountId: { type: String, default: '' },
  percentage: { type: Number, default: 5 },
  status: {
    type: String,
    enum: ['issued', 'used', 'expired', 'deleted', 'failed'],
    default: 'issued',
    index: true
  },
  failureReason: { type: String, default: '' },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  orderId: { type: String, default: '' },
  manual: { type: Boolean, default: false }
}, { timestamps: true });

const ReviewRewardCode =
  mongoose.models.ReviewRewardCode ||
  mongoose.model('ReviewRewardCode', reviewRewardCodeSchema, 'review_reward_codes');

function defaultRewardSettings(shopDomain) {
  return {
    shopDomain,
    enabled: false,
    percentage: 5,
    expiryDays: 60,
    prefix: 'GN',
    triggerStatus: 'accepted',
    verifiedOnly: true,
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true
    },
    emailTemplate: 'Thanks for leaving a review.\n\nHere is your unique {{ percentage }}% off code:\n\n{{ discount_code }}\n\nIt expires in {{ expiry_days }} days and can only be used once.'
  };
}

function normaliseRewardSettings(raw, shopDomain) {
  const base = defaultRewardSettings(shopDomain);
  const s = raw ? (raw.toObject ? raw.toObject() : raw) : {};

  return {
    ...base,
    ...s,
    percentage: Math.max(1, Math.min(100, Number(s.percentage || base.percentage))),
    expiryDays: Math.max(1, Math.min(365, Number(s.expiryDays || base.expiryDays))),
    prefix: String(s.prefix || base.prefix).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 18) || 'GN',
    combinesWith: {
      ...base.combinesWith,
      ...(s.combinesWith || {})
    }
  };
}

function generateRewardCode(prefix = 'GN') {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function sanitizeRewardCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

async function createShopifyBasicRewardDiscount({ shopDomain, code, settings, startsAt, endsAt }) {
  const mutation = `
    mutation CreateBasicRewardCode($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              startsAt
              endsAt
              codes(first: 1) {
                nodes { code }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const percentageDecimal = Math.max(0.01, Math.min(1, Number(settings.percentage || 5) / 100));

  const variables = {
    basicCodeDiscount: {
      title: `Nectar review reward - ${code}`,
      code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: percentageDecimal },
        items: { all: true }
      },
      combinesWith: settings.combinesWith || {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true
      }
    }
  };

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  const json = await shopifyFetch(`/admin/api/${apiVersion}/graphql.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables })
  });

  const errors = json.data?.discountCodeBasicCreate?.userErrors || [];

  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(', '));
  }

  const node = json.data?.discountCodeBasicCreate?.codeDiscountNode;

  if (!node?.id) {
    throw new Error('Shopify did not return a discount ID');
  }

  return {
    discountId: node.id,
    status: node.codeDiscount?.status || 'ACTIVE'
  };
}

async function createRewardForEmail({ shopDomain, email, reviewId = null, manual = false, requested = {} }) {
  const savedSettings = await ReviewRewardSetting.findOne({ shopDomain });
  const settings = normaliseRewardSettings(savedSettings, shopDomain);

  if (requested.percentage) settings.percentage = Math.max(1, Math.min(100, Number(requested.percentage)));
  if (requested.expiryDays) settings.expiryDays = Math.max(1, Math.min(365, Number(requested.expiryDays)));
  if (requested.prefix) settings.prefix = String(requested.prefix).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 18) || settings.prefix;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + settings.expiryDays * 24 * 60 * 60 * 1000);

  let code = sanitizeRewardCode(requested.code);

  if (!code) {
    for (let i = 0; i < 10; i += 1) {
      const candidate = generateRewardCode(settings.prefix);
      const exists = await ReviewRewardCode.findOne({ code: candidate }).lean();
      if (!exists) {
        code = candidate;
        break;
      }
    }
  }

  if (!code) throw new Error('Could not generate a unique reward code');

  const existing = await ReviewRewardCode.findOne({ code }).lean();
  if (existing) throw new Error('That reward code already exists');

  const reward = await ReviewRewardCode.create({
    shopDomain,
    reviewId,
    email,
    code,
    percentage: settings.percentage,
    startsAt,
    endsAt,
    manual,
    status: 'issued'
  });

  try {
    const shopifyDiscount = await createShopifyBasicRewardDiscount({
      shopDomain,
      code,
      settings,
      startsAt,
      endsAt
    });

    reward.shopifyDiscountId = shopifyDiscount.discountId;
    reward.status = 'issued';
    await reward.save();

    return reward;
  } catch (error) {
    reward.status = 'failed';
    reward.failureReason = error.message || 'Shopify discount creation failed';
    await reward.save();
    throw error;
  }
}

app.get('/api/admin/review-reward-settings', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);

    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const settings = await ReviewRewardSetting.findOne({ shopDomain });
    return res.json(normaliseRewardSettings(settings, shopDomain));
  } catch (error) {
    console.error('Load review reward settings failed:', error);
    return res.status(500).json({ error: 'Could not load review reward settings' });
  }
});

app.patch('/api/admin/review-reward-settings', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.query.shopDomain);

    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const incoming = normaliseRewardSettings(req.body || {}, shopDomain);

    const saved = await ReviewRewardSetting.findOneAndUpdate(
      { shopDomain },
      { $set: incoming },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json(normaliseRewardSettings(saved, shopDomain));
  } catch (error) {
    console.error('Save review reward settings failed:', error);
    return res.status(500).json({ error: error.message || 'Could not save review reward settings' });
  }
});

app.get('/api/admin/review-rewards', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);

    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const rewards = await ReviewRewardCode.find({ shopDomain })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(rewards.map((reward) => ({
      id: reward._id,
      reviewId: reward.reviewId,
      email: reward.email,
      code: reward.code,
      status: reward.status,
      percentage: reward.percentage,
      startsAt: reward.startsAt,
      endsAt: reward.endsAt,
      usedAt: reward.usedAt,
      failureReason: reward.failureReason,
      manual: reward.manual
    })));
  } catch (error) {
    console.error('Load review rewards failed:', error);
    return res.status(500).json({ error: 'Could not load review rewards' });
  }
});

app.post('/api/admin/review-rewards/manual', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.query.shopDomain);
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid customer email is required' });
    }

    const reward = await createRewardForEmail({
      shopDomain,
      email,
      manual: true,
      requested: req.body || {}
    });

    return res.json({
      created: true,
      reward: {
        id: reward._id,
        reviewId: reward.reviewId,
        email: reward.email,
        code: reward.code,
        status: reward.status,
        percentage: reward.percentage,
        startsAt: reward.startsAt,
        endsAt: reward.endsAt,
        shopifyDiscountId: reward.shopifyDiscountId
      }
    });
  } catch (error) {
    console.error('Manual review reward creation failed:', error);
    return res.status(500).json({ error: error.message || 'Could not create manual reward code' });
  }
});

app.post('/api/reviews/:id/reward', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) return res.status(404).json({ error: 'Review not found' });

    const shopDomain = cleanShopDomain(req.body?.shopDomain || req.query.shopDomain || review.shopDomain);
    const settings = normaliseRewardSettings(await ReviewRewardSetting.findOne({ shopDomain }), shopDomain);

    if (!settings.enabled) return res.json({ skipped: true, reason: 'reward_settings_disabled' });
    if (!review.email) return res.json({ skipped: true, reason: 'review_has_no_email' });
    if (settings.verifiedOnly && !review.verifiedPurchase) return res.json({ skipped: true, reason: 'not_verified_purchase' });
    if (settings.triggerStatus === 'accepted' && review.status !== 'accepted') {
      return res.json({ skipped: true, reason: 'review_not_accepted' });
    }

    const existing = await ReviewRewardCode.findOne({ shopDomain, reviewId: review._id }).lean();

    if (existing) {
      return res.json({ skipped: true, reason: 'reward_already_exists', reward: existing });
    }

    const reward = await createRewardForEmail({
      shopDomain,
      email: String(review.email).toLowerCase(),
      reviewId: review._id,
      manual: false,
      requested: {}
    });

    return res.json({ created: true, reward });
  } catch (error) {
    console.error('Issue review reward failed:', error);
    return res.status(500).json({ error: error.message || 'Could not issue review reward' });
  }
});
"""

if backend_marker not in server:
    listen_match = re.search(r'\n\s*app\.listen\s*\(', server)
    if not listen_match:
        raise SystemExit("Could not find app.listen in server.js")

    server = server[:listen_match.start()] + "\n" + backend + "\n" + server[listen_match.start():]

server_path.write_text(server)

print("Patched admin.html, public/admin-hotfix-nav.js, and server.js")
