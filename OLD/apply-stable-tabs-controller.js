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
let js = read(jsPath);

/* Remove old competing nav controllers */
const oldMarkers = [
  'Dashboard dropdown + review reward discount admin',
  'Cleaner sidebar navigation behaviour',
  'Force clean dashboard sidebar navigation',
  'Final clean Nectar sidebar + Discount Rewards behaviour',
  'Nectar top tabs, contextual sidebar, manual discounts and email templates',
  'Final contextual side tabs - replaces dropdown sidebar'
];

function removeBlockByMarker(content, marker) {
  let idx = content.indexOf(marker);

  while (idx !== -1) {
    let start = content.lastIndexOf('/* -------------------------------------------------------------------------- */', idx);
    if (start === -1 || idx - start > 800) {
      start = content.lastIndexOf('(function', idx);
    }
    if (start === -1) start = idx;

    let end = content.indexOf('\n})();', idx);
    if (end === -1) {
      content = content.slice(0, idx) + content.slice(idx + marker.length);
    } else {
      end += '\n})();'.length;
      content = content.slice(0, start) + '\n' + content.slice(end);
    }

    idx = content.indexOf(marker);
  }

  return content;
}

oldMarkers.forEach(marker => {
  js = removeBlockByMarker(js, marker);
});

/* Add stable CSS */
const css = `
/* Stable no-dropdown app navigation */
.nr-primary-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 24px;
  padding: 0 0 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.nr-primary-tab {
  border: 1px solid var(--border, #e2e8f0);
  background: #ffffff;
  color: var(--text, #0f172a);
  border-radius: 999px;
  padding: 11px 18px;
  font-weight: 900;
  cursor: pointer;
}

.nr-primary-tab.active {
  background: var(--text, #0f172a);
  color: #ffffff;
  border-color: var(--text, #0f172a);
}

.nr-side-title {
  margin: 0 0 8px;
  color: var(--text-light, #64748b);
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: 11px;
  font-weight: 950;
}

.nr-side-tabs {
  display: grid;
  gap: 8px;
  margin-top: 10px;
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
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 18px;
}

.nr-variable-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 14px;
}

.nr-variable-chip {
  border: 1px solid var(--border, #e2e8f0);
  background: #ffffff;
  border-radius: 999px;
  padding: 7px 10px;
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
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
  letter-spacing: 0.02em;
  margin: 8px 0 14px;
}

@media (max-width: 1000px) {
  .nr-primary-tabs {
    overflow-x: auto;
  }

  .nr-manual-code-grid,
  .nr-email-template-grid {
    grid-template-columns: 1fr;
  }
}
`;

if (!html.includes('Stable no-dropdown app navigation')) {
  if (html.includes('</style>')) {
    html = html.replace('</style>', `${css}\n</style>`);
  } else {
    html = html.replace('</head>', `<style>${css}</style>\n</head>`);
  }
}

/* One clean nav controller */
const stableJs = String.raw`

/* -------------------------------------------------------------------------- */
/* Stable no-dropdown app navigation controller                               */
/* -------------------------------------------------------------------------- */

(function () {
  if (window.__nectarStableTabsControllerLoaded) return;
  window.__nectarStableTabsControllerLoaded = true;

  const state = {
    module: 'dashboard',
    sub: 'overview',
    lastManualReward: null
  };

  const discountExtraHtml = [
    '<div id="reward-manual" class="nr-discount-subview">',
      '<div class="nr-manual-code-grid">',
        '<div class="panel">',
          '<h3 style="margin-top:0;">Create Manual Reward Code</h3>',
          '<p class="nr-muted">Create a one-use reward code for a customer email. Use this for testing and support cases.</p>',
          '<div class="nr-field"><label>Customer email</label><input id="manual-reward-email" type="email" placeholder="customer@example.com" /></div>',
          '<div class="nr-field"><label>Code prefix</label><input id="manual-reward-prefix" value="GN" /></div>',
          '<div class="nr-field"><label>Custom code, optional</label><input id="manual-reward-code" placeholder="Leave blank to auto-generate" /></div>',
          '<div class="nr-field"><label>Discount percentage</label><input id="manual-reward-percentage" type="number" min="1" max="100" value="5" /></div>',
          '<div class="nr-field"><label>Expiry window, days</label><input id="manual-reward-expiry-days" type="number" min="1" max="365" value="60" /></div>',
          '<button class="post-btn" onclick="window.createManualRewardCode()">Create Manual Code</button>',
        '</div>',
        '<div class="panel">',
          '<h3 style="margin-top:0;">Created Code</h3>',
          '<div id="manual-reward-result" class="nr-manual-result">Create a code to see the email copy here.</div>',
          '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">',
            '<button class="secondary-btn" onclick="window.copyManualRewardCode()">Copy Code</button>',
            '<button class="secondary-btn" onclick="window.copyManualRewardEmail()">Copy Email Copy</button>',
          '</div>',
        '</div>',
      '</div>',
    '</div>',

    '<div id="reward-email" class="nr-discount-subview">',
      '<div class="nr-email-template-grid">',
        '<div class="panel">',
          '<h3 style="margin-top:0;">Reward Email Template</h3>',
          '<p class="nr-muted">Design the email copy here. These variables are replaced when a code is generated.</p>',
          '<div class="nr-variable-row">',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\\'{{ discount_code }}\\')">{{ discount_code }}</button>',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\\'{{ expiry_days }}\\')">{{ expiry_days }}</button>',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\\'{{ percentage }}\\')">{{ percentage }}</button>',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\\'{{ customer_email }}\\')">{{ customer_email }}</button>',
          '</div>',
          '<div class="nr-field"><label>Email subject</label><input id="reward-email-subject" value="Your review reward code" /></div>',
          '<div class="nr-field">',
            '<label>Email body</label>',
            '<textarea id="reward-email-template-main">Thanks for leaving a review.\\n\\nHere is your unique {{ percentage }}% off code:\\n\\n{{ discount_code }}\\n\\nIt expires in {{ expiry_days }} days and can only be used once.</textarea>',
          '</div>',
          '<button class="post-btn" onclick="window.saveRewardSettings()">Save Email Template</button>',
        '</div>',
        '<div class="panel">',
          '<h3 style="margin-top:0;">Live Preview</h3>',
          '<div id="reward-email-preview" class="nr-email-preview"></div>',
          '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">',
            '<button class="secondary-btn" onclick="window.renderRewardEmailPreview()">Refresh Preview</button>',
            '<button class="secondary-btn" onclick="window.copyRewardEmailPreview()">Copy Preview</button>',
          '</div>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');

  function q(id) {
    return document.getElementById(id);
  }

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

  function contentRoot() {
    const firstView = document.querySelector('.view');
    return firstView ? firstView.parentElement : document.body;
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
      if (root) root.insertBefore(tabs, root.firstChild);
    }

    tabs.innerHTML = [
      '<button type="button" class="nr-primary-tab" data-stable-module="dashboard" data-stable-sub="overview">Dashboard</button>',
      '<button type="button" class="nr-primary-tab" data-stable-module="reviews" data-stable-sub="manager">Reviews</button>',
      '<button type="button" class="nr-primary-tab" data-stable-module="discounts" data-stable-sub="settings">Discount Rewards</button>'
    ].join('');

    tabs.querySelectorAll('.nr-primary-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.stableModule === state.module);
    });
  }

  function findSidebarManageGroup() {
    const groups = Array.from(document.querySelectorAll('.nav-group'));
    if (!groups.length) return null;

    const config = groups.find(g => /configuration/i.test(g.textContent || ''));
    const dev = groups.find(g => /developers/i.test(g.textContent || ''));

    return groups.find(g => g !== config && g !== dev) || groups[0];
  }

  function sideButton(label, module, sub) {
    const active = state.module === module && state.sub === sub ? ' active' : '';
    return '<button type="button" class="nr-side-tab' + active + '" data-stable-module="' + module + '" data-stable-sub="' + sub + '">' + label + '</button>';
  }

  function renderSidebar() {
    const group = findSidebarManageGroup();
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

    group.innerHTML = '<p class="nr-side-title">' + title + '</p><div class="nr-side-tabs">' + buttons + '</div>';
  }

  function ensureDiscountExtras() {
    const discountView = q('v-discounts');
    if (!discountView) return;

    if (!q('reward-manual')) {
      const settings = q('reward-settings');
      if (settings) settings.insertAdjacentHTML('afterend', discountExtraHtml);
      else discountView.insertAdjacentHTML('beforeend', discountExtraHtml);
    }

    syncEmailTemplateFields();
  }

  function showDiscountSub(sub) {
    ensureDiscountExtras();

    document.querySelectorAll('.nr-discount-subview').forEach(view => {
      view.classList.toggle('active', view.id === 'reward-' + sub);
    });

    if (sub === 'codes') loadRewardCodes();
    if (sub === 'email') renderRewardEmailPreview();
  }

  function select(module, sub) {
    state.module = module || 'dashboard';
    state.sub = sub || 'overview';

    ensureTopTabs();
    ensureDiscountExtras();

    if (state.module === 'dashboard') {
      state.sub = 'overview';
      showView('v-dash');
      if (typeof window.loadStats === 'function') window.loadStats();
      if (typeof window.loadDashboardOverview === 'function') window.loadDashboardOverview();
    }

    if (state.module === 'reviews') {
      if (state.sub === 'manager') showView('v-mgr');
      if (state.sub === 'campaigns') showView(q('v-campaigns') ? 'v-campaigns' : 'v-msg');
      if (state.sub === 'trash') showView('v-trash');
      if (state.sub === 'import') showView('v-import');
    }

    if (state.module === 'discounts') {
      showView('v-discounts');
      showDiscountSub(state.sub || 'settings');
      loadRewardSettings();
    }

    ensureTopTabs();
    renderSidebar();
  }

  window.nrSelectModule = select;

  window.tab = function(id) {
    if (id === 'v-dash') return select('dashboard', 'overview');
    if (id === 'v-mgr') return select('reviews', 'manager');
    if (id === 'v-campaigns' || id === 'v-msg') return select('reviews', 'campaigns');
    if (id === 'v-trash') return select('reviews', 'trash');
    if (id === 'v-import') return select('reviews', 'import');
    if (id === 'v-discounts') return select('discounts', state.sub || 'settings');
    showView(id);
  };

  window.rewardSubTab = function(sub) {
    return select('discounts', sub || 'settings');
  };

  document.addEventListener('click', function(event) {
    const btn = event.target.closest('[data-stable-module][data-stable-sub]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    select(btn.dataset.stableModule, btn.dataset.stableSub);
  }, true);

  function setText(id, value) {
    const el = q(id);
    if (el) el.textContent = value;
  }

  function setVal(id, value, fallback) {
    const el = q(id);
    if (el) el.value = value ?? fallback ?? '';
  }

  function setCheck(id, value) {
    const el = q(id);
    if (el) el.checked = !!value;
  }

  window.loadRewardSettings = async function() {
    try {
      const res = await fetch(getApiBase() + '/admin/review-reward-settings?shopDomain=' + encodeURIComponent(getShopDomain()) + '&t=' + Date.now());
      if (!res.ok) return;

      const s = await res.json();

      setCheck('reward-enabled', s.enabled);
      setVal('reward-percentage', s.percentage, 5);
      setVal('reward-expiry-days', s.expiryDays, 60);
      setVal('reward-prefix', s.prefix, 'GN');
      setVal('reward-trigger-status', s.triggerStatus, 'accepted');
      setCheck('reward-verified-only', s.verifiedOnly !== false);
      setCheck('reward-combine-order', s.combinesWith?.orderDiscounts !== false);
      setCheck('reward-combine-product', s.combinesWith?.productDiscounts !== false);
      setCheck('reward-combine-shipping', s.combinesWith?.shippingDiscounts !== false);

      if (q('reward-email-template')) q('reward-email-template').value = s.emailTemplate || q('reward-email-template').value;
      if (q('reward-email-template-main')) q('reward-email-template-main').value = s.emailTemplate || q('reward-email-template-main').value;

      syncEmailTemplateFields();
      renderRewardEmailPreview();
    } catch (error) {
      console.warn('Reward settings load failed:', error);
    }
  };

  window.saveRewardSettings = async function() {
    syncEmailTemplateFields();

    const payload = {
      shopDomain: getShopDomain(),
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
      emailTemplate: templateValue()
    };

    const res = await fetch(getApiBase() + '/admin/review-reward-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Could not save reward settings');
      return;
    }

    toast('Reward settings saved');
  };

  window.loadRewardCodes = async function() {
    const tbody = q('reward-code-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
      const res = await fetch(getApiBase() + '/admin/review-rewards?shopDomain=' + encodeURIComponent(getShopDomain()) + '&t=' + Date.now());

      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
        return;
      }

      const rows = await res.json();

      if (!Array.isArray(rows) || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(row => {
        const status = row.status || 'issued';
        const expires = row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—';

        return [
          '<tr>',
            '<td><strong>' + (row.code || '—') + '</strong></td>',
            '<td>' + (row.email || '—') + '</td>',
            '<td><span class="nr-badge ' + status + '">' + status + '</span></td>',
            '<td>' + expires + '</td>',
            '<td>' + (row.reviewId || '—') + '</td>',
          '</tr>'
        ].join('');
      }).join('');
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
    }
  };

  function getTemplateBox() {
    return q('reward-email-template-main') || q('reward-email-template');
  }

  function syncEmailTemplateFields() {
    const oldBox = q('reward-email-template');
    const newBox = q('reward-email-template-main');

    if (oldBox && newBox) {
      if (oldBox.value && oldBox.value !== newBox.value) newBox.value = oldBox.value;
      oldBox.value = newBox.value;
    }

    if (q('manual-reward-prefix') && q('reward-prefix')) q('manual-reward-prefix').value = q('reward-prefix').value || 'GN';
    if (q('manual-reward-percentage') && q('reward-percentage')) q('manual-reward-percentage').value = q('reward-percentage').value || 5;
    if (q('manual-reward-expiry-days') && q('reward-expiry-days')) q('manual-reward-expiry-days').value = q('reward-expiry-days').value || 60;
  }

  function templateValue() {
    const box = getTemplateBox();
    return box ? box.value : 'Thanks for leaving a review. Your code is {{ discount_code }}.';
  }

  function fillTemplate(template, reward) {
    const r = reward || {};
    return String(template || '')
      .replaceAll('{{ discount_code }}', r.code || 'GN-SAMPLE')
      .replaceAll('{{ expiry_days }}', String(r.expiryDays || 60))
      .replaceAll('{{ percentage }}', String(r.percentage || 5))
      .replaceAll('{{ customer_email }}', r.email || 'customer@example.com');
  }

  window.renderRewardEmailPreview = function() {
    const preview = q('reward-email-preview');
    if (!preview) return;

    preview.textContent = fillTemplate(templateValue(), state.lastManualReward || {
      code: 'GN-SAMPLE',
      email: 'customer@example.com',
      percentage: Number(q('reward-percentage')?.value || 5),
      expiryDays: Number(q('reward-expiry-days')?.value || 60)
    });
  };

  window.insertRewardVariable = function(variable) {
    const box = getTemplateBox();
    if (!box) return;

    const start = box.selectionStart || box.value.length;
    const end = box.selectionEnd || box.value.length;

    box.value = box.value.slice(0, start) + variable + box.value.slice(end);
    box.focus();
    box.selectionStart = box.selectionEnd = start + variable.length;

    syncEmailTemplateFields();
    renderRewardEmailPreview();
  };

  window.copyRewardEmailPreview = async function() {
    const preview = q('reward-email-preview');
    if (!preview) return;
    await navigator.clipboard.writeText(preview.textContent || '');
    toast('Email preview copied');
  };

  window.createManualRewardCode = async function() {
    const email = String(q('manual-reward-email')?.value || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      alert('Enter a valid customer email first.');
      return;
    }

    const payload = {
      shopDomain: getShopDomain(),
      email,
      code: String(q('manual-reward-code')?.value || '').trim(),
      prefix: String(q('manual-reward-prefix')?.value || 'GN').trim().toUpperCase(),
      percentage: Number(q('manual-reward-percentage')?.value || 5),
      expiryDays: Number(q('manual-reward-expiry-days')?.value || 60)
    };

    const resultBox = q('manual-reward-result');
    if (resultBox) resultBox.textContent = 'Creating code...';

    try {
      const res = await fetch(getApiBase() + '/admin/review-rewards/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || 'Could not create manual reward code');
      }

      const reward = json.reward || {};

      state.lastManualReward = {
        code: reward.code,
        email: reward.email,
        percentage: reward.percentage || payload.percentage,
        expiryDays: payload.expiryDays
      };

      const emailCopy = fillTemplate(templateValue(), state.lastManualReward);

      if (resultBox) {
        resultBox.innerHTML = [
          '<div class="nr-muted">Manual reward code created</div>',
          '<div class="nr-code-output">' + reward.code + '</div>',
          '<div><strong>Email:</strong> ' + reward.email + '</div>',
          '<div><strong>Discount:</strong> ' + (reward.percentage || payload.percentage) + '%</div>',
          '<div><strong>Status:</strong> ' + (reward.status || 'issued') + '</div>',
          '<hr style="border:0; border-top:1px solid var(--border,#e2e8f0); margin:14px 0;" />',
          '<div id="manual-reward-email-copy"></div>'
        ].join('');
      }

      const copyBox = q('manual-reward-email-copy');
      if (copyBox) copyBox.textContent = emailCopy;

      renderRewardEmailPreview();
      loadRewardCodes();
      toast('Manual reward code created');
    } catch (error) {
      if (resultBox) resultBox.textContent = error.message;
      alert(error.message);
    }
  };

  window.copyManualRewardCode = async function() {
    const code = state.lastManualReward?.code;
    if (!code) return alert('No manual code has been created yet.');
    await navigator.clipboard.writeText(code);
    toast('Code copied');
  };

  window.copyManualRewardEmail = async function() {
    const copyBox = q('manual-reward-email-copy');
    const text = copyBox ? copyBox.textContent : fillTemplate(templateValue(), state.lastManualReward);
    await navigator.clipboard.writeText(text || '');
    toast('Email copy copied');
  };

  function detectInitialState() {
    const activeView = document.querySelector('.view.active');

    if (!activeView) return;

    if (activeView.id === 'v-mgr') {
      state.module = 'reviews';
      state.sub = 'manager';
    } else if (activeView.id === 'v-discounts') {
      state.module = 'discounts';
      state.sub = 'settings';
    } else {
      state.module = 'dashboard';
      state.sub = 'overview';
    }
  }

  function boot() {
    detectInitialState();
    ensureTopTabs();
    ensureDiscountExtras();
    renderSidebar();
    renderRewardEmailPreview();
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 100);
  setTimeout(boot, 600);
  setTimeout(boot, 1500);
})();
`;

js += '\n' + stableJs + '\n';

write(htmlPath, html);
write(jsPath, js);

console.log('Done. Removed competing nav controllers and installed stable tabs controller.');
