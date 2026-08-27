
(function universalReviewWidgetManager() {
  if (window.__NECTAR_UNIVERSAL_WIDGET_MANAGER__) return;
  window.__NECTAR_UNIVERSAL_WIDGET_MANAGER__ = true;

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const canonical = [
    {
      key: 'reviews_widget',
      name: 'Reviews Widget',
      status: 'live',
      enabled: true,
      placement: 'Product page',
      description: 'Full customer review section for product pages.',
      editor: 'reviews'
    },
    {
      key: 'star_rating',
      name: 'Star Rating',
      status: 'live',
      enabled: true,
      placement: 'Product / collection cards',
      description: 'Compact rating stars and review count.',
      editor: 'star'
    },
    {
      key: 'reviews_carousel',
      name: 'Reviews Carousel',
      status: 'live',
      enabled: false,
      placement: 'Homepage / landing page',
      description: 'Carousel of approved reviews for social proof.',
      editor: 'carousel'
    },
    {
      key: 'seo_reviews_page',
      aliases: ['seo_page'],
      name: 'All Reviews SEO Page',
      status: 'live',
      enabled: false,
      placement: 'Dedicated /pages/reviews page',
      description: 'Searchable approved reviews page for customers, SEO and AI discovery.',
      editor: 'seo'
    },
    {
      key: 'reviews_tab',
      name: 'Reviews Tab',
      status: 'draft',
      enabled: false,
      placement: 'Floating tab',
      description: 'Store-wide floating access point for customer reviews.',
      editor: 'generic'
    }
  ];

  let state = { migrationMode: {}, widgets: [], summary: {} };
  let activeWidgetKey = '';

  function api(path, options = {}) {
    if (typeof window.adminFetch !== 'function') throw new Error('Admin API is not ready.');
    return window.adminFetch(path, options);
  }

  function canonicalKey(key) {
    const value = String(key || '');
    for (const item of canonical) {
      if (item.key === value || (item.aliases || []).includes(value)) return item.key;
    }
    return value;
  }

  function normalizeWidgets(remote = []) {
    const byKey = new Map();
    (Array.isArray(remote) ? remote : []).forEach((widget) => {
      const key = canonicalKey(widget.key);
      byKey.set(key, { ...widget, key });
    });

    const result = canonical.map((def) => {
      const saved = byKey.get(def.key) || {};
      byKey.delete(def.key);
      return { ...def, ...saved, key: def.key, editor: def.editor };
    });

    // Future-proofing: any backend widget that can actually be toggled must be visible.
    byKey.forEach((widget) => {
      if (widget.status !== 'coming_soon') {
        result.push({
          editor: 'generic',
          enabled: false,
          placement: 'Theme placement',
          description: '',
          ...widget
        });
      }
    });

    return result;
  }

  function statusLabel(status) {
    if (status === 'live') return 'Live-ready';
    if (status === 'draft') return 'Draft';
    if (status === 'coming_soon') return 'Coming soon';
    return String(status || 'Available').replace(/_/g, ' ');
  }

  function preview(widget) {
    if (widget.key === 'star_rating') return '<span class="uwm-stars">★★★★★</span><strong>4.8</strong><small>132 reviews</small>';
    if (widget.key === 'reviews_carousel') return '<span class="uwm-stars">★★★★★</span><strong>“Amazing quality…”</strong><small>Customer review carousel</small>';
    if (widget.key === 'seo_reviews_page') return '<strong>Customer Reviews</strong><input disabled value="Search reviews…" /><small>Searchable approved review archive</small>';
    if (widget.key === 'reviews_tab') return '<span class="uwm-tab-preview">★ Reviews</span><small>Floating storefront tab</small>';
    return '<span class="uwm-stars">★★★★★</span><strong>Customer Reviews</strong><small>Product review section</small>';
  }

  function ensureStyles() {
    if (document.getElementById('uwm-styles')) return;
    const style = document.createElement('style');
    style.id = 'uwm-styles';
    style.textContent = `
      .uwm-toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:0 0 18px;padding:18px;border:1px solid #dfe3e8;border-radius:16px;background:#fff}
      .uwm-toolbar h3{margin:0 0 6px}.uwm-toolbar p{margin:0;color:#6d7175;max-width:760px}
      .uwm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
      .uwm-card{border:1px solid #dfe3e8;border-radius:18px;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.035)}
      .uwm-preview{min-height:118px;padding:20px;background:#f7f8fa;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center}
      .uwm-preview input{width:min(230px,90%);padding:8px 10px;border:1px solid #dfe3e8;border-radius:9px;background:white}.uwm-stars{color:#f5b301;letter-spacing:1px}
      .uwm-body{padding:18px}.uwm-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.uwm-head h3{font-size:17px;margin:0}
      .uwm-pill{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase;background:#eef2f7;color:#475569}
      .uwm-pill.live{background:#dcfce7;color:#166534}.uwm-pill.draft{background:#fef3c7;color:#92400e}
      .uwm-meta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.uwm-meta span{padding:5px 8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#58606a}
      .uwm-body p{color:#6d7175;min-height:40px}.uwm-actions{display:flex;gap:8px;margin-top:15px}
      .uwm-actions button{border:1px solid #c9cccf;background:#fff;padding:9px 12px;border-radius:9px;font-weight:700;cursor:pointer}.uwm-actions button.primary{background:#111827;color:#fff;border-color:#111827}
      .uwm-switch{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700}.uwm-switch input{width:18px;height:18px}
      .uwm-modal-wrap{position:fixed;inset:0;background:rgba(15,23,42,.52);z-index:999999;display:none;align-items:center;justify-content:center;padding:20px}
      .uwm-modal-wrap.open{display:flex}.uwm-modal{width:min(850px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:20px;padding:22px;box-shadow:0 30px 90px rgba(15,23,42,.28)}
      .uwm-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.uwm-modal-head h2{margin:0}.uwm-close{border:0;background:#eef2f7;border-radius:999px;width:36px;height:36px;font-size:21px;cursor:pointer}
      .uwm-section{padding:16px 0;border-top:1px solid #e5e7eb;margin-top:16px}.uwm-section:first-of-type{border-top:0}
      .uwm-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.uwm-fields label{display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:13px}
      .uwm-fields label.full{grid-column:1/-1}.uwm-fields input,.uwm-fields textarea,.uwm-fields select{padding:10px 12px;border:1px solid #c9cccf;border-radius:10px;font:inherit}.uwm-fields textarea{min-height:90px}
      .uwm-setup{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.uwm-setup-card{padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}
      .uwm-note{padding:12px 14px;border-radius:11px;background:#eff6ff;color:#1e3a8a;margin:12px 0}.uwm-error{background:#fff1f2;color:#9f1239}
      .uwm-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.uwm-modal-actions button{padding:10px 14px;border-radius:9px;border:1px solid #c9cccf;background:#fff;font-weight:800;cursor:pointer}.uwm-modal-actions .primary{background:#111827;color:#fff;border-color:#111827}
      @media(max-width:700px){.uwm-fields{grid-template-columns:1fr}.uwm-fields label.full{grid-column:auto}.uwm-toolbar{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('uwm-modal-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'uwm-modal-wrap';
    wrap.className = 'uwm-modal-wrap';
    wrap.innerHTML = '<div class="uwm-modal" id="uwm-modal"></div>';
    wrap.addEventListener('click', (event) => {
      if (event.target === wrap) closeModal();
    });
    document.body.appendChild(wrap);
  }

  function closeModal() {
    document.getElementById('uwm-modal-wrap')?.classList.remove('open');
    activeWidgetKey = '';
  }

  async function saveAll() {
    const result = await api('/admin/migration', {
      method: 'PATCH',
      body: JSON.stringify({ migrationMode: state.migrationMode || {}, widgets: state.widgets })
    });
    state = { ...state, ...result, widgets: normalizeWidgets(result.widgets || state.widgets) };
    render();
    window.showToast?.('Widget settings saved.');
  }

  async function toggleWidget(key, checked) {
    const widget = state.widgets.find((item) => item.key === key);
    if (!widget) return;
    widget.enabled = Boolean(checked);
    try {
      await saveAll();
    } catch (error) {
      widget.enabled = !checked;
      render();
      window.showToast?.(error.message || 'Could not update widget.');
    }
  }

  function routeExistingEditor(widget) {
    closeModal();
    if (widget.key === 'reviews_widget') {
      window.tab?.('v-style');
      setTimeout(() => document.querySelector('button[onclick*="style-widget"]')?.click(), 60);
      return true;
    }
    if (widget.key === 'star_rating') {
      window.tab?.('v-style');
      setTimeout(() => document.querySelector('button[onclick*="style-card"]')?.click(), 60);
      return true;
    }
    if (widget.key === 'reviews_carousel') {
      window.tab?.('v-style');
      setTimeout(() => document.querySelector('button[onclick*="style-carousel"]')?.click(), 60);
      return true;
    }
    return false;
  }

  async function loadSeoSetup(modal) {
    const host = modal.querySelector('[data-seo-setup]');
    if (!host) return;
    host.innerHTML = '<div class="uwm-note">Checking the live review archive and Shopify page…</div>';
    try {
      const setup = await api('/admin/all-reviews-page-setup');
      const page = (setup.pageChecks || []).find((p) => /all reviews/i.test(p.label || '')) || {};
      host.innerHTML = `
        <div class="uwm-setup">
          <div class="uwm-setup-card"><strong>${Number(setup.acceptedReviews || 0)}</strong><br><small>approved reviews available</small></div>
          <div class="uwm-setup-card"><strong>${Number(setup.pendingReviews || 0)}</strong><br><small>reviews awaiting approval</small></div>
          <div class="uwm-setup-card"><strong>${esc(page.status || 'unknown')}</strong><br><small>/pages/${esc(page.handle || setup.recommendedPageHandle || 'reviews')}</small></div>
        </div>
        <div class="uwm-note">${esc(page.detail || 'Use the Nectar All Reviews SEO Page app block on the dedicated reviews page.')}</div>
        <div class="uwm-actions">
          <button type="button" data-create-reviews-page>Create / verify reviews page</button>
          ${page.url ? `<button type="button" data-preview-reviews-page>Open storefront page</button>` : ''}
        </div>
        <p style="font-size:12px;color:#6d7175;margin-top:10px">Theme block: <strong>${esc(setup.themeBlockName || 'All Reviews SEO Page')}</strong> · API: ${esc(setup.apiEndpoint || '')}</p>
      `;
      host.querySelector('[data-create-reviews-page]')?.addEventListener('click', createReviewsPage);
      host.querySelector('[data-preview-reviews-page]')?.addEventListener('click', () => window.open(page.url, '_blank', 'noopener'));
    } catch (error) {
      host.innerHTML = `<div class="uwm-note uwm-error">${esc(error.message || 'Could not inspect the All Reviews page.')}</div>`;
    }
  }

  async function createReviewsPage() {
    const handle = document.getElementById('uwm-seo-handle')?.value.trim() || 'reviews';
    try {
      const result = await api('/admin/storefront-pages/create', {
        method: 'POST',
        body: JSON.stringify({ type: 'all_reviews', handle })
      });
      window.showToast?.(result.message || 'Reviews page checked/created.');
      const modal = document.getElementById('uwm-modal');
      if (modal) loadSeoSetup(modal);
    } catch (error) {
      window.showToast?.(error.message || 'Could not create the reviews page.');
    }
  }

  function openSeoEditor(widget) {
    ensureModal();
    const config = widget.config || {};
    const modal = document.getElementById('uwm-modal');
    modal.innerHTML = `
      <div class="uwm-modal-head">
        <div><h2>All Reviews SEO Page</h2><p style="color:#6d7175;margin:6px 0 0">Searchable approved reviews page for customers, SEO and AI discovery.</p></div>
        <button class="uwm-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="uwm-section">
        <div class="uwm-fields">
          <label>Page handle<input id="uwm-seo-handle" value="${esc(config.handle || 'reviews')}" placeholder="reviews"></label>
          <label>Maximum reviews<input id="uwm-seo-limit" type="number" min="20" max="200" step="10" value="${Number(config.limit || 120)}"></label>
          <label class="full">Page title<input id="uwm-seo-title" value="${esc(config.title || 'Find your next favourite product')}"></label>
          <label class="full">Intro<textarea id="uwm-seo-intro">${esc(config.intro || 'Search real customer reviews by product, flavour profile, rating, ingredients, feeling or feedback. Recommendations are powered by approved review data.')}</textarea></label>
          <label class="full">Search placeholder<input id="uwm-seo-placeholder" value="${esc(config.placeholder || 'Search products, flavours, ratings, ingredients or feedback…')}"></label>
        </div>
        <div class="uwm-note">These values are kept in the Nectar widget configuration so the admin always has one visible source of truth. The Shopify theme app block remains the final storefront placement.</div>
      </div>
      <div class="uwm-section">
        <h3>Live page setup</h3>
        <div data-seo-setup></div>
      </div>
      <div class="uwm-section">
        <h3>What this page exposes</h3>
        <p style="color:#6d7175">Only accepted, non-test, non-deleted reviews are returned by the SEO review API. The page supports search, rating filters, review attributes and product recommendations.</p>
      </div>
      <div class="uwm-modal-actions">
        <button type="button" data-cancel>Cancel</button>
        <button type="button" class="primary" data-save>Save widget settings</button>
      </div>
    `;
    modal.querySelector('.uwm-close')?.addEventListener('click', closeModal);
    modal.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-save]')?.addEventListener('click', async () => {
      widget.config = {
        ...(widget.config || {}),
        handle: document.getElementById('uwm-seo-handle')?.value.trim() || 'reviews',
        limit: Math.max(20, Math.min(200, Number(document.getElementById('uwm-seo-limit')?.value || 120))),
        title: document.getElementById('uwm-seo-title')?.value.trim() || 'Customer Reviews',
        intro: document.getElementById('uwm-seo-intro')?.value.trim() || '',
        placeholder: document.getElementById('uwm-seo-placeholder')?.value.trim() || 'Search reviews…'
      };
      try { await saveAll(); closeModal(); }
      catch (error) { window.showToast?.(error.message || 'Could not save SEO widget settings.'); }
    });
    document.getElementById('uwm-modal-wrap').classList.add('open');
    loadSeoSetup(modal);
  }

  function openGenericEditor(widget) {
    ensureModal();
    const modal = document.getElementById('uwm-modal');
    modal.innerHTML = `
      <div class="uwm-modal-head">
        <div><h2>${esc(widget.name || 'Widget')}</h2><p style="color:#6d7175;margin:6px 0 0">Update the widget without hunting through another screen.</p></div>
        <button class="uwm-close" type="button">×</button>
      </div>
      <div class="uwm-section">
        <div class="uwm-fields">
          <label>Name<input id="uwm-name" value="${esc(widget.name || '')}"></label>
          <label>Placement<input id="uwm-placement" value="${esc(widget.placement || '')}"></label>
          <label class="full">Description<textarea id="uwm-description">${esc(widget.description || '')}</textarea></label>
          <label class="full">Render / theme hook<input value="${esc(widget.renderSnippet || 'Managed by app block')}" readonly></label>
        </div>
      </div>
      <div class="uwm-modal-actions">
        <button type="button" data-cancel>Cancel</button>
        <button type="button" class="primary" data-save>Save</button>
      </div>`;
    modal.querySelector('.uwm-close')?.addEventListener('click', closeModal);
    modal.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-save]')?.addEventListener('click', async () => {
      widget.name = document.getElementById('uwm-name')?.value.trim() || widget.name;
      widget.placement = document.getElementById('uwm-placement')?.value.trim() || widget.placement;
      widget.description = document.getElementById('uwm-description')?.value.trim() || '';
      try { await saveAll(); closeModal(); }
      catch (error) { window.showToast?.(error.message || 'Could not save widget.'); }
    });
    document.getElementById('uwm-modal-wrap').classList.add('open');
  }

  function editWidget(key) {
    const widget = state.widgets.find((item) => item.key === key);
    if (!widget) return;
    if (widget.editor === 'reviews' || widget.editor === 'star' || widget.editor === 'carousel') {
      routeExistingEditor(widget);
      return;
    }
    if (widget.key === 'seo_reviews_page') {
      openSeoEditor(widget);
      return;
    }
    openGenericEditor(widget);
  }

  function render() {
    ensureStyles();
    const grid = document.getElementById('review-widget-library-grid');
    if (!grid) return;
    grid.classList.add('uwm-grid');
    grid.innerHTML = state.widgets
      .filter((widget) => widget.status !== 'coming_soon')
      .map((widget) => `
        <article class="uwm-card" data-widget-key="${esc(widget.key)}">
          <div class="uwm-preview">${preview(widget)}</div>
          <div class="uwm-body">
            <div class="uwm-head">
              <div><h3>${esc(widget.name)}</h3></div>
              <label class="uwm-switch"><input type="checkbox" data-widget-toggle="${esc(widget.key)}" ${widget.enabled ? 'checked' : ''}> ${widget.enabled ? 'On' : 'Off'}</label>
            </div>
            <p>${esc(widget.description || '')}</p>
            <div class="uwm-meta">
              <span class="uwm-pill ${esc(widget.status)}">${esc(statusLabel(widget.status))}</span>
              <span>${esc(widget.placement || 'Theme placement')}</span>
            </div>
            <div class="uwm-actions">
              <button type="button" class="primary" data-widget-edit="${esc(widget.key)}">Update</button>
            </div>
          </div>
        </article>`).join('');

    grid.querySelectorAll('[data-widget-toggle]').forEach((input) => {
      input.addEventListener('change', () => toggleWidget(input.dataset.widgetToggle, input.checked));
    });
    grid.querySelectorAll('[data-widget-edit]').forEach((button) => {
      button.addEventListener('click', () => editWidget(button.dataset.widgetEdit));
    });
  }

  async function load() {
    const grid = document.getElementById('review-widget-library-grid');
    if (!grid) return;
    try {
      const remote = await api(`/admin/migration?t=${Date.now()}`);
      state = {
        ...remote,
        migrationMode: remote.migrationMode || {},
        widgets: normalizeWidgets(remote.widgets || [])
      };
      render();
    } catch (error) {
      grid.innerHTML = `<div class="uwm-note uwm-error">Could not load widgets: ${esc(error.message || 'Unknown error')}</div>`;
    }
  }

  // Override the old edit function so every toggleable widget has a valid update surface.
  window.editReviewWidget = editWidget;
  window.loadUniversalReviewWidgets = load;

  const previousTab = window.tab;
  if (typeof previousTab === 'function') {
    window.tab = function(id) {
      previousTab(id);
      if (id === 'v-widget-library') setTimeout(load, 80);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureStyles();
    ensureModal();
    setTimeout(load, 1200);
  });
})();
