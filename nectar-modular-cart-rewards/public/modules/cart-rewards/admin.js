(function NectarCartRewardsAdmin() {
  const PRODUCT_REVIEW_WIDGET = 'review-widget';
  const PRODUCT_CART_REWARDS = 'cart-rewards';
  const ACTIVE_CLASS = 'ncr-cart-product-active';

  const state = {
    product: PRODUCT_REVIEW_WIDGET,
    panel: 'dashboard',
    campaigns: [],
    templates: [],
    plannerEvents: [],
    loading: false,
    hydrated: false
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normaliseShop(shop) {
    return String(shop || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  function getShopDomain() {
    const params = new URLSearchParams(window.location.search);
    return normaliseShop(window.SHOP_DOMAIN || params.get('shop') || params.get('shopDomain') || '');
  }

  function showToast(message) {
    if (window.showToast) return window.showToast(message);
    console.log(message);
  }

  async function api(path, options = {}) {
    const adminPath = path.startsWith('/cart-rewards') ? path : `/cart-rewards${path}`;
    if (typeof window.adminFetch === 'function') {
      return window.adminFetch(adminPath, options);
    }

    const shopDomain = getShopDomain();
    const separator = adminPath.includes('?') ? '&' : '?';
    const response = await fetch(`/api${adminPath}${separator}shopDomain=${encodeURIComponent(shopDomain)}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Shop-Domain': shopDomain,
        ...(options.headers || {})
      },
      credentials: 'same-origin'
    });

    if (!response.ok) {
      let error = `Request failed (${response.status})`;
      try {
        const json = await response.json();
        error = json.error || json.detail || error;
      } catch (_) {}
      throw new Error(error);
    }

    return response.json();
  }

  function findSidebar() {
    const obvious = qs('.sidebar, .admin-sidebar, aside, nav');
    if (obvious) return obvious;

    const dashboardButton = qsa('button').find((button) => {
      const onclick = button.getAttribute('onclick') || '';
      return onclick.includes("v-dash") || button.textContent.trim() === 'Dashboard';
    });

    return dashboardButton ? dashboardButton.closest('div, aside, nav, section') : null;
  }

  function findMainContent() {
    return qs('main') || qs('.main-content') || qs('.admin-content') || qs('.content') || document.body;
  }

  function getSidebarChildrenToHide(sidebar) {
    if (!sidebar) return [];
    return Array.from(sidebar.children).filter((child) => {
      return !child.classList.contains('ncr-product-switcher') &&
        !child.classList.contains('ncr-cart-nav') &&
        child.id !== 'ncr-cart-nav';
    });
  }

  function installProductSwitcher() {
    const sidebar = findSidebar();
    if (!sidebar || qs('#ncr-product-switcher')) return;

    const switcher = document.createElement('div');
    switcher.id = 'ncr-product-switcher';
    switcher.className = 'ncr-product-switcher';
    switcher.innerHTML = `
      <button class="ncr-product-switcher__button" type="button" aria-expanded="false">
        <span class="ncr-product-switcher__label">
          <span class="ncr-product-switcher__kicker">App product</span>
          <strong data-ncr-current-product>review-widget</strong>
        </span>
        <span class="ncr-product-switcher__chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="ncr-product-switcher__menu" role="listbox" aria-label="Choose app product">
        <button class="ncr-product-switcher__item" type="button" data-ncr-product="${PRODUCT_REVIEW_WIDGET}" aria-selected="true">
          <strong>review-widget</strong>
          <span>Reviews, visual customiser, messaging and import tools.</span>
        </button>
        <button class="ncr-product-switcher__item" type="button" data-ncr-product="${PRODUCT_CART_REWARDS}" aria-selected="false">
          <strong>Cart Milestone Rewards</strong>
          <span>Cart drawer, cart page and checkout reward milestones.</span>
        </button>
      </div>
    `;

    const firstChild = sidebar.firstElementChild;
    if (firstChild) sidebar.insertBefore(switcher, firstChild.nextSibling);
    else sidebar.appendChild(switcher);

    const trigger = qs('.ncr-product-switcher__button', switcher);
    trigger.addEventListener('click', () => {
      const open = !switcher.classList.contains('is-open');
      switcher.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
    });

    qsa('[data-ncr-product]', switcher).forEach((button) => {
      button.addEventListener('click', () => {
        switcher.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        setProductMode(button.dataset.ncrProduct);
      });
    });

    document.addEventListener('click', (event) => {
      if (!switcher.contains(event.target)) {
        switcher.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function installCartNavigation() {
    const sidebar = findSidebar();
    if (!sidebar) return null;
    let nav = qs('#ncr-cart-nav', sidebar);
    if (nav) return nav;

    nav = document.createElement('div');
    nav.id = 'ncr-cart-nav';
    nav.className = 'ncr-cart-nav';
    nav.innerHTML = `
      <span class="ncr-cart-nav__group-title">Cart Rewards</span>
      <button type="button" data-ncr-panel="dashboard" class="active">Dashboard</button>
      <button type="button" data-ncr-panel="campaigns">Campaigns</button>
      <button type="button" data-ncr-panel="planner">Planner</button>
      <button type="button" data-ncr-panel="templates">Templates</button>
      <button type="button" data-ncr-panel="design">Design</button>
      <button type="button" data-ncr-panel="settings">Settings</button>
    `;

    const switcher = qs('#ncr-product-switcher', sidebar);
    if (switcher) switcher.insertAdjacentElement('afterend', nav);
    else sidebar.appendChild(nav);

    qsa('[data-ncr-panel]', nav).forEach((button) => {
      button.addEventListener('click', () => showPanel(button.dataset.ncrPanel));
    });

    return nav;
  }

  function ensureCartRewardsView() {
    let view = qs('#v-cart-rewards');
    if (view) return view;

    view = document.createElement('section');
    view.id = 'v-cart-rewards';
    view.className = 'view nectar-cart-rewards-admin-view';
    view.style.display = 'none';
    view.innerHTML = `
      <div class="ncr-shell">
        <div class="ncr-hero">
          <div>
            <h1>Cart Milestone Rewards</h1>
            <p>Let shoppers unlock promotional items as the cart grows. This module uses cart milestones and reward inventory only — no customer profile data is requested or stored.</p>
          </div>
          <div class="ncr-hero__actions">
            <button class="ncr-btn" type="button" data-ncr-action="refresh">Refresh</button>
            <button class="ncr-btn ncr-btn--primary" type="button" data-ncr-action="new-campaign">New campaign</button>
          </div>
        </div>

        <div class="ncr-panel active" data-ncr-panel-view="dashboard">
          <div class="ncr-grid ncr-grid--stats" id="ncr-stats"></div>
          <div class="ncr-grid ncr-grid--two" style="margin-top: 18px;">
            <div class="ncr-card">
              <div class="ncr-card__header">
                <div>
                  <h2>Active reward campaigns</h2>
                  <p>Only cart milestone campaigns live here. Review settings remain in the review-widget product.</p>
                </div>
              </div>
              <div class="ncr-list" id="ncr-dashboard-campaigns"></div>
            </div>
            <div class="ncr-card">
              <h2>Storefront surfaces</h2>
              <p>The same campaign feeds the cart drawer, cart page and checkout extension. Theme surfaces add/remove reward products where the shopper selects them; checkout is protected by the discount function.</p>
              <div class="ncr-pills">
                <span class="ncr-pill">Cart drawer block</span>
                <span class="ncr-pill">Cart page block</span>
                <span class="ncr-pill">Checkout extension</span>
                <span class="ncr-pill">Discount Function</span>
              </div>
            </div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="campaigns">
          <div class="ncr-card">
            <div class="ncr-card__header">
              <div>
                <h2>Campaign listing</h2>
                <p>Create stacked, highest-only or choose-one reward campaigns.</p>
              </div>
              <button class="ncr-btn ncr-btn--primary" type="button" data-ncr-action="new-campaign">New campaign</button>
            </div>
            <div class="ncr-list" id="ncr-campaign-list"></div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="planner">
          <div class="ncr-card">
            <div class="ncr-card__header">
              <div>
                <h2>Planner</h2>
                <p>Schedule promotions, turn campaigns on/off, and plan swaps without changing review features.</p>
              </div>
              <button class="ncr-btn" type="button" data-ncr-action="load-planner">Load month</button>
            </div>
            <div class="ncr-list" id="ncr-planner-list"></div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="templates">
          <div class="ncr-card">
            <div class="ncr-card__header">
              <div>
                <h2>Templates</h2>
                <p>Start from proven milestone structures and then configure reward products from the live Shopify catalogue.</p>
              </div>
              <button class="ncr-btn" type="button" data-ncr-action="load-templates">Refresh templates</button>
            </div>
            <div class="ncr-list" id="ncr-template-list"></div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="design">
          <div class="ncr-grid ncr-grid--two">
            <div class="ncr-card">
              <h2>Widget design</h2>
              <p>Design controls are scoped to the Cart Rewards storefront block only.</p>
              <div class="ncr-form-grid">
                <div class="ncr-field">
                  <label for="ncr-design-title">Widget title</label>
                  <input id="ncr-design-title" class="ncr-input" value="Unlock free rewards">
                </div>
                <div class="ncr-field">
                  <label for="ncr-design-radius">Border radius</label>
                  <input id="ncr-design-radius" class="ncr-input" type="number" value="18">
                </div>
                <div class="ncr-field">
                  <label for="ncr-design-primary">Primary colour</label>
                  <input id="ncr-design-primary" class="ncr-input" type="color" value="#111827">
                </div>
                <div class="ncr-field">
                  <label for="ncr-design-layout">Layout</label>
                  <select id="ncr-design-layout" class="ncr-select">
                    <option value="cards">Cards</option>
                    <option value="compact">Compact</option>
                    <option value="drawer">Drawer-first</option>
                  </select>
                </div>
              </div>
              <div style="margin-top: 16px;">
                <button class="ncr-btn ncr-btn--primary" type="button" data-ncr-action="save-design">Save design</button>
              </div>
            </div>
            <div class="ncr-card">
              <h2>Live preview</h2>
              <div class="ncr-progress-preview">
                <strong>Unlock free rewards</strong>
                <p>Spend £12 more to unlock your next reward.</p>
                <div class="ncr-progress-preview__bar"><div class="ncr-progress-preview__fill"></div></div>
                <div class="ncr-reward-preview-grid">
                  <div class="ncr-reward-preview-card"><strong>£25 gift</strong><span>Unlocked</span></div>
                  <div class="ncr-reward-preview-card"><strong>£50 gift</strong><span>Spend £12 more</span></div>
                  <div class="ncr-reward-preview-card"><strong>£75 gift</strong><span>Locked</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="settings">
          <div class="ncr-card">
            <h2>Settings and privacy boundary</h2>
            <p>This module only evaluates shop domain, cart totals, cart line items, reward variant availability and signed reward claim tokens.</p>
            <div class="ncr-pills">
              <span class="ncr-pill ncr-pill--active">No customer ID</span>
              <span class="ncr-pill ncr-pill--active">No customer email</span>
              <span class="ncr-pill ncr-pill--active">No customer tags</span>
              <span class="ncr-pill ncr-pill--active">Live inventory required</span>
              <span class="ncr-pill ncr-pill--active">Hide sold-out rewards by default</span>
            </div>
          </div>
        </div>
      </div>
    `;

    findMainContent().appendChild(view);

    qsa('[data-ncr-action]', view).forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.ncrAction));
    });

    return view;
  }

  function setProductSwitcherLabel(product) {
    const current = qs('[data-ncr-current-product]');
    if (current) current.textContent = product === PRODUCT_CART_REWARDS ? 'Cart Milestone Rewards' : 'review-widget';
    qsa('[data-ncr-product]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.ncrProduct === product));
    });
  }

  function setProductMode(product) {
    state.product = product === PRODUCT_CART_REWARDS ? PRODUCT_CART_REWARDS : PRODUCT_REVIEW_WIDGET;
    setProductSwitcherLabel(state.product);

    const sidebar = findSidebar();
    const view = ensureCartRewardsView();
    const cartNav = installCartNavigation();

    if (state.product === PRODUCT_CART_REWARDS) {
      document.body.classList.add(ACTIVE_CLASS);
      getSidebarChildrenToHide(sidebar).forEach((child) => child.classList.add('ncr-hidden-original-nav'));
      if (cartNav) cartNav.style.display = '';
      qsa('.view').forEach((el) => {
        el.classList.remove('active');
        if (el !== view) el.style.display = 'none';
      });
      view.classList.add('active');
      view.style.display = '';
      hydrateOnce();
      showPanel(state.panel || 'dashboard');
      return;
    }

    document.body.classList.remove(ACTIVE_CLASS);
    getSidebarChildrenToHide(sidebar).forEach((child) => child.classList.remove('ncr-hidden-original-nav'));
    if (cartNav) cartNav.style.display = 'none';
    view.classList.remove('active');
    view.style.display = 'none';
    if (typeof window.tab === 'function') window.tab('v-dash');
  }

  function showPanel(panel) {
    state.panel = panel || 'dashboard';
    qsa('#ncr-cart-nav [data-ncr-panel]').forEach((button) => {
      button.classList.toggle('active', button.dataset.ncrPanel === state.panel);
    });
    qsa('#v-cart-rewards [data-ncr-panel-view]').forEach((panelEl) => {
      panelEl.classList.toggle('active', panelEl.dataset.ncrPanelView === state.panel);
    });

    if (state.panel === 'templates' && !state.templates.length) loadTemplates();
    if (state.panel === 'planner' && !state.plannerEvents.length) loadPlanner();
  }

  async function hydrateOnce() {
    if (state.hydrated || state.loading) return;
    state.hydrated = true;
    await Promise.allSettled([loadCampaigns(), loadTemplates()]);
  }

  async function loadCampaigns() {
    state.loading = true;
    renderLoading();
    try {
      const json = await api('/campaigns');
      state.campaigns = json.campaigns || [];
      render();
    } catch (error) {
      renderError(error);
    } finally {
      state.loading = false;
    }
  }

  async function loadTemplates() {
    try {
      const json = await api('/templates');
      state.templates = json.templates || [];
      renderTemplates();
    } catch (error) {
      const container = qs('#ncr-template-list');
      if (container) container.innerHTML = `<div class="ncr-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadPlanner() {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const json = await api(`/planner/month?year=${year}&month=${month}`);
      state.plannerEvents = json.events || [];
      renderPlanner();
    } catch (error) {
      const container = qs('#ncr-planner-list');
      if (container) container.innerHTML = `<div class="ncr-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderLoading() {
    ['#ncr-dashboard-campaigns', '#ncr-campaign-list'].forEach((selector) => {
      const el = qs(selector);
      if (el) el.innerHTML = '<div class="ncr-empty">Loading cart reward campaigns…</div>';
    });
  }

  function renderError(error) {
    ['#ncr-dashboard-campaigns', '#ncr-campaign-list'].forEach((selector) => {
      const el = qs(selector);
      if (el) el.innerHTML = `<div class="ncr-empty">${escapeHtml(error.message || 'Could not load campaigns.')}</div>`;
    });
  }

  function statusPill(status) {
    const safe = escapeHtml(status || 'draft');
    return `<span class="ncr-pill ncr-pill--${safe}">${safe}</span>`;
  }

  function renderStats() {
    const stats = {
      total: state.campaigns.length,
      active: state.campaigns.filter((c) => c.status === 'active').length,
      scheduled: state.campaigns.filter((c) => c.status === 'scheduled').length,
      paused: state.campaigns.filter((c) => c.status === 'paused').length
    };

    const target = qs('#ncr-stats');
    if (!target) return;
    target.innerHTML = [
      ['Total campaigns', stats.total, 'Campaigns in this module'],
      ['Active', stats.active, 'Currently visible when rewards can be fulfilled'],
      ['Scheduled', stats.scheduled, 'Calendar-ready campaigns'],
      ['Paused', stats.paused, 'Temporarily disabled']
    ].map(([label, value, hint]) => `
      <div class="ncr-card ncr-stat">
        <span class="ncr-stat__label">${escapeHtml(label)}</span>
        <span class="ncr-stat__value">${Number(value || 0)}</span>
        <span class="ncr-stat__hint">${escapeHtml(hint)}</span>
      </div>
    `).join('');
  }

  function campaignRow(campaign) {
    const starts = campaign.startsAt ? new Date(campaign.startsAt).toLocaleString() : 'Manual start';
    const ends = campaign.endsAt ? new Date(campaign.endsAt).toLocaleString() : 'No end date';
    const mode = String(campaign.rewardMode || 'stack_all').replace(/_/g, ' ');
    return `
      <div class="ncr-campaign-row">
        <div>
          <h3>${escapeHtml(campaign.name || campaign.publicTitle || 'Untitled campaign')}</h3>
          <div class="ncr-meta">
            ${statusPill(campaign.status)}
            <span>${escapeHtml(mode)}</span>
            <span>${escapeHtml(starts)}</span>
            <span>${escapeHtml(ends)}</span>
          </div>
        </div>
        <div class="ncr-pills">
          <button class="ncr-btn" type="button" data-ncr-action="edit-campaign" data-id="${escapeHtml(campaign._id || campaign.id)}">Edit</button>
        </div>
      </div>
    `;
  }

  function render() {
    renderStats();
    const rows = state.campaigns.length
      ? state.campaigns.map(campaignRow).join('')
      : '<div class="ncr-empty">No cart reward campaigns yet. Create one from a template or start fresh.</div>';

    const dash = qs('#ncr-dashboard-campaigns');
    const list = qs('#ncr-campaign-list');
    if (dash) dash.innerHTML = rows;
    if (list) list.innerHTML = rows;
  }

  function renderTemplates() {
    const target = qs('#ncr-template-list');
    if (!target) return;
    if (!state.templates.length) {
      target.innerHTML = '<div class="ncr-empty">No templates found. Seed the default templates from the backend seed file.</div>';
      return;
    }

    target.innerHTML = state.templates.map((template) => `
      <div class="ncr-template-row">
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(template.description || 'Milestone reward template')}</p>
          <div class="ncr-meta">
            <span>${escapeHtml(template.category || 'custom')}</span>
            <span>${(template.template?.tiers || []).length} tiers</span>
          </div>
        </div>
        <button class="ncr-btn" type="button" data-ncr-action="use-template" data-id="${escapeHtml(template._id || template.id)}">Use template</button>
      </div>
    `).join('');
  }

  function renderPlanner() {
    const target = qs('#ncr-planner-list');
    if (!target) return;
    if (!state.plannerEvents.length) {
      target.innerHTML = '<div class="ncr-empty">No scheduled promotions this month.</div>';
      return;
    }

    target.innerHTML = state.plannerEvents.map((event) => `
      <div class="ncr-planner-row">
        <div>
          <h3>${escapeHtml(event.title || event.name || 'Scheduled promotion')}</h3>
          <div class="ncr-meta">
            <span>${escapeHtml(event.status || 'scheduled')}</span>
            <span>${escapeHtml(event.startsAt ? new Date(event.startsAt).toLocaleString() : 'No start')}</span>
            <span>${escapeHtml(event.endsAt ? new Date(event.endsAt).toLocaleString() : 'No end')}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function createCampaign() {
    const name = prompt('Campaign name', 'Cart milestone rewards');
    if (!name) return;
    try {
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          publicTitle: 'Unlock free rewards',
          status: 'draft',
          triggerType: 'subtotal',
          rewardMode: 'stack_all',
          inventory: {
            soldOutBehaviour: 'hide',
            hideEmptyTiers: true,
            hideEmptyCampaigns: true,
            preferBackupRewards: true
          }
        })
      });
      showToast('Campaign created');
      await loadCampaigns();
      showPanel('campaigns');
    } catch (error) {
      showToast(error.message || 'Could not create campaign');
    }
  }

  async function saveDesign() {
    try {
      await api('/designs', {
        method: 'POST',
        body: JSON.stringify({
          widgetTitle: qs('#ncr-design-title')?.value || 'Unlock free rewards',
          primaryColor: qs('#ncr-design-primary')?.value || '#111827',
          borderRadius: Number(qs('#ncr-design-radius')?.value || 18),
          layout: qs('#ncr-design-layout')?.value || 'cards',
          showProgressBar: true,
          showRewardImages: true
        })
      });
      showToast('Cart Rewards design saved');
    } catch (error) {
      showToast(error.message || 'Could not save design');
    }
  }

  async function handleAction(action) {
    if (action === 'refresh') return loadCampaigns();
    if (action === 'new-campaign') return createCampaign();
    if (action === 'load-templates') return loadTemplates();
    if (action === 'load-planner') return loadPlanner();
    if (action === 'save-design') return saveDesign();
    if (action === 'edit-campaign') {
      showToast('Open the campaign builder next. Backend routes are ready for campaign/tier editing.');
    }
    if (action === 'use-template') {
      showToast('Template selected. Connect this button to create-campaign when ready.');
    }
  }

  function injectAssetsNotice() {
    if (!qs('link[href*="/modules/cart-rewards/admin.css"], link[href*="cart-rewards-admin.css"]')) {
      console.warn('Cart Rewards admin CSS is not loaded. Load /modules/cart-rewards/admin.css through module-shell.js or add it to public/admin.html.');
    }
  }

  function init() {
    installProductSwitcher();
    ensureCartRewardsView();
    injectAssetsNotice();

    // Optional deep-link for development: /admin?shop=...&product=cart-rewards
    const params = new URLSearchParams(window.location.search);
    if (params.get('product') === PRODUCT_CART_REWARDS || window.location.hash === '#cart-rewards') {
      setProductMode(PRODUCT_CART_REWARDS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.NectarCartRewardsAdmin = {
    setProductMode,
    showPanel,
    refresh: loadCampaigns,
    state
  };
})();
