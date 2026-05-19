const API = 'https://nectar-reviews-api.onrender.com/api';
const urlParams = new URLSearchParams(window.location.search);
const SHOP_DOMAIN = urlParams.get('shopDomain') || urlParams.get('shop') || 'your-dev-store.myshopify.com';

let data = [];
let settings = {};
let state = { module: 'dashboard', sub: 'overview' };
let lastManualReward = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function stars(count) {
  const rating = Math.max(0, Math.min(5, Number(count || 0)));
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
}

window.showToast = function showToast(message) {
  if (window.shopify?.toast?.show) window.shopify.toast.show(message);
  const toast = $('custom-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.top = '30px';
  setTimeout(() => { toast.style.top = '-100px'; }, 3000);
};

function showView(id) {
  document.querySelectorAll('.view').forEach((view) => {
    const active = view.id === id;
    view.classList.toggle('active', active);
    view.style.display = active ? '' : 'none';
  });
}

function makeButton(label, module, sub, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.dataset.nrModule = module;
  button.dataset.nrSub = sub;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    selectModule(module, sub);
  });
  return button;
}

function renderTopTabs() {
  const tabs = $('nr-primary-tabs');
  if (!tabs) return;
  tabs.replaceChildren(
    makeButton('Dashboard', 'dashboard', 'overview', 'nr-primary-tab'),
    makeButton('Reviews', 'reviews', 'manager', 'nr-primary-tab'),
    makeButton('Discount Rewards', 'discounts', 'settings', 'nr-primary-tab')
  );
  document.querySelectorAll('.nr-primary-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.nrModule === state.module);
  });
}

function sideButton(label, module, sub) {
  const button = makeButton(label, module, sub, 'nr-side-tab');
  button.classList.toggle('active', state.module === module && state.sub === sub);
  return button;
}

function renderSideTabs() {
  const group = $('context-nav');
  if (!group) return;
  const title = document.createElement('p');
  title.className = 'nr-side-title';
  const list = document.createElement('div');
  list.className = 'nr-side-tabs';

  if (state.module === 'dashboard') {
    title.textContent = 'Dashboard';
    list.appendChild(sideButton('Overview', 'dashboard', 'overview'));
  }

  if (state.module === 'reviews') {
    title.textContent = 'Reviews';
    list.appendChild(sideButton('Review Manager', 'reviews', 'manager'));
    list.appendChild(sideButton('Messaging & Campaigns', 'reviews', 'campaigns'));
    list.appendChild(sideButton('Trash', 'reviews', 'trash'));
    list.appendChild(sideButton('Import CSV', 'reviews', 'import'));
  }

  if (state.module === 'discounts') {
    title.textContent = 'Discount Rewards';
    list.appendChild(sideButton('Settings', 'discounts', 'settings'));
    list.appendChild(sideButton('Manual Code', 'discounts', 'manual'));
    list.appendChild(sideButton('Generated Codes', 'discounts', 'codes'));
    list.appendChild(sideButton('Email Template', 'discounts', 'email'));
    list.appendChild(sideButton('Function Outline', 'discounts', 'function'));
  }

  group.replaceChildren(title, list);
}

function showDiscountSub(sub) {
  document.querySelectorAll('.nr-discount-subview').forEach((view) => {
    view.classList.toggle('active', view.id === `reward-${sub}`);
  });
  if (sub === 'codes') loadRewardCodes();
  if (sub === 'email') renderRewardEmailPreview();
}

function selectModule(module, sub) {
  state = { module, sub };

  if (module === 'dashboard') {
    state.sub = 'overview';
    showView('v-dash');
    setTimeout(loadStats, 0);
  }

  if (module === 'reviews') {
    if (sub === 'manager') showView('v-mgr');
    if (sub === 'campaigns') { showView('v-msg'); if (window.initMessagingCampaigns) window.initMessagingCampaigns(); }
    if (sub === 'trash') {
      showView('v-trash');
      loadTrash();
    }
    if (sub === 'import') showView('v-import');
  }

  if (module === 'discounts') {
    showView('v-discounts');
    showDiscountSub(sub || 'settings');
    if (sub === 'settings' || sub === 'manual' || sub === 'email') loadRewardSettings();
  }

  renderTopTabs();
  renderSideTabs();
}

window.tab = function tab(id) {
  if (id === 'v-dash') return selectModule('dashboard', 'overview');
  if (id === 'v-mgr') return selectModule('reviews', 'manager');
  if (id === 'v-msg' || id === 'v-campaigns') return selectModule('reviews', 'campaigns');
  if (id === 'v-trash') return selectModule('reviews', 'trash');
  if (id === 'v-import') return selectModule('reviews', 'import');
  if (id === 'v-discounts') return selectModule('discounts', state.sub || 'settings');
  showView(id);
};

window.rewardSubTab = function rewardSubTab(sub) {
  return selectModule('discounts', sub || 'settings');
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed: ${res.status}`);
  return json;
}

window.load = async function load() {
  await Promise.allSettled([loadReviews(), loadSettings(), loadRewardSettings()]);
  renderReviews();
  renderTrash();
  loadStats();
  renderTopTabs();
  renderSideTabs();
  renderRewardEmailPreview();
};

async function loadReviews() {
  try {
    data = await fetchJson(`${API}/admin/reviews?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`);
  } catch (error) {
    console.error('Load reviews failed:', error);
    data = [];
  }
}

async function loadSettings() {
  try {
    settings = await fetchJson(`${API}/admin/settings?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`);
    hydrateSettings();
  } catch (error) {
    console.error('Load settings failed:', error);
    settings = {};
  }
}

function hydrateSettings() {
  if (!settings) return;
  if ($('set-beta-enable')) $('set-beta-enable').checked = settings.betaMode?.enabled || false;
  if ($('set-beta-email')) $('set-beta-email').value = settings.betaMode?.email || '';
  if ($('set-auto-enable')) $('set-auto-enable').checked = settings.autoApproveEnabled || false;
  if ($('set-auto-type')) $('set-auto-type').value = settings.autoApproveType || 'verified';
  if ($('set-min-stars')) $('set-min-stars').value = settings.autoApproveMinStars || 4;
  if ($('set-seo')) $('set-seo').checked = settings.seo?.richSnippets !== false;
  if ($('style-title')) $('style-title').value = settings.widgetStyles?.widgetTitle || 'Customer Reviews';
  if ($('style-primary')) $('style-primary').value = settings.widgetStyles?.primaryColor || '#000000';
  if ($('style-star')) $('style-star').value = settings.widgetStyles?.starColor || '#ffc700';
  if ($('style-text')) $('style-text').value = settings.widgetStyles?.textSize || 15;
  updatePreviews();
}

window.loadStats = async function loadStats() {
  try {
    const stats = await fetchJson(`${API}/admin/stats?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`);
    const live = data.filter((r) => r.status === 'accepted' && !r.isDeleted);
    const pending = data.filter((r) => r.status === 'pending' && !r.isDeleted);
    const average = live.length ? (live.reduce((sum, r) => sum + Number(r.rating || 0), 0) / live.length).toFixed(1) : '0.0';
    if ($('stat-total')) $('stat-total').textContent = String(data.filter((r) => !r.isDeleted).length || stats.total || 0);
    if ($('stat-live')) $('stat-live').textContent = String(live.length || stats.live || 0);
    if ($('stat-pending')) $('stat-pending').textContent = String(pending.length);
    if ($('stat-average')) $('stat-average').textContent = average;
    const top = stats.topProduct || {};
    if ($('v-dash-prod-card')) {
      $('v-dash-prod-card').innerHTML = `
        <h3 style="margin-top:0;">Top Product Snapshot</h3>
        ${top.image ? `<img src="${escapeHtml(top.image)}" alt="" style="max-width:90px;border-radius:12px;float:right;margin-left:12px;">` : ''}
        <p class="muted">${escapeHtml(top.title || top.id || 'No product data yet')}</p>
        <div class="stars">${stars(Math.round(Number(top.averageRating || 0)))}</div>
        <p><strong>${top.count || 0}</strong> accepted review(s)</p>
      `;
    }
    if ($('source-summary')) {
      const sources = stats.sources || {};
      $('source-summary').innerHTML = `Website: <strong>${sources.website || 0}</strong><br>Email: <strong>${sources.email || 0}</strong><br>Import: <strong>${sources.import || 0}</strong>`;
    }
  } catch (error) {
    console.error('Load stats failed:', error);
  }
};

function filteredReviews() {
  const starsFilter = $('filter-stars')?.value || 'all';
  const statusFilter = $('filter-status')?.value || 'all';
  return data.filter((review) => {
    if (review.isDeleted) return false;
    if (starsFilter !== 'all' && String(review.rating) !== starsFilter) return false;
    if (statusFilter !== 'all' && review.status !== statusFilter) return false;
    return true;
  });
}

function renderReviews() {
  const list = $('reviews-list');
  if (!list) return;
  const reviews = filteredReviews();
  if (!reviews.length) {
    list.innerHTML = '<div class="panel muted">No reviews found.</div>';
    return;
  }
  list.innerHTML = reviews.map((review) => reviewCard(review)).join('');
}

function reviewCard(review) {
  return `
    <div class="review-card" data-review-id="${review._id}">
      <div class="review-head">
        <div>
          <div class="stars">${stars(review.rating)}</div>
          <h3 style="margin:8px 0 4px;">${escapeHtml(review.headline || 'Untitled review')}</h3>
          <p class="muted" style="margin:0;">${escapeHtml(review.name || review.email || review.userId || 'Customer')} ${review.verifiedPurchase ? '✓ Verified' : ''}</p>
        </div>
        <span class="badge ${escapeHtml(review.status)}">${escapeHtml(review.status)}</span>
      </div>
      <p>${escapeHtml(review.comment || '')}</p>
      ${review.reply ? `<p class="muted"><strong>Reply:</strong> ${escapeHtml(review.reply)}</p>` : ''}
      <div class="btn-row">
        <button class="secondary-btn" type="button" data-action="status" data-id="${review._id}" data-status="accepted">Accept</button>
        <button class="secondary-btn" type="button" data-action="status" data-id="${review._id}" data-status="hold">Hold</button>
        <button class="secondary-btn" type="button" data-action="status" data-id="${review._id}" data-status="rejected">Reject</button>
        <button class="secondary-btn" type="button" data-action="reward" data-id="${review._id}">Issue Reward</button>
        <button class="danger-btn" type="button" data-action="delete" data-id="${review._id}">Trash</button>
      </div>
    </div>
  `;
}

function renderTrash() {
  const list = $('trash-list');
  if (!list) return;
  const deleted = data.filter((review) => review.isDeleted);
  if (!deleted.length) {
    list.innerHTML = '<div class="panel muted">Trash is empty.</div>';
    return;
  }
  list.innerHTML = deleted.map((review) => `
    <div class="review-card">
      <h3 style="margin-top:0;">${escapeHtml(review.headline || 'Untitled review')}</h3>
      <p>${escapeHtml(review.comment || '')}</p>
      <button class="secondary-btn" type="button" data-action="recover" data-id="${review._id}">Restore</button>
    </div>
  `).join('');
}

window.updateStatus = async function updateStatus(id, status) {
  try {
    await fetchJson(`${API}/reviews/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, shopDomain: SHOP_DOMAIN }) });
    const review = data.find((r) => r._id === id);
    if (review) review.status = status;
    renderReviews();
    loadStats();
    showToast('Review updated');
  } catch (error) {
    alert(error.message);
  }
};

async function deleteReview(id) {
  try {
    await fetchJson(`${API}/reviews/${id}`, { method: 'DELETE' });
    const review = data.find((r) => r._id === id);
    if (review) review.isDeleted = true;
    renderReviews();
    renderTrash();
    loadStats();
    showToast('Review moved to trash');
  } catch (error) {
    alert(error.message);
  }
}

async function recoverReview(id) {
  try {
    const restored = await fetchJson(`${API}/reviews/${id}/recover`, { method: 'POST' });
    const index = data.findIndex((r) => r._id === id);
    if (index >= 0) data[index] = restored;
    renderReviews();
    renderTrash();
    loadStats();
    showToast('Review restored');
  } catch (error) {
    alert(error.message);
  }
}

async function issueReward(id) {
  try {
    const result = await fetchJson(`${API}/reviews/${id}/reward`, { method: 'POST', body: JSON.stringify({ shopDomain: SHOP_DOMAIN }) });
    if (result.created) showToast('Reward code issued');
    else if (result.skipped) showToast(`Reward skipped: ${String(result.reason || '').replaceAll('_', ' ')}`);
    else showToast('Reward request completed');
  } catch (error) {
    alert(error.message);
  }
}

async function loadTrash() {
  try {
    const deleted = await fetchJson(`${API}/admin/reviews?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&deleted=true&t=${Date.now()}`);
    const kept = data.filter((r) => !r.isDeleted);
    data = [...kept, ...deleted];
    renderTrash();
  } catch (error) {
    console.error('Load trash failed:', error);
  }
}

async function saveSettings() {
  const payload = {
    shopDomain: SHOP_DOMAIN,
    betaMode: { enabled: !!$('set-beta-enable')?.checked, email: $('set-beta-email')?.value || '' },
    autoApproveEnabled: !!$('set-auto-enable')?.checked,
    autoApproveType: $('set-auto-type')?.value || 'verified',
    autoApproveMinStars: Number($('set-min-stars')?.value || 4),
    seo: { richSnippets: !!$('set-seo')?.checked },
    widgetStyles: {
      widgetTitle: $('style-title')?.value || 'Customer Reviews',
      primaryColor: $('style-primary')?.value || '#000000',
      starColor: $('style-star')?.value || '#ffc700',
      textSize: Number($('style-text')?.value || 15)
    }
  };
  try {
    settings = await fetchJson(`${API}/admin/settings`, { method: 'PATCH', body: JSON.stringify(payload) });
    hydrateSettings();
    showToast('Settings saved');
  } catch (error) {
    alert(error.message);
  }
}

function updatePreviews() {
  if ($('preview-title')) $('preview-title').textContent = $('style-title')?.value || 'Customer Reviews';
  document.documentElement.style.setProperty('--preview-primary', $('style-primary')?.value || '#000000');
}

async function loadRewardSettings() {
  try {
    const reward = await fetchJson(`${API}/admin/review-reward-settings?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`);
    if ($('reward-enabled')) $('reward-enabled').checked = !!reward.enabled;
    if ($('reward-percentage')) $('reward-percentage').value = reward.percentage || 5;
    if ($('reward-expiry-days')) $('reward-expiry-days').value = reward.expiryDays || 60;
    if ($('reward-prefix')) $('reward-prefix').value = reward.prefix || 'GN';
    if ($('reward-trigger-status')) $('reward-trigger-status').value = reward.triggerStatus || 'accepted';
    if ($('reward-verified-only')) $('reward-verified-only').checked = reward.verifiedOnly !== false;
    if ($('reward-combine-order')) $('reward-combine-order').checked = reward.combinesWith?.orderDiscounts !== false;
    if ($('reward-combine-product')) $('reward-combine-product').checked = reward.combinesWith?.productDiscounts !== false;
    if ($('reward-combine-shipping')) $('reward-combine-shipping').checked = reward.combinesWith?.shippingDiscounts !== false;
    if ($('reward-email-subject')) $('reward-email-subject').value = reward.emailSubject || 'Your review reward code';
    if ($('reward-email-template') && reward.emailTemplate) $('reward-email-template').value = reward.emailTemplate;
    if ($('reward-email-template-main') && reward.emailTemplate) $('reward-email-template-main').value = reward.emailTemplate;
    if ($('manual-reward-prefix')) $('manual-reward-prefix').value = reward.prefix || 'GN';
    if ($('manual-reward-percentage')) $('manual-reward-percentage').value = reward.percentage || 5;
    if ($('manual-reward-expiry-days')) $('manual-reward-expiry-days').value = reward.expiryDays || 60;
    renderRewardEmailPreview();
  } catch (error) {
    console.error('Load reward settings failed:', error);
  }
}

async function saveRewardSettings() {
  const template = $('reward-email-template-main')?.value || $('reward-email-template')?.value || '';
  const payload = {
    shopDomain: SHOP_DOMAIN,
    enabled: !!$('reward-enabled')?.checked,
    percentage: Number($('reward-percentage')?.value || 5),
    expiryDays: Number($('reward-expiry-days')?.value || 60),
    prefix: String($('reward-prefix')?.value || 'GN').trim().toUpperCase(),
    triggerStatus: $('reward-trigger-status')?.value || 'accepted',
    verifiedOnly: !!$('reward-verified-only')?.checked,
    combinesWith: {
      orderDiscounts: !!$('reward-combine-order')?.checked,
      productDiscounts: !!$('reward-combine-product')?.checked,
      shippingDiscounts: !!$('reward-combine-shipping')?.checked
    },
    emailSubject: $('reward-email-subject')?.value || 'Your review reward code',
    emailTemplate: template
  };
  try {
    await fetchJson(`${API}/admin/review-reward-settings`, { method: 'PATCH', body: JSON.stringify(payload) });
    showToast('Reward settings saved');
  } catch (error) {
    alert(error.message);
  }
}

async function createManualRewardCode() {
  const email = String($('manual-reward-email')?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return alert('Enter a valid customer email first.');
  const result = $('manual-reward-result');
  if (result) result.textContent = 'Creating code...';
  const payload = {
    shopDomain: SHOP_DOMAIN,
    email,
    code: String($('manual-reward-code')?.value || '').trim(),
    prefix: String($('manual-reward-prefix')?.value || 'GN').trim().toUpperCase(),
    percentage: Number($('manual-reward-percentage')?.value || 5),
    expiryDays: Number($('manual-reward-expiry-days')?.value || 60)
  };
  try {
    const json = await fetchJson(`${API}/admin/review-rewards/manual`, { method: 'POST', body: JSON.stringify(payload) });
    const reward = json.reward || {};
    lastManualReward = { code: reward.code, email: reward.email, percentage: reward.percentage || payload.percentage, expiryDays: payload.expiryDays };
    if (result) {
      result.innerHTML = `
        <div class="muted">Manual reward code created</div>
        <div class="nr-code-output">${escapeHtml(reward.code)}</div>
        <div><strong>Email:</strong> ${escapeHtml(reward.email)}</div>
        <div><strong>Discount:</strong> ${escapeHtml(reward.percentage || payload.percentage)}%</div>
        <div><strong>Status:</strong> ${escapeHtml(reward.status || 'issued')}</div>
        <hr style="border:0;border-top:1px solid var(--border);margin:14px 0;">
        <div id="manual-email-copy">${escapeHtml(fillRewardTemplate(lastManualReward))}</div>
      `;
    }
    renderRewardEmailPreview();
    showToast('Manual reward code created');
  } catch (error) {
    if (result) result.textContent = error.message;
    alert(error.message);
  }
}

async function loadRewardCodes() {
  const body = $('reward-code-list');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  try {
    const rows = await fetchJson(`${API}/admin/review-rewards?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`);
    if (!Array.isArray(rows) || !rows.length) {
      body.innerHTML = '<tr><td colspan="5">No reward codes have been generated yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.code || '—')}</strong></td>
        <td>${escapeHtml(row.email || '—')}</td>
        <td><span class="badge ${escapeHtml(row.status || 'issued')}">${escapeHtml(row.status || 'issued')}</span></td>
        <td>${row.endsAt ? new Date(row.endsAt).toLocaleDateString() : '—'}</td>
        <td>${escapeHtml(row.reviewId || '—')}</td>
      </tr>
    `).join('');
  } catch (error) {
    body.innerHTML = '<tr><td colspan="5">Could not load reward codes.</td></tr>';
  }
}

function rewardTemplate() {
  return $('reward-email-template-main')?.value || $('reward-email-template')?.value || '';
}

function fillRewardTemplate(reward) {
  const r = reward || lastManualReward || { code: 'GN-SAMPLE', email: 'customer@example.com', percentage: 5, expiryDays: 60 };
  return rewardTemplate()
    .replaceAll('{{ discount_code }}', r.code || 'GN-SAMPLE')
    .replaceAll('{{ expiry_days }}', String(r.expiryDays || 60))
    .replaceAll('{{ percentage }}', String(r.percentage || 5))
    .replaceAll('{{ customer_email }}', r.email || 'customer@example.com');
}

function renderRewardEmailPreview() {
  const preview = $('reward-email-preview');
  if (preview) preview.textContent = fillRewardTemplate();
}

function setupEvents() {
  $('refresh-reviews')?.addEventListener('click', async () => { await loadReviews(); renderReviews(); loadStats(); });
  $('filter-stars')?.addEventListener('change', renderReviews);
  $('filter-status')?.addEventListener('change', renderReviews);
  $('save-settings')?.addEventListener('click', saveSettings);
  $('save-style')?.addEventListener('click', saveSettings);
  $('style-title')?.addEventListener('input', updatePreviews);
  $('style-primary')?.addEventListener('input', updatePreviews);
  $('style-star')?.addEventListener('input', updatePreviews);
  $('style-text')?.addEventListener('input', updatePreviews);
  $('save-reward-settings')?.addEventListener('click', saveRewardSettings);
  $('save-email-template')?.addEventListener('click', saveRewardSettings);
  $('create-manual-code')?.addEventListener('click', createManualRewardCode);
  $('refresh-codes')?.addEventListener('click', loadRewardCodes);
  $('reward-email-template-main')?.addEventListener('input', renderRewardEmailPreview);
  $('reward-email-template')?.addEventListener('input', renderRewardEmailPreview);

  document.querySelectorAll('[data-static-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state = { module: 'static', sub: button.dataset.staticView };
      showView(button.dataset.staticView);
      renderTopTabs();
      document.querySelectorAll('.nr-side-tab').forEach((el) => el.classList.remove('active'));
    });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === 'status') updateStatus(id, button.dataset.status);
    if (action === 'delete') deleteReview(id);
    if (action === 'recover') recoverReview(id);
    if (action === 'reward') issueReward(id);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  window.load();
});
