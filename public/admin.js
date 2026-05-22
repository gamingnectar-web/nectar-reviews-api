const API = `${window.location.origin}/api`;
const urlParams = new URLSearchParams(window.location.search);
const SHOP_DOMAIN = (urlParams.get('shop') || urlParams.get('shopDomain') || 'your-dev-store.myshopify.com').toLowerCase();

let data = [];
let dashboardCharts = {};
let currentAttributes = [];
let parsedCSVData = [];
let csvHeaders = [];
let mappedReviews = [];
let adminTokenPromise = null;

(function bootstrapAdminSecret() {
  const secret = urlParams.get('admin_secret');
  const signedToken = urlParams.get('admin_token');
  let changed = false;
  if (secret) {
    sessionStorage.setItem('nectar_admin_secret', secret);
    urlParams.delete('admin_secret');
    changed = true;
  }
  if (signedToken) {
    sessionStorage.setItem('nectar_admin_token', signedToken);
    urlParams.delete('admin_token');
    changed = true;
  }
  if (changed) {
    const cleanQuery = urlParams.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
})();

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function withShop(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}shopDomain=${encodeURIComponent(SHOP_DOMAIN)}`;
}

async function getAdminToken() {
  if (!adminTokenPromise) {
    adminTokenPromise = (async () => {
      try {
        if (window.shopify && typeof window.shopify.idToken === 'function') {
          return await window.shopify.idToken();
        }
      } catch (error) {
        console.warn('Could not get Shopify ID token:', error);
      }
      return '';
    })();
  }
  return adminTokenPromise;
}

async function adminFetch(path, options = {}) {
  const token = await getAdminToken();
  const secret = sessionStorage.getItem('nectar_admin_secret') || '';
  const signedToken = sessionStorage.getItem('nectar_admin_token') || '';
  const headers = {
    'Content-Type': 'application/json',
    'X-Shop-Domain': SHOP_DOMAIN,
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (signedToken) headers['X-Nectar-Admin-Token'] = signedToken;
  if (secret) headers['X-Nectar-Admin-Secret'] = secret;

  let res = await fetch(`${API}${withShop(path)}`, { ...options, headers, credentials: 'same-origin' });
  if (res.status === 401 && options.retryAuth !== false) {
    adminTokenPromise = null;
    const freshToken = await getAdminToken();
    if (freshToken && freshToken !== token) {
      headers.Authorization = `Bearer ${freshToken}`;
      res = await fetch(`${API}${withShop(path)}`, { ...options, headers, credentials: 'same-origin' });
    }
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const json = await res.json();
      message = json.error || json.detail || message;
    } catch (_) {}
    const error = new Error(message);
    error.status = res.status;
    if (res.status === 401) error.installUrl = `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(SHOP_DOMAIN)}&return_to=${encodeURIComponent('/admin?shop=' + SHOP_DOMAIN)}`;
    throw error;
  }
  return res.json();
}

window.openSecureAdminSession = function() {
  const url = `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(SHOP_DOMAIN)}&return_to=${encodeURIComponent('/admin?shop=' + SHOP_DOMAIN)}`;
  const popup = window.open(url, 'nectar-admin-auth', 'width=780,height=760');
  if (!popup) window.location.href = url;
};

window.adminFetch = adminFetch;
window.SHOP_DOMAIN = SHOP_DOMAIN;

window.showToast = function(msg) {
  if (window.shopify && window.shopify.toast) window.shopify.toast.show(msg);
  const toast = document.getElementById('custom-toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.style.top = '30px';
  setTimeout(() => { toast.style.top = '-100px'; }, 3000);
};

window.tab = function(id) {
  const target = document.getElementById(id);
  if (!target) return;
  document.querySelectorAll('.view, .tab-btn').forEach((el) => el.classList.remove('active'));
  target.classList.add('active');
  const activeBtn = document.querySelector(`button[onclick="window.tab('${id}')"]`);
  if (activeBtn) activeBtn.classList.add('active');
  if (id === 'v-dash') window.loadStats();
  if (['v-discounts', 'v-loyalty', 'v-referrals'].includes(id)) window.loadModules();
  if (id === 'v-loyalty') window.loadLoyaltyConfig?.();
};


window.docsTab = function(name) {
  document.querySelectorAll('#v-docs .docs-tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.docTab === name));
  document.querySelectorAll('#v-docs .docs-pane').forEach((pane) => pane.classList.toggle('active', pane.id === `docs-${name}`));
};

window.reviewManagerTab = function(name) {
  document.querySelectorAll('#v-mgr .admin-sub-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.reviewTab === name));
  document.querySelectorAll('#v-mgr .mgr-pane').forEach((pane) => pane.classList.toggle('active', pane.id === `mgr-pane-${name}`));
  if (name === 'trash') window.renderLists();
};

window.subTab = function(controlId, previewId) {
  document.querySelectorAll('.sub-view, .sub-tab-btn').forEach((el) => el.classList.remove('active'));
  document.getElementById(controlId)?.classList.add('active');
  const activeBtn = document.querySelector(`button[onclick="window.subTab('${controlId}', '${previewId}')"]`);
  if (activeBtn) activeBtn.classList.add('active');
  if (previewId) {
    document.querySelectorAll('.sub-preview').forEach((el) => el.classList.remove('active'));
    document.getElementById(previewId)?.classList.add('active');
  }
};

window.setPreviewMode = function(mode) {
  document.getElementById('btn-desk-prev')?.classList.toggle('active', mode === 'desktop');
  document.getElementById('btn-mob-prev')?.classList.toggle('active', mode === 'mobile');
  const prevContainer = document.getElementById('preview-container-wrap');
  if (!prevContainer) return;
  if (mode === 'mobile') {
    prevContainer.style.maxWidth = '375px';
    prevContainer.style.margin = '0 auto';
    prevContainer.style.border = '12px solid #1a1a1a';
    prevContainer.style.borderRadius = '32px';
    prevContainer.style.overflow = 'hidden';
    prevContainer.style.backgroundColor = '#ffffff';
  } else {
    prevContainer.style.maxWidth = '100%';
    prevContainer.style.margin = '0';
    prevContainer.style.border = 'none';
    prevContainer.style.borderRadius = '0';
    prevContainer.style.overflow = 'visible';
    prevContainer.style.backgroundColor = 'transparent';
  }
};

window.toggleImportInst = function() {
  const platform = document.getElementById('import-platform-select')?.value || 'generic';
  document.querySelectorAll('.import-inst-box').forEach((el) => el.classList.remove('active'));
  document.getElementById(`inst-${platform}`)?.classList.add('active');
};

window.fetchMetafields = async function() {
  try {
    const metafields = await adminFetch('/admin/metafields');
    const select = document.getElementById('attr-rule-val-meta');
    if (!select) return;
    if (!metafields.length) {
      select.innerHTML = '<option value="">No metafields found on this store</option>';
      return;
    }
    select.innerHTML = metafields.map((m) => `<option value="${escapeHtml(m.key)}">${escapeHtml(m.name)} (${escapeHtml(m.key)})</option>`).join('');
  } catch (error) {
    console.error(error);
  }
};

window.toggleRuleInput = function() {
  const type = document.getElementById('attr-rule-type')?.value || 'tag';
  const tagInput = document.getElementById('attr-rule-val-tag');
  const metaInput = document.getElementById('attr-rule-val-meta');
  if (type === 'tag') {
    if (tagInput) tagInput.style.display = 'block';
    if (metaInput) metaInput.style.display = 'none';
  } else {
    if (tagInput) tagInput.style.display = 'none';
    if (metaInput) metaInput.style.display = 'block';
    if (metaInput && metaInput.options.length <= 1) window.fetchMetafields();
  }
};

window.load = async function() {
  try {
    const session = await adminFetch('/admin/session');
    const security = document.getElementById('security-status');
    if (security) security.textContent = `Protected admin session active via ${session.authMode}. Shop: ${session.shopDomain}`;

    data = await adminFetch(`/admin/reviews?t=${Date.now()}`);
    const config = await adminFetch(`/admin/settings?t=${Date.now()}`);
    hydrateSettings(config || {});
    window.renderLists();
    window.loadStats();
    window.loadModules();
    window.loadLoyaltyConfig?.();
    window.generateFlowCode();
  } catch (error) {
    console.error('Init error:', error);
    window.showToast(error.message || 'Could not load admin data');
    const list = document.getElementById('mgr-list');
    if (list) {
      list.innerHTML = `<div class="panel"><h3>Admin authentication required</h3><p class="muted">${escapeHtml(error.message || 'Could not authenticate admin session.')}</p><p class="muted">For dev access, set ADMIN_SHARED_SECRET in Render and open /admin?shop=${escapeHtml(SHOP_DOMAIN)}&admin_secret=YOUR_SECRET once.</p></div>`;
    }
  }
};

function hydrateSettings(config) {
  if (config.betaMode) {
    document.getElementById('set-beta-enable').checked = Boolean(config.betaMode.enabled);
    document.getElementById('set-beta-email').value = config.betaMode.email || '';
  }
  document.getElementById('set-auto-enable').checked = Boolean(config.autoApproveEnabled);
  document.getElementById('set-auto-type').value = config.autoApproveType || 'verified';
  document.getElementById('set-min-stars').value = config.autoApproveMinStars || 4;
  document.getElementById('set-seo').checked = config.seo?.richSnippets !== false;
  currentAttributes = Array.isArray(config.attributeProfiles) ? config.attributeProfiles : [];

  if (config.widgetStyles) {
    document.getElementById('style-title').value = config.widgetStyles.widgetTitle || 'Customer Reviews';
    document.getElementById('style-primary').value = config.widgetStyles.primaryColor || '#000000';
    document.getElementById('style-star').value = config.widgetStyles.starColor || '#ffc700';
    document.getElementById('style-text').value = config.widgetStyles.textSize || 15;
    if (document.getElementById('style-width')) document.getElementById('style-width').value = config.widgetStyles.maxWidth || 1160;
    if (document.getElementById('style-review-star-size')) document.getElementById('style-review-star-size').value = config.widgetStyles.reviewStarSize || 52;
    if (document.getElementById('style-slider-track')) document.getElementById('style-slider-track').value = (config.widgetStyles.sliderTrackColor && config.widgetStyles.sliderTrackColor !== '#ffffff') ? config.widgetStyles.sliderTrackColor : '#e6ebf1';
    if (document.getElementById('style-slider-knob')) document.getElementById('style-slider-knob').value = config.widgetStyles.sliderKnobColor || '#111111';
  }
  if (document.getElementById('trash-retention-days')) document.getElementById('trash-retention-days').value = config.trashRetentionDays || 28;
  if (config.cardStyles) {
    document.getElementById('card-star').value = config.cardStyles.starSize || 14;
    document.getElementById('card-count').checked = config.cardStyles.showCount !== false;
    if (document.getElementById('card-badge-bg')) document.getElementById('card-badge-bg').value = config.cardStyles.badgeBackground || '#111827';
    if (document.getElementById('card-badge-text')) document.getElementById('card-badge-text').value = config.cardStyles.badgeTextColor || '#ffffff';
    if (document.getElementById('card-badge-star')) document.getElementById('card-badge-star').value = config.cardStyles.badgeStarColor || config.cardStyles.starColor || '#ffc700';
    if (document.getElementById('card-badge-radius')) document.getElementById('card-badge-radius').value = config.cardStyles.badgeRadius ?? 999;
  }
  if (config.carouselStyles) {
    document.getElementById('car-layout').value = config.carouselStyles.layout || 'infinite';
    document.getElementById('car-autoplay').checked = config.carouselStyles.autoplay !== false;
    document.getElementById('car-delay').value = config.carouselStyles.delay || 4000;
    document.getElementById('car-arrows').checked = Boolean(config.carouselStyles.showArrows);
    document.getElementById('car-limit').value = config.carouselStyles.limit || 10;
  }
  window.updatePreviews();
  window.renderAttributes();
}

function renderDashboardChart(id, type, labels, values, options = {}) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  const ctx = el.getContext('2d');
  if (dashboardCharts[id]) dashboardCharts[id].destroy();
  const baseType = type === 'line' ? 'line' : type;
  dashboardCharts[id] = new Chart(ctx, {
    type: baseType,
    data: {
      labels,
      datasets: [{
        label: options.label || 'Reviews',
        data: values,
        backgroundColor: options.backgroundColor || 'rgba(17,24,39,.82)',
        borderColor: options.borderColor || '#111827',
        borderWidth: 2,
        borderRadius: type === 'bar' ? 8 : 0,
        tension: .35,
        fill: type === 'line' ? false : true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: options.legend !== false }, tooltip: { enabled: true } },
      scales: options.scales === false ? undefined : {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { grid: { display: false } },
      },
      cutout: options.cutout,
    },
  });
}

window.loadStats = async function() {
  try {
    const stats = await adminFetch(`/admin/stats?t=${Date.now()}`);
    const total = Number(stats.totalReviews ?? 0);
    const live = Number(stats.liveReviews ?? 0);
    const pending = Number(stats.statuses?.pending ?? 0) + Number(stats.statuses?.hold ?? 0);
    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-live').innerText = Math.min(live, total);
    const pendingEl = document.getElementById('stat-pending');
    if (pendingEl) pendingEl.innerText = pending;

    const prodCardEl = document.getElementById('v-dash-prod-card');
    if (prodCardEl && stats.topProduct && stats.topProduct.id !== 'N/A') {
      const count = Number(stats.topProduct.count || 0);
      const avgNum = parseFloat(stats.topProduct.averageRating || 0);
      const fullStars = Number.isNaN(avgNum) ? 0 : Math.round(avgNum);
      prodCardEl.innerHTML = `
        <p class="stat-label">Most Reviewed Product</p>
        <h3 style="margin:0 0 10px; font-size:18px;">${escapeHtml(stats.topProduct.title || `ID: ${stats.topProduct.id}`)}</h3>
        <p style="margin:0; color:var(--star);">${'★'.repeat(fullStars)}${'☆'.repeat(Math.max(0, 5 - fullStars))} <span style="color:var(--text-light);">${(Number.isFinite(avgNum) ? avgNum : 0).toFixed(1)} (${count} reviews)</span></p>`;
    } else if (prodCardEl) {
      prodCardEl.innerHTML = '<p class="stat-label">Top Product</p><h3 class="stat-value" style="font-size:24px;">No reviews yet</h3><p class="stat-help">Product leaderboard will appear once reviews are collected.</p>';
    }

    const period = document.getElementById('dash-period')?.value || 'month';
    const chartType = document.getElementById('dash-chart-type')?.value || 'bar';
    const periodLabel = document.getElementById('dash-period-label');
    if (periodLabel) periodLabel.textContent = ({ day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[period] || 'Monthly');
    const series = stats.timeSeries?.[period] || [];
    renderDashboardChart('chartTimeline', chartType, series.map((p) => p.label), series.map((p) => p.count), { label: 'Reviews', legend: false });

    const sources = stats.sources || { website: 0, email: 0, import: 0 };
    renderDashboardChart('chartSources', 'doughnut', ['Website', 'Email', 'CSV Import'], [sources.website || 0, sources.email || 0, sources.import || 0], { backgroundColor: ['#111827', '#005bd3', '#ffc700'], cutout: '70%' , scales: false });

    const ratings = stats.ratings || { 1:0,2:0,3:0,4:0,5:0 };
    renderDashboardChart('chartRatings', 'bar', ['5★','4★','3★','2★','1★'], [ratings[5]||0, ratings[4]||0, ratings[3]||0, ratings[2]||0, ratings[1]||0], { label: 'Reviews', legend: false, backgroundColor: '#ffc700', borderColor: '#ffc700' });

    const statuses = stats.statuses || {};
    renderDashboardChart('chartStatuses', 'doughnut', ['Accepted','Pending','Hold','Rejected','Spam'], [statuses.accepted||0,statuses.pending||0,statuses.hold||0,statuses.rejected||0,statuses.spam||0], { backgroundColor: ['#008060','#005bd3','#b98900','#d72c0d','#6b7280'], cutout: '70%', scales: false });

    const productsBox = document.getElementById('dash-products');
    if (productsBox) {
      const products = Array.isArray(stats.products) ? stats.products.slice(0, 8) : [];
      productsBox.innerHTML = products.length ? `<table class="dash-table"><thead><tr><th>Product</th><th>Total</th><th>Live</th><th>Average</th></tr></thead><tbody>${products.map((p) => `<tr><td><strong>${escapeHtml(p.title || p.id)}</strong><br><small class="muted">${escapeHtml(p.id)}</small></td><td>${Number(p.count || 0)}</td><td>${Number(p.liveCount || 0)}</td><td>${Number(p.averageRating || 0).toFixed(1)} ★</td></tr>`).join('')}</tbody></table>` : '<div class="dash-table-empty">No product review data yet.</div>';
    }
  } catch (error) {
    console.warn(error);
  }
};

window.loadModules = async function() {
  try {
    const result = await adminFetch('/admin/modules');
    window.nectarModules = result.modules || {};
  } catch (error) {
    console.warn(error);
  }
};

window.renderLists = function() {
  const query = (document.getElementById('search-bar')?.value || '').toLowerCase();
  const status = document.getElementById('status-filter')?.value || 'all';
  const starF = document.getElementById('star-filter')?.value || 'all';
  let active = data.filter((r) => !r.isDeleted);
  if (status !== 'all') active = active.filter((r) => r.status === status);
  if (starF !== 'all') active = active.filter((r) => Number(r.rating) === parseInt(starF, 10));
  if (query) active = active.filter((r) => `${r.userId || ''} ${r.email || ''} ${r.comment || ''}`.toLowerCase().includes(query));
  let trash = data.filter((r) => r.isDeleted);
  const trashQuery = (document.getElementById('trash-search')?.value || '').toLowerCase();
  if (trashQuery) trash = trash.filter((r) => `${r.userId || ''} ${r.email || ''} ${r.comment || ''} ${r.headline || ''} ${r.itemId || ''}`.toLowerCase().includes(trashQuery));

  const mgrList = document.getElementById('mgr-list');
  const trashList = document.getElementById('trash-list');
  if (mgrList) mgrList.innerHTML = active.length ? active.map((r) => window.buildCard(r, false)).join('') : '<div class="panel"><p>No reviews match this filter.</p></div>';
  if (trashList) trashList.innerHTML = trash.length ? trash.map((r) => window.buildCard(r, true)).join('') : '<div class="panel"><p>Trash is empty.</p></div>';
  window.renderTrashStats(trash);
  window.autoResizeReplyBoxes?.();
};

window.renderTrashStats = function(trash) {
  const countEl = document.getElementById('trash-count');
  const oldestEl = document.getElementById('trash-oldest');
  if (countEl) countEl.textContent = String(trash.length || 0);
  if (oldestEl) {
    const dates = trash.map((r) => r.deletedAt || r.updatedAt || r.createdAt).filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime())).sort((a,b) => a - b);
    oldestEl.textContent = dates.length ? dates[0].toLocaleDateString() : '—';
  }
};

window.trashTab = function(name) {
  document.querySelectorAll('.trash-tab').forEach((btn) => btn.classList.toggle('active', btn.textContent.toLowerCase().includes(name === 'list' ? 'trash list' : 'auto-delete')));
  document.querySelectorAll('.trash-pane').forEach((pane) => pane.classList.toggle('active', pane.id === `trash-pane-${name}` || (name === 'settings' && pane.id === 'trash-pane-settings')));
};

window.toggleCard = function(button) {
  const card = button.closest('.settings-card');
  const body = card?.querySelector('.settings-card-body');
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  button.textContent = collapsed ? '−' : '+';
  button.classList.toggle('is-collapsed', !collapsed);
};


window.buildCard = function(r, isTrash) {
  const rating = Number(r.rating || 0);
  const createdDate = new Date(r.createdAt || Date.now()).toLocaleDateString();
  const productUrl = r.itemId && SHOP_DOMAIN && SHOP_DOMAIN.includes('myshopify.com')
    ? `https://${SHOP_DOMAIN}/admin/products/${encodeURIComponent(r.itemId)}`
    : '';
  const verifyHtml = r.verifiedPurchase
    ? `<span class="v-badge v-badge-yes" title="${escapeHtml(r.verificationNote || 'Verified Purchase')}">✓ Verified Buyer</span>`
    : `<button class="v-badge v-badge-no" title="${escapeHtml(r.verificationNote || 'Could not verify.') }" onclick="window.manuallyVerify('${r._id}')">⚠️ Unverified</button>`;
  let attrHtml = '';
  if (r.attributes && Object.keys(r.attributes).length > 0) {
    attrHtml = '<div class="admin-attr-grid">';
    for (const [key, rawVal] of Object.entries(r.attributes)) {
      const val = Math.max(0, Math.min(10, Number(rawVal || 0)));
      const pct = Math.max(0, Math.min(100, val * 10));
      attrHtml += `
        <div class="admin-attr-item">
          <div class="admin-attr-head"><span>${escapeHtml(key)}</span><strong>${escapeHtml(val)}/10</strong></div>
          <div class="admin-attr-bar"><span class="admin-attr-fill" style="width:${pct}%"></span></div>
        </div>`;
    }
    attrHtml += '</div>';
  }
  const testLabel = (r.isTestReview || r.testMode || r.testLabel)
    ? `<span class="test-label">${escapeHtml(r.testLabel || 'Test Review')}</span>`
    : '';
  const productHtml = r.itemId
    ? (productUrl ? `<a class="admin-product-pill" href="${productUrl}" target="_blank" rel="noopener">${escapeHtml(r.itemId)} ↗</a>` : `<span class="admin-product-pill">${escapeHtml(r.itemId)}</span>`)
    : '<span class="muted">No Product ID</span>';

  return `
    <div class="review-card status-border-${escapeHtml(r.status || 'pending')}">
      <div style="display:flex; gap:22px; justify-content:space-between; align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
            ${testLabel}
            <span class="customer-link">${escapeHtml(r.userId || 'Guest')}</span>
            <span class="status-group">
              <button class="s-btn acc ${r.status === 'accepted' ? 'active' : ''}" onclick="window.updateStatus('${r._id}', 'accepted')" title="Accept">✓</button>
              <button class="s-btn hld ${r.status === 'hold' ? 'active' : ''}" onclick="window.updateStatus('${r._id}', 'hold')" title="Hold">⏸</button>
              <button class="s-btn rej ${r.status === 'rejected' ? 'active' : ''}" onclick="window.updateStatus('${r._id}', 'rejected')" title="Reject">✕</button>
            </span>
          </div>
          <div style="color:var(--star); font-size:19px; margin-bottom:8px; letter-spacing:1px;">${'★'.repeat(rating)}${'☆'.repeat(Math.max(0, 5 - rating))}</div>
          <h3 style="margin:0 0 8px; font-size:20px; line-height:1.25;">${r.headline ? escapeHtml(r.headline) : ''}</h3>
          <p style="margin:0; color:#374151; line-height:1.5; white-space:pre-wrap; font-size:15px;">${escapeHtml(r.comment || '')}</p>
          ${attrHtml}
        </div>
        <div class="card-side" style="min-width:240px; text-align:right; border-left:1px solid var(--border); padding-left:22px;">
          <p class="admin-card-meta-label">Product ID:</p>
          ${productHtml}
          <p class="admin-card-meta-label" style="margin-top:10px;">${escapeHtml(createdDate)}</p>
          <div style="font-size:13px; color:var(--primary); font-weight:800; margin:10px 0;">${escapeHtml(r.email || 'No Email')}</div>
          <div style="margin-bottom:18px;">${verifyHtml}</div>
          ${isTrash ? `<button class="restore-btn" onclick="window.toggleBin('${r._id}', false)">↺ Restore</button>` : `<button class="delete-btn" onclick="window.toggleBin('${r._id}', true)">🗑️ Trash</button>`}
        </div>
      </div>
      <div style="width:100%; margin-top:15px; border-top:1px dashed var(--border); padding-top:15px;">
        <button class="reply-toggle" onclick="window.toggleReplyBox('${r._id}')">💬 Reply to Customer</button>
        <div id="reply-box-${r._id}" class="reply-panel" style="display:${r.reply ? 'block' : 'none'};">
          <div class="reply-toolbar"><strong>Reply to customer</strong></div>
          <textarea id="reply-text-${r._id}" class="reply-input" rows="3" placeholder="Write a reply. Public replies are shown under the review; private notes stay inside admin.">${escapeHtml(r.reply || '')}</textarea>
          <div class="reply-action-row"><select id="reply-vis-${r._id}" class="reply-vis-select" aria-label="Reply visibility"><option value="public" ${(r.replyVisibility || 'public') === 'public' ? 'selected' : ''}>Public</option><option value="private" ${r.replyVisibility === 'private' ? 'selected' : ''}>Private note</option></select><button id="reply-btn-${r._id}" class="post-btn" onclick="window.saveReply('${r._id}')">Save Reply</button></div>
        </div>
      </div>
    </div>`;
};

window.toggleReplyBox = function(id) {
  const box = document.getElementById(`reply-box-${id}`);
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
};

window.patchReview = async function(id, payload) {
  const updated = await adminFetch(`/reviews/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...payload, shopDomain: SHOP_DOMAIN }),
  });
  const index = data.findIndex((review) => review._id === id);
  if (index >= 0) data[index] = updated;
  return updated;
};

window.manuallyVerify = async function(id) {
  if (!confirm('Manually mark this review as a Verified Purchase?')) return;
  try {
    await window.patchReview(id, { verifiedPurchase: true, verificationNote: 'Manually verified by admin' });
    window.renderLists();
    window.showToast('Review Verified!');
  } catch (error) {
    window.showToast(error.message || 'Could not verify review');
  }
};

window.updateStatus = async function(id, status) {
  const original = data.find((x) => x._id === id);
  if (original) original.status = status;
  window.renderLists();
  try {
    await window.patchReview(id, { status });
    window.showToast(`Status updated to ${status}`);
  } catch (error) {
    window.showToast(error.message || 'Could not update status');
    window.load();
  }
};

window.toggleBin = async function(id, isDeleted) {
  if (isDeleted && !confirm('Move to trash? It will be permanently deleted in 28 days.')) return;
  const original = data.find((x) => x._id === id);
  if (original) original.isDeleted = isDeleted;
  window.renderLists();
  try {
    await window.patchReview(id, { isDeleted });
    window.showToast(isDeleted ? 'Moved to Trash' : 'Restored from Trash');
  } catch (error) {
    window.showToast(error.message || 'Could not update trash');
    window.load();
  }
};

window.saveTrashSettings = async function() {
  await window.saveSettings();
  window.showToast('Trash retention updated');
};

window.emptyTrash = async function() {
  const trash = data.filter((r) => r.isDeleted);
  if (!trash.length) return window.showToast('Trash is already empty');
  if (!confirm(`Permanently delete ${trash.length} review${trash.length === 1 ? '' : 's'} from trash? This cannot be undone.`)) return;
  try {
    const result = await adminFetch('/admin/trash/empty', { method: 'POST', body: JSON.stringify({}) });
    window.showToast(`Deleted ${result.deleted || 0} review${result.deleted === 1 ? '' : 's'}`);
    await window.load();
  } catch (error) { window.showToast(error.message || 'Could not empty trash'); }
};

window.cleanupTrash = async function() {
  const days = Math.max(1, Math.min(28, parseInt(document.getElementById('trash-retention-days')?.value || '28', 10)));
  try {
    const result = await adminFetch('/admin/trash/cleanup', { method: 'POST', body: JSON.stringify({ retentionDays: days }) });
    window.showToast(`Deleted ${result.deleted || 0} expired review${result.deleted === 1 ? '' : 's'}`);
    await window.load();
  } catch (error) { window.showToast(error.message || 'Could not delete expired reviews'); }
};

window.restoreAllTrash = async function() {
  const trash = data.filter((r) => r.isDeleted);
  if (!trash.length) return window.showToast('No trashed reviews to restore');
  if (!confirm(`Restore ${trash.length} review${trash.length === 1 ? '' : 's'} from trash?`)) return;
  try {
    const result = await adminFetch('/admin/trash/restore-all', { method: 'POST', body: JSON.stringify({}) });
    window.showToast(`Restored ${result.restored || 0} review${result.restored === 1 ? '' : 's'}`);
    await window.load();
  } catch (error) { window.showToast(error.message || 'Could not restore trash'); }
};

window.saveReply = async function(id) {
  const btn = document.getElementById(`reply-btn-${id}`);
  const originalText = btn?.innerText || 'Save Reply';
  if (btn) { btn.innerText = 'Saving...'; btn.disabled = true; }
  const text = document.getElementById(`reply-text-${id}`)?.value || '';
  const visibility = document.getElementById(`reply-vis-${id}`)?.value || 'public';
  try {
    await window.patchReview(id, { reply: text, replyVisibility: visibility });
    if (btn) btn.innerText = 'Published!';
    window.showToast(visibility === 'private' ? 'Private note saved' : 'Public reply saved');
    setTimeout(() => { if (btn) { btn.innerText = originalText; btn.disabled = false; } }, 1500);
  } catch (error) {
    if (btn) btn.innerText = 'Error saving';
    window.showToast(error.message || 'Could not save reply');
    setTimeout(() => { if (btn) { btn.innerText = originalText; btn.disabled = false; } }, 2000);
  }
};

window.renderAttributes = function() {
  const container = document.getElementById('attributes-list');
  if (!container) return;
  if (!currentAttributes.length) {
    container.innerHTML = '<div style="color:var(--text-light); font-size:13px; margin-top:12px;">No conditional rules created yet.</div>';
    return;
  }
  container.innerHTML = currentAttributes.map((attr, i) => `
    <div class="attr-pill">
      <div><span class="attr-tag">${escapeHtml(attr.type)}</span><span class="muted">${escapeHtml(attr.condition)}</span> <strong style="color:var(--border);">→</strong> <strong>Slider: '${escapeHtml(attr.label)}'</strong></div>
      <button style="background:none; border:none; color:var(--red); cursor:pointer; font-weight:600;" onclick="window.removeAttribute(${i})">✕ Remove</button>
    </div>`).join('');
};

window.addAttribute = function() {
  const type = document.getElementById('attr-rule-type')?.value || 'tag';
  const condition = type === 'tag' ? document.getElementById('attr-rule-val-tag')?.value.trim() : document.getElementById('attr-rule-val-meta')?.value;
  const label = document.getElementById('attr-label')?.value.trim();
  if (!condition || condition === 'undefined' || !label) {
    alert('Please fill out both the condition value and the slider name.');
    return;
  }
  if (currentAttributes.length < 8) {
    currentAttributes.push({ type, condition, label });
    document.getElementById('attr-rule-val-tag').value = '';
    document.getElementById('attr-label').value = '';
    window.saveSettings();
    window.renderAttributes();
    window.showToast('Attribute Saved');
  }
};

window.removeAttribute = async function(index) {
  if (!confirm('Are you sure you want to remove this slider rule?')) return;
  currentAttributes.splice(index, 1);
  window.renderAttributes();
  await window.saveSettings();
  window.showToast('Attribute Removed');
};

window.updatePreviews = function() {
  const title = document.getElementById('style-title')?.value || 'Customer Reviews';
  const primary = document.getElementById('style-primary')?.value || '#000000';
  const star = document.getElementById('style-star')?.value || '#ffc700';
  const txt = `${document.getElementById('style-text')?.value || 15}px`;
  const cardStar = `${document.getElementById('card-star')?.value || 14}px`;
  const maxWidth = `${document.getElementById('style-width')?.value || 1160}px`;
  const badgeBg = document.getElementById('card-badge-bg')?.value || '#111827';
  const badgeText = document.getElementById('card-badge-text')?.value || '#ffffff';
  const badgeStar = document.getElementById('card-badge-star')?.value || star;
  const badgeRadius = `${document.getElementById('card-badge-radius')?.value || 999}px`;
  const preTitle = document.getElementById('pre-title');
  if (preTitle) preTitle.innerText = title;
  document.querySelectorAll('.pre-color-primary').forEach((el) => { el.style.background = primary; });
  document.querySelectorAll('.pre-color-star').forEach((el) => { el.style.color = star; });
  document.querySelectorAll('.pre-color-text').forEach((el) => { el.style.fontSize = txt; });
  document.querySelectorAll('.pre-color-text-brand').forEach((el) => { el.style.color = primary; });
  const cardIcon = document.getElementById('pre-card-icon');
  const previewWrap = document.getElementById('preview-container-wrap');
  if (previewWrap && previewWrap.style.maxWidth !== '375px') previewWrap.style.maxWidth = maxWidth;
  if (cardIcon) { cardIcon.style.fontSize = cardStar; cardIcon.style.color = badgeStar; }
  const badge = document.getElementById('pre-card-badge');
  if (badge) { badge.style.background = badgeBg; badge.style.color = badgeText; badge.style.borderRadius = badgeRadius; }
  const cardCount = document.getElementById('pre-card-count');
  if (cardCount) cardCount.style.display = document.getElementById('card-count')?.checked ? 'inline' : 'none';
};

window.saveSettings = async function() {
  const payload = {
    shopDomain: SHOP_DOMAIN,
    betaMode: { enabled: document.getElementById('set-beta-enable').checked, email: document.getElementById('set-beta-email').value.trim() },
    autoApproveEnabled: document.getElementById('set-auto-enable').checked,
    autoApproveType: document.getElementById('set-auto-type').value,
    autoApproveMinStars: parseInt(document.getElementById('set-min-stars').value, 10),
    attributeProfiles: currentAttributes,
    seo: { richSnippets: document.getElementById('set-seo').checked },
    widgetStyles: {
      widgetTitle: document.getElementById('style-title').value,
      primaryColor: document.getElementById('style-primary').value,
      starColor: document.getElementById('style-star').value,
      textSize: parseInt(document.getElementById('style-text').value, 10),
      maxWidth: parseInt(document.getElementById('style-width')?.value || '1160', 10),
      reviewStarSize: parseInt(document.getElementById('style-review-star-size')?.value || '52', 10),
      sliderTrackColor: document.getElementById('style-slider-track')?.value || '#e6ebf1',
      sliderKnobColor: document.getElementById('style-slider-knob')?.value || '#111111',
    },
    trashRetentionDays: Math.max(1, Math.min(28, parseInt(document.getElementById('trash-retention-days')?.value || '28', 10))),
    cardStyles: {
      starSize: parseInt(document.getElementById('card-star').value, 10),
      showCount: document.getElementById('card-count').checked,
      badgeBackground: document.getElementById('card-badge-bg')?.value || '#111827',
      badgeTextColor: document.getElementById('card-badge-text')?.value || '#ffffff',
      badgeStarColor: document.getElementById('card-badge-star')?.value || '#ffc700',
      badgeRadius: parseInt(document.getElementById('card-badge-radius')?.value || '999', 10),
    },
    carouselStyles: {
      layout: document.getElementById('car-layout').value,
      autoplay: document.getElementById('car-autoplay').checked,
      delay: parseInt(document.getElementById('car-delay').value, 10) || 4000,
      showArrows: document.getElementById('car-arrows').checked,
      limit: parseInt(document.getElementById('car-limit').value, 10) || 10,
    },
  };
  try {
    await adminFetch('/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
    window.showToast('Settings Saved successfully!');
  } catch (error) {
    window.showToast(error.message || 'Could not save settings');
  }
};

window.handleFileUpload = function() {
  const file = document.getElementById('csv-file')?.files?.[0];
  if (!file) return;
  document.getElementById('file-name').innerText = `${file.name} selected`;
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete(results) {
      parsedCSVData = results.data || [];
      csvHeaders = results.meta.fields || [];
      mappedReviews = [];
      window.buildMappingUI();
    },
    error(error) {
      window.showToast(error.message || 'Could not parse CSV');
    },
  });
};

function normaliseHeaderName(header) {
  return String(header || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickDefaultHeader(fieldId, header) {
  const h = normaliseHeaderName(header);
  if (fieldId === 'map-itemId') return /(^| )(product id|product_id|item id|item_id|shopify product id|product gid|productid)( |$)/.test(h) || (h.includes('product') && h.includes('id'));
  if (fieldId === 'map-productTitle') return h.includes('product title') || h.includes('product name') || h === 'product' || h === 'item' || h.includes('item title') || h.includes('item name');
  if (fieldId === 'map-rating') return h.includes('score') || h.includes('rating') || h.includes('stars') || h === 'star rating';
  if (fieldId === 'map-userId') return h.includes('reviewer name') || h.includes('author') || h.includes('customer name') || h === 'name' || h.includes('user');
  if (fieldId === 'map-email') return h.includes('email');
  if (fieldId === 'map-headline') return h.includes('review title') || h.includes('review headline') || h === 'headline' || h === 'summary';
  if (fieldId === 'map-comment') return h.includes('body') || h.includes('content') || h.includes('review text') || h === 'review' || h.includes('comment');
  if (fieldId === 'map-date') return h.includes('date') || h.includes('created') || h.includes('submitted');
  if (fieldId === 'map-verified') return h.includes('verified');
  return false;
}

window.buildMappingUI = function() {
  document.getElementById('mapping-ui').style.display = 'block';
  const reqFields = [
    { id: 'map-itemId', label: 'Product ID', hint: 'Optional if Product Title is mapped.' },
    { id: 'map-productTitle', label: 'Product Title / Name', hint: 'Used for automatic Shopify matching.' },
    { id: 'map-rating', label: 'Star Rating (Req)' },
    { id: 'map-userId', label: 'Reviewer Name' },
    { id: 'map-email', label: 'Reviewer Email' },
    { id: 'map-headline', label: 'Review Title' },
    { id: 'map-comment', label: 'Review Body' },
    { id: 'map-date', label: 'Review Date' },
    { id: 'map-verified', label: 'Verified Purchase' },
  ];
  const usedDefaults = new Set();
  let html = '';
  reqFields.forEach((f) => {
    let options = '<option value="">-- Ignore --</option>';
    let selectedOnce = false;
    csvHeaders.forEach((h) => {
      let selected = '';
      if (!selectedOnce && !usedDefaults.has(h) && pickDefaultHeader(f.id, h)) {
        selected = 'selected';
        selectedOnce = true;
        usedDefaults.add(h);
      }
      options += `<option value="${escapeHtml(h)}" ${selected}>${escapeHtml(h)}</option>`;
    });
    html += `<div class="mapper-card"><label>${escapeHtml(f.label)}</label>${f.hint ? `<p class="muted" style="margin:0 0 8px;font-size:12px;">${escapeHtml(f.hint)}</p>` : ''}<select id="${f.id}" class="filter-select" style="width:100%; margin-top:6px;">${options}</select></div>`;
  });
  document.getElementById('column-mappers').innerHTML = html;
  const btn = document.getElementById('import-submit-btn');
  btn.innerText = 'Preview & Map Products';
  btn.onclick = window.generateStagingArea;
};

function csvValue(row, header) {
  return header ? row[header] : '';
}

function coerceRating(value) {
  const n = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function coerceBool(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'verified', 'verified purchase', 'verified buyer'].includes(v);
}

function normaliseImportTitle(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function looksLikeShopifyProductId(value) {
  const v = String(value || '').trim();
  return /^(gid:\/\/shopify\/Product\/\d+|\d{6,})$/.test(v);
}

function csvEscape(value) {
  const v = String(value ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function renderImportProductCell(review, index) {
  const statusClass = review.itemId ? 'matched' : 'warning';
  const statusText = review.itemId
    ? `Selected Shopify product ID: ${escapeHtml(review.itemId)}`
    : (review.rawProductRef ? `CSV product reference is not a Shopify Product ID: ${escapeHtml(review.rawProductRef)}` : 'No product selected yet. Search Shopify and choose the correct product before import.');
  return `
    <div class="import-product-cell" data-import-row="${index}">
      <div class="import-product-field">
        <input id="stage-item-${index}" class="premium-input" value="${escapeHtml(review.itemId || '')}" placeholder="Target Shopify Product ID" />
        <button type="button" class="import-mini-btn primary" onclick="window.openImportProductPicker(${index})">Choose</button>
      </div>
      <div id="stage-status-${index}" class="import-product-status ${statusClass}">${statusText}</div>
      <div class="import-product-tools">
        <button type="button" class="import-mini-btn" onclick="window.autoMatchImportProduct(${index})">Auto match</button>
        <button type="button" class="import-mini-btn" onclick="window.clearImportProduct(${index})">Clear</button>
      </div>
    </div>`;
}

window.generateStagingArea = function() {
  const map = {
    itemId: document.getElementById('map-itemId')?.value || '',
    productTitle: document.getElementById('map-productTitle')?.value || '',
    rating: document.getElementById('map-rating')?.value || '',
    userId: document.getElementById('map-userId')?.value || '',
    email: document.getElementById('map-email')?.value || '',
    headline: document.getElementById('map-headline')?.value || '',
    comment: document.getElementById('map-comment')?.value || '',
    createdAt: document.getElementById('map-date')?.value || '',
    verifiedPurchase: document.getElementById('map-verified')?.value || '',
  };
  if (!map.rating) {
    window.showToast('Star Rating must be mapped.');
    return;
  }
  if (!map.itemId && !map.productTitle) {
    window.showToast('Map either Product ID or Product Title so reviews can be attached to products.');
    return;
  }
  const verifiedByDefault = document.getElementById('import-verified-default')?.checked !== false;
  mappedReviews = parsedCSVData.map((row, rowIndex) => {
    const rawItemId = String(csvValue(row, map.itemId) || '').trim();
    const productTitle = String(csvValue(row, map.productTitle) || '').trim();
    const itemId = looksLikeShopifyProductId(rawItemId) ? rawItemId : '';
    return {
      rowIndex: rowIndex + 1,
      itemId,
      rawProductRef: rawItemId,
      productTitle,
      rating: coerceRating(csvValue(row, map.rating)),
      userId: String(csvValue(row, map.userId) || 'Imported Customer').trim(),
      email: String(csvValue(row, map.email) || '').trim(),
      headline: String(csvValue(row, map.headline) || '').trim(),
      comment: String(csvValue(row, map.comment) || '').trim(),
      createdAt: String(csvValue(row, map.createdAt) || '').trim(),
      verifiedPurchase: verifiedByDefault ? true : coerceBool(csvValue(row, map.verifiedPurchase)),
    };
  }).filter((r) => r.rating && (r.comment || r.headline));

  const rows = mappedReviews.map((r, i) => `
    <tr>
      <td><strong>${escapeHtml(r.userId || 'Imported Customer')}</strong>${r.email ? `<br><small>${escapeHtml(r.email)}</small>` : ''}</td>
      <td><span style="color:#ffae00;letter-spacing:1px;">${'★'.repeat(parseInt(r.rating, 10) || 5)}</span></td>
      <td><strong>${escapeHtml(r.headline || '')}</strong><br><span>${escapeHtml(String(r.comment || '').slice(0, 120))}</span></td>
      <td>${escapeHtml(r.productTitle || '')}${r.rawProductRef ? `<br><small>CSV ref: ${escapeHtml(r.rawProductRef)}</small>` : ''}${r.itemId ? `<br><small>Shopify ID: ${escapeHtml(r.itemId)}</small>` : ''}</td>
      <td>${renderImportProductCell(r, i)}</td>
    </tr>`).join('');
  const stagingHtml = `
    <div id="staging-area" style="margin-top:24px;">
      <h3>3. Smart Product Mapping</h3>
      <p class="muted">Every review needs a target Shopify Product ID. If the CSV did not include one, use Auto match or Choose to select the correct product from Shopify.</p>
      <div class="import-product-tools" style="margin:0 0 12px;"><button type="button" class="secondary-btn" onclick="window.autoMatchAllImportProducts()">Auto match all by title</button><button type="button" class="secondary-btn" onclick="window.showUnmatchedImportRows()">Show unmatched only</button><button type="button" class="secondary-btn" onclick="window.showAllImportRows()">Show all rows</button><button type="button" class="secondary-btn" onclick="window.downloadUnmatchedImportRows()">Download rows needing mapping</button></div>
      <div class="import-table-wrap"><table class="import-table"><thead><tr><th>Reviewer</th><th>Rating</th><th>Review</th><th>CSV product</th><th>Target product</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p style="display:flex;justify-content:flex-end;margin-top:18px;"><button id="final-import-btn" class="primary-btn" onclick="window.processFinalImport()">Go Live (Import to Database)</button></p>
    </div>`;
  let existing = document.getElementById('staging-area');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'staging-area';
    document.getElementById('mapping-ui').appendChild(existing);
  }
  existing.outerHTML = stagingHtml;
};

function ensureImportProductModal() {
  let modal = document.getElementById('import-product-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'import-product-modal';
  modal.className = 'import-modal-backdrop';
  modal.innerHTML = `
    <div class="import-modal" role="dialog" aria-modal="true">
      <div class="import-modal-head"><div><h3>Select target Shopify product</h3><p>Choose where this imported review should appear.</p></div><button type="button" class="import-modal-close" aria-label="Close">×</button></div>
      <div class="import-modal-search"><input id="import-product-search-input" type="search" placeholder="Search by product title, handle or ID"><button type="button" class="primary-btn" id="import-product-search-run">Search</button></div>
      <div id="import-product-results" class="import-modal-results"><div class="import-help">Search for a product to select it.</div></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.matches('.import-modal-close')) modal.classList.remove('active'); });
  modal.querySelector('#import-product-search-run')?.addEventListener('click', () => window.runImportProductSearch());
  modal.querySelector('#import-product-search-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); window.runImportProductSearch(); } });
  return modal;
}

async function fetchShopifyProductMatches(query) {
  if (!query) return [];
  const res = await adminFetch(`/admin/products/search?q=${encodeURIComponent(query)}`);
  return res.products || [];
}

window.openImportProductPicker = function(index) {
  const modal = ensureImportProductModal();
  modal.dataset.importIndex = String(index);
  const input = modal.querySelector('#import-product-search-input');
  input.value = mappedReviews[index]?.productTitle || mappedReviews[index]?.itemId || '';
  modal.querySelector('#import-product-results').innerHTML = '<div class="import-help">Search for a product to select it.</div>';
  modal.classList.add('active');
  setTimeout(() => input.focus(), 50);
};

window.runImportProductSearch = async function() {
  const modal = ensureImportProductModal();
  const index = parseInt(modal.dataset.importIndex || '0', 10);
  const box = modal.querySelector('#import-product-results');
  const query = modal.querySelector('#import-product-search-input')?.value.trim() || '';
  if (!query) { box.innerHTML = '<div class="import-help">Enter a product title or ID first.</div>'; return; }
  box.innerHTML = '<div class="import-help">Searching Shopify products…</div>';
  try {
    const products = await fetchShopifyProductMatches(query);
    if (!products.length) { box.innerHTML = '<div class="import-help">No products found. Try a shorter title or use the Product ID directly.</div>'; return; }
    box.innerHTML = products.map((p) => `
      <div class="import-product-result">
        <img src="${escapeHtml(p.image || '')}" alt="">
        <div><strong>${escapeHtml(p.title || 'Product')}</strong><small>Product ID: ${escapeHtml(p.id || '')}${p.handle ? ` · ${escapeHtml(p.handle)}` : ''}</small></div>
        <button type="button" class="primary-btn" onclick="window.selectImportProduct(${index}, '${escapeHtml(p.id || '')}', '${escapeHtml(p.title || '')}')">Select</button>
      </div>`).join('');
  } catch (error) {
    const installUrl = error.installUrl || `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(SHOP_DOMAIN)}`;
    box.innerHTML = `<div class="import-help"><strong>Product search needs Shopify connection.</strong><br>${escapeHtml(error.message || 'Reconnect through Shopify OAuth to search products.')}<br><br><button type="button" class="primary-btn" onclick="window.openSecureAdminSession()">Connect Shopify</button></div>`;
  }
};

window.selectImportProduct = function(index, productId, title) {
  mappedReviews[index].itemId = String(productId || '').trim();
  if (title) mappedReviews[index].matchedProductTitle = title;
  const input = document.getElementById(`stage-item-${index}`);
  if (input) input.value = mappedReviews[index].itemId;
  const status = document.getElementById(`stage-status-${index}`);
  if (status) {
    status.className = 'import-product-status matched';
    status.innerHTML = `Selected: ${escapeHtml(title || 'Shopify product')}<br><small>Product ID: ${escapeHtml(productId)}</small>`;
  }
  document.getElementById('import-product-modal')?.classList.remove('active');
};

window.clearImportProduct = function(index) {
  if (!mappedReviews[index]) return;
  mappedReviews[index].itemId = '';
  mappedReviews[index].matchedProductTitle = '';
  const input = document.getElementById(`stage-item-${index}`);
  if (input) input.value = '';
  const status = document.getElementById(`stage-status-${index}`);
  if (status) { status.className = 'import-product-status warning'; status.innerText = 'No product selected yet.'; }
};

window.autoMatchImportProduct = async function(index) {
  const review = mappedReviews[index];
  if (!review) return;
  const query = review.productTitle || review.itemId || '';
  if (!query) { window.showToast('No product title or ID available to match.'); return; }
  const status = document.getElementById(`stage-status-${index}`);
  if (status) { status.className = 'import-product-status'; status.innerText = 'Searching Shopify…'; }
  try {
    const products = await fetchShopifyProductMatches(query);
    const targetTitle = normaliseImportTitle(review.productTitle || review.rawProductRef);
    const exact = products.find((p) => normaliseImportTitle(p.title) === targetTitle) || products.find((p) => {
      const pt = normaliseImportTitle(p.title);
      return targetTitle.length > 10 && (pt.includes(targetTitle) || targetTitle.includes(pt));
    });
    if (!exact) {
      if (status) { status.className = 'import-product-status warning'; status.innerText = 'No confident match found. Choose manually.'; }
      return;
    }
    window.selectImportProduct(index, exact.id, exact.title);
  } catch (error) {
    if (status) { status.className = 'import-product-status warning'; status.innerText = error.message || 'Auto match failed.'; }
  }
};

window.autoMatchAllImportProducts = async function() {
  for (let i = 0; i < mappedReviews.length; i += 1) {
    if (!document.getElementById(`stage-item-${i}`)?.value.trim()) {
      await window.autoMatchImportProduct(i);
    }
  }
  window.showToast('Auto matching complete. Check any unmatched rows before importing.');
};

window.showUnmatchedImportRows = function() {
  mappedReviews.forEach((_, i) => {
    const row = document.querySelector(`[data-import-row="${i}"]`)?.closest('tr');
    if (row) row.style.display = document.getElementById(`stage-item-${i}`)?.value.trim() ? 'none' : '';
  });
};

window.showAllImportRows = function() {
  document.querySelectorAll('#staging-area tbody tr').forEach((row) => { row.style.display = ''; });
};

function unmatchedImportRows() {
  return mappedReviews.map((r, i) => ({ ...r, itemId: document.getElementById(`stage-item-${i}`)?.value.trim() || '' })).filter((r) => !looksLikeShopifyProductId(r.itemId));
}

window.downloadUnmatchedImportRows = function() {
  const rows = unmatchedImportRows();
  if (!rows.length) { window.showToast('No unmatched rows to download.'); return; }
  const headers = ['rowIndex','reviewer','email','rating','headline','comment','date','csvProductReference','csvProductTitle','requiredShopifyProductId','reason'];
  const lines = [headers.join(',')].concat(rows.map((r) => [
    r.rowIndex, r.userId, r.email, r.rating, r.headline, r.comment, r.createdAt, r.rawProductRef, r.productTitle, '', 'Needs a Shopify Product ID selected in the importer',
  ].map(csvEscape).join(',')));
  const blob = new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nectar-import-needs-mapping-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

window.processFinalImport = async function() {
  const btn = document.getElementById('final-import-btn');
  if (btn) { btn.innerText = 'Importing...'; btn.disabled = true; }
  const finalPayload = mappedReviews.map((r, i) => ({ ...r, itemId: document.getElementById(`stage-item-${i}`)?.value.trim() || '' }));
  const ready = finalPayload.filter((r) => looksLikeShopifyProductId(r.itemId));
  const missing = finalPayload.length - ready.length;
  if (missing) {
    window.downloadUnmatchedImportRows();
    window.showToast(`${missing} row${missing === 1 ? '' : 's'} saved to a mapping file. Importing ${ready.length} ready review${ready.length === 1 ? '' : 's'}.`);
  }
  if (!ready.length) {
    if (btn) { btn.innerText = 'Go Live (Import to Database)'; btn.disabled = false; }
    return;
  }
  try {
    const result = await adminFetch('/reviews/import', {
      method: 'POST',
      body: JSON.stringify({ shopDomain: SHOP_DOMAIN, reviews: ready }),
    });
    window.showToast(`Import successful: ${result.imported || 0} reviews${missing ? `; ${missing} still need mapping` : ''}.`);
    document.getElementById('mapping-ui').style.display = 'none';
    document.getElementById('staging-area')?.remove();
    window.load();
    window.tab('v-mgr');
  } catch (error) {
    window.showToast(error.message || 'Import failed');
  } finally {
    if (btn) { btn.innerText = 'Go Live (Import to Database)'; btn.disabled = false; }
  }
};

window.generateFlowCode = function() {
  const logo = document.getElementById('flow-logo')?.value.trim() || '';
  const color = document.getElementById('flow-color')?.value || '#111827';
  const heading = document.getElementById('flow-heading')?.value || 'Review your recent order';
  const shopUrl = `https://${SHOP_DOMAIN}`;
  const logoHtml = logo ? `<img src="${escapeHtml(logo)}" alt="Logo" style="max-width:160px; margin-bottom:18px;" />` : '';
  const flowHtml = `
${logoHtml}
<h2 style="color:${color}; margin:0 0 14px;">${escapeHtml(heading)}</h2>
<p>Hi {{ order.customer.firstName | default: "there" }},</p>
<p>We hope you're loving your recent purchase! Could you take 60 seconds to leave a quick review?</p>
<a href="${shopUrl}/pages/review?order={{ order.name }}" style="display:inline-block; background:${color}; color:#fff; padding:12px 18px; border-radius:999px; text-decoration:none; font-weight:700;">Review Your Order</a>`.trim();
  const output = document.getElementById('flow-code-output');
  if (output) output.value = flowHtml;
};

window.copyFlowCode = function() {
  const output = document.getElementById('flow-code-output');
  if (!output) return;
  output.select();
  document.execCommand('copy');
  window.showToast('Copied to clipboard!');
};



function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(90, textarea.scrollHeight)}px`;
}
window.autoResizeReplyBoxes = function() {
  document.querySelectorAll('.reply-input').forEach((textarea) => {
    autoResizeTextarea(textarea);
    if (textarea.dataset.autoresizeBound === 'true') return;
    textarea.dataset.autoresizeBound = 'true';
    textarea.addEventListener('input', () => autoResizeTextarea(textarea));
  });
};

function enhanceModernColorPickers() {
  const ids = ['style-primary','style-star','style-slider-track','style-slider-knob','card-badge-bg','card-badge-text','card-badge-star'];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.modernColor === 'true') return;
    const current = /^#[0-9a-f]{6}$/i.test(input.value) ? input.value : '#111827';
    input.type = 'text';
    input.value = current;
    input.dataset.modernColor = 'true';
    input.setAttribute('inputmode', 'text');
    input.setAttribute('maxlength', '7');
    const wrap = document.createElement('div');
    wrap.className = 'nr-color-input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nr-color-swatch-btn';
    btn.style.setProperty('--swatch', input.value);
    btn.setAttribute('aria-label', `Choose colour for ${id}`);
    wrap.appendChild(btn);
    input.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(input.value)) { btn.style.setProperty('--swatch', input.value); window.updatePreviews?.(); } });
    btn.addEventListener('click', () => openModernColorPicker(input, btn));
  });
}

function openModernColorPicker(input, swatch) {
  let modal = document.getElementById('nr-color-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'nr-color-modal';
    modal.className = 'nr-color-modal-backdrop';
    const palette = ['#111827','#000000','#ffffff','#ffc700','#f5a400','#005bd3','#008060','#d72c0d','#f97316','#7c3aed','#ec4899','#0ea5e9','#10b981','#64748b','#e6ebf1','#f8fafc'];
    modal.innerHTML = `<div class="nr-color-modal" role="dialog" aria-modal="true"><h3>Choose colour</h3><p>Pick a brand colour or paste a hex value.</p><div class="nr-color-grid">${palette.map((c) => `<button type="button" class="nr-color-chip" data-colour="${c}" style="--chip:${c}" aria-label="${c}"></button>`).join('')}</div><div class="nr-color-modal-actions"><input id="nr-color-value" value="#111827"><button type="button" class="secondary-btn" data-close-colour>Cancel</button><button type="button" class="primary-btn" data-apply-colour>Apply</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.matches('[data-close-colour]')) modal.classList.remove('open'); });
  }
  const value = modal.querySelector('#nr-color-value');
  value.value = /^#[0-9a-f]{6}$/i.test(input.value) ? input.value : '#111827';
  modal.querySelectorAll('[data-colour]').forEach((chip) => chip.onclick = () => { value.value = chip.dataset.colour; });
  modal.querySelector('[data-apply-colour]').onclick = () => {
    const next = /^#[0-9a-f]{6}$/i.test(value.value) ? value.value : input.value;
    input.value = next;
    swatch.style.setProperty('--swatch', next);
    modal.classList.remove('open');
    window.updatePreviews?.();
  };
  modal.classList.add('open');
}

function injectReviewManagerTabs() {
  const mgr = document.getElementById('v-mgr');
  if (!mgr || mgr.dataset.tabsReady === 'true') return;
  mgr.dataset.tabsReady = 'true';
  const title = mgr.querySelector('.page-title');
  const tabs = document.createElement('div');
  tabs.className = 'review-manager-tabs';
  tabs.innerHTML = '<button type="button" class="active" data-review-sub="reviews">Reviews</button><button type="button" data-review-sub="rules">Approval rules</button><button type="button" data-review-sub="trash">Trash</button>';
  title?.after(tabs);
  tabs.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-review-sub]');
    if (!btn) return;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    if (btn.dataset.reviewSub === 'rules') window.tab('v-settings');
    if (btn.dataset.reviewSub === 'trash') window.tab('v-trash');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const labelInput = document.getElementById('attr-label');
  if (labelInput) {
    labelInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        window.addAttribute();
      }
    });
  }
  enhanceModernColorPickers();
  window.load();
  setTimeout(() => { enhanceModernColorPickers(); window.autoResizeReplyBoxes?.(); }, 400);
  document.getElementById('loyalty-enabled')?.addEventListener('change', () => window.saveLoyaltyConfig?.());
});


window.enableAutoGrowTextareas = function() {
  document.querySelectorAll('textarea.reply-input').forEach((ta) => {
    if (ta.dataset.autogrowBound) return;
    ta.dataset.autogrowBound = '1';
    const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(96, ta.scrollHeight)}px`; };
    ta.addEventListener('input', grow);
    grow();
  });
};
window.autoResizeReplyBoxes = window.enableAutoGrowTextareas;

function getLoyaltyPayload() {
  const discountValue = Number(document.getElementById('loyalty-discount-value')?.value || 10);
  const points = Number(document.getElementById('loyalty-points-value')?.value || 100);
  const pointName = document.getElementById('loyalty-points-label')?.value || document.getElementById('loyalty-points-label-overview')?.value || 'Points';
  return {
    enabled: Boolean(document.getElementById('loyalty-enabled')?.checked),
    pointName,
    emailTemplates: [{
      id: window.currentLoyaltyConfig?.emailTemplates?.[0]?.id || 'loyalty_email_primary',
      name: document.getElementById('loyalty-email-template-name')?.value || 'Reward ready',
      primary: (document.getElementById('loyalty-email-template-primary')?.value || 'primary') === 'primary',
      status: document.getElementById('loyalty-email-template-primary')?.value || 'primary',
      subject: document.getElementById('loyalty-email-subject')?.value || 'Your review reward is ready',
      heading: document.getElementById('loyalty-email-heading')?.value || 'Your reward is ready',
      body: document.getElementById('loyalty-email-body')?.value || 'Thanks for leaving a review. Your {{ reward_type }} is now ready.',
      accentColor: document.getElementById('loyalty-email-accent')?.value || '#111827',
      buttonText: document.getElementById('loyalty-email-button')?.value || 'Shop now',
    }],
    tiers: [
      { id: 'bronze', name: 'Bronze', threshold: Number(document.getElementById('loyalty-tier-bronze')?.value || 0), multiplier: 1 },
      { id: 'silver', name: 'Silver', threshold: Number(document.getElementById('loyalty-tier-silver')?.value || 500), multiplier: 1.2 },
      { id: 'gold', name: 'Gold', threshold: Number(document.getElementById('loyalty-tier-gold')?.value || 1500), multiplier: Number(document.getElementById('loyalty-tier-gold-multiplier')?.value || 1.5) },
    ],
    redemptionRewards: [{
      id: window.currentLoyaltyConfig?.redemptionRewards?.[0]?.id || 'reward_checkout_discount',
      name: document.getElementById('loyalty-reward-name')?.value || '£5 off coupon',
      type: document.getElementById('loyalty-reward-type')?.value || 'discount',
      pointsCost: Number(document.getElementById('loyalty-reward-cost')?.value || 500),
      discountValue: Number(document.getElementById('loyalty-reward-value')?.value || 5),
      enabled: true,
      betaCheckoutEnabled: Boolean(document.getElementById('loyalty-checkout-enabled')?.checked),
      discountMode: document.getElementById('loyalty-checkout-native-codes')?.checked ? 'native_discount_code' : 'draft_only',
    }],
    rewardTemplates: [{
      id: window.currentLoyaltyConfig?.rewardTemplates?.[0]?.id || undefined,
      name: document.getElementById('loyalty-discount-name')?.value || 'Review thank-you discount',
      enabled: true,
      trigger: document.getElementById('loyalty-discount-trigger')?.value || 'review_approved',
      discountType: 'percentage',
      discountValue,
      delayDays: Number(document.getElementById('loyalty-discount-delay')?.value || 0),
      verifiedOnly: Boolean(document.getElementById('loyalty-discount-verified')?.checked),
      minStars: Number(document.getElementById('loyalty-discount-stars')?.value || 1),
      reusableTemplate: true,
      messageTemplate: document.getElementById('loyalty-discount-message')?.value || 'Thanks for your review — here is {{ discount_value }}% off your next order.',
      emailSubject: document.getElementById('loyalty-email-subject')?.value || 'Your review reward is ready',
      emailBody: document.getElementById('loyalty-email-body')?.value || 'Thanks for leaving a review. Your {{ reward_type }} is now ready.',
    }],
    pointsRules: [{
      id: window.currentLoyaltyConfig?.pointsRules?.[0]?.id || undefined,
      name: document.getElementById('loyalty-points-name')?.value || 'Review approved points',
      enabled: true,
      trigger: document.getElementById('loyalty-points-trigger')?.value || 'review_approved',
      points,
      delayDays: Number(document.getElementById('loyalty-points-delay')?.value || 28),
      verifiedOnly: Boolean(document.getElementById('loyalty-points-verified')?.checked),
      minStars: Number(document.getElementById('loyalty-points-stars')?.value || 1),
      maxAwardsPerOrder: 1,
    }],
    settings: {
      reuseCoreEmailProvider: Boolean(document.getElementById('loyalty-reuse-email-provider')?.checked ?? true),
      pointsExpireAfterDays: Number(window.currentLoyaltyConfig?.settings?.pointsExpireAfterDays || 365),
      pendingMaturationEnabled: window.currentLoyaltyConfig?.settings?.pendingMaturationEnabled !== false,
      allowManualAdjustments: window.currentLoyaltyConfig?.settings?.allowManualAdjustments !== false,
      checkoutBeta: {
        enabled: Boolean(document.getElementById('loyalty-checkout-enabled')?.checked),
        betaLabel: document.getElementById('loyalty-checkout-label')?.value || 'Use your points at checkout',
        minimumPointsToShow: Number(document.getElementById('loyalty-checkout-min-points')?.value || 1),
        maximumPointsPerCheckout: Number(document.getElementById('loyalty-checkout-max-points')?.value || 5000),
        pointValueMinorUnits: Number(document.getElementById('loyalty-checkout-point-value')?.value || 1),
        allowNativeDiscountCodes: Boolean(document.getElementById('loyalty-checkout-native-codes')?.checked),
        requireLoggedInCustomer: true,
        allowPartialRedemption: true,
        betaNote: document.getElementById('loyalty-checkout-note')?.value || 'Customers must be logged in before checkout redemption appears.',
      },
    },
  };
}

function hydrateLoyalty(config = {}) {
  window.currentLoyaltyConfig = config;
  const reward = (config.rewardTemplates || [])[0] || {};
  const points = (config.pointsRules || [])[0] || {};
  const emailTemplate = (config.emailTemplates || [])[0] || {};
  const tiers = config.tiers || [];
  const redemption = (config.redemptionRewards || [])[0] || {};
  if (document.getElementById('loyalty-enabled')) document.getElementById('loyalty-enabled').checked = Boolean(config.enabled);
  if (document.getElementById('loyalty-status-text')) document.getElementById('loyalty-status-text').textContent = config.enabled ? 'Enabled' : 'Configured but inactive';
  if (document.getElementById('loyalty-status-help')) document.getElementById('loyalty-status-help').textContent = config.enabled ? 'Review rewards can be created when rules match.' : 'Turn on the module when you are ready to award points/discounts.';
  if (document.getElementById('loyalty-points-label')) document.getElementById('loyalty-points-label').value = config.pointName || 'Points';
  if (document.getElementById('loyalty-points-label-overview')) document.getElementById('loyalty-points-label-overview').value = config.pointName || 'Points';

  if (document.getElementById('loyalty-discount-name')) document.getElementById('loyalty-discount-name').value = reward.name || 'Review thank-you discount';
  if (document.getElementById('loyalty-discount-value')) document.getElementById('loyalty-discount-value').value = reward.discountValue ?? 10;
  if (document.getElementById('loyalty-discount-trigger')) document.getElementById('loyalty-discount-trigger').value = reward.trigger || 'review_approved';
  if (document.getElementById('loyalty-discount-delay')) document.getElementById('loyalty-discount-delay').value = reward.delayDays ?? 0;
  if (document.getElementById('loyalty-discount-stars')) document.getElementById('loyalty-discount-stars').value = reward.minStars || 1;
  if (document.getElementById('loyalty-discount-verified')) document.getElementById('loyalty-discount-verified').checked = reward.verifiedOnly !== false;
  if (document.getElementById('loyalty-discount-message')) document.getElementById('loyalty-discount-message').value = reward.messageTemplate || 'Thanks for your review — here is {{ discount_value }}% off your next order.';

  if (document.getElementById('loyalty-email-template-name')) document.getElementById('loyalty-email-template-name').value = emailTemplate.name || 'Reward ready';
  if (document.getElementById('loyalty-email-template-primary')) document.getElementById('loyalty-email-template-primary').value = emailTemplate.status || (emailTemplate.primary === false ? 'draft' : 'primary');
  if (document.getElementById('loyalty-email-subject')) document.getElementById('loyalty-email-subject').value = emailTemplate.subject || reward.emailSubject || 'Your review reward is ready';
  if (document.getElementById('loyalty-email-heading')) document.getElementById('loyalty-email-heading').value = emailTemplate.heading || 'Your reward is ready';
  if (document.getElementById('loyalty-email-body')) document.getElementById('loyalty-email-body').value = emailTemplate.body || reward.emailBody || 'Thanks for leaving a review. Your {{ reward_type }} is now ready.';
  if (document.getElementById('loyalty-email-accent')) document.getElementById('loyalty-email-accent').value = emailTemplate.accentColor || '#111827';
  if (document.getElementById('loyalty-email-button')) document.getElementById('loyalty-email-button').value = emailTemplate.buttonText || 'Shop now';

  if (document.getElementById('loyalty-points-name')) document.getElementById('loyalty-points-name').value = points.name || 'Review approved points';
  if (document.getElementById('loyalty-points-value')) document.getElementById('loyalty-points-value').value = points.points ?? 100;
  if (document.getElementById('loyalty-points-trigger')) document.getElementById('loyalty-points-trigger').value = points.trigger || 'review_approved';
  if (document.getElementById('loyalty-points-delay')) document.getElementById('loyalty-points-delay').value = points.delayDays ?? 28;
  if (document.getElementById('loyalty-points-stars')) document.getElementById('loyalty-points-stars').value = points.minStars || 1;
  if (document.getElementById('loyalty-points-verified')) document.getElementById('loyalty-points-verified').checked = points.verifiedOnly !== false;

  const tierById = Object.fromEntries(tiers.map((t) => [t.id, t]));
  if (document.getElementById('loyalty-tier-bronze')) document.getElementById('loyalty-tier-bronze').value = tierById.bronze?.threshold ?? 0;
  if (document.getElementById('loyalty-tier-silver')) document.getElementById('loyalty-tier-silver').value = tierById.silver?.threshold ?? 500;
  if (document.getElementById('loyalty-tier-gold')) document.getElementById('loyalty-tier-gold').value = tierById.gold?.threshold ?? 1500;
  if (document.getElementById('loyalty-tier-gold-multiplier')) document.getElementById('loyalty-tier-gold-multiplier').value = tierById.gold?.multiplier ?? 1.5;

  if (document.getElementById('loyalty-reward-name')) document.getElementById('loyalty-reward-name').value = redemption.name || '£5 off coupon';
  if (document.getElementById('loyalty-reward-cost')) document.getElementById('loyalty-reward-cost').value = redemption.pointsCost ?? 500;
  if (document.getElementById('loyalty-reward-type')) document.getElementById('loyalty-reward-type').value = redemption.type || 'discount';
  if (document.getElementById('loyalty-reward-value')) document.getElementById('loyalty-reward-value').value = redemption.discountValue ?? 5;
  const checkoutBeta = config.settings?.checkoutBeta || {};
  if (document.getElementById('loyalty-checkout-enabled')) document.getElementById('loyalty-checkout-enabled').checked = Boolean(checkoutBeta.enabled);
  if (document.getElementById('loyalty-checkout-native-codes')) document.getElementById('loyalty-checkout-native-codes').checked = Boolean(checkoutBeta.allowNativeDiscountCodes || redemption.discountMode === 'native_discount_code');
  if (document.getElementById('loyalty-checkout-min-points')) document.getElementById('loyalty-checkout-min-points').value = checkoutBeta.minimumPointsToShow ?? 1;
  if (document.getElementById('loyalty-checkout-max-points')) document.getElementById('loyalty-checkout-max-points').value = checkoutBeta.maximumPointsPerCheckout ?? 5000;
  if (document.getElementById('loyalty-checkout-point-value')) document.getElementById('loyalty-checkout-point-value').value = checkoutBeta.pointValueMinorUnits ?? 1;
  if (document.getElementById('loyalty-checkout-label')) document.getElementById('loyalty-checkout-label').value = checkoutBeta.betaLabel || 'Use your points at checkout';
  if (document.getElementById('loyalty-checkout-note')) document.getElementById('loyalty-checkout-note').value = checkoutBeta.betaNote || 'Customers must be logged in before checkout redemption appears.';
  window.updateLoyaltyPreview?.();
  window.updateLoyaltyCheckoutPreview?.();
}

function buildLoyaltyPreviewHtml() {
  const subject = document.getElementById('loyalty-email-subject')?.value || 'Your review reward is ready';
  const heading = document.getElementById('loyalty-email-heading')?.value || 'Your reward is ready';
  const body = document.getElementById('loyalty-email-body')?.value || 'Thanks for leaving a review. Your reward is now ready.';
  const discount = document.getElementById('loyalty-discount-value')?.value || '10';
  const pointName = document.getElementById('loyalty-points-label')?.value || 'Points';
  const accent = document.getElementById('loyalty-email-accent')?.value || '#111827';
  const buttonText = document.getElementById('loyalty-email-button')?.value || 'Shop now';
  const renderedBody = escapeHtml(body).replace(/\{\{\s*discount_value\s*\}\}/g, discount).replace(/\{\{\s*reward_type\s*\}\}/g, discount + '% discount').replace(/\{\{\s*points_name\s*\}\}/g, escapeHtml(pointName));
  return `<div style="background:#f3f4f6;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#111827;"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:30px;border:1px solid #e5e7eb;text-align:center;"><div style="font-size:13px;font-weight:800;color:#008060;margin-bottom:12px;">Reward ready</div><h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">${escapeHtml(heading || subject)}</h1><p style="font-size:16px;line-height:1.6;color:#4b5563;">${renderedBody}</p><div style="margin:22px auto;padding:18px;border:2px dashed ${escapeHtml(accent)};border-radius:14px;font-weight:900;font-size:26px;letter-spacing:.04em;max-width:260px;color:${escapeHtml(accent)};">${escapeHtml(discount)}% OFF</div><a href="https://${SHOP_DOMAIN}" style="display:inline-block;background:${escapeHtml(accent)};color:#fff;text-decoration:none;border-radius:12px;padding:13px 18px;font-weight:800;">${escapeHtml(buttonText)}</a><p style="margin-top:18px;font-size:12px;color:#667085;">Sent by ${escapeHtml(SHOP_DOMAIN)}</p></div></div>`;
}

window.updateLoyaltyPreview = function() {
  const box = document.getElementById('loyalty-email-preview');
  if (box) box.innerHTML = buildLoyaltyPreviewHtml();
};

window.updateLoyaltyCheckoutPreview = function() {
  const box = document.getElementById('loyalty-checkout-preview');
  if (!box) return;
  const enabled = Boolean(document.getElementById('loyalty-checkout-enabled')?.checked);
  const nativeCodes = Boolean(document.getElementById('loyalty-checkout-native-codes')?.checked);
  const pointName = document.getElementById('loyalty-points-label')?.value || 'Points';
  const rewardName = document.getElementById('loyalty-reward-name')?.value || '£5 off coupon';
  const rewardCost = Number(document.getElementById('loyalty-reward-cost')?.value || 500);
  const rewardValue = Number(document.getElementById('loyalty-reward-value')?.value || 5);
  const label = document.getElementById('loyalty-checkout-label')?.value || 'Use your points at checkout';
  const note = document.getElementById('loyalty-checkout-note')?.value || 'Customers must be logged in before checkout redemption appears.';
  box.innerHTML = `<div class="loyalty-wallet-card"><span>${enabled ? 'Beta enabled' : 'Beta disabled'}</span><strong>${escapeHtml(label)}</strong><p class="muted">A logged-in customer with enough ${escapeHtml(pointName)} will see this block in checkout.</p></div><div class="loyalty-redemption-row"><div><strong>${escapeHtml(rewardName)}</strong><span>${rewardCost} ${escapeHtml(pointName)} → ${rewardValue} off${nativeCodes ? ' · native discount code' : ' · reservation only'}</span></div><button class="secondary-btn" type="button" disabled>Redeem</button></div><p class="muted" style="margin-top:12px;">${escapeHtml(note)}</p>`;
};


window.sendLoyaltyTestEmail = async function() {
  const to = document.getElementById('loyalty-test-to')?.value || '';
  if (!to) { window.showToast('Enter a test recipient email.'); return; }
  try {
    await adminFetch('/admin/loyalty/test-email', {
      method: 'POST',
      body: JSON.stringify({ to, subject: document.getElementById('loyalty-email-subject')?.value || 'Your review reward is ready', html: buildLoyaltyPreviewHtml() }),
    });
    window.showToast('Loyalty test email sent.');
  } catch (error) {
    window.showToast(error.message || 'Could not send loyalty test email');
  }
};

function renderLoyaltyLedger(rows = []) {
  const list = document.getElementById('loyalty-ledger-list');
  if (!list) return;
  list.innerHTML = rows.length ? rows.map((row) => `
    <div class="loyalty-ledger-row">
      <div><strong>${escapeHtml(row.ruleName || row.eventType)}</strong><span>${escapeHtml(String(row.customerRefHash || '').slice(0, 14))}… · ${row.availableAt ? new Date(row.availableAt).toLocaleDateString() : '—'}</span></div>
      <span class="loyalty-ledger-badge">${escapeHtml(row.status || 'pending')}</span>
      <strong>${row.points ? `${Number(row.points)} pts` : `${Number(row.discountValue || 0)}${row.discountType === 'percentage' ? '%' : ''}`}</strong>
    </div>`).join('') : '<p class="muted">No loyalty ledger rows yet. Rows will appear after matching review events or manual adjustments.</p>';
}

window.loadLoyaltyConfig = async function() {
  try {
    const config = await adminFetch('/admin/loyalty/config');
    hydrateLoyalty(config || {});
    const [ledger] = await Promise.all([adminFetch('/admin/loyalty/ledger?limit=25'), window.loadLoyaltyRedemptions?.()]);
    renderLoyaltyLedger(ledger.rows || []);
  } catch (error) {
    console.warn('Could not load loyalty config:', error);
    window.showToast(error.message || 'Could not load loyalty config');
  }
};

window.manualLoyaltyAdjustment = async function() {
  const customerRef = document.getElementById('loyalty-adjust-ref')?.value || '';
  const points = Number(document.getElementById('loyalty-adjust-points')?.value || 0);
  if (!customerRef || !points) { window.showToast('Enter a customer reference and points change.'); return; }
  try {
    await adminFetch('/admin/loyalty/ledger/manual-adjust', {
      method: 'POST',
      body: JSON.stringify({ customerRef, points, status: document.getElementById('loyalty-adjust-status')?.value || 'available', reason: document.getElementById('loyalty-adjust-reason')?.value || 'Manual adjustment' }),
    });
    window.showToast('Loyalty points adjusted.');
    window.loadLoyaltyConfig?.();
  } catch (error) {
    window.showToast(error.message || 'Could not adjust points');
  }
};


window.loadLoyaltyRedemptions = async function() {
  const list = document.getElementById('loyalty-redemptions-list');
  if (!list) return;
  try {
    const data = await adminFetch('/admin/loyalty/redemptions?limit=20');
    const rows = data.rows || [];
    list.innerHTML = rows.length ? rows.map((row) => `<div class="loyalty-ledger-row"><div><strong>${escapeHtml(row.rewardName || row.rewardId || 'Checkout redemption')}</strong><span>${escapeHtml(row.shopifyDiscountCode || 'No code issued')} · ${row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</span></div><span class="loyalty-ledger-badge">${escapeHtml(row.status || 'draft')}</span><strong>${Number(row.pointsCost || row.pointsReserved || 0)} pts</strong></div>`).join('') : '<p class="muted">No checkout redemptions yet.</p>';
  } catch (error) {
    list.innerHTML = `<div class="notice-box error">${escapeHtml(error.message || 'Could not load redemptions')}</div>`;
  }
};

window.saveLoyaltyConfig = async function() {
  try {
    const saved = await adminFetch('/admin/loyalty/config', {
      method: 'PATCH',
      body: JSON.stringify(getLoyaltyPayload()),
    });
    hydrateLoyalty(saved || {});
    window.updateLoyaltyPreview?.();
    window.updateLoyaltyCheckoutPreview?.();
    window.showToast('Loyalty settings saved');
  } catch (error) {
    window.showToast(error.message || 'Could not save loyalty settings');
  }
};

window.initLoyaltyTabs = function() {
  document.querySelectorAll('[data-loyalty-tab]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const target = btn.dataset.loyaltyTab;
      document.querySelectorAll('[data-loyalty-tab]').forEach((item) => item.classList.toggle('active', item === btn));
      document.querySelectorAll('.loyalty-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `loyalty-tab-${target}`));
    });
  });
};

setTimeout(() => { window.initLoyaltyTabs?.(); window.updateLoyaltyPreview?.(); window.updateLoyaltyCheckoutPreview?.(); }, 400);
