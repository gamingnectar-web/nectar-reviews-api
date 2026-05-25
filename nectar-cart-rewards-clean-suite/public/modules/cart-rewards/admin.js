(function NectarCartRewardsAdmin() {
  const PRODUCT_REVIEW_WIDGET = 'review-widget';
  const PRODUCT_CART_REWARDS = 'cart-rewards';
  const ACTIVE_CLASS = 'ncr-cart-product-active';

  const emptyBuilder = () => ({
    campaignId: null,
    name: '',
    publicTitle: 'Unlock free rewards',
    description: '',
    status: 'draft',
    triggerType: 'subtotal',
    rewardMode: 'stack_all',
    startsAt: '',
    endsAt: '',
    timezone: 'Europe/London',
    inventory: {
      soldOutBehaviour: 'hide',
      hideEmptyTiers: true,
      hideEmptyCampaigns: true,
      preferBackupRewards: true
    },
    tiers: [
      {
        title: 'First reward',
        thresholdType: 'subtotal',
        thresholdValue: 2500,
        currencyCode: 'GBP',
        sortOrder: 1,
        rewards: []
      }
    ]
  });

  const state = {
    product: PRODUCT_REVIEW_WIDGET,
    panel: 'dashboard',
    campaigns: [],
    templates: [],
    plannerEvents: [],
    analytics: null,
    products: [],
    loading: false,
    hydrated: false,
    lastReviewViewId: sessionStorage.getItem('nectar_last_review_view') || 'v-dash',
    builder: emptyBuilder(),
    activeTierIndex: 0
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

  function moneyFromMinor(value, currency = 'GBP') {
    const amount = Number(value || 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch (_) {
      return `${currency} ${amount.toFixed(2)}`;
    }
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

  function toast(message, tone = 'info') {
    if (window.showToast) return window.showToast(message);
    const root = ensureToastRoot();
    const item = document.createElement('div');
    item.className = `ncr-toast ncr-toast--${tone}`;
    item.textContent = message;
    root.appendChild(item);
    setTimeout(() => item.classList.add('is-visible'), 20);
    setTimeout(() => {
      item.classList.remove('is-visible');
      setTimeout(() => item.remove(), 220);
    }, 3600);
  }

  function ensureToastRoot() {
    let root = qs('#ncr-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ncr-toast-root';
      root.className = 'ncr-toast-root';
      document.body.appendChild(root);
    }
    return root;
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

    const dashboardButton = qsa('button, a').find((button) => {
      const onclick = button.getAttribute('onclick') || '';
      const text = (button.textContent || '').trim().toLowerCase();
      return onclick.includes('v-dash') || text === 'dashboard';
    });

    return dashboardButton ? dashboardButton.closest('div, aside, nav, section') : null;
  }

  function findMainContent() {
    const direct = qs('main') || qs('[role="main"]') || qs('.main-content') || qs('.admin-content') || qs('.content');
    if (direct) return direct;

    const firstView = qs('.view, [id^="v-"]');
    if (firstView && firstView.parentElement && firstView.parentElement !== document.body) return firstView.parentElement;

    return document.body;
  }

  function isCartWorkspaceNode(node) {
    return node && node.nodeType === 1 && (
      node.id === 'ncr-cart-workspace' ||
      node.id === 'v-cart-rewards' ||
      node.classList.contains('nectar-cart-rewards-admin-view')
    );
  }

  function ensureWorkspaces() {
    const main = findMainContent();
    let reviewWorkspace = qs('#ncr-review-workspace');
    let cartWorkspace = qs('#ncr-cart-workspace');

    if (!reviewWorkspace) {
      reviewWorkspace = document.createElement('div');
      reviewWorkspace.id = 'ncr-review-workspace';
      reviewWorkspace.className = 'ncr-review-workspace';

      const canWrapMainChildren = main !== document.body;
      const nodesToMove = canWrapMainChildren
        ? Array.from(main.childNodes).filter((node) => !isCartWorkspaceNode(node))
        : qsa('.view, [id^="v-"]').filter((node) => !isCartWorkspaceNode(node));

      nodesToMove.forEach((node) => reviewWorkspace.appendChild(node));
      main.appendChild(reviewWorkspace);
    }

    if (!cartWorkspace) {
      cartWorkspace = document.createElement('div');
      cartWorkspace.id = 'ncr-cart-workspace';
      cartWorkspace.className = 'ncr-cart-workspace';
      cartWorkspace.style.display = 'none';
      main.appendChild(cartWorkspace);
    }

    return { main, reviewWorkspace, cartWorkspace };
  }

  function getVisibleReviewView() {
    const reviewWorkspace = qs('#ncr-review-workspace');
    const scope = reviewWorkspace || document;
    return qs('.view.active, [id^="v-"].active', scope) ||
      qsa('.view, [id^="v-"]', scope).find((el) => {
        if (el.id === 'v-cart-rewards') return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        return !style || style.display !== 'none';
      }) ||
      qs('#v-dash', scope) ||
      qs('.view, [id^="v-"]', scope);
  }

  function rememberCurrentReviewView() {
    const visible = getVisibleReviewView();
    if (visible && visible.id && visible.id !== 'v-cart-rewards') {
      state.lastReviewViewId = visible.id;
      sessionStorage.setItem('nectar_last_review_view', visible.id);
    }
  }

  function restoreReviewView() {
    const reviewWorkspace = qs('#ncr-review-workspace');
    const scope = reviewWorkspace || document;
    const targetId = state.lastReviewViewId || sessionStorage.getItem('nectar_last_review_view') || 'v-dash';

    if (typeof window.tab === 'function') {
      try {
        window.tab(targetId);
      } catch (error) {
        console.warn('[cart-rewards] review tab restore failed', error);
      }
    }

    let target = null;
    try {
      target = qs(`#${CSS.escape(targetId)}`, scope);
    } catch (_) {
      target = qs('#v-dash', scope);
    }
    target = target || qs('#v-dash', scope) || qs('.view, [id^="v-"]', scope);

    if (target) {
      qsa('.view, [id^="v-"]', scope).forEach((el) => {
        if (el.id === 'v-cart-rewards') return;
        if (el === target) {
          el.classList.add('active');
          el.style.display = '';
        }
      });
    }
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
      <button type="button" data-ncr-panel="builder">Builder</button>
      <button type="button" data-ncr-panel="planner">Planner</button>
      <button type="button" data-ncr-panel="templates">Templates</button>
      <button type="button" data-ncr-panel="design">Design</button>
      <button type="button" data-ncr-panel="analytics">Analytics</button>
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
    const { cartWorkspace } = ensureWorkspaces();
    let view = qs('#v-cart-rewards', cartWorkspace) || qs('#v-cart-rewards');
    if (view) {
      if (view.parentElement !== cartWorkspace) cartWorkspace.appendChild(view);
      return view;
    }

    view = document.createElement('section');
    view.id = 'v-cart-rewards';
    view.className = 'nectar-cart-rewards-admin-view';
    view.style.display = 'none';
    view.innerHTML = `
      <div class="ncr-shell">
        <div class="ncr-hero">
          <div>
            <span class="ncr-eyebrow">Cart Rewards</span>
            <h1>Cart Milestone Rewards</h1>
            <p>Premium cart drawer, cart page and checkout reward campaigns. Milestones use cart data, reward inventory and signed claim tokens only.</p>
          </div>
          <div class="ncr-hero__actions">
            <button class="ncr-btn" type="button" data-ncr-action="refresh">Refresh</button>
            <button class="ncr-btn ncr-btn--primary" type="button" data-ncr-action="new-campaign">New campaign</button>
          </div>
        </div>

        <div class="ncr-panel active" data-ncr-panel-view="dashboard">
          <div class="ncr-grid ncr-grid--stats" id="ncr-stats"></div>
          <div class="ncr-grid ncr-grid--two ncr-mt">
            <div class="ncr-card">
              <div class="ncr-card__header">
                <div>
                  <h2>Campaigns</h2>
                  <p>Live, scheduled and draft promotions live here. Reviews remain in the review-widget workspace.</p>
                </div>
                <button class="ncr-btn" type="button" data-ncr-action="open-builder">Open builder</button>
              </div>
              <div class="ncr-list" id="ncr-dashboard-campaigns"></div>
            </div>
            <div class="ncr-card ncr-card--dark">
              <span class="ncr-eyebrow">Safe by default</span>
              <h2>Inventory-gated milestones</h2>
              <p>Sold-out rewards are hidden by default. Empty tiers vanish, and the whole block hides when nothing can be fulfilled unless the merchant deliberately allows continuation or backups.</p>
              <div class="ncr-pills">
                <span class="ncr-pill">Cart drawer</span>
                <span class="ncr-pill">Cart page</span>
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

        <div class="ncr-panel" data-ncr-panel-view="builder">
          <div class="ncr-builder-layout">
            <div class="ncr-card ncr-builder-card">
              <div class="ncr-card__header">
                <div>
                  <h2>Campaign builder</h2>
                  <p>Add products, tiers, schedule and inventory handling without touching review settings.</p>
                </div>
                <button class="ncr-btn ncr-btn--primary" type="button" data-ncr-action="save-builder">Save campaign</button>
              </div>
              <div id="ncr-builder-root"></div>
            </div>
            <div class="ncr-card ncr-preview-card">
              <h2>Live preview</h2>
              <div id="ncr-builder-preview"></div>
            </div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="planner">
          <div class="ncr-card">
            <div class="ncr-card__header">
              <div>
                <h2>Planner</h2>
                <p>Calendar starts and ends, campaign swaps, and seasonal promotional planning.</p>
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
                <p>Start from useful milestone structures, then attach live Shopify products.</p>
              </div>
              <button class="ncr-btn" type="button" data-ncr-action="load-templates">Refresh templates</button>
            </div>
            <div class="ncr-list" id="ncr-template-list"></div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="design">
          <div class="ncr-grid ncr-grid--two">
            <div class="ncr-card">
              <h2>Appearance</h2>
              <p>Control the cart drawer and cart page feel from the app, not hard-coded theme edits.</p>
              <div id="ncr-design-root"></div>
              <div class="ncr-actions-row">
                <button class="ncr-btn ncr-btn--primary" type="button" data-ncr-action="save-design">Save design</button>
              </div>
            </div>
            <div class="ncr-card">
              <h2>Storefront preview</h2>
              <div id="ncr-design-preview"></div>
            </div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="analytics">
          <div class="ncr-card">
            <div class="ncr-card__header">
              <div>
                <h2>Reward analytics</h2>
                <p>See campaign effectiveness, reward claims, anonymous usage, and optimised reward signals.</p>
              </div>
              <button class="ncr-btn" type="button" data-ncr-action="load-analytics">Refresh analytics</button>
            </div>
            <div id="ncr-analytics-root"></div>
          </div>
        </div>

        <div class="ncr-panel" data-ncr-panel-view="settings">
          <div class="ncr-card">
            <h2>Privacy and fulfilment boundary</h2>
            <p>This module only evaluates shop domain, cart totals, cart line items, reward variant availability and signed reward claim tokens. Customer profile data is not needed.</p>
            <div class="ncr-pills">
              <span class="ncr-pill ncr-pill--active">No customer ID</span>
              <span class="ncr-pill ncr-pill--active">No customer email</span>
              <span class="ncr-pill ncr-pill--active">No customer tags</span>
              <span class="ncr-pill ncr-pill--active">Live inventory required</span>
              <span class="ncr-pill ncr-pill--active">Sold-out hidden by default</span>
            </div>
          </div>
        </div>
      </div>
    `;

    cartWorkspace.appendChild(view);

    qsa('[data-ncr-action]', view).forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.ncrAction, button));
    });

    renderBuilder();
    renderDesign();
    renderAnalytics();
    return view;
  }

  function setProductSwitcherLabel(product) {
    const current = qs('[data-ncr-current-product]');
    if (current) current.textContent = product === PRODUCT_CART_REWARDS ? 'Cart Milestone Rewards' : 'review-widget';
    qsa('[data-ncr-product]').forEach((button) => {
      const selected = button.dataset.ncrProduct === product || (product === PRODUCT_REVIEW_WIDGET && button.dataset.ncrProduct === 'reviews');
      button.setAttribute('aria-selected', String(selected));
    });
  }

  function setProductMode(product) {
    state.product = product === PRODUCT_CART_REWARDS ? PRODUCT_CART_REWARDS : PRODUCT_REVIEW_WIDGET;
    setProductSwitcherLabel(state.product);

    const sidebar = findSidebar();
    const { reviewWorkspace, cartWorkspace } = ensureWorkspaces();
    const view = ensureCartRewardsView();
    const cartNav = installCartNavigation();

    if (state.product === PRODUCT_CART_REWARDS) {
      rememberCurrentReviewView();
      document.body.classList.add(ACTIVE_CLASS);
      document.body.dataset.nectarActiveModule = PRODUCT_CART_REWARDS;
      getSidebarChildrenToHide(sidebar).forEach((child) => child.classList.add('ncr-hidden-original-nav'));
      if (cartNav) cartNav.style.display = '';
      reviewWorkspace.style.display = 'none';
      cartWorkspace.style.display = '';
      view.style.display = '';
      hydrateOnce();
      showPanel(state.panel || 'dashboard');
      return;
    }

    document.body.classList.remove(ACTIVE_CLASS);
    document.body.dataset.nectarActiveModule = 'reviews';
    getSidebarChildrenToHide(sidebar).forEach((child) => child.classList.remove('ncr-hidden-original-nav'));
    if (cartNav) cartNav.style.display = 'none';
    view.style.display = 'none';
    cartWorkspace.style.display = 'none';
    reviewWorkspace.style.display = '';
    restoreReviewView();
  }

  function showPanel(panel) {
    state.panel = panel || 'dashboard';
    qsa('#ncr-cart-nav [data-ncr-panel]').forEach((button) => {
      button.classList.toggle('active', button.dataset.ncrPanel === state.panel);
    });
    qsa('#v-cart-rewards [data-ncr-panel-view]').forEach((panelEl) => {
      panelEl.classList.toggle('active', panelEl.dataset.ncrPanelView === state.panel);
    });

    if (state.panel === 'builder') renderBuilder();
    if (state.panel === 'design') renderDesign();
    if (state.panel === 'analytics') loadAnalytics();
    if (state.panel === 'templates' && !state.templates.length) loadTemplates();
    if (state.panel === 'planner' && !state.plannerEvents.length) loadPlanner();
  }

  async function hydrateOnce() {
    if (state.hydrated || state.loading) return;
    state.hydrated = true;
    await Promise.allSettled([loadCampaigns(), loadTemplates(), loadAnalytics()]);
  }

  async function loadCampaigns() {
    state.loading = true;
    renderLoading();
    try {
      const json = await api('/campaigns');
      state.campaigns = json.campaigns || [];
      renderCampaigns();
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

  async function loadAnalytics() {
    const target = qs('#ncr-analytics-root');
    if (target) target.innerHTML = '<div class="ncr-empty">Loading analytics…</div>';
    try {
      const json = await api('/analytics/overview');
      state.analytics = json;
      renderAnalytics();
    } catch (error) {
      state.analytics = { error: error.message };
      renderAnalytics();
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
    const overview = state.analytics?.summary || {};
    const stats = {
      total: state.campaigns.length,
      active: state.campaigns.filter((c) => c.status === 'active').length,
      scheduled: state.campaigns.filter((c) => c.status === 'scheduled').length,
      claims: overview.claims || 0,
      revenue: overview.influencedRevenue || 0
    };

    const target = qs('#ncr-stats');
    if (!target) return;
    target.innerHTML = [
      ['Total campaigns', stats.total, 'Campaigns in this module'],
      ['Active', stats.active, 'Visible when rewards can be fulfilled'],
      ['Scheduled', stats.scheduled, 'Calendar-ready campaigns'],
      ['Claims', stats.claims, 'Rewards added to cart'],
      ['Influenced revenue', moneyFromMinor(stats.revenue), 'Orders with reward lines']
    ].map(([label, value, hint]) => `
      <div class="ncr-card ncr-stat">
        <span class="ncr-stat__label">${escapeHtml(label)}</span>
        <span class="ncr-stat__value">${escapeHtml(value)}</span>
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
        <div class="ncr-actions-row">
          <button class="ncr-btn" type="button" data-ncr-action="edit-campaign" data-id="${escapeHtml(campaign._id || campaign.id)}">Edit</button>
          <button class="ncr-btn" type="button" data-ncr-action="schedule-campaign" data-id="${escapeHtml(campaign._id || campaign.id)}">Schedule</button>
        </div>
      </div>
    `;
  }

  function renderCampaigns() {
    renderStats();
    const rows = state.campaigns.length
      ? state.campaigns.map(campaignRow).join('')
      : '<div class="ncr-empty">No cart reward campaigns yet. Create one from a template or start fresh.</div>';

    const dash = qs('#ncr-dashboard-campaigns');
    const list = qs('#ncr-campaign-list');
    if (dash) dash.innerHTML = rows;
    if (list) list.innerHTML = rows;

    qsa('[data-ncr-action="edit-campaign"]').forEach((button) => {
      button.addEventListener('click', () => openExistingCampaign(button.dataset.id));
    });
    qsa('[data-ncr-action="schedule-campaign"]').forEach((button) => {
      button.addEventListener('click', () => openScheduleModal(button.dataset.id));
    });
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

    qsa('[data-ncr-action="use-template"]', target).forEach((button) => {
      button.addEventListener('click', () => useTemplate(button.dataset.id));
    });
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

  function renderBuilder() {
    const root = qs('#ncr-builder-root');
    const preview = qs('#ncr-builder-preview');
    if (!root) return;
    const b = state.builder;

    root.innerHTML = `
      <div class="ncr-builder-section">
        <span class="ncr-section-label">1. Campaign details</span>
        <div class="ncr-form-grid ncr-form-grid--two">
          <label class="ncr-field">Campaign name<input class="ncr-input" data-builder="name" value="${escapeHtml(b.name)}" placeholder="Summer cart rewards"></label>
          <label class="ncr-field">Customer title<input class="ncr-input" data-builder="publicTitle" value="${escapeHtml(b.publicTitle)}" placeholder="Unlock free rewards"></label>
          <label class="ncr-field">Status<select class="ncr-select" data-builder="status">${options(['draft','scheduled','active','paused'], b.status)}</select></label>
          <label class="ncr-field">Reward mode<select class="ncr-select" data-builder="rewardMode">${options([['stack_all','Stack all unlocked tiers'],['highest_only','Highest tier only'],['choose_one','Customer chooses one']], b.rewardMode)}</select></label>
        </div>
      </div>

      <div class="ncr-builder-section">
        <div class="ncr-card__header">
          <div>
            <span class="ncr-section-label">2. Tiers and reward products</span>
            <p>Attach reward variants from the live Shopify catalogue. Unavailable rewards hide by default.</p>
          </div>
          <button type="button" class="ncr-btn" data-builder-action="add-tier">Add tier</button>
        </div>
        <div class="ncr-tier-editor-list">
          ${b.tiers.map((tier, index) => tierEditor(tier, index)).join('')}
        </div>
      </div>

      <div class="ncr-builder-section">
        <span class="ncr-section-label">3. Product picker</span>
        <div class="ncr-product-picker">
          <div class="ncr-field ncr-field--inline">
            <input class="ncr-input" id="ncr-product-search" placeholder="Search products for rewards">
            <button type="button" class="ncr-btn" data-builder-action="search-products">Search</button>
          </div>
          <div id="ncr-product-results" class="ncr-product-results">${renderProductResults()}</div>
        </div>
      </div>

      <div class="ncr-builder-section">
        <span class="ncr-section-label">4. Schedule and inventory</span>
        <div class="ncr-form-grid ncr-form-grid--two">
          <label class="ncr-field">Start date/time<input class="ncr-input" type="datetime-local" data-builder="startsAt" value="${toLocalDateTimeValue(b.startsAt)}"></label>
          <label class="ncr-field">End date/time<input class="ncr-input" type="datetime-local" data-builder="endsAt" value="${toLocalDateTimeValue(b.endsAt)}"></label>
          <label class="ncr-field">Sold-out behaviour<select class="ncr-select" data-builder-inventory="soldOutBehaviour">${options([['hide','Hide reward'],['disable','Show disabled'],['continue_selling','Continue selling'],['backup_only','Use backups only']], b.inventory.soldOutBehaviour)}</select></label>
          <label class="ncr-field">Timezone<input class="ncr-input" data-builder="timezone" value="${escapeHtml(b.timezone || 'Europe/London')}"></label>
        </div>
        <div class="ncr-check-grid">
          ${checkbox('hideEmptyTiers', 'Hide tiers when no rewards can be fulfilled', b.inventory.hideEmptyTiers)}
          ${checkbox('hideEmptyCampaigns', 'Hide widget when no campaign rewards can be fulfilled', b.inventory.hideEmptyCampaigns)}
          ${checkbox('preferBackupRewards', 'Allow configured backup rewards', b.inventory.preferBackupRewards)}
        </div>
      </div>
    `;

    bindBuilderEvents(root);
    if (preview) preview.innerHTML = renderCampaignPreview();
  }

  function options(items, selected) {
    return items.map((item) => {
      const value = Array.isArray(item) ? item[0] : item;
      const label = Array.isArray(item) ? item[1] : item;
      return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function checkbox(key, label, checked) {
    return `
      <label class="ncr-check">
        <input type="checkbox" data-builder-inventory="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function tierEditor(tier, index) {
    const active = index === state.activeTierIndex ? 'is-active' : '';
    return `
      <div class="ncr-tier-editor ${active}" data-tier-index="${index}">
        <div class="ncr-tier-editor__top">
          <button type="button" class="ncr-tier-editor__select" data-builder-action="select-tier" data-index="${index}">Tier ${index + 1}</button>
          <button type="button" class="ncr-btn ncr-btn--ghost" data-builder-action="remove-tier" data-index="${index}">Remove</button>
        </div>
        <div class="ncr-form-grid ncr-form-grid--two">
          <label class="ncr-field">Title<input class="ncr-input" data-tier-field="title" data-index="${index}" value="${escapeHtml(tier.title || '')}"></label>
          <label class="ncr-field">Threshold value<input class="ncr-input" type="number" data-tier-field="thresholdValue" data-index="${index}" value="${Number(tier.thresholdValue || 0)}"></label>
          <label class="ncr-field">Threshold type<select class="ncr-select" data-tier-field="thresholdType" data-index="${index}">${options([['subtotal','Cart subtotal'],['quantity','Cart quantity']], tier.thresholdType || 'subtotal')}</select></label>
          <label class="ncr-field">Currency<input class="ncr-input" data-tier-field="currencyCode" data-index="${index}" value="${escapeHtml(tier.currencyCode || 'GBP')}"></label>
        </div>
        <div class="ncr-reward-chip-list">
          ${(tier.rewards || []).map((reward, rewardIndex) => rewardChip(reward, index, rewardIndex)).join('') || '<span class="ncr-muted">No rewards attached yet.</span>'}
        </div>
      </div>
    `;
  }

  function rewardChip(reward, tierIndex, rewardIndex) {
    return `
      <span class="ncr-reward-chip">
        ${reward.imageUrl ? `<img src="${escapeHtml(reward.imageUrl)}" alt="">` : ''}
        <span>${escapeHtml(reward.title || reward.variantTitle || 'Reward')}</span>
        <button type="button" aria-label="Remove reward" data-builder-action="remove-reward" data-tier-index="${tierIndex}" data-reward-index="${rewardIndex}">×</button>
      </span>
    `;
  }

  function bindBuilderEvents(root) {
    qsa('[data-builder]', root).forEach((input) => {
      input.addEventListener('input', () => {
        state.builder[input.dataset.builder] = input.value;
        renderBuilderPreviewOnly();
      });
    });

    qsa('[data-builder-inventory]', root).forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.builderInventory;
        state.builder.inventory[key] = input.type === 'checkbox' ? input.checked : input.value;
      });
    });

    qsa('[data-tier-field]', root).forEach((input) => {
      input.addEventListener('input', () => {
        const tier = state.builder.tiers[Number(input.dataset.index)];
        if (!tier) return;
        tier[input.dataset.tierField] = input.type === 'number' ? Number(input.value || 0) : input.value;
        renderBuilderPreviewOnly();
      });
    });

    qsa('[data-builder-action]', root).forEach((button) => {
      button.addEventListener('click', () => handleBuilderAction(button.dataset.builderAction, button));
    });
  }

  function renderBuilderPreviewOnly() {
    const preview = qs('#ncr-builder-preview');
    if (preview) preview.innerHTML = renderCampaignPreview();
  }

  function renderCampaignPreview() {
    const b = state.builder;
    const sorted = [...(b.tiers || [])].sort((a, z) => Number(a.thresholdValue || 0) - Number(z.thresholdValue || 0));
    const max = sorted.length ? sorted[sorted.length - 1].thresholdValue : 100;
    return `
      <div class="ncr-storefront-preview ncr-storefront-preview--premium">
        <div class="ncr-storefront-preview__header">
          <strong>${escapeHtml(b.publicTitle || 'Unlock free rewards')}</strong>
          <span>${escapeHtml(String(b.rewardMode || 'stack_all').replace(/_/g, ' '))}</span>
        </div>
        <div class="ncr-preview-progress"><span style="width:${Math.min(72, Number(max ? 5000 / max * 100 : 0))}%"></span></div>
        <div class="ncr-preview-tier-list">
          ${sorted.map((tier) => `
            <div class="ncr-preview-tier">
              <div><strong>${escapeHtml(tier.title || 'Reward tier')}</strong><span>${moneyFromMinor(tier.thresholdValue, tier.currencyCode || 'GBP')}</span></div>
              <small>${(tier.rewards || []).length ? `${tier.rewards.length} reward option(s)` : 'Add reward product'}</small>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderProductResults() {
    if (!state.products.length) return '<div class="ncr-empty ncr-empty--small">Search products, then add a variant to the selected tier.</div>';
    return state.products.map((product) => `
      <div class="ncr-product-result">
        ${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="">` : '<span class="ncr-product-result__placeholder"></span>'}
        <div>
          <strong>${escapeHtml(product.title)}</strong>
          <div class="ncr-product-variants">
            ${(product.variants || []).map((variant) => `
              <button type="button" class="ncr-variant-pill" data-builder-action="add-product-reward"
                data-product-id="${escapeHtml(product.id)}"
                data-product-title="${escapeHtml(product.title)}"
                data-product-handle="${escapeHtml(product.handle || '')}"
                data-image-url="${escapeHtml(variant.imageUrl || product.imageUrl || '')}"
                data-variant-id="${escapeHtml(variant.id)}"
                data-variant-title="${escapeHtml(variant.title || 'Default')}"
                data-available="${variant.availableForSale !== false}">
                ${escapeHtml(variant.title || 'Default')} ${variant.availableForSale === false ? '· sold out' : ''}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `).join('');
  }

  async function handleBuilderAction(action, button) {
    if (action === 'add-tier') {
      state.builder.tiers.push({
        title: `Reward tier ${state.builder.tiers.length + 1}`,
        thresholdType: 'subtotal',
        thresholdValue: (state.builder.tiers.length + 1) * 2500,
        currencyCode: 'GBP',
        sortOrder: state.builder.tiers.length + 1,
        rewards: []
      });
      state.activeTierIndex = state.builder.tiers.length - 1;
      return renderBuilder();
    }

    if (action === 'remove-tier') {
      const index = Number(button.dataset.index);
      state.builder.tiers.splice(index, 1);
      state.activeTierIndex = Math.max(0, state.activeTierIndex - 1);
      return renderBuilder();
    }

    if (action === 'select-tier') {
      state.activeTierIndex = Number(button.dataset.index || 0);
      return renderBuilder();
    }

    if (action === 'remove-reward') {
      const tier = state.builder.tiers[Number(button.dataset.tierIndex)];
      if (tier) tier.rewards.splice(Number(button.dataset.rewardIndex), 1);
      return renderBuilder();
    }

    if (action === 'search-products') return searchProducts();

    if (action === 'add-product-reward') {
      const tier = state.builder.tiers[state.activeTierIndex];
      if (!tier) return toast('Select a tier first.', 'warning');
      tier.rewards = tier.rewards || [];
      tier.rewards.push({
        productId: button.dataset.productId,
        variantId: button.dataset.variantId,
        handle: button.dataset.productHandle,
        title: button.dataset.productTitle,
        variantTitle: button.dataset.variantTitle,
        imageUrl: button.dataset.imageUrl,
        quantity: 1,
        discountType: 'free',
        discountValue: 100,
        outOfStockBehaviour: button.dataset.available === 'false' ? 'hide' : 'hide',
        availableForSale: button.dataset.available !== 'false'
      });
      return renderBuilder();
    }
  }

  async function searchProducts() {
    const query = qs('#ncr-product-search')?.value || '';
    const resultRoot = qs('#ncr-product-results');
    if (resultRoot) resultRoot.innerHTML = '<div class="ncr-empty ncr-empty--small">Searching products…</div>';
    try {
      const json = await api(`/products/search?q=${encodeURIComponent(query)}&first=16`);
      state.products = json.products || [];
      if (resultRoot) {
        resultRoot.innerHTML = renderProductResults();
        qsa('[data-builder-action]', resultRoot).forEach((button) => {
          button.addEventListener('click', () => handleBuilderAction(button.dataset.builderAction, button));
        });
      }
      if (json.warning) toast(json.warning, 'warning');
    } catch (error) {
      if (resultRoot) resultRoot.innerHTML = `<div class="ncr-empty ncr-empty--small">${escapeHtml(error.message)}</div>`;
    }
  }

  async function saveBuilder() {
    const b = state.builder;
    if (!b.name.trim()) return toast('Add a campaign name first.', 'warning');
    if (!b.tiers.length) return toast('Add at least one tier.', 'warning');

    const payload = {
      name: b.name,
      publicTitle: b.publicTitle,
      description: b.description,
      status: b.status,
      triggerType: b.triggerType,
      rewardMode: b.rewardMode,
      startsAt: b.startsAt || null,
      endsAt: b.endsAt || null,
      timezone: b.timezone,
      inventory: b.inventory,
      tiers: b.tiers.map((tier, index) => ({
        ...tier,
        sortOrder: index + 1,
        thresholdValue: Number(tier.thresholdValue || 0),
        rewards: (tier.rewards || []).map((reward) => ({ ...reward, quantity: Number(reward.quantity || 1) }))
      }))
    };

    try {
      const json = b.campaignId
        ? await api(`/campaigns/${b.campaignId}/builder`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/campaigns/builder', { method: 'POST', body: JSON.stringify(payload) });

      state.builder.campaignId = json.campaign?._id || json.campaign?.id || b.campaignId;
      toast('Campaign saved.', 'success');
      await loadCampaigns();
      showPanel('campaigns');
    } catch (error) {
      toast(error.message || 'Could not save campaign.', 'error');
    }
  }

  function renderDesign() {
    const root = qs('#ncr-design-root');
    const preview = qs('#ncr-design-preview');
    if (!root) return;

    root.innerHTML = `
      <div class="ncr-form-grid ncr-form-grid--two">
        <label class="ncr-field">Widget title<input id="ncr-design-title" class="ncr-input" value="Unlock free rewards"></label>
        <label class="ncr-field">Subtitle<input id="ncr-design-subtitle" class="ncr-input" value="Add more to unlock exclusive gifts."></label>
        <label class="ncr-field">Layout<select id="ncr-design-layout" class="ncr-select">${options([['premium_cards','Premium cards'],['compact','Compact'],['drawer','Drawer first'],['timeline','Timeline']], 'premium_cards')}</select></label>
        <label class="ncr-field">Progress style<select id="ncr-design-progress" class="ncr-select">${options([['bar','Progress bar'],['steps','Milestone steps'],['minimal','Minimal text']], 'bar')}</select></label>
        <label class="ncr-field">Primary colour<input id="ncr-design-primary" class="ncr-input" type="color" value="#111827"></label>
        <label class="ncr-field">Accent colour<input id="ncr-design-accent" class="ncr-input" type="color" value="#f5b301"></label>
        <label class="ncr-field">Background<input id="ncr-design-bg" class="ncr-input" type="color" value="#ffffff"></label>
        <label class="ncr-field">Border radius<input id="ncr-design-radius" class="ncr-input" type="number" value="18"></label>
        <label class="ncr-field">Density<select id="ncr-design-density" class="ncr-select">${options([['comfortable','Comfortable'],['compact','Compact'],['spacious','Spacious']], 'comfortable')}</select></label>
        <label class="ncr-field">Drawer behaviour<select id="ncr-design-drawer" class="ncr-select">${options([['embedded','Embedded block'],['sticky','Sticky in drawer'],['collapsible','Collapsible panel']], 'embedded')}</select></label>
      </div>
      <div class="ncr-check-grid">
        <label class="ncr-check"><input id="ncr-surface-drawer" type="checkbox" checked><span>Show in cart drawer</span></label>
        <label class="ncr-check"><input id="ncr-surface-page" type="checkbox" checked><span>Show on cart page</span></label>
        <label class="ncr-check"><input id="ncr-surface-checkout" type="checkbox" checked><span>Show in checkout extension</span></label>
        <label class="ncr-check"><input id="ncr-design-images" type="checkbox" checked><span>Show reward images</span></label>
        <label class="ncr-check"><input id="ncr-design-locked" type="checkbox" checked><span>Show locked future rewards</span></label>
        <label class="ncr-check"><input id="ncr-design-remove" type="checkbox" checked><span>Allow remove buttons</span></label>
      </div>
    `;

    qsa('input, select', root).forEach((field) => field.addEventListener('input', renderDesignPreview));
    if (preview) preview.innerHTML = designPreviewHtml();
  }

  function renderDesignPreview() {
    const preview = qs('#ncr-design-preview');
    if (preview) preview.innerHTML = designPreviewHtml();
  }

  function designPreviewHtml() {
    const title = qs('#ncr-design-title')?.value || 'Unlock free rewards';
    const subtitle = qs('#ncr-design-subtitle')?.value || 'Add more to unlock exclusive gifts.';
    const primary = qs('#ncr-design-primary')?.value || '#111827';
    const accent = qs('#ncr-design-accent')?.value || '#f5b301';
    const bg = qs('#ncr-design-bg')?.value || '#ffffff';
    const radius = Number(qs('#ncr-design-radius')?.value || 18);
    const layout = qs('#ncr-design-layout')?.value || 'premium_cards';
    return `
      <div class="ncr-storefront-preview ncr-storefront-preview--${escapeHtml(layout)}" style="--ncr-preview-primary:${escapeHtml(primary)};--ncr-preview-accent:${escapeHtml(accent)};background:${escapeHtml(bg)};border-radius:${radius}px">
        <div class="ncr-storefront-preview__header"><strong>${escapeHtml(title)}</strong><span>Drawer preview</span></div>
        <p>${escapeHtml(subtitle)}</p>
        <div class="ncr-preview-progress"><span style="width:64%;background:${escapeHtml(accent)}"></span></div>
        <div class="ncr-preview-tier-list">
          <div class="ncr-preview-tier"><div><strong>Free sample</strong><span>Unlocked</span></div><button>Add</button></div>
          <div class="ncr-preview-tier"><div><strong>Premium shaker</strong><span>Spend £8 more</span></div><button disabled>Locked</button></div>
        </div>
      </div>
    `;
  }

  async function saveDesign() {
    try {
      await api('/designs', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Default Cart Rewards',
          widgetTitle: qs('#ncr-design-title')?.value || 'Unlock free rewards',
          widgetSubtitle: qs('#ncr-design-subtitle')?.value || 'Add more to unlock exclusive gifts.',
          primaryColor: qs('#ncr-design-primary')?.value || '#111827',
          accentColor: qs('#ncr-design-accent')?.value || '#f5b301',
          backgroundColor: qs('#ncr-design-bg')?.value || '#ffffff',
          borderRadius: Number(qs('#ncr-design-radius')?.value || 18),
          layout: qs('#ncr-design-layout')?.value || 'premium_cards',
          progressStyle: qs('#ncr-design-progress')?.value || 'bar',
          density: qs('#ncr-design-density')?.value || 'comfortable',
          drawerBehaviour: qs('#ncr-design-drawer')?.value || 'embedded',
          showProgressBar: true,
          showRewardImages: qs('#ncr-design-images')?.checked !== false,
          showLockedRewards: qs('#ncr-design-locked')?.checked !== false,
          showRemoveButton: qs('#ncr-design-remove')?.checked !== false,
          surfaces: {
            cartDrawer: qs('#ncr-surface-drawer')?.checked !== false,
            cartPage: qs('#ncr-surface-page')?.checked !== false,
            checkout: qs('#ncr-surface-checkout')?.checked !== false
          }
        })
      });
      toast('Cart Rewards design saved.', 'success');
    } catch (error) {
      toast(error.message || 'Could not save design.', 'error');
    }
  }

  function renderAnalytics() {
    const root = qs('#ncr-analytics-root');
    if (!root) return;
    const data = state.analytics;
    if (!data) {
      root.innerHTML = '<div class="ncr-empty">Analytics will appear once campaigns receive impressions, claims or conversions.</div>';
      return;
    }
    if (data.error) {
      root.innerHTML = `<div class="ncr-empty">${escapeHtml(data.error)}</div>`;
      return;
    }

    const summary = data.summary || {};
    root.innerHTML = `
      <div class="ncr-grid ncr-grid--stats">
        ${[
          ['Impressions', summary.impressions || 0, 'Widget views'],
          ['Unlocks', summary.unlocks || 0, 'Milestones reached'],
          ['Claims', summary.claims || 0, 'Rewards added'],
          ['Conversions', summary.conversions || 0, 'Reward orders'],
          ['Influenced revenue', moneyFromMinor(summary.influencedRevenue || 0), 'Orders with reward lines']
        ].map(([label, value, hint]) => `<div class="ncr-card ncr-stat"><span class="ncr-stat__label">${escapeHtml(label)}</span><span class="ncr-stat__value">${escapeHtml(value)}</span><span class="ncr-stat__hint">${escapeHtml(hint)}</span></div>`).join('')}
      </div>
      <div class="ncr-grid ncr-grid--two ncr-mt">
        <div class="ncr-card">
          <h3>Most used rewards</h3>
          <div class="ncr-list ncr-list--compact">
            ${(data.topRewards || []).map((reward) => `<div class="ncr-mini-row"><strong>${escapeHtml(reward.rewardTitle || reward.rewardVariantId || 'Reward')}</strong><span>${Number(reward.claims || 0)} claims</span></div>`).join('') || '<div class="ncr-empty ncr-empty--small">No reward claims yet.</div>'}
          </div>
        </div>
        <div class="ncr-card">
          <h3>Anonymous reward usage</h3>
          <p class="ncr-muted">This is deliberately anonymous unless you later opt into order-level attribution. No customer profile data is displayed here.</p>
          <div class="ncr-list ncr-list--compact">
            ${(data.recentClaims || []).map((claim) => `<div class="ncr-mini-row"><strong>${escapeHtml(claim.rewardVariantId || 'Reward')}</strong><span>${escapeHtml(claim.status || 'claimed')} · ${escapeHtml(claim.orderName || claim.cartRef || 'cart')}</span></div>`).join('') || '<div class="ncr-empty ncr-empty--small">No claims yet.</div>'}
          </div>
        </div>
      </div>
    `;
    renderStats();
  }

  function openModal({ title, description, body, footer, onMount }) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'ncr-modal-overlay';
    overlay.className = 'ncr-modal-overlay';
    overlay.innerHTML = `
      <div class="ncr-modal" role="dialog" aria-modal="true" aria-labelledby="ncr-modal-title">
        <div class="ncr-modal__header">
          <div><h2 id="ncr-modal-title">${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>
          <button class="ncr-modal__close" type="button" data-modal-close aria-label="Close">×</button>
        </div>
        <div class="ncr-modal__body">${body || ''}</div>
        <div class="ncr-modal__footer">${footer || `<button class="ncr-btn" type="button" data-modal-close>Close</button>`}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    qsa('[data-modal-close]', overlay).forEach((button) => button.addEventListener('click', closeModal));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    if (typeof onMount === 'function') onMount(overlay);
  }

  function closeModal() {
    const overlay = qs('#ncr-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    setTimeout(() => overlay.remove(), 160);
  }

  function openNewCampaignModal() {
    openModal({
      title: 'Create campaign',
      description: 'Start with the essentials, then finish tiers and products in the campaign builder.',
      body: `
        <div class="ncr-form-grid">
          <label class="ncr-field">Campaign name<input id="ncr-modal-campaign-name" class="ncr-input" value="Cart milestone rewards"></label>
          <label class="ncr-field">Customer-facing title<input id="ncr-modal-public-title" class="ncr-input" value="Unlock free rewards"></label>
          <label class="ncr-field">Reward mode<select id="ncr-modal-reward-mode" class="ncr-select">${options([['stack_all','Stack all unlocked tiers'],['highest_only','Highest tier only'],['choose_one','Customer chooses one']], 'stack_all')}</select></label>
        </div>
      `,
      footer: `
        <button class="ncr-btn" type="button" data-modal-close>Cancel</button>
        <button class="ncr-btn ncr-btn--primary" type="button" id="ncr-modal-create-campaign">Create and open builder</button>
      `,
      onMount: (overlay) => {
        qs('#ncr-modal-create-campaign', overlay).addEventListener('click', () => {
          const builder = emptyBuilder();
          builder.name = qs('#ncr-modal-campaign-name', overlay).value || 'Cart milestone rewards';
          builder.publicTitle = qs('#ncr-modal-public-title', overlay).value || 'Unlock free rewards';
          builder.rewardMode = qs('#ncr-modal-reward-mode', overlay).value || 'stack_all';
          state.builder = builder;
          state.activeTierIndex = 0;
          closeModal();
          showPanel('builder');
          renderBuilder();
        });
      }
    });
  }

  async function openExistingCampaign(id) {
    try {
      const json = await api(`/campaigns/${id}`);
      const campaign = json.campaign || {};
      state.builder = {
        ...emptyBuilder(),
        campaignId: campaign._id || campaign.id,
        name: campaign.name || '',
        publicTitle: campaign.publicTitle || 'Unlock free rewards',
        description: campaign.description || '',
        status: campaign.status || 'draft',
        triggerType: campaign.triggerType || 'subtotal',
        rewardMode: campaign.rewardMode || 'stack_all',
        startsAt: campaign.startsAt || '',
        endsAt: campaign.endsAt || '',
        timezone: campaign.timezone || 'Europe/London',
        inventory: campaign.inventory || emptyBuilder().inventory,
        tiers: (json.tiers || []).length ? json.tiers : emptyBuilder().tiers
      };
      state.activeTierIndex = 0;
      showPanel('builder');
      renderBuilder();
    } catch (error) {
      toast(error.message || 'Could not open campaign.', 'error');
    }
  }

  function openScheduleModal(id) {
    const campaign = state.campaigns.find((item) => String(item._id || item.id) === String(id)) || {};
    openModal({
      title: 'Schedule campaign',
      description: campaign.name || 'Choose when this promotion should be active.',
      body: `
        <div class="ncr-form-grid">
          <label class="ncr-field">Starts at<input id="ncr-schedule-start" type="datetime-local" class="ncr-input" value="${toLocalDateTimeValue(campaign.startsAt)}"></label>
          <label class="ncr-field">Ends at<input id="ncr-schedule-end" type="datetime-local" class="ncr-input" value="${toLocalDateTimeValue(campaign.endsAt)}"></label>
          <label class="ncr-check"><input id="ncr-schedule-auto" type="checkbox" checked><span>Automatically activate and expire</span></label>
        </div>
      `,
      footer: `
        <button class="ncr-btn" type="button" data-modal-close>Cancel</button>
        <button class="ncr-btn ncr-btn--primary" type="button" id="ncr-save-schedule">Save schedule</button>
      `,
      onMount: (overlay) => {
        qs('#ncr-save-schedule', overlay).addEventListener('click', async () => {
          try {
            await api(`/campaigns/${id}/schedule`, {
              method: 'POST',
              body: JSON.stringify({
                startsAt: qs('#ncr-schedule-start', overlay).value || null,
                endsAt: qs('#ncr-schedule-end', overlay).value || null,
                autoActivate: qs('#ncr-schedule-auto', overlay).checked,
                autoExpire: qs('#ncr-schedule-auto', overlay).checked
              })
            });
            closeModal();
            toast('Campaign scheduled.', 'success');
            await loadCampaigns();
            await loadPlanner();
          } catch (error) {
            toast(error.message || 'Could not schedule campaign.', 'error');
          }
        });
      }
    });
  }

  function useTemplate(id) {
    const template = state.templates.find((item) => String(item._id || item.id) === String(id));
    const b = emptyBuilder();
    b.name = template?.name ? `${template.name} campaign` : 'Cart milestone campaign';
    b.publicTitle = template?.template?.publicTitle || 'Unlock free rewards';
    b.rewardMode = template?.template?.rewardMode || 'stack_all';
    if (Array.isArray(template?.template?.tiers) && template.template.tiers.length) {
      b.tiers = template.template.tiers.map((tier, index) => ({
        title: tier.title || `Tier ${index + 1}`,
        thresholdType: tier.thresholdType || 'subtotal',
        thresholdValue: Number(tier.thresholdValue || ((index + 1) * 2500)),
        currencyCode: tier.currencyCode || 'GBP',
        sortOrder: index + 1,
        rewards: []
      }));
    }
    state.builder = b;
    state.activeTierIndex = 0;
    showPanel('builder');
    renderBuilder();
    toast('Template loaded into the builder. Add reward products next.', 'success');
  }

  function toLocalDateTimeValue(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function handleAction(action, source) {
    if (action === 'refresh') return loadCampaigns();
    if (action === 'new-campaign') return openNewCampaignModal();
    if (action === 'open-builder') { showPanel('builder'); return renderBuilder(); }
    if (action === 'save-builder') return saveBuilder();
    if (action === 'load-templates') return loadTemplates();
    if (action === 'load-planner') return loadPlanner();
    if (action === 'load-analytics') return loadAnalytics();
    if (action === 'save-design') return saveDesign();
    if (action === 'edit-campaign') return openExistingCampaign(source?.dataset?.id);
    if (action === 'schedule-campaign') return openScheduleModal(source?.dataset?.id);
  }

  function injectAssetsNotice() {
    if (!qs('link[href*="/modules/cart-rewards/admin.css"], link[href*="cart-rewards-admin.css"]')) {
      console.warn('Cart Rewards admin CSS is not loaded. Load /modules/cart-rewards/admin.css through module-shell.js or add it to public/admin.html.');
    }
  }

  function init() {
    if (!window.NectarModuleShell) installProductSwitcher();
    ensureCartRewardsView();
    injectAssetsNotice();

    window.addEventListener('nectar:module-change', (event) => {
      const next = event.detail?.module === PRODUCT_CART_REWARDS ? PRODUCT_CART_REWARDS : PRODUCT_REVIEW_WIDGET;
      setProductMode(next);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('product') === PRODUCT_CART_REWARDS || params.get('module') === PRODUCT_CART_REWARDS || window.location.hash === '#cart-rewards') {
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
