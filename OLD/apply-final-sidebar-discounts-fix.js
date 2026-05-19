const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlPath = path.join(root, 'admin.html');
const jsPath = path.join(root, 'admin.js');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
  fs.writeFileSync(file, content);
}

let html = read(htmlPath);
let adminJs = read(jsPath);

const cleanCss = `
/* Final clean Nectar sidebar + discount rewards UI */
.nr-sidebar-group {
  display: grid;
  gap: 6px;
  margin: 8px 0 10px;
}

.nr-group-toggle {
  width: 100%;
  display: flex !important;
  justify-content: space-between;
  align-items: center;
}

.nr-group-items {
  display: none;
  padding-left: 10px;
  gap: 6px;
}

.nr-sidebar-group.open .nr-group-items {
  display: grid;
}

.nr-group-caret {
  font-size: 11px;
  opacity: 0.7;
}

.nr-nav-subtab {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text-light, #64748b);
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 800;
  cursor: pointer;
}

.nr-nav-subtab.active,
.nr-nav-subtab:hover {
  background: #ffffff;
  color: var(--text, #0f172a);
}

.nr-nav-parent-active {
  background: #ffffff !important;
  color: var(--text, #0f172a) !important;
}

.nr-tabbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.nr-tabbar button {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  padding: 10px 14px;
  border-radius: 999px;
  font-weight: 800;
  cursor: pointer;
}

.nr-tabbar button.active {
  background: var(--text, #0f172a);
  color: #fff;
  border-color: var(--text, #0f172a);
}

.nr-discount-subview {
  display: none;
}

.nr-discount-subview.active {
  display: block;
}

.nr-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.nr-field label,
.nr-toggle-line {
  display: block;
  color: var(--text, #0f172a);
  font-weight: 800;
  margin-bottom: 8px;
}

.nr-field input,
.nr-field select,
.nr-field textarea {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  font: inherit;
  background: #fff;
}

.nr-field textarea {
  min-height: 150px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.nr-muted {
  color: var(--text-light, #64748b);
  font-size: 13px;
  line-height: 1.5;
}

.nr-code-table {
  width: 100%;
  border-collapse: collapse;
}

.nr-code-table th,
.nr-code-table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  font-size: 13px;
}

.nr-code-table th {
  color: var(--text-light, #64748b);
  text-transform: uppercase;
  font-size: 11px;
}

.nr-badge {
  display: inline-flex;
  border-radius: 999px;
  padding: 5px 9px;
  background: #f2f4f7;
  font-size: 12px;
  font-weight: 800;
}

.nr-badge.used,
.nr-badge.deleted {
  background: #ecfdf3;
  color: #067647;
}

.nr-badge.failed {
  background: #fef3f2;
  color: #b42318;
}

.nr-badge.expired {
  background: #fffaeb;
  color: #b54708;
}

@media (max-width: 900px) {
  .nr-form-grid {
    grid-template-columns: 1fr;
  }
}
`;

if (!html.includes('Final clean Nectar sidebar + discount rewards UI')) {
  if (html.includes('</style>')) {
    html = html.replace('</style>', `${cleanCss}\n</style>`);
  } else {
    html = html.replace('</head>', `<style>${cleanCss}</style>\n</head>`);
  }
}

const cleanManageNav = `
<div class="nav-group">
  <p class="nav-title">Manage</p>

  <button class="tab-btn active" data-final-nav-target="v-dash" onclick="window.tab('v-dash')">
    Dashboard Overview
  </button>

  <div class="nr-sidebar-group open" id="nr-reviews-group">
    <button class="tab-btn nr-group-toggle" type="button" onclick="window.toggleNectarNavGroup('nr-reviews-group')">
      <span>Reviews</span>
      <span class="nr-group-caret">▾</span>
    </button>

    <div class="nr-group-items">
      <button class="nr-nav-subtab" data-final-nav-target="v-mgr" onclick="window.tab('v-mgr')">Review Manager</button>
      <button class="nr-nav-subtab" data-final-nav-target="v-msg" onclick="window.tab('v-msg')">Messaging &amp; Campaigns ✉️</button>
      <button class="nr-nav-subtab" data-final-nav-target="v-trash" onclick="window.tab('v-trash')">Trash 🗑️</button>
      <button class="nr-nav-subtab" data-final-nav-target="v-import" onclick="window.tab('v-import')">Import CSV</button>
    </div>
  </div>

  <div class="nr-sidebar-group" id="nr-discounts-group">
    <button class="tab-btn nr-group-toggle" type="button" onclick="window.toggleNectarNavGroup('nr-discounts-group')">
      <span>Discount Rewards</span>
      <span class="nr-group-caret">▾</span>
    </button>

    <div class="nr-group-items">
      <button class="nr-nav-subtab" data-final-nav-target="v-discounts-settings" onclick="window.tab('v-discounts'); window.rewardSubTab('settings')">Settings</button>
      <button class="nr-nav-subtab" data-final-nav-target="v-discounts-codes" onclick="window.tab('v-discounts'); window.rewardSubTab('codes')">Generated Codes</button>
      <button class="nr-nav-subtab" data-final-nav-target="v-discounts-function" onclick="window.tab('v-discounts'); window.rewardSubTab('function')">Function Outline</button>
    </div>
  </div>
</div>
`;

const manageNavRegex = /<div class="nav-group">\s*<p class="nav-title">Manage<\/p>[\s\S]*?<\/div>\s*(?=<div class="nav-group">\s*<p class="nav-title">Configuration<\/p>)/i;

if (manageNavRegex.test(html)) {
  html = html.replace(manageNavRegex, `${cleanManageNav}\n`);
} else {
  console.warn('Static Manage nav replacement did not match. Runtime JS fallback will still clean it in the browser.');
}

const discountSection = `
<section id="v-discounts" class="view">
  <h2 class="page-title">Discount Rewards</h2>

  <div class="nr-tabbar">
    <button class="active" data-reward-tab="settings" onclick="window.rewardSubTab('settings')">Settings</button>
    <button data-reward-tab="codes" onclick="window.rewardSubTab('codes')">Generated Codes</button>
    <button data-reward-tab="function" onclick="window.rewardSubTab('function')">Function Outline</button>
  </div>

  <div id="reward-settings" class="nr-discount-subview active">
    <div class="grid-2">
      <div class="panel">
        <h3 style="margin-top:0;">Review Reward Settings</h3>
        <p class="nr-muted">Create unique Shopify discount codes when a customer leaves an eligible review.</p>

        <div class="nr-form-grid">
          <div class="nr-field">
            <label>Enable reward codes</label>
            <label class="nr-toggle-line">
              <input type="checkbox" id="reward-enabled" />
              Issue codes automatically
            </label>
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
            <input id="reward-prefix" value="NECTAR" />
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
            <label class="nr-toggle-line">
              <input type="checkbox" id="reward-verified-only" checked />
              Verified purchases only
            </label>
          </div>
        </div>

        <h4>Combine with</h4>
        <div class="nr-form-grid">
          <label class="nr-toggle-line"><input type="checkbox" id="reward-combine-order" checked /> Order discounts</label>
          <label class="nr-toggle-line"><input type="checkbox" id="reward-combine-product" checked /> Product / BOGO discounts</label>
          <label class="nr-toggle-line"><input type="checkbox" id="reward-combine-shipping" checked /> Free shipping discounts</label>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:18px;">
          <button class="post-btn" onclick="window.saveRewardSettings()">Save Reward Settings</button>
          <button class="secondary-btn" onclick="window.loadRewardSettings()">Refresh</button>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-top:0;">Reward Email Format</h3>
        <p class="nr-muted">Use this copy after a reward code is issued.</p>

        <div class="nr-field">
          <label>Email copy</label>
          <textarea id="reward-email-template">Thanks for leaving a review.

Here is your unique 5% off code:

{{ discount_code }}

It expires in {{ expiry_days }} days and can only be used once.</textarea>
        </div>

        <p class="nr-muted">
          The code is unique, expires after the configured window, and should be deleted/disabled after use by the webhook.
        </p>
      </div>
    </div>
  </div>

  <div id="reward-codes" class="nr-discount-subview">
    <div class="panel">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
        <div>
          <h3 style="margin:0;">Generated Reward Codes</h3>
          <p class="nr-muted" style="margin:6px 0 0;">Latest review discount codes generated by the app.</p>
        </div>
        <button class="secondary-btn" onclick="window.loadRewardCodes()">Refresh Codes</button>
      </div>

      <div style="overflow:auto; margin-top:18px;">
        <table class="nr-code-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Email</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody id="reward-code-list">
            <tr><td colspan="5">No codes loaded yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="reward-function" class="nr-discount-subview">
    <div class="panel">
      <h3 style="margin-top:0;">Discount Function Outline</h3>
      <p class="nr-muted">
        The server creates the unique code. The Shopify Function reads the reward config and returns a 5% order-level discount.
      </p>

      <div class="nr-field">
        <label>Function behaviour</label>
        <textarea readonly>Input:
- discount metafield: nectar_reviews.reward_config
- buyer identity email, when available

Output:
- order subtotal discount
- percentage from config, default 5
- no product-line discount, to reduce clashes with BOGO/free item logic
- combine flags controlled when the code is created</textarea>
      </div>
    </div>
  </div>
</section>
`;

if (!html.includes('id="v-discounts"')) {
  const marker = '<section id="v-mgr" class="view">';
  if (html.includes(marker)) {
    html = html.replace(marker, `${discountSection}\n\n${marker}`);
  } else {
    console.warn('Could not insert v-discounts statically. Runtime JS fallback will insert it.');
  }
}

write(htmlPath, html);

const finalJs = `

/* -------------------------------------------------------------------------- */
/* Final clean Nectar sidebar + Discount Rewards behaviour */
/* -------------------------------------------------------------------------- */

(function () {
  if (window.__nectarFinalSidebarDiscountsLoaded) return;
  window.__nectarFinalSidebarDiscountsLoaded = true;

  const discountSectionHtml = ${JSON.stringify(discountSection)};

  function getApiBase() {
    return typeof API !== 'undefined' && API ? API : '/api';
  }

  function getShopDomain() {
    if (typeof SHOP_DOMAIN !== 'undefined' && SHOP_DOMAIN) return SHOP_DOMAIN;
    const params = new URLSearchParams(window.location.search);
    return params.get('shopDomain') || params.get('shop') || '';
  }

  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  function q(id) {
    return document.getElementById(id);
  }

  window.toggleNectarNavGroup = function(groupId) {
    const group = q(groupId);
    if (group) group.classList.toggle('open');
  };

  function ensureDiscountSection() {
    if (q('v-discounts')) return;

    const manager = q('v-mgr');
    if (manager) {
      manager.insertAdjacentHTML('beforebegin', discountSectionHtml);
    }
  }

  function cleanDashboardOverview() {
    const dash = q('v-dash');
    if (!dash) return;

    dash.querySelectorAll('.panel').forEach(panel => {
      const txt = (panel.textContent || '').trim();
      if (/Discount Rewards/i.test(txt)) {
        panel.remove();
      }
    });
  }

  function finalCleanSidebar() {
    const manageTitle = Array.from(document.querySelectorAll('.nav-title'))
      .find(el => (el.textContent || '').trim().toLowerCase() === 'manage');

    if (!manageTitle) return;

    const manageGroup = manageTitle.closest('.nav-group');
    if (!manageGroup) return;

    if (manageGroup.dataset.finalCleanNectarNav === 'true') return;

    manageGroup.dataset.finalCleanNectarNav = 'true';
    manageGroup.innerHTML = \`
      <p class="nav-title">Manage</p>

      <button class="tab-btn active" data-final-nav-target="v-dash" onclick="window.tab('v-dash')">
        Dashboard Overview
      </button>

      <div class="nr-sidebar-group open" id="nr-reviews-group">
        <button class="tab-btn nr-group-toggle" type="button" onclick="window.toggleNectarNavGroup('nr-reviews-group')">
          <span>Reviews</span>
          <span class="nr-group-caret">▾</span>
        </button>

        <div class="nr-group-items">
          <button class="nr-nav-subtab" data-final-nav-target="v-mgr" onclick="window.tab('v-mgr')">Review Manager</button>
          <button class="nr-nav-subtab" data-final-nav-target="v-msg" onclick="window.tab('v-msg')">Messaging &amp; Campaigns ✉️</button>
          <button class="nr-nav-subtab" data-final-nav-target="v-trash" onclick="window.tab('v-trash')">Trash 🗑️</button>
          <button class="nr-nav-subtab" data-final-nav-target="v-import" onclick="window.tab('v-import')">Import CSV</button>
        </div>
      </div>

      <div class="nr-sidebar-group" id="nr-discounts-group">
        <button class="tab-btn nr-group-toggle" type="button" onclick="window.toggleNectarNavGroup('nr-discounts-group')">
          <span>Discount Rewards</span>
          <span class="nr-group-caret">▾</span>
        </button>

        <div class="nr-group-items">
          <button class="nr-nav-subtab" data-final-nav-target="v-discounts-settings" onclick="window.tab('v-discounts'); window.rewardSubTab('settings')">Settings</button>
          <button class="nr-nav-subtab" data-final-nav-target="v-discounts-codes" onclick="window.tab('v-discounts'); window.rewardSubTab('codes')">Generated Codes</button>
          <button class="nr-nav-subtab" data-final-nav-target="v-discounts-function" onclick="window.tab('v-discounts'); window.rewardSubTab('function')">Function Outline</button>
        </div>
      </div>
    \`;
  }

  function setActiveSidebar(viewId, rewardTab) {
    document.querySelectorAll('[data-final-nav-target]').forEach(el => {
      el.classList.remove('active');
    });

    document.querySelectorAll('.nr-group-toggle').forEach(el => {
      el.classList.remove('nr-nav-parent-active');
    });

    if (viewId === 'v-dash') {
      const dash = document.querySelector('[data-final-nav-target="v-dash"]');
      if (dash) dash.classList.add('active');
      return;
    }

    if (['v-mgr', 'v-msg', 'v-trash', 'v-import'].includes(viewId)) {
      const group = q('nr-reviews-group');
      if (group) group.classList.add('open');

      const parent = document.querySelector('#nr-reviews-group .nr-group-toggle');
      if (parent) parent.classList.add('nr-nav-parent-active');

      const target = document.querySelector('[data-final-nav-target="' + viewId + '"]');
      if (target) target.classList.add('active');
      return;
    }

    if (viewId === 'v-discounts') {
      const group = q('nr-discounts-group');
      if (group) group.classList.add('open');

      const parent = document.querySelector('#nr-discounts-group .nr-group-toggle');
      if (parent) parent.classList.add('nr-nav-parent-active');

      const key = rewardTab || 'settings';
      const target = document.querySelector('[data-final-nav-target="v-discounts-' + key + '"]');
      if (target) target.classList.add('active');
    }
  }

  window.rewardSubTab = function(id) {
    ensureDiscountSection();

    document.querySelectorAll('.nr-discount-subview').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-reward-tab]').forEach(el => el.classList.remove('active'));

    const view = q('reward-' + id);
    const btn = document.querySelector('[data-reward-tab="' + id + '"]');

    if (view) view.classList.add('active');
    if (btn) btn.classList.add('active');

    setActiveSidebar('v-discounts', id);

    if (id === 'codes') window.loadRewardCodes();
  };

  function setInput(id, value, fallback) {
    const el = q(id);
    if (!el) return;
    el.value = value ?? fallback ?? '';
  }

  function setCheck(id, value) {
    const el = q(id);
    if (!el) return;
    el.checked = !!value;
  }

  window.loadRewardSettings = async function() {
    ensureDiscountSection();

    try {
      const res = await fetch(\`\${getApiBase()}/admin/review-reward-settings?shopDomain=\${encodeURIComponent(getShopDomain())}&t=\${Date.now()}\`);

      if (!res.ok) return;

      const s = await res.json();

      setCheck('reward-enabled', s.enabled);
      setInput('reward-percentage', s.percentage, 5);
      setInput('reward-expiry-days', s.expiryDays, 60);
      setInput('reward-prefix', s.prefix, 'NECTAR');
      setInput('reward-trigger-status', s.triggerStatus, 'accepted');
      setCheck('reward-verified-only', s.verifiedOnly !== false);
      setCheck('reward-combine-order', s.combinesWith?.orderDiscounts !== false);
      setCheck('reward-combine-product', s.combinesWith?.productDiscounts !== false);
      setCheck('reward-combine-shipping', s.combinesWith?.shippingDiscounts !== false);

      if (q('reward-email-template') && s.emailTemplate) {
        q('reward-email-template').value = s.emailTemplate;
      }
    } catch (error) {
      console.warn('Reward settings load failed:', error);
    }
  };

  window.saveRewardSettings = async function() {
    ensureDiscountSection();

    const payload = {
      shopDomain: getShopDomain(),
      enabled: !!q('reward-enabled')?.checked,
      percentage: Number(q('reward-percentage')?.value || 5),
      expiryDays: Number(q('reward-expiry-days')?.value || 60),
      prefix: String(q('reward-prefix')?.value || 'NECTAR').trim().toUpperCase(),
      triggerStatus: q('reward-trigger-status')?.value || 'accepted',
      verifiedOnly: !!q('reward-verified-only')?.checked,
      combinesWith: {
        orderDiscounts: !!q('reward-combine-order')?.checked,
        productDiscounts: !!q('reward-combine-product')?.checked,
        shippingDiscounts: !!q('reward-combine-shipping')?.checked
      },
      emailTemplate: q('reward-email-template')?.value || ''
    };

    try {
      const res = await fetch(\`\${getApiBase()}/admin/review-reward-settings\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Backend reward settings endpoint is not available yet.');
      }

      toast('Reward settings saved');
    } catch (error) {
      alert(error.message);
    }
  };

  window.loadRewardCodes = async function() {
    ensureDiscountSection();

    const tbody = q('reward-code-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(\`\${getApiBase()}/admin/review-rewards?shopDomain=\${encodeURIComponent(getShopDomain())}&t=\${Date.now()}\`);

      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="5">Backend reward code endpoint is not available yet.</td></tr>';
        return;
      }

      const rows = await res.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(row => {
        const status = row.status || 'issued';
        const expires = row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—';

        return \`
          <tr>
            <td><strong>\${row.code || '—'}</strong></td>
            <td>\${row.email || '—'}</td>
            <td><span class="nr-badge \${status}">\${status}</span></td>
            <td>\${expires}</td>
            <td>\${row.reviewId || '—'}</td>
          </tr>
        \`;
      }).join('');
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
    }
  };

  const originalTab = window.tab;

  window.tab = function(id) {
    ensureDiscountSection();

    if (typeof originalTab === 'function') {
      originalTab(id);
    }

    finalCleanSidebar();
    cleanDashboardOverview();
    setActiveSidebar(id);

    if (id === 'v-discounts') {
      window.loadRewardSettings();
    }

    if (id === 'v-dash' && typeof window.loadStats === 'function') {
      window.loadStats();
    }
  };

  function bootCleanNav() {
    ensureDiscountSection();
    finalCleanSidebar();
    cleanDashboardOverview();

    const activeView = document.querySelector('.view.active');
    if (activeView) {
      setActiveSidebar(activeView.id);
    } else if (typeof window.tab === 'function') {
      window.tab('v-dash');
    }
  }

  document.addEventListener('DOMContentLoaded', bootCleanNav);
  setTimeout(bootCleanNav, 250);
  setTimeout(bootCleanNav, 1000);
  setTimeout(bootCleanNav, 2000);
})();
`;

if (!adminJs.includes('Final clean Nectar sidebar + Discount Rewards behaviour')) {
  adminJs += finalJs;
}

write(jsPath, adminJs);

console.log('Done. Applied final sidebar + Discount Rewards fix to admin.html and admin.js.');
