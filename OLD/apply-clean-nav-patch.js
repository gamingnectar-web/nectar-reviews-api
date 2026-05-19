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

/* -------------------------------------------------------------------------- */
/* Cleaner sidebar navigation */
/* -------------------------------------------------------------------------- */

const cleanNavCss = `
/* Cleaner Nectar sidebar navigation */
.nr-sidebar-group {
  display: grid;
  gap: 6px;
  margin: 10px 0;
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

.nr-sidebar-group.open .nr-group-caret {
  transform: rotate(180deg);
}

.nr-nav-subtab {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--muted);
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.nr-nav-subtab.active,
.nr-nav-subtab:hover {
  background: #ffffff;
  color: var(--text);
}

.nr-nav-parent-active {
  background: #ffffff !important;
  color: var(--text) !important;
}

/* Keep the overview focused. Discounts now live in their own sidebar group. */
.nr-dashboard-strip {
  grid-template-columns: 1fr !important;
}

.nr-dashboard-strip > .panel:nth-child(2) {
  display: none !important;
}
`;

if (!html.includes('Cleaner Nectar sidebar navigation')) {
  html = html.replace('</style>', `${cleanNavCss}\n</style>`);
}

const manageLabel = '<div class="section-label">MANAGE</div>';
const configLabel = '<div class="section-label">CONFIGURATION</div>';

const manageStart = html.indexOf(manageLabel);
const configStart = html.indexOf(configLabel, manageStart);

if (manageStart === -1 || configStart === -1) {
  throw new Error('Could not find MANAGE / CONFIGURATION sidebar section in admin.html');
}

const newManageNav = `
<div class="section-label">MANAGE</div>

<button class="tab-btn active" data-nav-target="v-dash" onclick="window.tab('v-dash')">
  Dashboard Overview
</button>

<div class="nr-sidebar-group open" id="nr-reviews-group">
  <button class="tab-btn nr-group-toggle" type="button" onclick="window.toggleNavGroup('nr-reviews-group')">
    <span>Reviews</span>
    <span class="nr-group-caret">▾</span>
  </button>

  <div class="nr-group-items">
    <button class="nr-nav-subtab" data-nav-target="v-mgr" onclick="window.tab('v-mgr')">Review Manager</button>
    <button class="nr-nav-subtab" data-nav-target="v-campaigns" onclick="window.tab('v-campaigns')">Messaging & Campaigns ✉️</button>
    <button class="nr-nav-subtab" data-nav-target="v-trash" onclick="window.tab('v-trash')">Trash 🗑️</button>
    <button class="nr-nav-subtab" data-nav-target="v-import" onclick="window.tab('v-import')">Import CSV</button>
  </div>
</div>

<div class="nr-sidebar-group" id="nr-discounts-group">
  <button class="tab-btn nr-group-toggle" type="button" onclick="window.toggleNavGroup('nr-discounts-group')">
    <span>Discount Rewards</span>
    <span class="nr-group-caret">▾</span>
  </button>

  <div class="nr-group-items">
    <button class="nr-nav-subtab" data-nav-target="v-discounts-settings" onclick="window.tab('v-discounts'); window.rewardSubTab('settings')">Settings</button>
    <button class="nr-nav-subtab" data-nav-target="v-discounts-codes" onclick="window.tab('v-discounts'); window.rewardSubTab('codes')">Generated Codes</button>
    <button class="nr-nav-subtab" data-nav-target="v-discounts-function" onclick="window.tab('v-discounts'); window.rewardSubTab('function')">Function Outline</button>
  </div>
</div>

`;

html = html.slice(0, manageStart) + newManageNav + html.slice(configStart);

write(htmlPath, html);

/* -------------------------------------------------------------------------- */
/* Cleaner sidebar behaviour */
/* -------------------------------------------------------------------------- */

const cleanNavJs = `

/* -------------------------------------------------------------------------- */
/* Cleaner sidebar navigation behaviour */
/* -------------------------------------------------------------------------- */

(function () {
  function q(id) {
    return document.getElementById(id);
  }

  window.toggleNavGroup = function(groupId) {
    const group = q(groupId);
    if (!group) return;
    group.classList.toggle('open');
  };

  function openGroup(groupId) {
    const group = q(groupId);
    if (group) group.classList.add('open');
  }

  function setActiveSidebar(viewId, rewardTab) {
    document.querySelectorAll('[data-nav-target]').forEach(el => {
      el.classList.remove('active');
    });

    document.querySelectorAll('.nr-group-toggle').forEach(el => {
      el.classList.remove('nr-nav-parent-active');
    });

    if (viewId === 'v-dash') {
      const dashboard = document.querySelector('[data-nav-target="v-dash"]');
      if (dashboard) dashboard.classList.add('active');
      return;
    }

    if (['v-mgr', 'v-campaigns', 'v-trash', 'v-import'].includes(viewId)) {
      openGroup('nr-reviews-group');

      const reviewsButton = document.querySelector('#nr-reviews-group .nr-group-toggle');
      if (reviewsButton) reviewsButton.classList.add('nr-nav-parent-active');

      const target = document.querySelector('[data-nav-target="' + viewId + '"]');
      if (target) target.classList.add('active');
      return;
    }

    if (viewId === 'v-discounts') {
      openGroup('nr-discounts-group');

      const discountsButton = document.querySelector('#nr-discounts-group .nr-group-toggle');
      if (discountsButton) discountsButton.classList.add('nr-nav-parent-active');

      const key = rewardTab || 'settings';
      const target = document.querySelector('[data-nav-target="v-discounts-' + key + '"]');
      if (target) target.classList.add('active');
    }
  }

  const previousTab = window.tab;

  window.tab = function(id) {
    if (typeof previousTab === 'function') {
      previousTab(id);
    }

    setActiveSidebar(id);

    if (id === 'v-dash' && typeof window.loadDashboardOverview === 'function') {
      window.loadDashboardOverview();
    }

    if (id === 'v-discounts') {
      if (typeof window.loadRewardSettings === 'function') window.loadRewardSettings();
      if (typeof window.loadRewardCodes === 'function') window.loadRewardCodes();
    }
  };

  const previousRewardSubTab = window.rewardSubTab;

  window.rewardSubTab = function(id) {
    if (typeof previousRewardSubTab === 'function') {
      previousRewardSubTab(id);
    }

    setActiveSidebar('v-discounts', id);
  };

  setTimeout(() => {
    window.tab('v-dash');
    setActiveSidebar('v-dash');
  }, 400);
})();
`;

if (!adminJs.includes('Cleaner sidebar navigation behaviour')) {
  adminJs += cleanNavJs;
}

write(jsPath, adminJs);

console.log('Done. Cleaned sidebar navigation and set Dashboard Overview as the default landing view.');
