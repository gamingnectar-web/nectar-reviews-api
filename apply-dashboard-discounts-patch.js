const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlPath = path.join(root, 'admin.html');
const jsPath = path.join(root, 'admin.js');
const serverPath = path.join(root, 'server.js');

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
let server = read(serverPath);

/* ----------------------------- admin.html CSS ----------------------------- */

const discountCss = `
/* Nectar dashboard + reward discount additions */
.nr-nav-dropdown {
  display: grid;
  gap: 6px;
}

.nr-dropdown-toggle {
  display: flex !important;
  justify-content: space-between;
  align-items: center;
}

.nr-nav-subtabs {
  display: none;
  padding-left: 12px;
  gap: 6px;
}

.nr-nav-dropdown.open .nr-nav-subtabs {
  display: grid;
}

.nr-nav-subtab {
  border: 0;
  background: transparent;
  color: var(--muted);
  text-align: left;
  padding: 8px 12px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.nr-nav-subtab.active,
.nr-nav-subtab:hover {
  background: #ffffff;
  color: var(--text);
}

.nr-dashboard-strip {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 18px;
  margin-bottom: 28px;
}

.nr-mini-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.nr-mini-card {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 16px;
  padding: 16px;
}

.nr-mini-card p {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.nr-mini-card strong {
  font-size: 24px;
  letter-spacing: -0.04em;
}

.nr-discount-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 7px 11px;
  background: #ecfdf3;
  color: #067647;
  font-weight: 800;
  font-size: 12px;
}

.nr-discount-status.off {
  background: #fef3f2;
  color: #b42318;
}

.nr-action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.nr-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.nr-field label,
.nr-toggle-line {
  display: block;
  color: var(--text);
  font-weight: 800;
  margin-bottom: 8px;
}

.nr-field input,
.nr-field select,
.nr-field textarea {
  width: 100%;
  border: 1px solid var(--border);
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
  color: var(--muted);
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
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.nr-code-table th {
  color: var(--muted);
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

.nr-badge.used { background: #ecfdf3; color: #067647; }
.nr-badge.failed { background: #fef3f2; color: #b42318; }
.nr-badge.expired { background: #fffaeb; color: #b54708; }

.nr-tabbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.nr-tabbar button {
  border: 1px solid var(--border);
  background: #fff;
  padding: 10px 14px;
  border-radius: 999px;
  font-weight: 800;
  cursor: pointer;
}

.nr-tabbar button.active {
  background: var(--text);
  color: #fff;
  border-color: var(--text);
}

.nr-discount-subview {
  display: none;
}

.nr-discount-subview.active {
  display: block;
}

@media (max-width: 1100px) {
  .nr-dashboard-strip,
  .nr-form-grid {
    grid-template-columns: 1fr;
  }

  .nr-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .nr-mini-grid {
    grid-template-columns: 1fr;
  }
}
`;

if (!html.includes('Nectar dashboard + reward discount additions')) {
  html = html.replace('</style>', `${discountCss}\n</style>`);
}

/* --------------------------- admin.html left nav --------------------------- */

const oldDashboardButton = `<button class="tab-btn active" onclick="window.tab('v-dash')">Dashboard</button>`;

const newDashboardDropdown = `
<div class="nr-nav-dropdown open" id="nr-dashboard-dropdown">
  <button class="tab-btn active nr-dropdown-toggle" onclick="window.tab('v-dash'); window.toggleDashboardNav(true)">
    <span>Dashboard</span>
    <span>▾</span>
  </button>
  <div class="nr-nav-subtabs">
    <button class="nr-nav-subtab active" data-nr-subtab="v-dash" onclick="window.tab('v-dash')">Overview</button>
    <button class="nr-nav-subtab" data-nr-subtab="v-discounts" onclick="window.tab('v-discounts')">Discount Rewards</button>
  </div>
</div>`;

if (!html.includes('id="nr-dashboard-dropdown"')) {
  if (!html.includes(oldDashboardButton)) {
    throw new Error('Could not find Dashboard button in admin.html');
  }
  html = html.replace(oldDashboardButton, newDashboardDropdown);
}

/* --------------------- admin.html dashboard summary boxes ------------------ */

const dashboardInsertAfter = `<div id="nr-dashboard-analytics-mount"></div>`;

const dashboardBoxes = `
<div class="nr-dashboard-strip">
  <div class="panel">
    <div class="nr-action-row" style="justify-content: space-between; margin-bottom: 16px;">
      <div>
        <h3 style="margin:0;">Reviews Summary</h3>
        <p class="nr-muted" style="margin:6px 0 0;">Live overview of review performance and moderation workload.</p>
      </div>
      <button class="secondary-btn" onclick="window.tab('v-mgr')">Open Review Manager</button>
    </div>

    <div class="nr-mini-grid">
      <div class="nr-mini-card">
        <p>Total</p>
        <strong id="dash-reviews-total">0</strong>
      </div>
      <div class="nr-mini-card">
        <p>Live</p>
        <strong id="dash-reviews-live">0</strong>
      </div>
      <div class="nr-mini-card">
        <p>Pending</p>
        <strong id="dash-reviews-pending">0</strong>
      </div>
      <div class="nr-mini-card">
        <p>Average</p>
        <strong id="dash-reviews-average">0.0</strong>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="nr-action-row" style="justify-content: space-between; margin-bottom: 16px;">
      <div>
        <h3 style="margin:0;">Discount Rewards</h3>
        <p class="nr-muted" style="margin:6px 0 0;">5% review reward codes, 60-day expiry and one-use tracking.</p>
      </div>
      <span id="dash-discount-status" class="nr-discount-status off">Disabled</span>
    </div>

    <div class="nr-mini-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
      <div class="nr-mini-card">
        <p>Issued</p>
        <strong id="dash-discounts-issued">0</strong>
      </div>
      <div class="nr-mini-card">
        <p>Used</p>
        <strong id="dash-discounts-used">0</strong>
      </div>
      <div class="nr-mini-card">
        <p>Active</p>
        <strong id="dash-discounts-active">0</strong>
      </div>
    </div>

    <div class="nr-action-row" style="margin-top: 16px;">
      <button class="primary-btn" onclick="window.tab('v-discounts')">Configure Discounts</button>
    </div>
  </div>
</div>`;

if (!html.includes('dash-discounts-issued')) {
  if (!html.includes(dashboardInsertAfter)) {
    throw new Error('Could not find dashboard analytics mount in admin.html');
  }
  html = html.replace(dashboardInsertAfter, `${dashboardInsertAfter}\n${dashboardBoxes}`);
}

/* ---------------------- admin.html discount settings page ------------------ */

const reviewManagerSection = `<section id="v-mgr" class="view">`;

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
        <h3 style="margin-top: 0;">Review Reward Settings</h3>
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

        <div class="nr-action-row" style="margin-top: 18px;">
          <button class="primary-btn" onclick="window.saveRewardSettings()">Save Reward Settings</button>
          <button class="secondary-btn" onclick="window.loadRewardSettings()">Refresh</button>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-top: 0;">Reward Email Format</h3>
        <p class="nr-muted">Use this in the email after a review reward is issued. The API stores the actual code per customer.</p>

        <div class="nr-field">
          <label>Email copy</label>
          <textarea id="reward-email-template">Thanks for leaving a review.

Here is your unique 5% off code:

{{ discount_code }}

It expires in {{ expiry_days }} days and can only be used once.</textarea>
        </div>

        <div class="nr-action-row" style="margin-top: 12px;">
          <button class="secondary-btn" onclick="window.copyRewardEmailTemplate()">Copy Template</button>
        </div>

        <hr style="border:0; border-top:1px solid var(--border); margin:20px 0;" />

        <h4>Environment required</h4>
        <p class="nr-muted">
          Add <code>SHOPIFY_REVIEW_REWARD_FUNCTION_ID</code> and make sure your app has <code>write_discounts</code>.
        </p>
      </div>
    </div>
  </div>

  <div id="reward-codes" class="nr-discount-subview">
    <div class="panel">
      <div class="nr-action-row" style="justify-content: space-between;">
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
            <tr><td colspan="5">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="reward-function" class="nr-discount-subview">
    <div class="panel">
      <h3 style="margin-top: 0;">Discount Function Outline</h3>
      <p class="nr-muted">
        This is the checkout-side logic. The server creates a code discount with config metafields; the Function reads those metafields and returns a 5% order-level reward.
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
  if (!html.includes(reviewManagerSection)) {
    throw new Error('Could not find Review Manager section in admin.html');
  }
  html = html.replace(reviewManagerSection, `${discountSection}\n${reviewManagerSection}`);
}

write(htmlPath, html);

/* ------------------------------- admin.js -------------------------------- */

const dashboardJs = `

/* -------------------------------------------------------------------------- */
/* Dashboard dropdown + review reward discount admin */
/* -------------------------------------------------------------------------- */

(function () {
  const q = (id) => document.getElementById(id);

  window.toggleDashboardNav = function(forceOpen) {
    const dropdown = q('nr-dashboard-dropdown');
    if (!dropdown) return;
    if (forceOpen === true) dropdown.classList.add('open');
    else dropdown.classList.toggle('open');
  };

  window.rewardSubTab = function(id) {
    document.querySelectorAll('.nr-discount-subview').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-reward-tab]').forEach(el => el.classList.remove('active'));

    const target = q('reward-' + id);
    const button = document.querySelector('[data-reward-tab="' + id + '"]');

    if (target) target.classList.add('active');
    if (button) button.classList.add('active');

    if (id === 'codes') window.loadRewardCodes();
  };

  const originalTab = window.tab;
  window.tab = function(id) {
    if (typeof originalTab === 'function') originalTab(id);

    const isDashboardArea = id === 'v-dash' || id === 'v-discounts';
    const dropdown = q('nr-dashboard-dropdown');
    const dropdownButton = dropdown ? dropdown.querySelector('.nr-dropdown-toggle') : null;

    if (dropdown) dropdown.classList.toggle('open', isDashboardArea);
    if (dropdownButton) dropdownButton.classList.toggle('active', isDashboardArea);

    document.querySelectorAll('.nr-nav-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nrSubtab === id);
    });

    if (id === 'v-dash') window.loadDashboardOverview();
    if (id === 'v-discounts') {
      window.loadRewardSettings();
      window.loadRewardCodes();
    }
  };

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function setText(id, value) {
    const el = q(id);
    if (el) el.textContent = value;
  }

  window.loadDashboardOverview = async function() {
    try {
      const res = await fetch(\`\${API}/admin/dashboard?shopDomain=\${encodeURIComponent(SHOP_DOMAIN)}&t=\${Date.now()}\`);
      if (!res.ok) return;
      const json = await res.json();

      setText('dash-reviews-total', json.reviews?.total || 0);
      setText('dash-reviews-live', json.reviews?.live || 0);
      setText('dash-reviews-pending', json.reviews?.pending || 0);
      setText('dash-reviews-average', number(json.reviews?.averageRating).toFixed(1));

      setText('dash-discounts-issued', json.rewards?.issued || 0);
      setText('dash-discounts-used', json.rewards?.used || 0);
      setText('dash-discounts-active', json.rewards?.active || 0);

      const status = q('dash-discount-status');
      if (status) {
        const enabled = !!json.rewardSettings?.enabled;
        status.textContent = enabled ? 'Enabled' : 'Disabled';
        status.classList.toggle('off', !enabled);
      }
    } catch (error) {
      console.warn('Dashboard overview failed:', error);
    }
  };

  window.loadRewardSettings = async function() {
    try {
      const res = await fetch(\`\${API}/admin/review-reward-settings?shopDomain=\${encodeURIComponent(SHOP_DOMAIN)}&t=\${Date.now()}\`);
      if (!res.ok) return;
      const s = await res.json();

      if (q('reward-enabled')) q('reward-enabled').checked = !!s.enabled;
      if (q('reward-percentage')) q('reward-percentage').value = s.percentage ?? 5;
      if (q('reward-expiry-days')) q('reward-expiry-days').value = s.expiryDays ?? 60;
      if (q('reward-prefix')) q('reward-prefix').value = s.prefix || 'NECTAR';
      if (q('reward-trigger-status')) q('reward-trigger-status').value = s.triggerStatus || 'accepted';
      if (q('reward-verified-only')) q('reward-verified-only').checked = s.verifiedOnly !== false;
      if (q('reward-combine-order')) q('reward-combine-order').checked = s.combinesWith?.orderDiscounts !== false;
      if (q('reward-combine-product')) q('reward-combine-product').checked = s.combinesWith?.productDiscounts !== false;
      if (q('reward-combine-shipping')) q('reward-combine-shipping').checked = s.combinesWith?.shippingDiscounts !== false;
      if (q('reward-email-template')) q('reward-email-template').value = s.emailTemplate || q('reward-email-template').value;
    } catch (error) {
      console.warn('Reward settings load failed:', error);
    }
  };

  window.saveRewardSettings = async function() {
    const payload = {
      shopDomain: SHOP_DOMAIN,
      enabled: !!q('reward-enabled')?.checked,
      percentage: number(q('reward-percentage')?.value, 5),
      expiryDays: number(q('reward-expiry-days')?.value, 60),
      prefix: (q('reward-prefix')?.value || 'NECTAR').trim().toUpperCase(),
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
      const res = await fetch(\`\${API}/admin/review-reward-settings\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not save reward settings');
      }

      window.showToast('Reward settings saved');
      window.loadDashboardOverview();
    } catch (error) {
      alert(error.message);
    }
  };

  window.loadRewardCodes = async function() {
    const tbody = q('reward-code-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(\`\${API}/admin/review-rewards?shopDomain=\${encodeURIComponent(SHOP_DOMAIN)}&t=\${Date.now()}\`);
      if (!res.ok) throw new Error('Could not load reward codes');
      const rows = await res.json();

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(row => {
        const expires = row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—';
        const status = row.status || 'issued';
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

  window.copyRewardEmailTemplate = function() {
    const el = q('reward-email-template');
    if (!el) return;
    el.select();
    document.execCommand('copy');
    window.showToast('Reward email template copied');
  };

  const originalUpdateStatus = window.updateStatus;
  window.updateStatus = async function(id, status) {
    if (typeof originalUpdateStatus === 'function') {
      await originalUpdateStatus(id, status);
    }

    if (status === 'accepted') {
      try {
        const res = await fetch(\`\${API}/reviews/\${id}/reward\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopDomain: SHOP_DOMAIN })
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok && json.created) window.showToast('Review reward discount issued');
        if (res.ok && json.skipped) console.log('Reward skipped:', json.reason);
      } catch (error) {
        console.warn('Reward issue failed:', error);
      }
    }

    window.loadDashboardOverview();
  };

  setTimeout(() => {
    window.loadDashboardOverview();
    window.loadRewardSettings();
  }, 600);
})();
`;

if (!adminJs.includes('Dashboard dropdown + review reward discount admin')) {
  if (adminJs.includes('window.load();')) {
    adminJs = adminJs.replace(/window\.load\(\);\s*$/, `${dashboardJs}\nwindow.load();\n`);
  } else {
    adminJs += `\n${dashboardJs}\n`;
  }
}

write(jsPath, adminJs);

/* ------------------------------- server.js -------------------------------- */

const serverAddon = `

/* -------------------------------------------------------------------------- */
/* Review reward discount codes */
/* -------------------------------------------------------------------------- */

const reviewRewardSettingSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  percentage: { type: Number, default: 5 },
  expiryDays: { type: Number, default: 60 },
  prefix: { type: String, default: 'NECTAR' },
  triggerStatus: { type: String, enum: ['pending', 'accepted'], default: 'accepted' },
  verifiedOnly: { type: Boolean, default: true },
  combinesWith: {
    orderDiscounts: { type: Boolean, default: true },
    productDiscounts: { type: Boolean, default: true },
    shippingDiscounts: { type: Boolean, default: true }
  },
  emailTemplate: { type: String, default: '' }
}, { timestamps: true });

const ReviewRewardSetting =
  mongoose.models.ReviewRewardSetting ||
  mongoose.model('ReviewRewardSetting', reviewRewardSettingSchema, 'review_reward_settings');

const reviewRewardCodeSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  code: { type: String, required: true, unique: true, index: true },
  shopifyDiscountId: { type: String, default: '' },
  percentage: { type: Number, default: 5 },
  status: {
    type: String,
    enum: ['issued', 'used', 'expired', 'deleted', 'failed', 'skipped'],
    default: 'issued',
    index: true
  },
  failureReason: { type: String, default: '' },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  orderId: { type: String, default: '' }
}, { timestamps: true });

reviewRewardCodeSchema.index({ shopDomain: 1, email: 1, reviewId: 1 }, { unique: true });
reviewRewardCodeSchema.index({ shopDomain: 1, status: 1, createdAt: -1 });

const ReviewRewardCode =
  mongoose.models.ReviewRewardCode ||
  mongoose.model('ReviewRewardCode', reviewRewardCodeSchema, 'review_reward_codes');

function defaultRewardSettings(shopDomain) {
  return {
    shopDomain,
    enabled: false,
    percentage: 5,
    expiryDays: 60,
    prefix: 'NECTAR',
    triggerStatus: 'accepted',
    verifiedOnly: true,
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true
    },
    emailTemplate: 'Thanks for leaving a review. Your unique code is {{ discount_code }} and expires in {{ expiry_days }} days.'
  };
}

function normaliseRewardSettings(raw, shopDomain) {
  const base = defaultRewardSettings(shopDomain);
  const s = raw ? raw.toObject ? raw.toObject() : raw : {};
  return {
    ...base,
    ...s,
    percentage: Math.max(1, Math.min(100, Number(s.percentage || base.percentage))),
    expiryDays: Math.max(1, Math.min(365, Number(s.expiryDays || base.expiryDays))),
    prefix: String(s.prefix || base.prefix).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 18) || 'NECTAR',
    combinesWith: {
      ...base.combinesWith,
      ...(s.combinesWith || {})
    }
  };
}

function generateRewardCode(prefix = 'NECTAR') {
  return \`\${prefix}-\${crypto.randomBytes(5).toString('hex').toUpperCase()}\`;
}

async function createShopifyReviewRewardDiscount({ code, review, settings, startsAt, endsAt }) {
  const functionId = process.env.SHOPIFY_REVIEW_REWARD_FUNCTION_ID;

  if (!functionId) {
    throw new Error('Missing SHOPIFY_REVIEW_REWARD_FUNCTION_ID env var');
  }

  const mutation = \`
    mutation CreateReviewRewardCode($codeAppDiscount: DiscountCodeAppInput!) {
      discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
        codeAppDiscount {
          discountId
          title
          status
          startsAt
          endsAt
          codes(first: 1) {
            nodes { code }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  \`;

  const variables = {
    codeAppDiscount: {
      title: \`Nectar review reward - \${code}\`,
      code,
      functionId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      combinesWith: settings.combinesWith,
      context: { all: true },
      metafields: [
        {
          namespace: 'nectar_reviews',
          key: 'reward_config',
          type: 'json',
          value: JSON.stringify({
            type: 'review_reward',
            percentage: settings.percentage,
            email: String(review.email || '').toLowerCase(),
            reviewId: String(review._id),
            expiresAt: endsAt.toISOString()
          })
        }
      ]
    }
  };

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
  const json = await shopifyFetch(\`/admin/api/\${apiVersion}/graphql.json\`, {
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables })
  });

  const errors = json.data?.discountCodeAppCreate?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map(e => e.message).join(', '));
  }

  const created = json.data?.discountCodeAppCreate?.codeAppDiscount;
  if (!created?.discountId) {
    throw new Error('Shopify did not return a discount ID');
  }

  return created;
}

async function deleteShopifyDiscountCode(discountId) {
  if (!discountId) return;

  const mutation = \`
    mutation DeleteReviewRewardCode($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors { field message code }
      }
    }
  \`;

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  const json = await shopifyFetch(\`/admin/api/\${apiVersion}/graphql.json\`, {
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables: { id: discountId } })
  });

  const errors = json.data?.discountCodeDelete?.userErrors || [];
  if (errors.length) {
    console.warn('Could not delete reward discount:', errors);
  }
}

async function issueRewardForReview(review, force = false) {
  const shopDomain = cleanShopDomain(review.shopDomain);
  const savedSettings = await ReviewRewardSetting.findOne({ shopDomain });
  const settings = normaliseRewardSettings(savedSettings, shopDomain);

  if (!settings.enabled && !force) return { skipped: true, reason: 'reward_settings_disabled' };
  if (!review.email) return { skipped: true, reason: 'review_has_no_email' };
  if (settings.verifiedOnly && !review.verifiedPurchase) return { skipped: true, reason: 'not_verified_purchase' };
  if (settings.triggerStatus === 'accepted' && review.status !== 'accepted') return { skipped: true, reason: 'review_not_accepted' };

  const existing = await ReviewRewardCode.findOne({ shopDomain, reviewId: review._id });
  if (existing) return { skipped: true, reason: 'reward_already_exists', reward: existing };

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + settings.expiryDays * 24 * 60 * 60 * 1000);
  const code = generateRewardCode(settings.prefix);

  const reward = await ReviewRewardCode.create({
    shopDomain,
    reviewId: review._id,
    email: String(review.email).toLowerCase(),
    code,
    percentage: settings.percentage,
    startsAt,
    endsAt,
    status: 'issued'
  });

  try {
    const shopifyDiscount = await createShopifyReviewRewardDiscount({
      code,
      review,
      settings,
      startsAt,
      endsAt
    });

    reward.shopifyDiscountId = shopifyDiscount.discountId;
    reward.status = 'issued';
    await reward.save();

    return { created: true, reward };
  } catch (error) {
    reward.status = 'failed';
    reward.failureReason = error.message || 'Shopify discount creation failed';
    await reward.save();
    throw error;
  }
}

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const reviews = await Review.find({
      shopDomain,
      isDeleted: false,
      isTestReview: { $ne: true }
    }).lean();

    const rewards = await ReviewRewardCode.find({ shopDomain }).lean();
    const settings = normaliseRewardSettings(await ReviewRewardSetting.findOne({ shopDomain }), shopDomain);

    const live = reviews.filter(r => r.status === 'accepted');
    const ratingSum = live.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);

    const now = new Date();

    return res.json({
      reviews: {
        total: reviews.length,
        live: live.length,
        pending: reviews.filter(r => r.status === 'pending').length,
        hold: reviews.filter(r => r.status === 'hold').length,
        averageRating: live.length ? Number((ratingSum / live.length).toFixed(1)) : 0
      },
      rewards: {
        issued: rewards.length,
        active: rewards.filter(r => r.status === 'issued' && new Date(r.endsAt) > now).length,
        used: rewards.filter(r => r.status === 'used').length,
        expired: rewards.filter(r => r.status === 'expired' || new Date(r.endsAt) <= now).length,
        failed: rewards.filter(r => r.status === 'failed').length
      },
      rewardSettings: settings
    });
  } catch (error) {
    console.error('Dashboard endpoint failed:', error);
    return res.status(500).json({ error: 'Could not load dashboard' });
  }
});

app.get('/api/admin/review-reward-settings', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const settings = await ReviewRewardSetting.findOne({ shopDomain });
    return res.json(normaliseRewardSettings(settings, shopDomain));
  } catch (error) {
    return res.status(500).json({ error: 'Could not load reward settings' });
  }
});

app.patch('/api/admin/review-reward-settings', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain);
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const incoming = normaliseRewardSettings(req.body, shopDomain);

    const saved = await ReviewRewardSetting.findOneAndUpdate(
      { shopDomain },
      { $set: incoming },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json(normaliseRewardSettings(saved, shopDomain));
  } catch (error) {
    console.error('Save reward settings failed:', error);
    return res.status(500).json({ error: error.message || 'Could not save reward settings' });
  }
});

app.get('/api/admin/review-rewards', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const rewards = await ReviewRewardCode.find({ shopDomain })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(rewards.map(r => ({
      id: r._id,
      reviewId: r.reviewId,
      email: r.email,
      code: r.code,
      status: r.status,
      percentage: r.percentage,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      usedAt: r.usedAt,
      failureReason: r.failureReason
    })));
  } catch (error) {
    return res.status(500).json({ error: 'Could not load reward codes' });
  }
});

app.post('/api/reviews/:id/reward', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const requestedShop = cleanShopDomain(req.body?.shopDomain || req.query.shopDomain || review.shopDomain);
    if (requestedShop && requestedShop !== cleanShopDomain(review.shopDomain)) {
      return res.status(403).json({ error: 'Shop mismatch' });
    }

    const result = await issueRewardForReview(review);
    return res.json(result);
  } catch (error) {
    console.error('Issue review reward failed:', error);
    return res.status(500).json({ error: error.message || 'Could not issue reward' });
  }
});

app.post('/api/webhooks/orders-paid/reward-discounts', async (req, res) => {
  try {
    const order = req.body || {};
    const shopDomain = cleanShopDomain(req.headers['x-shopify-shop-domain'] || req.query.shopDomain || order.shop_domain);
    const discountCodes = [
      ...(order.discount_codes || []).map(d => d.code),
      ...(order.discount_applications || []).map(d => d.code)
    ].filter(Boolean);

    if (!shopDomain || !discountCodes.length) return res.json({ ok: true, matched: 0 });

    const rewards = await ReviewRewardCode.find({
      shopDomain,
      code: { $in: discountCodes },
      status: { $ne: 'used' }
    });

    for (const reward of rewards) {
      reward.status = 'used';
      reward.usedAt = new Date();
      reward.orderId = String(order.id || order.admin_graphql_api_id || '');
      await reward.save();

      try {
        await deleteShopifyDiscountCode(reward.shopifyDiscountId);
        reward.status = 'deleted';
        reward.deletedAt = new Date();
        await reward.save();
      } catch (error) {
        console.warn('Reward code used but delete failed:', reward.code, error.message);
      }
    }

    return res.json({ ok: true, matched: rewards.length });
  } catch (error) {
    console.error('Reward order webhook failed:', error);
    return res.status(500).json({ error: 'Reward webhook failed' });
  }
});
`;

if (!server.includes('Review reward discount codes')) {
  const listenMatch = server.match(/\n\s*app\.listen\s*\(/);
  if (listenMatch) {
    server = server.replace(listenMatch[0], `\n${serverAddon}\n${listenMatch[0]}`);
  } else {
    server += `\n${serverAddon}\n`;
  }
}

write(serverPath, server);

/* ---------------------- Shopify Function outline files --------------------- */

const extDir = path.join(root, 'extensions', 'review-reward-discount');
const srcDir = path.join(extDir, 'src');
fs.mkdirSync(srcDir, { recursive: true });

const extensionToml = `name = "Nectar Review Reward"
type = "function"
api_version = "2026-04"

[[extensions.targeting]]
target = "cart.lines.discounts.generate.run"
input_query = "src/cart_lines_discounts_generate_run.graphql"
export = "cartLinesDiscountsGenerateRun"
`;

const functionQuery = `query RunInput {
  discount {
    discountClasses
    metafield(namespace: "nectar_reviews", key: "reward_config") {
      value
    }
  }
  cart {
    buyerIdentity {
      email
      customer {
        email
      }
    }
    lines {
      id
    }
  }
}
`;

const functionRun = `// Nectar Reviews - review reward discount function
// This is the checkout-side Function outline.
// Deploy it through Shopify CLI as a discount function extension.

export function cartLinesDiscountsGenerateRun(input) {
  const empty = { operations: [] };

  let config = {};
  try {
    config = JSON.parse(input.discount?.metafield?.value || '{}');
  } catch (error) {
    return empty;
  }

  const percentage = Number(config.percentage || 5);
  if (!percentage || percentage <= 0) return empty;

  const requiredEmail = String(config.email || '').toLowerCase().trim();
  const buyerEmail = String(
    input.cart?.buyerIdentity?.email ||
    input.cart?.buyerIdentity?.customer?.email ||
    ''
  ).toLowerCase().trim();

  // If buyer email is available, guard the reward code against another logged-in buyer.
  // Guest checkout might not provide email at this point, so Shopify usageLimit: 1 is still the fallback guard.
  if (requiredEmail && buyerEmail && requiredEmail !== buyerEmail) {
    return empty;
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: 'Review reward',
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: []
                  }
                }
              ],
              value: {
                percentage: {
                  value: percentage.toString()
                }
              }
            }
          ],
          selectionStrategy: 'FIRST'
        }
      }
    ]
  };
}
`;

fs.writeFileSync(path.join(extDir, 'shopify.extension.toml'), extensionToml);
fs.writeFileSync(path.join(srcDir, 'cart_lines_discounts_generate_run.graphql'), functionQuery);
fs.writeFileSync(path.join(srcDir, 'cart_lines_discounts_generate_run.js'), functionRun);

console.log('Done. Patched admin.html, admin.js, server.js and created extensions/review-reward-discount.');
