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

const css = `
/* Final contextual side tabs - no dropdown */
.nr-left-select,
.nr-context-help {
  display: none !important;
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
  color: var(--text, #0f172a);
}

.nr-side-title {
  margin: 0 0 8px;
  color: var(--text-light, #64748b);
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: 11px;
  font-weight: 950;
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
  .nr-manual-code-grid,
  .nr-email-template-grid {
    grid-template-columns: 1fr;
  }
}
`;

if (!html.includes('Final contextual side tabs - no dropdown')) {
  if (html.includes('</style>')) {
    html = html.replace('</style>', `${css}\n</style>`);
  } else {
    html = html.replace('</head>', `<style>${css}</style>\n</head>`);
  }
  write(htmlPath, html);
}

const js = String.raw`

/* -------------------------------------------------------------------------- */
/* Final contextual side tabs - replaces dropdown sidebar                     */
/* -------------------------------------------------------------------------- */

(function () {
  if (window.__nectarSideTabsNoDropdownLoaded) return;
  window.__nectarSideTabsNoDropdownLoaded = true;

  const state = {
    module: 'dashboard',
    sub: 'overview',
    lastManualReward: null
  };

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
    else alert(message);
  }

  function findContentRoot() {
    const firstView = document.querySelector('.view');
    return firstView ? firstView.parentElement : document.body;
  }

  function ensureTopTabs() {
    let tabs = q('nr-primary-tabs');

    if (!tabs) {
      const root = findContentRoot();
      tabs = document.createElement('div');
      tabs.id = 'nr-primary-tabs';
      tabs.className = 'nr-primary-tabs';
      tabs.innerHTML = [
        '<button class="nr-primary-tab" data-module="dashboard" onclick="window.nrSelectModule(\'dashboard\', \'overview\')">Dashboard</button>',
        '<button class="nr-primary-tab" data-module="reviews" onclick="window.nrSelectModule(\'reviews\', \'manager\')">Reviews</button>',
        '<button class="nr-primary-tab" data-module="discounts" onclick="window.nrSelectModule(\'discounts\', \'settings\')">Discount Rewards</button>'
      ].join('');

      if (root) root.insertBefore(tabs, root.firstChild);
    }

    document.querySelectorAll('.nr-primary-tab').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-module') === state.module);
    });
  }

  function getSidebarGroup() {
    const groups = Array.from(document.querySelectorAll('.nav-group'));

    const configGroup = groups.find(group => /configuration/i.test(group.textContent || ''));
    const developersGroup = groups.find(group => /developers/i.test(group.textContent || ''));

    return groups.find(group => {
      if (group === configGroup || group === developersGroup) return false;
      const txt = group.textContent || '';
      return /dashboard|reviews|discount rewards|manage|overview/i.test(txt);
    }) || groups[0] || null;
  }

  function sideButton(label, module, sub) {
    const active = state.module === module && state.sub === sub ? ' active' : '';
    return '<button class="nr-side-tab' + active + '" onclick="window.nrSelectModule(\'' + module + '\', \'' + sub + '\')">' + label + '</button>';
  }

  function renderSideTabs() {
    const group = getSidebarGroup();
    if (!group) return;

    let title = 'Dashboard';
    let buttons = '';

    if (state.module === 'dashboard') {
      title = 'Dashboard';
      buttons = sideButton('Overview', 'dashboard', 'overview');
    }

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

    group.innerHTML = [
      '<p class="nr-side-title">' + title + '</p>',
      '<div class="nr-side-tabs">' + buttons + '</div>'
    ].join('');
  }

  const manualAndEmailHtml = [
    '<div id="reward-manual" class="nr-discount-subview">',
      '<div class="nr-manual-code-grid">',
        '<div class="panel">',
          '<h3 style="margin-top:0;">Create Manual Reward Code</h3>',
          '<p class="nr-muted">Create a one-use reward code for a customer email. Use this for support cases and testing.</p>',

          '<div class="nr-field">',
            '<label>Customer email</label>',
            '<input id="manual-reward-email" type="email" placeholder="customer@example.com" />',
          '</div>',

          '<div class="nr-field">',
            '<label>Code prefix</label>',
            '<input id="manual-reward-prefix" value="GN" />',
          '</div>',

          '<div class="nr-field">',
            '<label>Custom code, optional</label>',
            '<input id="manual-reward-code" placeholder="Leave blank to auto-generate" />',
          '</div>',

          '<div class="nr-field">',
            '<label>Discount percentage</label>',
            '<input id="manual-reward-percentage" type="number" min="1" max="100" value="5" />',
          '</div>',

          '<div class="nr-field">',
            '<label>Expiry window, days</label>',
            '<input id="manual-reward-expiry-days" type="number" min="1" max="365" value="60" />',
          '</div>',

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
          '<p class="nr-muted">Design the reward email copy here. The app uses these variables when a code is created.</p>',

          '<div class="nr-variable-row">',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\'{{ discount_code }}\')">{{ discount_code }}</button>',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\'{{ expiry_days }}\')">{{ expiry_days }}</button>',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\'{{ percentage }}\')">{{ percentage }}</button>',
            '<button class="nr-variable-chip" onclick="window.insertRewardVariable(\'{{ customer_email }}\')">{{ customer_email }}</button>',
          '</div>',

          '<div class="nr-field">',
            '<label>Email subject</label>',
            '<input id="reward-email-subject" value="Your review reward code" />',
          '</div>',

          '<div class="nr-field">',
            '<label>Email body</label>',
            '<textarea id="reward-email-template-main">Thanks for leaving a review.\n\nHere is your unique {{ percentage }}% off code:\n\n{{ discount_code }}\n\nIt expires in {{ expiry_days }} days and can only be used once.</textarea>',
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

  function ensureDiscountExtraViews() {
    const discountSection = q('v-discounts');
    if (!discountSection) return;

    if (!q('reward-manual')) {
      const settings = q('reward-settings');
      if (settings) settings.insertAdjacentHTML('afterend', manualAndEmailHtml);
      else discountSection.insertAdjacentHTML('beforeend', manualAndEmailHtml);
    }

    syncEmailTemplateFields();
  }

  function showView(viewId) {
    if (typeof window.__nectarOriginalTabForSideTabs === 'function') {
      window.__nectarOriginalTabForSideTabs(viewId);
      return;
    }

    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('active', view.id === viewId);
      view.style.display = view.id === viewId ? '' : 'none';
    });
  }

  if (!window.__nectarOriginalTabForSideTabs && typeof window.tab === 'function') {
    window.__nectarOriginalTabForSideTabs = window.tab;
  }

  function showDiscountSubView(sub) {
    ensureDiscountExtraViews();

    document.querySelectorAll('.nr-discount-subview').forEach(view => {
      view.classList.remove('active');
    });

    document.querySelectorAll('[data-reward-tab]').forEach(button => {
      button.classList.remove('active');
    });

    const target = q('reward-' + sub);
    if (target) target.classList.add('active');

    const oldButton = document.querySelector('[data-reward-tab="' + sub + '"]');
    if (oldButton) oldButton.classList.add('active');

    if (sub === 'codes' && typeof window.loadRewardCodes === 'function') {
      window.loadRewardCodes();
    }

    if (sub === 'email') {
      renderRewardEmailPreview();
    }
  }

  window.nrSelectModule = function(module, sub) {
    state.module = module;
    state.sub = sub || 'overview';

    ensureTopTabs();
    ensureDiscountExtraViews();

    if (module === 'dashboard') {
      state.sub = 'overview';
      showView('v-dash');
      if (typeof window.loadStats === 'function') window.loadStats();
      if (typeof window.loadDashboardOverview === 'function') window.loadDashboardOverview();
    }

    if (module === 'reviews') {
      if (state.sub === 'manager') showView('v-mgr');
      if (state.sub === 'campaigns') showView(q('v-campaigns') ? 'v-campaigns' : 'v-msg');
      if (state.sub === 'trash') showView('v-trash');
      if (state.sub === 'import') showView('v-import');
    }

    if (module === 'discounts') {
      showView('v-discounts');
      showDiscountSubView(state.sub || 'settings');
      if (typeof window.loadRewardSettings === 'function') window.loadRewardSettings();
    }

    ensureTopTabs();
    renderSideTabs();

    setTimeout(renderSideTabs, 50);
    setTimeout(renderSideTabs, 250);
  };

  window.tab = function(viewId) {
    if (viewId === 'v-dash') return window.nrSelectModule('dashboard', 'overview');
    if (viewId === 'v-mgr') return window.nrSelectModule('reviews', 'manager');
    if (viewId === 'v-msg' || viewId === 'v-campaigns') return window.nrSelectModule('reviews', 'campaigns');
    if (viewId === 'v-trash') return window.nrSelectModule('reviews', 'trash');
    if (viewId === 'v-import') return window.nrSelectModule('reviews', 'import');
    if (viewId === 'v-discounts') return window.nrSelectModule('discounts', state.sub || 'settings');

    showView(viewId);
  };

  window.rewardSubTab = function(sub) {
    state.module = 'discounts';
    state.sub = sub || 'settings';
    showView('v-discounts');
    showDiscountSubView(state.sub);
    ensureTopTabs();
    renderSideTabs();
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

    if (q('manual-reward-prefix') && q('reward-prefix')) {
      q('manual-reward-prefix').value = q('reward-prefix').value || 'GN';
    }

    if (q('manual-reward-percentage') && q('reward-percentage')) {
      q('manual-reward-percentage').value = q('reward-percentage').value || 5;
    }

    if (q('manual-reward-expiry-days') && q('reward-expiry-days')) {
      q('manual-reward-expiry-days').value = q('reward-expiry-days').value || 60;
    }
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

      if (typeof window.loadRewardCodes === 'function') {
        window.loadRewardCodes();
      }

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
    const activeTop = document.querySelector('.nr-primary-tab.active');
    const module = activeTop ? activeTop.getAttribute('data-module') : null;

    if (module === 'reviews') {
      state.module = 'reviews';
      state.sub = 'manager';
      return;
    }

    if (module === 'discounts') {
      state.module = 'discounts';
      state.sub = 'settings';
      return;
    }

    const activeView = document.querySelector('.view.active');

    if (activeView) {
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
  }

  function boot() {
    detectInitialState();
    ensureTopTabs();
    ensureDiscountExtraViews();
    renderSideTabs();
    renderRewardEmailPreview();
  }

  const observer = new MutationObserver(function() {
    clearTimeout(window.__nectarSideTabsTimer);
    window.__nectarSideTabsTimer = setTimeout(function() {
      ensureTopTabs();
      renderSideTabs();
    }, 80);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 100);
  setTimeout(boot, 500);
  setTimeout(boot, 1200);
})();
`;

if (!adminJs.includes('Final contextual side tabs - replaces dropdown sidebar')) {
  adminJs += '\n' + js + '\n';
  write(jsPath, adminJs);
}

console.log('Done. Replaced left dropdown with contextual side tabs and exposed Manual Code / Email Template screens.');
