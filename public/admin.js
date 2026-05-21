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

  const res = await fetch(`${API}${withShop(path)}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const json = await res.json();
      message = json.error || json.detail || message;
    } catch (_) {}
    const error = new Error(message);
    error.status = res.status;
    if (res.status === 401) error.installUrl = `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(SHOP_DOMAIN)}`;
    throw error;
  }
  return res.json();
}

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
          <h3 style="margin:0 0 8px; font-size:20px; line-height:1.25;">${escapeHtml(r.headline || 'No Headline')}</h3>
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
      parsedCSVData = results.data;
      csvHeaders = results.meta.fields || [];
      window.buildMappingUI();
    },
  });
};

window.buildMappingUI = function() {
  document.getElementById('mapping-ui').style.display = 'block';
  const reqFields = [
    { id: 'map-itemId', label: 'Product ID (Req)' },
    { id: 'map-rating', label: 'Star Rating (Req)' },
    { id: 'map-userId', label: 'Reviewer Name' },
    { id: 'map-email', label: 'Reviewer Email' },
    { id: 'map-headline', label: 'Review Title' },
    { id: 'map-comment', label: 'Review Body' },
    { id: 'map-date', label: 'Review Date' },
  ];
  let html = '';
  reqFields.forEach((f) => {
    let options = '<option value="">-- Ignore --</option>';
    csvHeaders.forEach((h) => {
      const hL = h.toLowerCase();
      let selected = '';
      if (f.id === 'map-itemId' && (hL.includes('product') || hL.includes('id'))) selected = 'selected';
      if (f.id === 'map-rating' && (hL.includes('score') || hL.includes('rating'))) selected = 'selected';
      if (f.id === 'map-userId' && (hL.includes('name') || hL.includes('user'))) selected = 'selected';
      if (f.id === 'map-email' && hL.includes('email')) selected = 'selected';
      if (f.id === 'map-headline' && hL.includes('title')) selected = 'selected';
      if (f.id === 'map-comment' && (hL.includes('body') || hL.includes('content') || hL.includes('review'))) selected = 'selected';
      if (f.id === 'map-date' && hL.includes('date')) selected = 'selected';
      options += `<option value="${escapeHtml(h)}" ${selected}>${escapeHtml(h)}</option>`;
    });
    html += `<div class="mapper-card"><label>${escapeHtml(f.label)}</label><select id="${f.id}" class="filter-select" style="width:100%; margin-top:6px;">${options}</select></div>`;
  });
  document.getElementById('column-mappers').innerHTML = html;
  const btn = document.getElementById('import-submit-btn');
  btn.innerText = 'Preview & Map Products';
  btn.onclick = window.generateStagingArea;
};

window.generateStagingArea = function() {
  const map = {
    itemId: document.getElementById('map-itemId').value,
    rating: document.getElementById('map-rating').value,
    userId: document.getElementById('map-userId').value,
    email: document.getElementById('map-email').value,
    headline: document.getElementById('map-headline').value,
    comment: document.getElementById('map-comment').value,
    createdAt: document.getElementById('map-date').value,
  };
  if (!map.itemId || !map.rating) {
    alert('Product ID and Star Rating must be mapped.');
    return;
  }
  mappedReviews = parsedCSVData.map((row) => ({
    itemId: row[map.itemId],
    rating: row[map.rating],
    userId: row[map.userId],
    email: row[map.email],
    headline: row[map.headline],
    comment: row[map.comment],
    createdAt: row[map.createdAt],
  }));
  const rows = mappedReviews.map((r, i) => `
    <tr><td>${escapeHtml(r.userId || '')}</td><td>${'★'.repeat(parseInt(r.rating, 10) || 5)}</td><td>${escapeHtml(String(r.comment || '').slice(0, 80))}</td><td><input id="stage-item-${i}" class="premium-input" value="${escapeHtml(r.itemId || '')}" style="width:100%;" /></td></tr>`).join('');
  const stagingHtml = `
    <div id="staging-area" style="margin-top:24px;">
      <h3>3. Smart Product Mapping</h3>
      <p class="muted">Check that every row has the correct numeric Product ID before importing.</p>
      <table class="import-table"><thead><tr><th>Reviewer</th><th>Rating</th><th>Review</th><th>Target Product ID</th></tr></thead><tbody>${rows}</tbody></table>
      <p><button id="final-import-btn" class="primary-btn" onclick="window.processFinalImport()">Go Live (Import to Database)</button></p>
    </div>`;
  let existing = document.getElementById('staging-area');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'staging-area';
    document.getElementById('mapping-ui').appendChild(existing);
  }
  existing.outerHTML = stagingHtml;
};

window.processFinalImport = async function() {
  const btn = document.getElementById('final-import-btn');
  if (btn) { btn.innerText = 'Importing...'; btn.disabled = true; }
  const finalPayload = mappedReviews.map((r, i) => ({ ...r, itemId: document.getElementById(`stage-item-${i}`).value.trim() }));
  try {
    const result = await adminFetch('/reviews/import', {
      method: 'POST',
      body: JSON.stringify({ shopDomain: SHOP_DOMAIN, reviews: finalPayload }),
    });
    window.showToast(`Import successful: ${result.imported || 0} reviews`);
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
  return {
    enabled: Boolean(document.getElementById('loyalty-enabled')?.checked),
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
  };
}

function hydrateLoyalty(config = {}) {
  window.currentLoyaltyConfig = config;
  const reward = (config.rewardTemplates || [])[0] || {};
  const points = (config.pointsRules || [])[0] || {};
  if (document.getElementById('loyalty-enabled')) document.getElementById('loyalty-enabled').checked = Boolean(config.enabled);
  if (document.getElementById('loyalty-status-text')) document.getElementById('loyalty-status-text').textContent = config.enabled ? 'Enabled' : 'Configured but inactive';
  if (document.getElementById('loyalty-status-help')) document.getElementById('loyalty-status-help').textContent = config.enabled ? 'Review rewards can be created when rules match.' : 'Turn on the module when you are ready to award points/discounts.';

  if (document.getElementById('loyalty-discount-name')) document.getElementById('loyalty-discount-name').value = reward.name || 'Review thank-you discount';
  if (document.getElementById('loyalty-discount-value')) document.getElementById('loyalty-discount-value').value = reward.discountValue ?? 10;
  if (document.getElementById('loyalty-discount-trigger')) document.getElementById('loyalty-discount-trigger').value = reward.trigger || 'review_approved';
  if (document.getElementById('loyalty-discount-delay')) document.getElementById('loyalty-discount-delay').value = reward.delayDays ?? 0;
  if (document.getElementById('loyalty-discount-stars')) document.getElementById('loyalty-discount-stars').value = reward.minStars || 1;
  if (document.getElementById('loyalty-discount-verified')) document.getElementById('loyalty-discount-verified').checked = reward.verifiedOnly !== false;
  if (document.getElementById('loyalty-discount-message')) document.getElementById('loyalty-discount-message').value = reward.messageTemplate || 'Thanks for your review — here is {{ discount_value }}% off your next order.';

  if (document.getElementById('loyalty-points-name')) document.getElementById('loyalty-points-name').value = points.name || 'Review approved points';
  if (document.getElementById('loyalty-points-value')) document.getElementById('loyalty-points-value').value = points.points ?? 100;
  if (document.getElementById('loyalty-points-trigger')) document.getElementById('loyalty-points-trigger').value = points.trigger || 'review_approved';
  if (document.getElementById('loyalty-points-delay')) document.getElementById('loyalty-points-delay').value = points.delayDays ?? 28;
  if (document.getElementById('loyalty-points-stars')) document.getElementById('loyalty-points-stars').value = points.minStars || 1;
  if (document.getElementById('loyalty-points-verified')) document.getElementById('loyalty-points-verified').checked = points.verifiedOnly !== false;
}

window.loadLoyaltyConfig = async function() {
  try {
    const config = await adminFetch('/admin/loyalty/config');
    hydrateLoyalty(config || {});
    const ledger = await adminFetch('/admin/loyalty/ledger?limit=25');
    const list = document.getElementById('loyalty-ledger-list');
    if (list) {
      const rows = ledger.rows || [];
      list.innerHTML = rows.length ? rows.map((row) => `
        <div class="loyalty-ledger-row">
          <div><strong>${escapeHtml(row.ruleName || row.eventType)}</strong><br><code>${escapeHtml(row.customerRefHash || '')}</code></div>
          <div><span class="loyalty-ledger-pill">${escapeHtml(row.status || 'pending')}</span></div>
          <div>${row.points ? `${Number(row.points)} points` : `${Number(row.discountValue || 0)}${row.discountType === 'percentage' ? '%' : ''} discount`}</div>
          <div>${row.availableAt ? new Date(row.availableAt).toLocaleDateString() : '—'}</div>
        </div>`).join('') : '<p class="muted">No loyalty ledger rows yet. Rows will appear after matching review events.</p>';
    }
  } catch (error) {
    console.warn('Could not load loyalty config:', error);
    window.showToast(error.message || 'Could not load loyalty config');
  }
};

window.saveLoyaltyConfig = async function() {
  try {
    const saved = await adminFetch('/admin/loyalty/config', {
      method: 'PATCH',
      body: JSON.stringify(getLoyaltyPayload()),
    });
    hydrateLoyalty(saved || {});
    window.showToast('Loyalty settings saved');
  } catch (error) {
    window.showToast(error.message || 'Could not save loyalty settings');
  }
};
