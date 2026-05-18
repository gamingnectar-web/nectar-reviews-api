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

const forceCss = `
/* Force clean dashboard navigation */
.nr-force-hidden {
  display: none !important;
}

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

/* Keep overview clean. Discount management is now under its own sidebar group. */
.nr-dashboard-strip {
  grid-template-columns: 1fr !important;
}

.nr-dashboard-strip > .panel:nth-child(2) {
  display: none !important;
}
`;

if (!html.includes('Force clean dashboard navigation')) {
  if (html.includes('</style>')) {
    html = html.replace('</style>', `${forceCss}\n</style>`);
  } else {
    html = html.replace('</head>', `<style>${forceCss}</style>\n</head>`);
  }
  write(htmlPath, html);
}

const forceJs = `

/* -------------------------------------------------------------------------- */
/* Force clean dashboard sidebar navigation */
/* -------------------------------------------------------------------------- */

(function () {
  if (window.__nectarForceCleanNavLoaded) return;
  window.__nectarForceCleanNavLoaded = true;

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function findExactText(label) {
    return Array.from(document.querySelectorAll('div, span, p, strong, small'))
      .find(el => text(el).toUpperCase() === label.toUpperCase());
  }

  function makeButton(label, className, onClick, target) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (target) button.setAttribute('data-force-nav-target', target);
    button.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function makeGroup(id, label, openByDefault, children) {
    const group = document.createElement('div');
    group.className = 'nr-sidebar-group' + (openByDefault ? ' open' : '');
    group.id = id;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tab-btn nr-group-toggle';
    toggle.innerHTML = '<span>' + label + '</span><span class="nr-group-caret">▾</span>';
    toggle.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      group.classList.toggle('open');
    });

    const items = document.createElement('div');
    items.className = 'nr-group-items';

    children.forEach(child => items.appendChild(child));

    group.appendChild(toggle);
    group.appendChild(items);

    return group;
  }

  function clearOldManageItems(manageLabel, configLabel) {
    let node = manageLabel.nextSibling;
    const remove = [];

    while (node && node !== configLabel) {
      remove.push(node);
      node = node.nextSibling;
    }

    remove.forEach(item => item.remove());
  }

  function showDiscountTab(tabId) {
    if (typeof window.tab === 'function') {
      window.tab('v-discounts');
    }

    setTimeout(function() {
      if (typeof window.rewardSubTab === 'function') {
        window.rewardSubTab(tabId);
      }
      setActiveSidebar('v-discounts', tabId);
    }, 50);
  }

  function replaceManageSidebar() {
    const manageLabel = findExactText('MANAGE');
    const configLabel = findExactText('CONFIGURATION');

    if (!manageLabel || !configLabel || manageLabel.parentElement !== configLabel.parentElement) {
      return false;
    }

    if (document.getElementById('nr-force-dashboard-nav')) {
      setActiveFromCurrentView();
      return true;
    }

    clearOldManageItems(manageLabel, configLabel);

    const fragment = document.createDocumentFragment();

    const dashboard = makeButton(
      'Dashboard Overview',
      'tab-btn active',
      function() {
        if (typeof window.tab === 'function') window.tab('v-dash');
        setActiveSidebar('v-dash');
      },
      'v-dash'
    );
    dashboard.id = 'nr-force-dashboard-nav';
    fragment.appendChild(dashboard);

    const reviewsGroup = makeGroup('nr-force-reviews-group', 'Reviews', true, [
      makeButton('Review Manager', 'nr-nav-subtab', function() {
        if (typeof window.tab === 'function') window.tab('v-mgr');
        setActiveSidebar('v-mgr');
      }, 'v-mgr'),

      makeButton('Messaging & Campaigns ✉️', 'nr-nav-subtab', function() {
        if (typeof window.tab === 'function') window.tab('v-campaigns');
        setActiveSidebar('v-campaigns');
      }, 'v-campaigns'),

      makeButton('Trash 🗑️', 'nr-nav-subtab', function() {
        if (typeof window.tab === 'function') window.tab('v-trash');
        setActiveSidebar('v-trash');
      }, 'v-trash'),

      makeButton('Import CSV', 'nr-nav-subtab', function() {
        if (typeof window.tab === 'function') window.tab('v-import');
        setActiveSidebar('v-import');
      }, 'v-import')
    ]);

    const discountsGroup = makeGroup('nr-force-discounts-group', 'Discount Rewards', false, [
      makeButton('Settings', 'nr-nav-subtab', function() {
        showDiscountTab('settings');
      }, 'v-discounts-settings'),

      makeButton('Generated Codes', 'nr-nav-subtab', function() {
        showDiscountTab('codes');
      }, 'v-discounts-codes'),

      makeButton('Function Outline', 'nr-nav-subtab', function() {
        showDiscountTab('function');
      }, 'v-discounts-function')
    ]);

    fragment.appendChild(reviewsGroup);
    fragment.appendChild(discountsGroup);

    configLabel.parentNode.insertBefore(fragment, configLabel);

    setActiveFromCurrentView();
    return true;
  }

  function setActiveSidebar(viewId, rewardTab) {
    document.querySelectorAll('[data-force-nav-target]').forEach(el => {
      el.classList.remove('active');
    });

    document.querySelectorAll('.nr-group-toggle').forEach(el => {
      el.classList.remove('nr-nav-parent-active');
    });

    if (viewId === 'v-dash') {
      const dashboard = document.querySelector('[data-force-nav-target="v-dash"]');
      if (dashboard) dashboard.classList.add('active');
      return;
    }

    if (['v-mgr', 'v-campaigns', 'v-trash', 'v-import'].includes(viewId)) {
      const group = document.getElementById('nr-force-reviews-group');
      if (group) group.classList.add('open');

      const parent = document.querySelector('#nr-force-reviews-group .nr-group-toggle');
      if (parent) parent.classList.add('nr-nav-parent-active');

      const target = document.querySelector('[data-force-nav-target="' + viewId + '"]');
      if (target) target.classList.add('active');
      return;
    }

    if (viewId === 'v-discounts') {
      const group = document.getElementById('nr-force-discounts-group');
      if (group) group.classList.add('open');

      const parent = document.querySelector('#nr-force-discounts-group .nr-group-toggle');
      if (parent) parent.classList.add('nr-nav-parent-active');

      const key = rewardTab || 'settings';
      const target = document.querySelector('[data-force-nav-target="v-discounts-' + key + '"]');
      if (target) target.classList.add('active');
    }
  }

  function setActiveFromCurrentView() {
    const activeView = document.querySelector('.view.active');
    if (!activeView) {
      setActiveSidebar('v-dash');
      return;
    }

    if (activeView.id === 'v-discounts') {
      const activeRewardTab = document.querySelector('[data-reward-tab].active');
      setActiveSidebar('v-discounts', activeRewardTab ? activeRewardTab.getAttribute('data-reward-tab') : 'settings');
      return;
    }

    setActiveSidebar(activeView.id);
  }

  const previousTab = window.tab;

  window.tab = function(id) {
    if (typeof previousTab === 'function') {
      previousTab(id);
    }

    setTimeout(function() {
      replaceManageSidebar();
      setActiveSidebar(id);

      if (id === 'v-dash' && typeof window.loadDashboardOverview === 'function') {
        window.loadDashboardOverview();
      }

      if (id === 'v-discounts') {
        if (typeof window.loadRewardSettings === 'function') window.loadRewardSettings();
        if (typeof window.loadRewardCodes === 'function') window.loadRewardCodes();
      }
    }, 0);
  };

  const previousRewardSubTab = window.rewardSubTab;

  window.rewardSubTab = function(id) {
    if (typeof previousRewardSubTab === 'function') {
      previousRewardSubTab(id);
    }

    setTimeout(function() {
      replaceManageSidebar();
      setActiveSidebar('v-discounts', id);
    }, 0);
  };

  function boot() {
    replaceManageSidebar();

    setTimeout(function() {
      replaceManageSidebar();

      const activeView = document.querySelector('.view.active');
      if (!activeView && typeof window.tab === 'function') {
        window.tab('v-dash');
      } else {
        setActiveFromCurrentView();
      }
    }, 300);
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 300);
  setTimeout(boot, 1000);
  setTimeout(boot, 2000);
})();
`;

if (!adminJs.includes('Force clean dashboard sidebar navigation')) {
  adminJs += forceJs;
  write(jsPath, adminJs);
}

console.log('Done. Added force clean sidebar nav patch.');
