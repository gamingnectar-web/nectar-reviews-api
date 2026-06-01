/* Nectar Reviews — deterministic help drawer
   Phase 1 support: no OpenAI, no vector store, no API cost.
   Load after admin.js and any admin enhancement scripts.
*/
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const SHOP = window.SHOP_DOMAIN || params.get('shop') || 'your-dev-store.myshopify.com';
  const API_BASE = window.API || 'https://nectar-reviews-api.onrender.com/api';

  let cachedState = null;
  let isOpen = false;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  function injectStyles() {
    if (document.getElementById('nr-help-drawer-style')) return;
    const style = document.createElement('style');
    style.id = 'nr-help-drawer-style';
    style.textContent = `
      .nr-help-launcher {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 99990;
        border: 0;
        border-radius: 999px;
        background: var(--primary, #111827);
        color: #fff;
        box-shadow: 0 14px 40px rgba(17, 24, 39, .24);
        padding: 13px 18px;
        font: inherit;
        font-weight: 850;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .nr-help-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99991;
        background: rgba(17, 24, 39, .32);
        opacity: 0;
        pointer-events: none;
        transition: opacity .18s ease;
      }
      .nr-help-backdrop.active {
        opacity: 1;
        pointer-events: auto;
      }
      .nr-help-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 99992;
        width: min(520px, 100%);
        background: #fff;
        box-shadow: -20px 0 60px rgba(17, 24, 39, .24);
        transform: translateX(105%);
        transition: transform .22s ease;
        display: flex;
        flex-direction: column;
        font-family: inherit;
      }
      .nr-help-drawer.active { transform: translateX(0); }
      .nr-help-head {
        padding: 22px;
        border-bottom: 1px solid var(--border, #e5e7eb);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      .nr-help-head h2 {
        margin: 0;
        color: var(--primary, #111827);
        font-size: 24px;
        letter-spacing: -.035em;
      }
      .nr-help-head p {
        margin: 7px 0 0;
        color: var(--text-light, #6b7280);
        font-size: 13px;
        line-height: 1.5;
      }
      .nr-help-close {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        border: 1px solid var(--border, #e5e7eb);
        background: #f9fafb;
        color: var(--primary, #111827);
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
      }
      .nr-help-body {
        overflow: auto;
        padding: 18px 22px 28px;
        display: grid;
        gap: 16px;
      }
      .nr-help-progress {
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 16px;
        padding: 16px;
        background: #f9fafb;
      }
      .nr-help-progress-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .nr-help-progress-top strong {
        color: var(--primary, #111827);
        font-size: 15px;
      }
      .nr-help-progress-top span {
        color: var(--text-light, #6b7280);
        font-size: 12px;
        font-weight: 850;
      }
      .nr-help-meter {
        height: 9px;
        border-radius: 999px;
        background: #e5e7eb;
        overflow: hidden;
      }
      .nr-help-meter > div {
        height: 100%;
        border-radius: inherit;
        background: var(--primary, #111827);
        transition: width .2s ease;
      }
      .nr-help-card {
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 16px;
        background: #fff;
        overflow: hidden;
      }
      .nr-help-card h3 {
        margin: 0;
        padding: 16px;
        border-bottom: 1px solid var(--border, #e5e7eb);
        color: var(--primary, #111827);
        font-size: 16px;
      }
      .nr-help-list { display: grid; gap: 0; }
      .nr-help-check, .nr-help-topic {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border, #e5e7eb);
      }
      .nr-help-check:last-child, .nr-help-topic:last-child { border-bottom: 0; }
      .nr-help-check {
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 10px;
      }
      .nr-help-status {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 13px;
        font-weight: 900;
      }
      .nr-help-status.ok { background: #dcfce7; color: #047857; }
      .nr-help-status.todo { background: #ffedd5; color: #c2410c; }
      .nr-help-check strong, .nr-help-topic strong {
        display: block;
        color: var(--primary, #111827);
        font-size: 13px;
        line-height: 1.35;
      }
      .nr-help-check p, .nr-help-topic p {
        margin: 4px 0 0;
        color: var(--text-light, #6b7280);
        font-size: 12px;
        line-height: 1.5;
      }
      .nr-help-topic button, .nr-help-refresh {
        margin-top: 10px;
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 10px;
        background: #f9fafb;
        color: var(--primary, #111827);
        padding: 9px 11px;
        font: inherit;
        font-size: 12px;
        font-weight: 850;
        cursor: pointer;
      }
      .nr-help-refresh { width: 100%; min-height: 42px; }
      .nr-help-error {
        padding: 14px;
        border: 1px solid #fecdd3;
        background: #fff1f2;
        color: #be123c;
        border-radius: 14px;
        font-size: 13px;
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
  }

  async function loadState(force) {
    if (cachedState && !force) return cachedState;

    const urls = {
      settings: `${API_BASE}/admin/settings?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`,
      reviews: `${API_BASE}/admin/reviews?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`,
      stats: `${API_BASE}/admin/stats?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`,
      email: `${API_BASE}/admin/email-settings?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`,
    };

    const [settings, reviews, stats, email] = await Promise.all([
      fetchJson(urls.settings).catch((error) => ({ __error: error.message })),
      fetchJson(urls.reviews).catch((error) => ({ __error: error.message })),
      fetchJson(urls.stats).catch((error) => ({ __error: error.message })),
      fetchJson(urls.email).catch((error) => ({ __error: error.message, optional: true })),
    ]);

    cachedState = { settings, reviews, stats, email, loadedAt: Date.now() };
    return cachedState;
  }

  function isError(value) {
    return value && value.__error;
  }

  function buildChecks(state) {
    const settings = isError(state.settings) ? {} : (state.settings || {});
    const reviews = Array.isArray(state.reviews) ? state.reviews : [];
    const stats = isError(state.stats) ? {} : (state.stats || {});
    const email = isError(state.email) ? null : state.email;

    const liveReviews = reviews.filter((r) => r && r.status === 'accepted' && !r.isDeleted && !r.isTestReview);
    const pendingReviews = reviews.filter((r) => r && r.status === 'pending' && !r.isDeleted && !r.isTestReview);
    const deletedReviews = reviews.filter((r) => r && r.isDeleted);
    const hasFlowBuilder = !!document.getElementById('flow-code-output') || !!document.getElementById('v-msg');
    const hasManualInstall = !!document.getElementById('v-dev') || /rev-widget|Manual Installation/i.test(document.body.textContent || '');
    const hasValidShop = SHOP && SHOP !== 'your-dev-store.myshopify.com' && /\.myshopify\.com$/i.test(SHOP);
    const sources = stats.sources || {};

    return [
      {
        id: 'shop-context',
        ok: hasValidShop,
        title: 'Open app with a real shop context',
        body: hasValidShop ? `Current shop: ${SHOP}` : 'The admin is using the fallback dev shop. Open the app from Shopify admin so ?shop=your-store.myshopify.com is present.',
        tab: 'v-dash',
      },
      {
        id: 'api-settings',
        ok: !isError(state.settings),
        title: 'Settings endpoint is reachable',
        body: isError(state.settings) ? state.settings.__error : 'The admin can load merchant settings.',
        tab: 'v-set',
      },
      {
        id: 'api-reviews',
        ok: Array.isArray(state.reviews),
        title: 'Reviews endpoint is reachable',
        body: Array.isArray(state.reviews) ? `${reviews.length} review records loaded.` : state.reviews.__error,
        tab: 'v-mgr',
      },
      {
        id: 'live-review',
        ok: liveReviews.length > 0,
        title: 'At least one review is live',
        body: liveReviews.length ? `${liveReviews.length} accepted review(s) are available for storefront widgets.` : `${pendingReviews.length} pending review(s). Accept one review to test storefront output.`,
        tab: 'v-mgr',
      },
      {
        id: 'not-trash-only',
        ok: reviews.length === 0 || deletedReviews.length < reviews.length,
        title: 'Reviews are not all in trash',
        body: deletedReviews.length ? `${deletedReviews.length} review(s) are in trash.` : 'No trashed reviews blocking display.',
        tab: 'v-trash',
      },
      {
        id: 'seo',
        ok: settings.seo ? settings.seo.richSnippets !== false : true,
        title: 'Rich snippets are enabled',
        body: settings.seo && settings.seo.richSnippets === false ? 'SEO rich snippets are currently disabled.' : 'Google rich snippets are enabled or using the default enabled state.',
        tab: 'v-set',
      },
      {
        id: 'auto-approve',
        ok: !!settings.autoApproveEnabled,
        title: 'Automated publishing is configured',
        body: settings.autoApproveEnabled ? `Auto-approve is on for ${settings.autoApproveType || 'verified'} reviews, ${settings.autoApproveMinStars || 4}+ stars.` : 'Optional, but useful: turn on auto-approve once moderation rules are stable.',
        tab: 'v-set',
      },
      {
        id: 'flow-builder',
        ok: hasFlowBuilder,
        title: 'Messaging / Flow builder is available',
        body: hasFlowBuilder ? 'Review-request email HTML can be generated in Messaging & Campaigns.' : 'The Messaging & Campaigns builder was not found on this page.',
        tab: 'v-msg',
      },
      {
        id: 'email-provider',
        ok: !email || !!email.enabled,
        title: 'Merchant email provider',
        body: !email ? 'Email settings endpoint is optional or not installed yet.' : (email.enabled ? `${email.provider || 'SMTP'} is configured.` : 'Email sending is not configured. Test emails may fall back to a manual mail draft.'),
        tab: 'v-msg',
      },
      {
        id: 'manual-install',
        ok: hasManualInstall,
        title: 'Manual install instructions exist',
        body: hasManualInstall ? 'The product widget and carousel setup instructions are available.' : 'Manual setup block not found. Add visible install instructions for merchants.',
        tab: 'v-dev',
      },
      {
        id: 'source-breakdown',
        ok: Number(sources.website || 0) + Number(sources.email || 0) + Number(sources.import || 0) > 0,
        title: 'Review source tracking has data',
        body: `Website: ${sources.website || 0}, Email: ${sources.email || 0}, Import: ${sources.import || 0}.`,
        tab: 'v-dash',
      },
    ];
  }

  function buildTopics(checks) {
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    const topics = [];

    if (!byId['shop-context'].ok) {
      topics.push({
        title: 'The dashboard is showing the dev store',
        body: 'Open the app from Shopify admin so the shop query parameter is passed through. This prevents data loading from the fallback domain.',
        tab: 'v-dash',
      });
    }

    if (!byId['live-review'].ok) {
      topics.push({
        title: 'Reviews are not showing on the storefront',
        body: 'Accept at least one real review, make sure it is not in Trash, then test the product widget with that product ID.',
        tab: 'v-mgr',
      });
    }

    if (!byId['flow-builder'].ok || !byId['email-provider'].ok) {
      topics.push({
        title: 'Test email is not sending',
        body: 'Check Messaging & Campaigns. If SMTP settings are not saved, backend sending may fail and the UI should fall back to a manual email draft.',
        tab: 'v-msg',
      });
    }

    if (!byId['auto-approve'].ok) {
      topics.push({
        title: 'Reviews stay pending',
        body: 'This is expected while auto-approve is off. Turn it on only after your moderation rules and minimum star rating are correct.',
        tab: 'v-set',
      });
    }

    topics.push({
      title: 'Product widget installation',
      body: 'Use Manual Setup to add the product page widget snippet. Then test with a product that has at least one accepted review.',
      tab: 'v-dev',
    });

    topics.push({
      title: 'CSV import troubleshooting',
      body: 'Map Product ID and Star Rating first. If auto-mapping turns red, use the product picker or paste the numeric Shopify product ID manually.',
      tab: 'v-import',
    });

    return topics;
  }

  function progressHtml(checks) {
    const complete = checks.filter((check) => check.ok).length;
    const pct = checks.length ? Math.round((complete / checks.length) * 100) : 0;
    return `
      <div class="nr-help-progress">
        <div class="nr-help-progress-top">
          <strong>Setup health</strong>
          <span>${complete}/${checks.length} complete</span>
        </div>
        <div class="nr-help-meter"><div style="width:${pct}%"></div></div>
      </div>
    `;
  }

  function checksHtml(checks) {
    return `
      <section class="nr-help-card">
        <h3>Setup checklist</h3>
        <div class="nr-help-list">
          ${checks.map((check) => `
            <div class="nr-help-check">
              <div class="nr-help-status ${check.ok ? 'ok' : 'todo'}">${check.ok ? '✓' : '!'}</div>
              <div>
                <strong>${escapeHtml(check.title)}</strong>
                <p>${escapeHtml(check.body)}</p>
                ${check.tab ? `<button data-nr-help-tab="${escapeHtml(check.tab)}">Go to this area</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function topicsHtml(topics) {
    return `
      <section class="nr-help-card">
        <h3>Common fixes</h3>
        <div class="nr-help-list">
          ${topics.map((topic) => `
            <div class="nr-help-topic">
              <strong>${escapeHtml(topic.title)}</strong>
              <p>${escapeHtml(topic.body)}</p>
              ${topic.tab ? `<button data-nr-help-tab="${escapeHtml(topic.tab)}">Open related tab</button>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function ensureShell() {
    if (document.getElementById('nr-help-drawer')) return;

    const launcher = document.createElement('button');
    launcher.id = 'nr-help-launcher';
    launcher.className = 'nr-help-launcher';
    launcher.type = 'button';
    launcher.innerHTML = 'Need help?';
    launcher.addEventListener('click', () => openDrawer(false));

    const backdrop = document.createElement('div');
    backdrop.id = 'nr-help-backdrop';
    backdrop.className = 'nr-help-backdrop';
    backdrop.addEventListener('click', closeDrawer);

    const drawer = document.createElement('aside');
    drawer.id = 'nr-help-drawer';
    drawer.className = 'nr-help-drawer';
    drawer.setAttribute('aria-label', 'Nectar Reviews help drawer');
    drawer.innerHTML = `
      <div class="nr-help-head">
        <div>
          <h2>Nectar Help</h2>
          <p>Deterministic setup checks and next steps. No AI, no API cost.</p>
        </div>
        <button class="nr-help-close" type="button" aria-label="Close help drawer">×</button>
      </div>
      <div class="nr-help-body" id="nr-help-body">
        <div class="nr-help-progress">Loading setup checks...</div>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    drawer.querySelector('.nr-help-close').addEventListener('click', closeDrawer);
    drawer.addEventListener('click', (event) => {
      const tabButton = event.target.closest('[data-nr-help-tab]');
      if (!tabButton) return;
      const tabId = tabButton.getAttribute('data-nr-help-tab');
      if (typeof window.tab === 'function') {
        window.tab(tabId);
        closeDrawer();
        toast('Opened related setup area');
      }
    });
  }

  async function renderDrawer(force) {
    const body = document.getElementById('nr-help-body');
    if (!body) return;
    body.innerHTML = '<div class="nr-help-progress">Loading setup checks...</div>';

    try {
      const state = await loadState(force);
      const checks = buildChecks(state);
      const topics = buildTopics(checks);
      body.innerHTML = `
        ${progressHtml(checks)}
        ${checksHtml(checks)}
        ${topicsHtml(topics)}
        <button class="nr-help-refresh" type="button" id="nr-help-refresh">Refresh checks</button>
      `;
      const refresh = document.getElementById('nr-help-refresh');
      if (refresh) refresh.addEventListener('click', () => renderDrawer(true));
    } catch (error) {
      body.innerHTML = `
        <div class="nr-help-error">
          Help drawer could not load setup state. ${escapeHtml(error.message || error)}
        </div>
        <button class="nr-help-refresh" type="button" id="nr-help-refresh">Try again</button>
      `;
      const refresh = document.getElementById('nr-help-refresh');
      if (refresh) refresh.addEventListener('click', () => renderDrawer(true));
    }
  }

  function openDrawer(force) {
    isOpen = true;
    document.getElementById('nr-help-backdrop').classList.add('active');
    document.getElementById('nr-help-drawer').classList.add('active');
    renderDrawer(force);
  }

  function closeDrawer() {
    isOpen = false;
    const backdrop = document.getElementById('nr-help-backdrop');
    const drawer = document.getElementById('nr-help-drawer');
    if (backdrop) backdrop.classList.remove('active');
    if (drawer) drawer.classList.remove('active');
  }

  function hookLoad() {
    if (window.__nrHelpDrawerLoadHooked || typeof window.load !== 'function') return;
    const originalLoad = window.load;
    window.load = async function () {
      const result = await originalLoad.apply(this, arguments);
      cachedState = null;
      if (isOpen) renderDrawer(true);
      return result;
    };
    window.__nrHelpDrawerLoadHooked = true;
  }

  function init() {
    injectStyles();
    ensureShell();
    hookLoad();
    console.log('[Nectar Reviews] Deterministic help drawer loaded.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
