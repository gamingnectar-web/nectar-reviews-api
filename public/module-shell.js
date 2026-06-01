/*
  Nectar modular admin shell.
  v27: no top product switcher. Products live in the sidebar Products group.
  This file now only loads optional product assets and broadcasts product changes.
*/
(function NectarModuleShell() {
  const DEFAULT_MODULE = 'reviews';
  const REVIEW_MODULE = 'reviews';
  const CART_MODULE = 'cart-rewards';
  const loadedAssets = new Set();

  const state = {
    activeModule: DEFAULT_MODULE,
    modules: []
  };

  function qs(selector, root = document) { return root.querySelector(selector); }

  function getModules() {
    const modules = Array.isArray(window.NECTAR_MODULES) ? window.NECTAR_MODULES : [];
    return modules.length ? modules : [
      { id: REVIEW_MODULE, productSlug: 'review-widget', label: 'Reviews', legacy: true, defaultModule: true },
      { id: 'loyalty', productSlug: 'loyalty', label: 'Loyalty', legacy: true },
      { id: 'discounts', productSlug: 'discounts', label: 'Discounts', legacy: true },
      { id: CART_MODULE, productSlug: CART_MODULE, label: 'Cart Rewards', css: '/modules/cart-rewards/admin.css', script: '/modules/cart-rewards/admin.js' },
      { id: 'referrals', productSlug: 'referrals', label: 'Referrals', legacy: true }
    ];
  }

  function normaliseModuleId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'review-widget' || raw === 'reviews') return REVIEW_MODULE;
    if (raw === 'cart-rewards' || raw === 'cart_rewards' || raw === 'cart milestone rewards') return CART_MODULE;
    if (raw === 'loyalty') return 'loyalty';
    if (raw === 'discounts') return 'discounts';
    if (raw === 'referrals') return 'referrals';
    const found = state.modules.find((module) => module.id === raw || module.productSlug === raw);
    return found ? found.id : REVIEW_MODULE;
  }

  function currentModule() {
    return state.modules.find((module) => module.id === state.activeModule) || state.modules[0];
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

  function notifyModuleChange(moduleId) {
    document.body.dataset.nectarActiveModule = moduleId;
    window.dispatchEvent(new CustomEvent('nectar:module-change', {
      detail: { module: moduleId, product: moduleId === REVIEW_MODULE ? 'review-widget' : moduleId }
    }));
  }

  function moduleForView(viewId) {
    if (viewId === 'v-cart-rewards') return CART_MODULE;
    if (viewId === 'v-loyalty') return 'loyalty';
    if (viewId === 'v-discounts') return 'discounts';
    if (viewId === 'v-referrals') return 'referrals';
    return REVIEW_MODULE;
  }

  async function setActiveModule(moduleId, options = {}) {
    const next = normaliseModuleId(moduleId);
    state.activeModule = next;
    const module = currentModule();
    await ensureModuleAssets(module);
    notifyModuleChange(next);
    if (next === CART_MODULE && window.NectarCartRewardsAdmin?.setProductMode) {
      window.NectarCartRewardsAdmin.setProductMode(CART_MODULE);
    }
    if (!options.silent) window.NectarAdminProductContext?.refreshStatuses?.();
  }

  function patchTab() {
    const oldTab = window.tab;
    if (typeof oldTab !== 'function' || oldTab.__nectarModuleShellPatched) return;
    const patched = function moduleAwareTab(id) {
      const result = oldTab.apply(this, arguments);
      setActiveModule(moduleForView(id), { silent: true }).catch((error) => console.warn('[nectar-module-shell] module activation failed', error));
      return result;
    };
    patched.__nectarModuleShellPatched = true;
    window.tab = patched;
  }

  function init() {
    state.modules = getModules();
    patchTab();
    setActiveModule(DEFAULT_MODULE, { silent: true }).catch((error) => console.warn('[nectar-module-shell] init failed', error));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.NectarModuleShell = {
    setActiveModule,
    get activeModule() { return state.activeModule; },
    get modules() { return state.modules.slice(); }
  };
})();
