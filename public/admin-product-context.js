/*
  v28 product navigation + contextual side menu.
  - No top App Product switcher.
  - Products always remain visible in the Products group.
  - Manage group changes to the active product's most useful screens.
  - Configuration group stays visible so product tabs do not wipe shared settings.
*/
(function NectarAdminProductContext() {
  const PRODUCT_ORDER = ['reviews', 'product-creation-import', 'loyalty', 'discounts', 'cart-rewards', 'referrals'];
  const PRODUCT_STATUS = {
    reviews: { label: 'Reviews', view: 'v-dash', stage: '', dot: 'warning', title: 'Reviews enabled; launch checks loading.' },
    'product-creation-import': { label: 'Product Creation & Import', view: 'v-product-creation-import', stage: 'Beta', dot: 'warning', title: 'Create draft products from URLs, invoices and manual entry.' },
    loyalty: { label: 'Loyalty', view: 'v-loyalty', stage: 'Beta', dot: '', title: 'Loyalty is beta. Enable when configured.' },
    discounts: { label: 'Discounts', view: 'v-discounts', stage: 'Beta', dot: '', title: 'Discounts is beta. Enable when configured.' },
    'cart-rewards': { label: 'Cart Rewards', view: 'v-cart-rewards', stage: 'Beta', dot: '', title: 'Cart Rewards is beta. Enable after tests pass.' },
    referrals: { label: 'Referrals', view: 'v-referrals', stage: 'Soon', dot: '', title: 'Referrals is coming soon.' }
  };

  const MANAGE_MENUS = {
    reviews: [
      { label: 'Dashboard', view: 'v-dash' },
      { label: 'Reviews', view: 'v-mgr' },
      { label: 'Reviews Widget Library', view: 'v-widget-library' },
      { label: 'Migration Centre', view: 'v-migration' },
      { label: 'Review Importer', view: 'v-import' },
      { label: 'Messaging & Campaigns', view: 'v-msg', suffix: '✉️' },
      { label: 'Reviews Visual Customiser', view: 'v-style' }
    ],
    'product-creation-import': [
      { label: 'Import Dashboard', view: 'v-product-creation-import', pciTab: 'url' },
      { label: 'URL Import', view: 'v-product-creation-import', pciTab: 'url' },
      { label: 'Invoice Import', view: 'v-product-creation-import', pciTab: 'invoice' },
      { label: 'Manual Create', view: 'v-product-creation-import', pciTab: 'manual' },
      { label: 'Settings', view: 'v-product-creation-import', pciTab: 'settings' },
      { label: 'Import History', view: 'v-product-creation-import', pciTab: 'history' }
    ],
    loyalty: [
      { label: 'Loyalty Overview', view: 'v-loyalty', loyaltyTab: 'overview' },
      { label: 'Email Builder', view: 'v-loyalty', loyaltyTab: 'email' },
      { label: 'Userboard', view: 'v-loyalty', loyaltyTab: 'members' },
      { label: 'Points Rules', view: 'v-loyalty', loyaltyTab: 'rules' },
      { label: 'Tiers', view: 'v-loyalty', loyaltyTab: 'tiers' },
      { label: 'Rewards', view: 'v-loyalty', loyaltyTab: 'rewards' },
      { label: 'Checkout Beta', view: 'v-loyalty', loyaltyTab: 'checkout', pill: 'Beta' },
      { label: 'Settings', view: 'v-loyalty', loyaltyTab: 'settings' }
    ],
    discounts: [
      { label: 'Discounts Overview', view: 'v-discounts' },
      { label: 'Review Discounts', view: 'v-discounts', anchor: 'discount-review-templates' },
      { label: 'Loyalty Discounts', view: 'v-discounts', anchor: 'discount-loyalty-templates' },
      { label: 'Cart Reward Discounts', view: 'v-discounts', anchor: 'discount-cart-templates' },
      { label: 'Issued Codes', view: 'v-discounts', anchor: 'discount-issued-codes' },
      { label: 'Settings', view: 'v-discounts', anchor: 'discount-code-explainer' }
    ],
    'cart-rewards': [
      { label: 'Cart Rewards Dashboard', view: 'v-cart-rewards', cartPanel: 'dashboard' },
      { label: 'Campaigns', view: 'v-cart-rewards', cartPanel: 'campaigns' },
      { label: 'Campaign Builder', view: 'v-cart-rewards', cartPanel: 'builder' },
      { label: 'Campaign Calendar', view: 'v-cart-rewards', cartPanel: 'planner' },
      { label: 'Templates', view: 'v-cart-rewards', cartPanel: 'templates' },
      { label: 'Design', view: 'v-cart-rewards', cartPanel: 'design' },
      { label: 'Analytics', view: 'v-cart-rewards', cartPanel: 'analytics' },
      { label: 'Settings', view: 'v-cart-rewards', cartPanel: 'settings' }
    ],
    referrals: [
      { label: 'Referrals Roadmap', view: 'v-referrals' },
      { label: 'Launch Checklist', view: 'v-review-launch' },
      { label: 'Documentation', view: 'v-docs' }
    ]
  };

  const CONFIG_MENUS = {
    reviews: [
      { label: 'App Settings & Render Names', view: 'v-settings' },
      { label: 'Reviews Launch Checklist', view: 'v-review-launch' },
      { label: 'Real-world Test Centre', view: 'v-test-centre' }
    ],
    'product-creation-import': [
      { label: 'Connection Status', view: 'v-product-creation-import', pciTab: 'url' },
      { label: 'Shopify Product Search', view: 'v-product-creation-import', pciTab: 'invoice' },
      { label: 'Import Rules', view: 'v-product-creation-import', pciTab: 'settings' },
      { label: 'History', view: 'v-product-creation-import', pciTab: 'history' }
    ],
    loyalty: [
      { label: 'Loyalty Settings', view: 'v-loyalty', loyaltyTab: 'settings' },
      { label: 'Checkout Beta Settings', view: 'v-loyalty', loyaltyTab: 'checkout' },
      { label: 'Real-world Test Centre', view: 'v-test-centre' }
    ],
    discounts: [
      { label: 'Discount Settings', view: 'v-discounts' },
      { label: 'Real-world Test Centre', view: 'v-test-centre' },
      { label: 'Manual Setup', view: 'v-docs' }
    ],
    'cart-rewards': [
      { label: 'Cart Rewards Settings', view: 'v-cart-rewards', cartPanel: 'settings' },
      { label: 'Cart Rewards Design', view: 'v-cart-rewards', cartPanel: 'design' },
      { label: 'Cart Rewards Tests', view: 'v-test-centre' },
      { label: 'Manual Setup', view: 'v-docs' }
    ],
    referrals: [
      { label: 'Referral Settings', view: 'v-referrals' },
      { label: 'Documentation', view: 'v-docs' }
    ]
  };

  let activeProduct = 'reviews';
  let activeManageKey = '';

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }

  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  function navGroups() { return qsa('.sidebar .nav-group'); }

  function groupByTitle(pattern) {
    return navGroups().find((group) => pattern.test(group.querySelector('.nav-title')?.textContent || '')) || null;
  }

  function manageGroup() { return groupByTitle(/manage/i) || navGroups()[0]; }
  function configGroup() { return groupByTitle(/configuration/i) || navGroups()[1]; }
  function productGroup() { return groupByTitle(/products/i) || navGroups()[2]; }

  function productForView(viewId) {
    if (viewId === 'v-product-creation-import') return 'product-creation-import';
    if (viewId === 'v-loyalty') return 'loyalty';
    if (viewId === 'v-discounts') return 'discounts';
    if (viewId === 'v-cart-rewards') return 'cart-rewards';
    if (viewId === 'v-referrals') return 'referrals';
    return activeProduct || 'reviews';
  }

  function dotHtml(id) {
    const cfg = PRODUCT_STATUS[id] || {};
    const cls = cfg.dot ? `tab-status-dot ${cfg.dot}` : 'tab-status-dot hidden';
    return `<span id="nav-status-${esc(id)}" class="${cls}" title="${esc(cfg.title || '')}"></span>`;
  }

  function productButtonHtml(id) {
    const cfg = PRODUCT_STATUS[id];
    const stage = cfg.stage ? `<span class="pill">${esc(cfg.stage)}</span>` : '';
    return `<button class="tab-btn product-tab-btn ${activeProduct === id ? 'active' : ''}" type="button" data-product-key="${esc(id)}" data-product-view="${esc(cfg.view)}"><span>${esc(cfg.label)} ${dotHtml(id)}</span>${stage}</button>`;
  }

  function itemButtonHtml(item, index) {
    const key = item.key || `${item.view || 'view'}:${item.loyaltyTab || item.cartPanel || item.pciTab || item.anchor || index}`;
    const suffix = item.suffix ? ` <span class="nav-soft-suffix">${esc(item.suffix)}</span>` : '';
    const pill = item.pill ? `<span class="pill">${esc(item.pill)}</span>` : '';
    return `<button class="tab-btn context-tab-btn ${activeManageKey === key ? 'active' : ''}" type="button" data-context-nav-key="${esc(key)}" data-context-view="${esc(item.view)}" data-loyalty-target="${esc(item.loyaltyTab || '')}" data-cart-panel="${esc(item.cartPanel || '')}" data-pci-tab="${esc(item.pciTab || '')}" data-scroll-anchor="${esc(item.anchor || '')}"><span>${esc(item.label)}${suffix}</span>${pill}</button>`;
  }

  function renderProductGroup() {
    const group = productGroup();
    if (!group) return;
    group.dataset.nectarStaticGroup = 'products';
    group.innerHTML = `<p class="nav-title" onclick="window.toggleNavGroup?.(this)">Products</p>${PRODUCT_ORDER.map(productButtonHtml).join('')}`;
    group.querySelectorAll('[data-product-key]').forEach((button) => {
      button.addEventListener('click', () => setProduct(button.dataset.productKey));
    });
  }

  function renderContextGroups() {
    const product = activeProduct || 'reviews';
    const manage = manageGroup();
    const config = configGroup();
    const manageItems = MANAGE_MENUS[product] || MANAGE_MENUS.reviews;
    const configItems = CONFIG_MENUS[product] || CONFIG_MENUS.reviews;
    if (manage) {
      manage.dataset.nectarContextGroup = 'manage';
      manage.innerHTML = `<p class="nav-title" onclick="window.toggleNavGroup?.(this)">Manage</p>${manageItems.map(itemButtonHtml).join('')}`;
    }
    if (config) {
      config.dataset.nectarContextGroup = 'configuration';
      config.innerHTML = `<p class="nav-title" onclick="window.toggleNavGroup?.(this)">Configuration</p>${configItems.map(itemButtonHtml).join('')}`;
    }
    qsa('[data-context-nav-key]').forEach((button) => {
      button.addEventListener('click', () => navigateContext(button));
    });
  }

  function navigateContext(button) {
    const view = button.dataset.contextView;
    const loyaltyTab = button.dataset.loyaltyTarget;
    const cartPanel = button.dataset.cartPanel;
    const pciTab = button.dataset.pciTab;
    const anchor = button.dataset.scrollAnchor;
    activeManageKey = button.dataset.contextNavKey || '';
    if (view && typeof window.tab === 'function') window.tab(view);
    if (loyaltyTab) setTimeout(() => document.querySelector(`#v-loyalty [data-loyalty-tab="${CSS.escape(loyaltyTab)}"]`)?.click(), 70);
    if (cartPanel) setTimeout(() => window.NectarCartRewardsAdmin?.showPanel?.(cartPanel), 90);
    if (pciTab) setTimeout(() => window.pciTab?.(pciTab), 70);
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    qsa('[data-context-nav-key]').forEach((btn) => btn.classList.toggle('active', btn === button));
  }

  function refreshActiveProduct(viewId) {
    const visibleView = viewId || document.querySelector('.view.active')?.id || 'v-dash';
    if (['v-product-creation-import', 'v-loyalty', 'v-discounts', 'v-cart-rewards', 'v-referrals'].includes(visibleView)) {
      activeProduct = productForView(visibleView);
    }
    document.body.dataset.nectarProductContext = activeProduct;
    qsa('[data-product-key]').forEach((button) => button.classList.toggle('active', button.dataset.productKey === activeProduct));
    renderContextGroups();
  }

  function setProduct(product) {
    const next = PRODUCT_STATUS[product] ? product : 'reviews';
    activeProduct = next;
    activeManageKey = '';
    document.body.dataset.nectarProductContext = next;
    window.NectarModuleShell?.setActiveModule?.(next, { silent: true });
    const cfg = PRODUCT_STATUS[next] || PRODUCT_STATUS.reviews;
    if (typeof window.tab === 'function') window.tab(cfg.view);
    if (next === 'cart-rewards') setTimeout(() => window.NectarCartRewardsAdmin?.showPanel?.('dashboard'), 100);
    if (next === 'product-creation-import') setTimeout(() => window.pciTab?.('url'), 100);
    refreshActiveProduct(cfg.view);
    refreshStatuses();
  }

  function setDot(id, state, title) {
    const dot = document.getElementById(`nav-status-${id}`);
    if (!dot) return;
    dot.className = state ? `tab-status-dot ${state}` : 'tab-status-dot hidden';
    dot.title = title || '';
  }

  async function refreshStatuses() {
    let modules = window.nectarModules || null;
    if (typeof window.adminFetch === 'function') {
      try {
        const result = await window.adminFetch('/admin/modules');
        modules = result.modules || {};
        window.nectarModules = modules;
      } catch (error) {
        console.warn('[nectar-product-context] could not load module statuses', error);
      }
    }
    if (!modules || Array.isArray(modules)) return;
    const reviewDot = document.getElementById('nav-status-reviews');
    const keepReviewsLive = reviewDot?.classList.contains('live');
    setDot('reviews', modules.reviews?.enabled === false ? '' : (keepReviewsLive ? 'live' : 'warning'), modules.reviews?.enabled === false ? 'Reviews disabled.' : (keepReviewsLive ? 'Reviews live-ready: launch checks passed.' : 'Reviews enabled; launch checklist decides if this becomes green.'));
    const pciEnabled = modules.productCreationImport?.enabled !== false && modules['product-creation-import']?.enabled !== false;
    setDot('product-creation-import', pciEnabled ? 'warning' : '', pciEnabled ? 'Product Creation & Import beta enabled. Shopify OAuth/write_products controls whether creation works.' : 'Product Creation & Import disabled.');
    setDot('loyalty', modules.loyalty?.enabled ? 'warning' : '', modules.loyalty?.enabled ? 'Loyalty beta enabled but not fully live.' : 'Loyalty beta not enabled.');
    setDot('discounts', modules.discounts?.enabled ? 'warning' : '', modules.discounts?.enabled ? 'Discounts beta enabled but not fully live.' : 'Discounts beta not enabled.');
    const cartEnabled = Boolean(modules.cartRewards?.enabled || modules.cart_rewards?.enabled || modules['cart-rewards']?.enabled);
    setDot('cart-rewards', cartEnabled ? 'warning' : '', cartEnabled ? 'Cart Rewards beta enabled but not fully live.' : 'Cart Rewards beta not enabled.');
    setDot('referrals', '', 'Referrals coming soon.');
  }

  const oldTab = window.tab;
  if (typeof oldTab === 'function' && !oldTab.__nectarProductContextPatchedV28) {
    const patched = function productAwareTab(id) {
      const result = oldTab.apply(this, arguments);
      setTimeout(() => refreshActiveProduct(id), 30);
      return result;
    };
    patched.__nectarProductContextPatchedV28 = true;
    window.tab = patched;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderProductGroup();
    const params = new URLSearchParams(window.location.search || '');
    const requestedProduct = params.get('product') || params.get('module') || '';
    if (PRODUCT_STATUS[requestedProduct]) {
      setTimeout(() => setProduct(requestedProduct), 20);
    } else {
      refreshActiveProduct(document.querySelector('.view.active')?.id || 'v-dash');
    }
    setTimeout(refreshStatuses, 200);
  });

  window.NectarAdminProductContext = {
    setProduct,
    renderNav: () => { renderProductGroup(); renderContextGroups(); },
    refreshStatuses,
    refreshActiveProduct,
    get activeProduct() { return activeProduct; }
  };
})();
