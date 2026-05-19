const fs = require('fs');
const path = require('path');

const navPath = path.join(process.cwd(), 'admin-nav-stable.js');

if (!fs.existsSync(navPath)) {
  throw new Error('admin-nav-stable.js not found');
}

let js = fs.readFileSync(navPath, 'utf8');

const oldEnsureTopTabs = /function ensureTopTabs\(\) \{[\s\S]*?\n  \}\n\n  function updateTopActive\(\)/;

const newEnsureTopTabs = `function ensureTopTabs() {
    let tabs = q('nr-primary-tabs');

    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'nr-primary-tabs';
      tabs.className = 'nr-primary-tabs';

      const firstView = document.querySelector('.view');
      const mainArea =
        document.querySelector('main') ||
        document.querySelector('.main') ||
        document.querySelector('.content') ||
        document.querySelector('.admin-main') ||
        document.querySelector('.page-content') ||
        (firstView ? firstView.parentElement : null) ||
        document.body;

      if (firstView && firstView.parentElement) {
        firstView.parentElement.insertBefore(tabs, firstView);
      } else if (mainArea.firstChild) {
        mainArea.insertBefore(tabs, mainArea.firstChild);
      } else {
        mainArea.appendChild(tabs);
      }
    }

    tabs.innerHTML = \`
      <button type="button" class="nr-primary-tab" data-nr-module="dashboard" data-nr-sub="overview">Dashboard</button>
      <button type="button" class="nr-primary-tab" data-nr-module="reviews" data-nr-sub="manager">Reviews</button>
      <button type="button" class="nr-primary-tab" data-nr-module="discounts" data-nr-sub="settings">Discount Rewards</button>
    \`;

    tabs.style.display = 'flex';
    tabs.style.visibility = 'visible';
    tabs.style.opacity = '1';

    updateTopActive();
  }

  function updateTopActive()`;

if (!oldEnsureTopTabs.test(js)) {
  console.error('Could not find ensureTopTabs function. Showing matches:');
  const idx = js.indexOf('function ensureTopTabs');
  console.error(js.slice(idx, idx + 1200));
  process.exit(1);
}

js = js.replace(oldEnsureTopTabs, newEnsureTopTabs);

if (!js.includes('window.forceNectarTopTabs')) {
  js += `

window.forceNectarTopTabs = function () {
  const old = document.getElementById('nr-primary-tabs');
  if (old) old.remove();

  const firstView = document.querySelector('.view');
  const target = firstView && firstView.parentElement ? firstView.parentElement : document.body;

  const tabs = document.createElement('div');
  tabs.id = 'nr-primary-tabs';
  tabs.className = 'nr-primary-tabs';
  tabs.innerHTML = \`
    <button type="button" class="nr-primary-tab" data-nr-module="dashboard" data-nr-sub="overview">Dashboard</button>
    <button type="button" class="nr-primary-tab" data-nr-module="reviews" data-nr-sub="manager">Reviews</button>
    <button type="button" class="nr-primary-tab" data-nr-module="discounts" data-nr-sub="settings">Discount Rewards</button>
  \`;

  target.insertBefore(tabs, firstView || target.firstChild);
};
setTimeout(window.forceNectarTopTabs, 300);
`;
}

fs.copyFileSync(navPath, `${navPath}.bak-${Date.now()}`);
fs.writeFileSync(navPath, js);

console.log('Done. Forced top Dashboard / Reviews / Discount Rewards buttons into the main content area.');
