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

/* -------------------------------------------------------------------------- */
/* Admin CSS                                                                  */
/* -------------------------------------------------------------------------- */

const topTabsCss = `
/* Nectar top tabs + contextual sidebar */
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

.nr-left-select {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  background: #ffffff;
  color: var(--text, #0f172a);
  border-radius: 12px;
  padding: 11px 12px;
  font-weight: 800;
  cursor: pointer;
  margin-top: 8px;
}

.nr-context-help {
  color: var(--text-light, #64748b);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 10px;
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

.nr-field {
  margin-bottom: 15px;
}

.nr-field label {
  display: block;
  font-weight: 900;
  margin-bottom: 7px;
  color: var(--text, #0f172a);
}

.nr-field input,
.nr-field select,
.nr-field textarea {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  font: inherit;
  background: #ffffff;
}

.nr-field textarea {
  min-height: 180px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

.nr-muted {
  color: var(--text-light, #64748b);
  font-size: 13px;
  line-height: 1.5;
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

if (!html.includes('Nectar top tabs + contextual sidebar')) {
  if (html.includes('</style>')) {
    html = html.replace('</style>', `${topTabsCss}\n</style>`);
  } else {
    html = html.replace('</head>', `<style>${topTabsCss}</style>\n</head>`);
  }
}

/* -------------------------------------------------------------------------- */
/* Admin JS                                                                   */
/* -------------------------------------------------------------------------- */

const topTabsJs = String.raw`

/* -------------------------------------------------------------------------- */
/* Nectar top tabs, contextual sidebar, manual discounts and email templates   */
/* -------------------------------------------------------------------------- */

(function () {
  if (window.__nectarTopTabsManualDiscountsLoaded) return;
  window.__nectarTopTabsManualDiscountsLoaded = true;

  const STATE = {
    module: 'dashboard',
    sub: 'overview',
    lastManualReward: null
  };

  const DISCOUNT_SECTION_HTML = [
    '<div id="reward-manual" class="nr-discount-subview">',
      '<div class="nr-manual-code-grid">',
        '<div class="panel">',
          '<h3 style="margin-top:0;">Create Manual Reward Code</h3>',
          '<p class="nr-muted">Create a one-use reward code for a customer email. This is useful for testing and support cases.</p>',

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

          '<div class="nr-field">',
            '<label>Internal note, optional</label>',
            '<input id="manual-reward-note" placeholder="Example: support goodwill code" />',
          '</div>',

          '<button class="post-btn" onclick="window.createManualRewardCode()">Create Manual Code</button>',
        '</div>',

        '<div class="panel">',
          '<h3 style="margin-top:0;">Created Code</h3>',
          '<div id="manual-reward-result" class="nr-manual-result">',
            'Create a code to see the customer email copy here.',
          '</div>',
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
          '<p class="nr-muted">This template is stored in the app settings and can be reused by the client-side reward tools.</p>',

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
          '<p class="nr-muted">Preview uses the latest manual code, or sample values if no code has been created yet.</p>',
          '<div id="reward-email-preview" class="nr-email-preview"></div>',
          '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">',
            '<button class="secondary-btn" onclick="window.renderRewardEmailPreview()">Refresh Preview</button>',
            '<button class="secondary-btn" onclick="window.copyRewardEmailPreview()">Copy Preview</button>',
          '</div>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');

  function getApiBase() {
    return typeof API !== 'undefined' && API ? API : '/api';
  }

  function getShopDomain() {
    if (typeof SHOP_DOMAIN !== 'undefined' && SHOP_DOMAIN) return SHOP_DOMAIN;
    const params = new URLSearchParams(window.location.search);
    return params.get('shopDomain') || params.get('shop') || '';
  }

  function q(id) {
    return document.getElementById(id);
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
    if (q('nr-primary-tabs')) return;

    const root = findContentRoot();
    if (!root) return;

    const tabs = document.createElement('div');
    tabs.id = 'nr-primary-tabs';
    tabs.className = 'nr-primary-tabs';
    tabs.innerHTML = [
      '<button class="nr-primary-tab active" data-module="dashboard" onclick="window.nrSelectModule(\'dashboard\', \'overview\')">Dashboard</button>',
      '<button class="nr-primary-tab" data-module="reviews" onclick="window.nrSelectModule(\'reviews\', \'manager\')">Reviews</button>',
      '<button class="nr-primary-tab" data-module="discounts" onclick="window.nrSelectModule(\'discounts\', \'settings\')">Discount Rewards</button>'
    ].join('');

    root.insertBefore(tabs, root.firstChild);
  }

  function ensureDiscountViews() {
    const discountSection = q('v-discounts');
    if (!discountSection) return;

    if (!q('reward-manual')) {
      const settings = q('reward-settings');
      if (settings) settings.insertAdjacentHTML('afterend', DISCOUNT_SECTION_HTML);
      else discountSection.insertAdjacentHTML('beforeend', DISCOUNT_SECTION_HTML);
    }

    syncEmailTemplateFields();
    renderRewardEmailPreview();
  }

  function getManageGroup() {
    const titles = Array.from(document.querySelectorAll('.nav-title, .section-label'));
    const manageTitle = titles.find(el => (el.textContent || '').trim().toLowerCase() === 'manage');
    return manageTitle ? manageTitle.closest('.nav-group') || manageTitle.parentElement : null;
  }

  function optionHtml(value, label, activeValue) {
    return '<option value="' + value + '"' + (value === activeValue ? ' selected' : '') + '>' + label + '</option>';
  }

  function renderContextSidebar() {
    const group = getManageGroup();
    if (!group) return;

    let title = 'Dashboard';
    let options = '';
    let help = '';

    if (STATE.module === 'dashboard') {
      title = 'Dashboard';
      options = optionHtml('overview', 'Overview', STATE.sub);
      help = 'Performance, review totals and quick health checks.';
    }

    if (STATE.module === 'reviews') {
      title = 'Reviews';
      options = [
        optionHtml('manager', 'Review Manager', STATE.sub),
        optionHtml('campaigns', 'Messaging & Campaigns', STATE.sub),
        optionHtml('trash', 'Trash', STATE.sub),
        optionHtml('import', 'Import CSV', STATE.sub)
      ].join('');
      help = 'Manage, import and message around reviews.';
    }

    if (STATE.module === 'discounts') {
      title = 'Discount Rewards';
      options = [
        optionHtml('settings', 'Settings', STATE.sub),
        optionHtml('manual', 'Manual Code', STATE.sub),
        optionHtml('codes', 'Generated Codes', STATE.sub),
        optionHtml('email', 'Email Template', STATE.sub),
        optionHtml('function', 'Function Outline', STATE.sub)
      ].join('');
      help = 'Configure, manually create and track reward codes.';
    }

    group.innerHTML = [
      '<p class="nav-title">' + title + '</p>',
      '<select class="nr-left-select" id="nr-context-select">',
      options,
      '</select>',
      '<p class="nr-context-help">' + help + '</p>'
    ].join('');

    const select = q('nr-context-select');
    if (select) {
      select.addEventListener('change', function () {
        window.nrSelectModule(STATE.module, select.value);
      });
    }
  }

  function setTopActive() {
    document.querySelectorAll('.nr-primary-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-module') === STATE.module);
    });
  }

  function mapViewToState(viewId) {
    if (viewId === 'v-dash') return { module: 'dashboard', sub: 'overview' };
    if (viewId === 'v-mgr') return { module: 'reviews', sub: 'manager' };
    if (viewId === 'v-msg' || viewId === 'v-campaigns') return { module: 'reviews', sub: 'campaigns' };
    if (viewId === 'v-trash') return { module: 'reviews', sub: 'trash' };
    if (viewId === 'v-import') return { module: 'reviews', sub: 'import' };
    if (viewId === 'v-discounts') return { module: 'discounts', sub: STATE.sub || 'settings' };
    return null;
  }

  const previousTab = window.tab;

  function rawTab(viewId) {
    if (typeof previousTab === 'function') previousTab(viewId);
  }

  window.tab = function(viewId) {
    const mapped = mapViewToState(viewId);
    if (mapped) {
      STATE.module = mapped.module;
      STATE.sub = mapped.sub;
    }

    rawTab(viewId);

    ensureTopTabs();
    ensureDiscountViews();
    renderContextSidebar();
    setTopActive();

    if (viewId === 'v-discounts') {
      window.rewardSubTab(STATE.sub || 'settings');
      window.loadRewardSettings();
    }
  };

  window.nrSelectModule = function(module, sub) {
    STATE.module = module;
    STATE.sub = sub;

    ensureTopTabs();
    ensureDiscountViews();

    if (module === 'dashboard') {
      rawTab('v-dash');
      if (typeof window.loadStats === 'function') window.loadStats();
    }

    if (module === 'reviews') {
      if (sub === 'manager') rawTab('v-mgr');
      if (sub === 'campaigns') rawTab(q('v-campaigns') ? 'v-campaigns' : 'v-msg');
      if (sub === 'trash') rawTab('v-trash');
      if (sub === 'import') rawTab('v-import');
    }

    if (module === 'discounts') {
      rawTab('v-discounts');
      window.rewardSubTab(sub || 'settings');
      window.loadRewardSettings();
      if (sub === 'codes') window.loadRewardCodes();
    }

    renderContextSidebar();
    setTopActive();
  };

  window.rewardSubTab = function(id) {
    STATE.module = 'discounts';
    STATE.sub = id || 'settings';

    ensureDiscountViews();

    document.querySelectorAll('.nr-discount-subview').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-reward-tab]').forEach(el => el.classList.remove('active'));

    const target = q('reward-' + STATE.sub);
    if (target) target.classList.add('active');

    const tabButton = document.querySelector('[data-reward-tab="' + STATE.sub + '"]');
    if (tabButton) tabButton.classList.add('active');

    renderContextSidebar();
    setTopActive();

    if (STATE.sub === 'codes') window.loadRewardCodes();
    if (STATE.sub === 'email') renderRewardEmailPreview();
  };

  function getEmailTemplateTextarea() {
    return q('reward-email-template-main') || q('reward-email-template');
  }

  function syncEmailTemplateFields() {
    const oldBox = q('reward-email-template');
    const newBox = q('reward-email-template-main');

    if (oldBox && newBox && oldBox.value && oldBox.value !== newBox.value) {
      newBox.value = oldBox.value;
    }
  }

  function emailTemplateValue() {
    const box = getEmailTemplateTextarea();
    return box ? box.value : 'Thanks for leaving a review. Your code is {{ discount_code }} and expires in {{ expiry_days }} days.';
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

    const reward = STATE.lastManualReward || {
      code: 'GN-SAMPLE',
      email: 'customer@example.com',
      percentage: Number(q('reward-percentage')?.value || 5),
      expiryDays: Number(q('reward-expiry-days')?.value || 60)
    };

    preview.textContent = fillTemplate(emailTemplateValue(), reward);
  };

  window.insertRewardVariable = function(variable) {
    const box = getEmailTemplateTextarea();
    if (!box) return;

    const start = box.selectionStart || box.value.length;
    const end = box.selectionEnd || box.value.length;
    box.value = box.value.slice(0, start) + variable + box.value.slice(end);
    box.focus();
    box.selectionStart = box.selectionEnd = start + variable.length;

    renderRewardEmailPreview();
  };

  window.copyRewardEmailPreview = async function() {
    const preview = q('reward-email-preview');
    if (!preview) return;
    await navigator.clipboard.writeText(preview.textContent || '');
    toast('Email preview copied');
  };

  const previousLoadRewardSettings = window.loadRewardSettings;

  window.loadRewardSettings = async function() {
    if (typeof previousLoadRewardSettings === 'function') {
      await previousLoadRewardSettings();
    }

    ensureDiscountViews();
    syncEmailTemplateFields();

    if (q('manual-reward-percentage') && q('reward-percentage')) {
      q('manual-reward-percentage').value = q('reward-percentage').value || 5;
    }

    if (q('manual-reward-expiry-days') && q('reward-expiry-days')) {
      q('manual-reward-expiry-days').value = q('reward-expiry-days').value || 60;
    }

    if (q('manual-reward-prefix') && q('reward-prefix')) {
      q('manual-reward-prefix').value = q('reward-prefix').value || 'GN';
    }

    renderRewardEmailPreview();
  };

  const previousSaveRewardSettings = window.saveRewardSettings;

  window.saveRewardSettings = async function() {
    const newBox = q('reward-email-template-main');
    const oldBox = q('reward-email-template');

    if (newBox && oldBox) {
      oldBox.value = newBox.value;
    }

    if (typeof previousSaveRewardSettings === 'function') {
      return previousSaveRewardSettings();
    }

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
      emailTemplate: emailTemplateValue()
    };

    const res = await fetch(getApiBase() + '/admin/review-reward-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Could not save reward settings');
    }

    toast('Reward settings saved');
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
      expiryDays: Number(q('manual-reward-expiry-days')?.value || 60),
      note: String(q('manual-reward-note')?.value || '').trim()
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
      STATE.lastManualReward = {
        code: reward.code,
        email: reward.email,
        percentage: reward.percentage || payload.percentage,
        expiryDays: payload.expiryDays
      };

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

      const emailCopy = fillTemplate(emailTemplateValue(), STATE.lastManualReward);
      const copyBox = q('manual-reward-email-copy');
      if (copyBox) copyBox.textContent = emailCopy;

      renderRewardEmailPreview();
      if (typeof window.loadRewardCodes === 'function') window.loadRewardCodes();

      toast('Manual reward code created');
    } catch (error) {
      if (resultBox) resultBox.textContent = error.message;
      alert(error.message);
    }
  };

  window.copyManualRewardCode = async function() {
    const code = STATE.lastManualReward?.code;
    if (!code) return alert('No manual code has been created yet.');
    await navigator.clipboard.writeText(code);
    toast('Code copied');
  };

  window.copyManualRewardEmail = async function() {
    const copyBox = q('manual-reward-email-copy');
    const text = copyBox ? copyBox.textContent : fillTemplate(emailTemplateValue(), STATE.lastManualReward);
    await navigator.clipboard.writeText(text || '');
    toast('Email copy copied');
  };

  function boot() {
    ensureTopTabs();
    ensureDiscountViews();

    const activeView = document.querySelector('.view.active');
    if (activeView) {
      const mapped = mapViewToState(activeView.id);
      if (mapped) {
        STATE.module = mapped.module;
        STATE.sub = mapped.sub;
      }
    }

    renderContextSidebar();
    setTopActive();
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 250);
  setTimeout(boot, 1000);
  setTimeout(boot, 2000);
})();
`;

if (!adminJs.includes('Nectar top tabs, contextual sidebar, manual discounts and email templates')) {
  adminJs += '\n' + topTabsJs + '\n';
}

write(htmlPath, html);
write(jsPath, adminJs);

/* -------------------------------------------------------------------------- */
/* Server backend: manual reward code endpoint + fallback discount creation    */
/* -------------------------------------------------------------------------- */

const serverAddon = String.raw`

/* -------------------------------------------------------------------------- */
/* Manual review reward codes + Shopify basic discount fallback                */
/* -------------------------------------------------------------------------- */

function sanitizeRewardCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40);
}

async function createShopifyBasicRewardDiscount({ shopDomain, code, email, settings, startsAt, endsAt }) {
  const percentageDecimal = Math.max(0.01, Math.min(1, Number(settings.percentage || 5) / 100));

  const mutation = [
    'mutation CreateBasicRewardCode($basicCodeDiscount: DiscountCodeBasicInput!) {',
    '  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {',
    '    codeDiscountNode {',
    '      id',
    '      codeDiscount {',
    '        ... on DiscountCodeBasic {',
    '          title',
    '          status',
    '          startsAt',
    '          endsAt',
    '          codes(first: 1) { nodes { code } }',
    '        }',
    '      }',
    '    }',
    '    userErrors { field message code }',
    '  }',
    '}'
  ].join('\n');

  const variables = {
    basicCodeDiscount: {
      title: 'Nectar review reward - ' + code,
      code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      customerGets: {
        value: {
          percentage: percentageDecimal
        },
        items: {
          all: true
        }
      },
      combinesWith: settings.combinesWith || {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true
      }
    }
  };

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  const json = await shopifyFetch('/admin/api/' + apiVersion + '/graphql.json', {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables })
  });

  const errors = json.data?.discountCodeBasicCreate?.userErrors || [];

  if (errors.length) {
    throw new Error(errors.map(e => e.message).join(', '));
  }

  const node = json.data?.discountCodeBasicCreate?.codeDiscountNode;

  if (!node?.id) {
    throw new Error('Shopify did not return a basic discount ID');
  }

  return {
    discountId: node.id,
    title: node.codeDiscount?.title || 'Nectar review reward - ' + code,
    status: node.codeDiscount?.status || 'ACTIVE',
    fallbackType: 'basic'
  };
}

// Overrides the earlier helper. Uses the Shopify Function if configured, otherwise falls back to a standard Shopify code discount.
async function createShopifyReviewRewardDiscount({ code, review, settings, startsAt, endsAt }) {
  const shopDomain = cleanShopDomain(
    review?.shopDomain ||
    settings?.shopDomain ||
    getShopifyStoreUrl()
  );

  const functionId = process.env.SHOPIFY_REVIEW_REWARD_FUNCTION_ID;

  if (!functionId) {
    return createShopifyBasicRewardDiscount({
      shopDomain,
      code,
      email: review?.email || '',
      settings,
      startsAt,
      endsAt
    });
  }

  const mutation = [
    'mutation CreateReviewRewardCode($codeAppDiscount: DiscountCodeAppInput!) {',
    '  discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {',
    '    codeAppDiscount {',
    '      discountId',
    '      title',
    '      status',
    '      startsAt',
    '      endsAt',
    '      codes(first: 1) { nodes { code } }',
    '    }',
    '    userErrors { field message code }',
    '  }',
    '}'
  ].join('\n');

  const variables = {
    codeAppDiscount: {
      title: 'Nectar review reward - ' + code,
      code,
      functionId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      combinesWith: settings.combinesWith || {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true
      },
      context: { all: true },
      metafields: [
        {
          namespace: 'nectar_reviews',
          key: 'reward_config',
          type: 'json',
          value: JSON.stringify({
            type: 'review_reward',
            percentage: settings.percentage,
            email: String(review?.email || '').toLowerCase(),
            reviewId: String(review?._id || ''),
            expiresAt: endsAt.toISOString()
          })
        }
      ]
    }
  };

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  const json = await shopifyFetch('/admin/api/' + apiVersion + '/graphql.json', {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables })
  });

  const errors = json.data?.discountCodeAppCreate?.userErrors || [];

  if (errors.length) {
    throw new Error(errors.map(e => e.message).join(', '));
  }

  const created = json.data?.discountCodeAppCreate?.codeAppDiscount;

  if (!created?.discountId) {
    throw new Error('Shopify did not return an app discount ID');
  }

  return created;
}

async function deleteShopifyDiscountCode(discountId, shopDomain) {
  if (!discountId) return;

  const mutation = [
    'mutation DeleteReviewRewardCode($id: ID!) {',
    '  discountCodeDelete(id: $id) {',
    '    deletedCodeDiscountId',
    '    userErrors { field message code }',
    '  }',
    '}'
  ].join('\n');

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  const json = await shopifyFetch('/admin/api/' + apiVersion + '/graphql.json', {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query: mutation, variables: { id: discountId } })
  });

  const errors = json.data?.discountCodeDelete?.userErrors || [];

  if (errors.length) {
    console.warn('Could not delete reward discount:', errors);
  }
}

app.post('/api/admin/review-rewards/manual', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.query.shopDomain);
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!shopDomain) {
      return res.status(400).json({ error: 'shopDomain is required' });
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid customer email is required' });
    }

    const savedSettings = await ReviewRewardSetting.findOne({ shopDomain });
    const settings = normaliseRewardSettings(savedSettings, shopDomain);

    settings.shopDomain = shopDomain;
    settings.percentage = Math.max(1, Math.min(100, Number(req.body.percentage || settings.percentage || 5)));
    settings.expiryDays = Math.max(1, Math.min(365, Number(req.body.expiryDays || settings.expiryDays || 60)));
    settings.prefix = String(req.body.prefix || settings.prefix || 'GN')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 18) || 'GN';

    let code = sanitizeRewardCode(req.body.code);

    if (!code) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = generateRewardCode(settings.prefix);
        const exists = await ReviewRewardCode.findOne({ code: candidate }).lean();
        if (!exists) {
          code = candidate;
          break;
        }
      }
    }

    if (!code) {
      return res.status(500).json({ error: 'Could not generate a unique code' });
    }

    const existing = await ReviewRewardCode.findOne({ code }).lean();

    if (existing) {
      return res.status(409).json({ error: 'That reward code already exists' });
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + settings.expiryDays * 24 * 60 * 60 * 1000);
    const manualReviewId = new mongoose.Types.ObjectId();

    const reward = await ReviewRewardCode.create({
      shopDomain,
      reviewId: manualReviewId,
      email,
      code,
      percentage: settings.percentage,
      startsAt,
      endsAt,
      status: 'issued'
    });

    try {
      const shopifyDiscount = await createShopifyReviewRewardDiscount({
        code,
        review: {
          _id: manualReviewId,
          email,
          shopDomain
        },
        settings,
        startsAt,
        endsAt
      });

      reward.shopifyDiscountId = shopifyDiscount.discountId;
      reward.status = 'issued';
      await reward.save();

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
        },
        shopifyDiscount
      });
    } catch (error) {
      reward.status = 'failed';
      reward.failureReason = error.message || 'Shopify discount creation failed';
      await reward.save();

      return res.status(500).json({
        error: error.message || 'Shopify discount creation failed',
        reward: {
          id: reward._id,
          email: reward.email,
          code: reward.code,
          status: reward.status,
          percentage: reward.percentage,
          failureReason: reward.failureReason
        }
      });
    }
  } catch (error) {
    console.error('Manual reward code creation failed:', error);
    return res.status(500).json({ error: error.message || 'Could not create manual reward code' });
  }
});
`;

if (!server.includes('Manual review reward codes + Shopify basic discount fallback')) {
  const listenMatch = server.match(/\n\s*app\.listen\s*\(/);

  if (listenMatch) {
    server = server.replace(listenMatch[0], '\n' + serverAddon + '\n' + listenMatch[0]);
  } else {
    server += '\n' + serverAddon + '\n';
  }
}

write(serverPath, server);

console.log('Done. Added top tabs, contextual sidebar, manual reward code creation, and email template tooling.');
