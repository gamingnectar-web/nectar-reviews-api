/*
  v27 product navigation stabiliser.
  The top App Product switcher is removed. All products stay visible in the bottom
  Products nav group, while tabs remain normal static admin tabs.
*/
(function NectarAdminProductContext() {
  const PRODUCT_STATUS = {
    reviews: { label: 'Reviews', view: 'v-dash', stage: '', dot: 'warning', title: 'Reviews enabled; launch checks loading.' },
    loyalty: { label: 'Loyalty', view: 'v-loyalty', stage: 'Beta', dot: '', title: 'Loyalty is beta. Enable when configured.' },
    discounts: { label: 'Discounts', view: 'v-discounts', stage: 'Beta', dot: '', title: 'Discounts is beta. Enable when configured.' },
    'cart-rewards': { label: 'Cart Rewards', view: 'v-cart-rewards', stage: 'Beta', dot: '', title: 'Cart Rewards is beta. Enable after tests pass.' },
    referrals: { label: 'Referrals', view: 'v-referrals', stage: 'Soon', dot: '', title: 'Referrals is coming soon.' }
  };

  let activeProduct = 'reviews';

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }

  function productForView(viewId) {
    if (viewId === 'v-loyalty') return 'loyalty';
    if (viewId === 'v-discounts') return 'discounts';
    if (viewId === 'v-cart-rewards') return 'cart-rewards';
    if (viewId === 'v-referrals') return 'referrals';
    return 'reviews';
  }

  function dotHtml(id) {
    const cfg = PRODUCT_STATUS[id] || {};
    const cls = cfg.dot ? `tab-status-dot ${cfg.dot}` : 'tab-status-dot hidden';
    return `<span id="nav-status-${esc(id)}" class="${cls}" title="${esc(cfg.title || '')}"></span>`;
  }

  function productButtonHtml(id) {
    const cfg = PRODUCT_STATUS[id];
    if (!cfg) return '';
    const stage = cfg.stage ? `<span class="pill">${esc(cfg.stage)}</span>` : '';
    return `<button class="tab-btn product-tab-btn ${activeProduct === id ? 'active' : ''}" type="button" data-product-key="${esc(id)}" data-product-view="${esc(cfg.view)}"><span>${esc(cfg.label)} ${dotHtml(id)}</span>${stage}</button>`;
  }

  function productGroup() {
    const groups = Array.from(document.querySelectorAll('.sidebar .nav-group'));
    return groups.find((group) => /products/i.test(group.querySelector('.nav-title')?.textContent || '')) || groups[2];
  }

  function installProductNav() {
    const group = productGroup();
    if (!group) return;
    group.innerHTML = `<p class="nav-title">Products</p>${Object.keys(PRODUCT_STATUS).map(productButtonHtml).join('')}`;
    group.querySelectorAll('[data-product-key]').forEach((button) => {
      button.addEventListener('click', () => setProduct(button.dataset.productKey));
    });
    refreshActiveProduct();
    refreshStatuses();
  }

  function refreshActiveProduct(viewId) {
    activeProduct = productForView(viewId || document.querySelector('.view.active')?.id || 'v-dash');
    document.body.dataset.nectarProductContext = activeProduct;
    document.querySelectorAll('[data-product-key]').forEach((button) => {
      button.classList.toggle('active', button.dataset.productKey === activeProduct);
    });
  }

  function setProduct(product) {
    const cfg = PRODUCT_STATUS[product] || PRODUCT_STATUS.reviews;
    activeProduct = product;
    window.NectarModuleShell?.setActiveModule?.(product, { silent: true });
    if (typeof window.tab === 'function') window.tab(cfg.view);
    refreshActiveProduct(cfg.view);
  }

  function setDot(id, state, title) {
    const dot = document.getElementById(`nav-status-${id}`);
    if (!dot) return;
    dot.className = state ? `tab-status-dot ${state}` : 'tab-status-dot hidden';
    dot.title = title || '';
  }

  async function refreshStatuses() {
    let modules = window.nectarModules || null;
    if (!modules && typeof window.adminFetch === 'function') {
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
    setDot('reviews', modules.reviews?.enabled === false ? '' : (keepReviewsLive ? 'live' : 'warning'), modules.reviews?.enabled === false ? 'Reviews disabled.' : (keepReviewsLive ? 'Reviews live-ready: launch checks passed.' : 'Reviews enabled; launch checks decide if this becomes green.'));
    setDot('loyalty', modules.loyalty?.enabled ? 'warning' : '', modules.loyalty?.enabled ? 'Loyalty beta enabled but not fully live.' : 'Loyalty beta not enabled.');
    setDot('discounts', modules.discounts?.enabled ? 'warning' : '', modules.discounts?.enabled ? 'Discounts beta enabled but not fully live.' : 'Discounts beta not enabled.');
    setDot('cart-rewards', modules.cartRewards?.enabled || modules.cart_rewards?.enabled ? 'warning' : '', modules.cartRewards?.enabled || modules.cart_rewards?.enabled ? 'Cart Rewards beta enabled but not fully live.' : 'Cart Rewards beta not enabled.');
    setDot('referrals', '', 'Referrals coming soon.');
  }

  const oldTab = window.tab;
  if (typeof oldTab === 'function' && !oldTab.__nectarProductContextPatched) {
    const patched = function productAwareTab(id) {
      const result = oldTab.apply(this, arguments);
      refreshActiveProduct(id);
      return result;
    };
    patched.__nectarProductContextPatched = true;
    window.tab = patched;
  }

  document.addEventListener('DOMContentLoaded', () => {
    installProductNav();
    setTimeout(refreshStatuses, 200);
  });

  window.NectarAdminProductContext = {
    setProduct,
    renderNav: installProductNav,
    refreshStatuses,
    get activeProduct() { return activeProduct; }
  };
})();
