/*
  Nectar modular admin shell.
  Keeps one Shopify app identity and switches product workspaces without destroying
  the existing review-widget admin DOM.
*/
(function NectarModuleShell() {
  const STORAGE_KEY = 'nectar_active_admin_module';
  const DEFAULT_MODULE = 'reviews';
  const CART_MODULE = 'cart-rewards';
  const REVIEW_MODULE = 'reviews';
  const loadedAssets = new Set();
  let outsideClickBound = false;

  const state = {
    activeModule: DEFAULT_MODULE,
    modules: []
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function getModules() {
    const modules = Array.isArray(window.NECTAR_MODULES) ? window.NECTAR_MODULES : [];
    return modules.length ? modules : [
      {
        id: REVIEW_MODULE,
        productSlug: 'review-widget',
        label: 'review-widget',
        description: 'Reviews dashboard, review manager, messaging, import and visual customiser.',
        legacy: true,
        defaultModule: true
      },
      {
        id: CART_MODULE,
        productSlug: CART_MODULE,
        label: 'Cart Milestone Rewards',
        description: 'Cart drawer, cart page and checkout reward milestones.',
        css: '/modules/cart-rewards/admin.css',
        script: '/modules/cart-rewards/admin.js'
      }
    ];
  }

  function findSidebar() {
    const obvious = qs('.sidebar, .admin-sidebar, aside, nav');
    if (obvious) return obvious;

    const dashboardButton = qsa('button, a').find((button) => {
      const onclick = button.getAttribute('onclick') || '';
      const text = (button.textContent || '').trim().toLowerCase();
      return onclick.includes('v-dash') || text === 'dashboard';
    });

    return dashboardButton ? dashboardButton.closest('div, aside, nav, section') : null;
  }

  function normaliseModuleId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'review-widget' || raw === 'reviews') return REVIEW_MODULE;
    if (raw === 'cart-rewards' || raw === 'cart_rewards' || raw === 'cart milestone rewards') return CART_MODULE;
    const found = state.modules.find((module) => module.id === raw || module.productSlug === raw);
    return found ? found.id : REVIEW_MODULE;
  }

  function getInitialModule() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('module') || params.get('product');
    if (fromUrl) return normaliseModuleId(fromUrl);
    if (window.location.hash === '#cart-rewards') return CART_MODULE;

    // The Shopify app should open into the main review-widget product by default.
    // Session storage is only kept for diagnostics and should not force the app
    // to reopen in a secondary product after a reload.
    return DEFAULT_MODULE;
  }

  function currentModule() {
    return state.modules.find((module) => module.id === state.activeModule) || state.modules[0];
  }

  function createSwitcherHtml() {
    const current = currentModule();
    const options = state.modules.map((module) => `
      <button class="ncr-product-switcher__item" type="button" data-ncr-product="${module.id}" aria-selected="${module.id === state.activeModule}">
        <strong>${module.label || module.productSlug || module.id}</strong>
        <span>${module.description || ''}</span>
      </button>
    `).join('');

    return `
      <button class="ncr-product-switcher__button" type="button" aria-expanded="false">
        <span class="ncr-product-switcher__label">
          <span class="ncr-product-switcher__kicker">App product</span>
          <strong data-ncr-current-product>${current.label || current.productSlug || current.id}</strong>
        </span>
        <span class="ncr-product-switcher__chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="ncr-product-switcher__menu" role="listbox" aria-label="Choose app product">
        ${options}
      </div>
    `;
  }

  function installProductSwitcher() {
    const sidebar = findSidebar();
    if (!sidebar) return null;

    let switcher = qs('#ncr-product-switcher', sidebar);
    if (!switcher) {
      switcher = document.createElement('div');
      switcher.id = 'ncr-product-switcher';
      switcher.className = 'ncr-product-switcher';

      const firstChild = sidebar.firstElementChild;
      if (firstChild) sidebar.insertBefore(switcher, firstChild.nextSibling);
      else sidebar.prepend(switcher);
    }

    switcher.innerHTML = createSwitcherHtml();

    const trigger = qs('.ncr-product-switcher__button', switcher);
    if (trigger) {
      trigger.addEventListener('click', () => {
        const open = !switcher.classList.contains('is-open');
        switcher.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
      });
    }

    qsa('[data-ncr-product]', switcher).forEach((button) => {
      button.addEventListener('click', () => {
        switcher.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        setActiveModule(button.dataset.ncrProduct);
      });
    });

    if (!outsideClickBound) {
      outsideClickBound = true;
      document.addEventListener('click', (event) => {
        qsa('.ncr-product-switcher.is-open').forEach((openSwitcher) => {
          if (!openSwitcher.contains(event.target)) {
            openSwitcher.classList.remove('is-open');
            const openTrigger = qs('.ncr-product-switcher__button', openSwitcher);
            if (openTrigger) openTrigger.setAttribute('aria-expanded', 'false');
          }
        });
      });
    }

    return switcher;
  }

  function refreshSwitcherSelection() {
    const switcher = qs('#ncr-product-switcher');
    if (!switcher) return;
    const current = currentModule();
    const label = qs('[data-ncr-current-product]', switcher);
    if (label) label.textContent = current.label || current.productSlug || current.id;
    qsa('[data-ncr-product]', switcher).forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.ncrProduct === state.activeModule));
    });
  }

  function loadCss(href) {
    if (!href || loadedAssets.has(href) || qs(`link[href="${href}"]`)) return Promise.resolve();
    loadedAssets.add(href);
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    if (!src || loadedAssets.has(src) || qs(`script[src="${src}"]`)) return Promise.resolve();
    loadedAssets.add(src);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function ensureModuleAssets(module) {
    if (!module || module.legacy) return;
    await loadCss(module.css || `${module.adminFolder}/admin.css`);
    await loadScript(module.script || `${module.adminFolder}/admin.js`);
  }

  function setUrlModule(moduleId) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('module', moduleId === REVIEW_MODULE ? 'review-widget' : moduleId);
      url.searchParams.delete('product');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
  }

  function notifyModuleChange(moduleId) {
    document.body.dataset.nectarActiveModule = moduleId;
    window.dispatchEvent(new CustomEvent('nectar:module-change', {
      detail: { module: moduleId, product: moduleId === REVIEW_MODULE ? 'review-widget' : moduleId }
    }));
  }

  function activateReviewWidget() {
    notifyModuleChange(REVIEW_MODULE);
    if (window.NectarCartRewardsAdmin && typeof window.NectarCartRewardsAdmin.setProductMode === 'function') {
      window.NectarCartRewardsAdmin.setProductMode('review-widget');
    }
  }

  function activateCartRewards() {
    notifyModuleChange(CART_MODULE);
    if (window.NectarCartRewardsAdmin && typeof window.NectarCartRewardsAdmin.setProductMode === 'function') {
      window.NectarCartRewardsAdmin.setProductMode(CART_MODULE);
    }
  }

  async function setActiveModule(moduleId, options = {}) {
    const next = normaliseModuleId(moduleId);
    state.activeModule = next;
    sessionStorage.setItem(STORAGE_KEY, next);
    if (!options.skipUrl) setUrlModule(next);
    refreshSwitcherSelection();

    const module = currentModule();
    await ensureModuleAssets(module);

    if (next === CART_MODULE) activateCartRewards();
    else activateReviewWidget();
  }

  function init() {
    state.modules = getModules();
    state.activeModule = getInitialModule();
    installProductSwitcher();
    setActiveModule(state.activeModule, { skipUrl: true }).catch((error) => {
      console.error('[nectar-module-shell] could not activate module', error);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.NectarModuleShell = {
    setActiveModule,
    get activeModule() { return state.activeModule; },
    get modules() { return state.modules.slice(); }
  };
})();
