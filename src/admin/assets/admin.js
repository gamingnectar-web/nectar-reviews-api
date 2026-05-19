(() => {
  const boot = window.__NECTAR_BOOTSTRAP__ || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const params = new URLSearchParams(window.location.search);
  const state = {
    shopDomain: normaliseShop(boot.shopDomain || params.get('shop') || params.get('shopDomain') || sessionStorage.getItem('nectar.shopDomain') || ''),
    adminSession: boot.sessionToken || params.get('adminSession') || sessionStorage.getItem('nectar.adminSession') || '',
    reviews: [],
    trash: [],
    rules: [],
    settings: null,
    modules: []
  };

  function normaliseShop(value) {
    return String(value || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function log(value) {
    const output = $('diagnosticOutput');
    if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.adminSession) headers['X-Nectar-Admin-Session'] = state.adminSession;
    return headers;
  }

  function withShop(path) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}shopDomain=${encodeURIComponent(state.shopDomain)}`;
  }

  async function api(path, options = {}) {
    if (!state.shopDomain) throw new Error('Shop domain is required.');
    const res = await fetch(path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
      const message = data.error || data.message || `Request failed with ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  function setStatus() {
    if ($('shopDomain')) $('shopDomain').value = state.shopDomain;
    if ($('sideShop')) $('sideShop').textContent = state.shopDomain || 'No store selected';
    const dot = $('installDot');
    const text = $('installText');
    const sessionText = $('sessionText');
    if (state.adminSession) {
      dot?.classList.add('ok');
      text.textContent = `${state.shopDomain || 'Store'} connected`;
      sessionText.textContent = `Merchant session: ${boot.sessionSource || 'active'}${boot.installed ? ' · app installed' : ''}`;
    } else {
      dot?.classList.add('warn');
      text.textContent = state.shopDomain ? `${state.shopDomain} preview` : 'No store connected';
      sessionText.textContent = 'Open the app from Shopify Admin to make merchant changes.';
    }
    const warning = $('authWarning');
    if (!warning) return;
    if (boot.authWarning && !state.adminSession) {
      warning.innerHTML = `<div class="warning">${escapeHtml(boot.authWarning)}</div>`;
    } else if (state.adminSession) {
      warning.innerHTML = `<div class="okbox">App session active. Reviews, discounts, Nectar Drops and messaging are available by default for this installed store.</div>`;
    } else {
      warning.innerHTML = '';
    }
  }

  function bind(id, event, handler) {
    const el = $(id);
    if (!el) return;
    el.addEventListener(event, async (evt) => {
      try { await handler(evt); }
      catch (error) { showToast(error.message); log({ error: error.message }); }
    });
  }

  function showView(view) {
    $$('.section').forEach((section) => section.classList.remove('active'));
    $$('.nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    const target = $(`view-${view}`);
    if (target) target.classList.add('active');
  }

  function statusCount(statusCounts, status) {
    const entry = (statusCounts || []).find((item) => item._id === status);
    return entry?.count || 0;
  }

  async function loadDashboard() {
    const analytics = await api(withShop('/api/admin/reviews/analytics'));
    const reviewPayload = await api(withShop('/api/admin/reviews?includeDeleted=false&limit=250'));
    state.reviews = reviewPayload.reviews || [];
    const rewards = await api(withShop('/api/admin/discounts/review-rewards')).catch(() => ({ rewards: [] }));
    const loyalty = await api(withShop('/api/admin/loyalty/overview')).catch(() => ({}));

    $('statTotal').textContent = state.reviews.length;
    $('statLive').textContent = statusCount(analytics.statusCounts, 'accepted');
    $('statPending').textContent = statusCount(analytics.statusCounts, 'pending');
    $('statAverage').textContent = analytics.summary?.averageRating ?? '0.0';

    const top = analytics.topProduct || {};
    $('topProduct').innerHTML = top.id && top.id !== 'N/A'
      ? `<strong>${escapeHtml(top.title || `Product ID: ${top.id}`)}</strong><br><span class="stars">${'★'.repeat(Math.round(top.averageRating || 0))}${'☆'.repeat(5 - Math.round(top.averageRating || 0))}</span> ${escapeHtml(top.averageRating || 0)} (${escapeHtml(top.count || 0)} reviews)`
      : '<span class="muted">No reviews yet.</span>';

    const sources = analytics.sources || {};
    $('sourceStats').innerHTML = ['website', 'email', 'import', 'admin'].map((key) => `<div class="stat"><strong>${sources[key] || 0}</strong><br><span class="muted">${escapeHtml(key)}</span></div>`).join('');

    const rewardRows = rewards.rewards || [];
    const issued = rewardRows.length;
    const used = rewardRows.filter((r) => r.status === 'used').length;
    const active = rewardRows.filter((r) => r.status === 'issued').length;
    $('discountSummary').innerHTML = `<div class="stat"><strong>${issued}</strong><br><span class="muted">Issued</span></div><div class="stat"><strong>${used}</strong><br><span class="muted">Used</span></div><div class="stat"><strong>${active}</strong><br><span class="muted">Active</span></div>`;

    const counts = loyalty.counts || {};
    const points = loyalty.points || {};
    $('loyaltySummary').innerHTML = `<div class="stat"><strong>${counts.accounts || 0}</strong><br><span class="muted">Accounts</span></div><div class="stat"><strong>${points.pending || 0}</strong><br><span class="muted">Pending</span></div><div class="stat"><strong>${points.earned || 0}</strong><br><span class="muted">Approved</span></div>`;
  }

  function reviewCustomerLabel(review) {
    return review.customerRef || review.userId || (review.verifiedPurchase ? 'Verified customer' : 'Customer');
  }

  function renderReviewList() {
    const query = String($('reviewSearch')?.value || '').toLowerCase();
    const status = $('statusFilter')?.value || 'all';
    const star = $('starFilter')?.value || 'all';
    let rows = [...state.reviews];
    if (status !== 'all') rows = rows.filter((r) => r.status === status);
    if (star !== 'all') rows = rows.filter((r) => Number(r.rating) === Number(star));
    if (query) {
      rows = rows.filter((r) => [r.comment, r.headline, r.itemId, r.itemTitle, r.customerRef, r.userId].some((v) => String(v || '').toLowerCase().includes(query)));
    }

    $('reviewList').innerHTML = rows.length ? rows.map((r) => `
      <div class="review-card">
        <div class="review-head">
          <div><strong>${escapeHtml(reviewCustomerLabel(r))}</strong> ${r.verifiedPurchase ? '<span class="badge ok">✓ Verified</span>' : '<span class="badge warn">Unverified</span>'}<br><span class="muted small">Product ID: ${escapeHtml(r.itemId)} · ${new Date(r.createdAt).toLocaleDateString()}</span></div>
          <span class="badge ${r.status === 'accepted' ? 'ok' : r.status === 'rejected' || r.status === 'spam' ? 'red' : 'warn'}">${escapeHtml(r.status || 'pending')}</span>
        </div>
        <p class="stars">${'★'.repeat(Number(r.rating) || 0)}${'☆'.repeat(5 - (Number(r.rating) || 0))}</p>
        <h3>${escapeHtml(r.headline || 'No headline')}</h3>
        <p>${escapeHtml(r.comment || '')}</p>
        ${r.reply ? `<p><strong>Reply:</strong> ${escapeHtml(r.reply)}</p>` : ''}
        <div class="actions"><button class="green" data-status="accepted" data-id="${escapeHtml(r._id)}">Accept</button><button class="secondary" data-status="hold" data-id="${escapeHtml(r._id)}">Hold</button><button class="red" data-status="rejected" data-id="${escapeHtml(r._id)}">Reject</button><button class="secondary" data-reply="${escapeHtml(r._id)}">Reply</button><button class="red" data-delete="${escapeHtml(r._id)}">Trash</button></div>
        <div class="reply-box" id="reply-${escapeHtml(r._id)}"><textarea rows="3" placeholder="Reply to customer">${escapeHtml(r.reply || '')}</textarea><div class="actions"><button data-save-reply="${escapeHtml(r._id)}">Publish Reply</button></div></div>
      </div>`).join('') : '<p class="muted">No reviews match this filter.</p>';

    $$('[data-status]').forEach((button) => button.addEventListener('click', () => updateReviewStatus(button.dataset.id, button.dataset.status)));
    $$('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteReview(button.dataset.delete)));
    $$('[data-reply]').forEach((button) => button.addEventListener('click', () => {
      const box = $(`reply-${button.dataset.reply}`);
      if (box) box.style.display = box.style.display === 'block' ? 'none' : 'block';
    }));
    $$('[data-save-reply]').forEach((button) => button.addEventListener('click', () => saveReply(button.dataset.saveReply)));
  }

  async function loadReviews(includeDeleted = false) {
    const data = await api(withShop(`/api/admin/reviews?includeDeleted=${includeDeleted ? 'true' : 'false'}&limit=250`));
    const rows = data.reviews || [];
    if (includeDeleted) {
      state.trash = rows.filter((r) => r.isDeleted);
      $('trashList').innerHTML = state.trash.length ? state.trash.map((r) => `<div class="review-card"><strong>${escapeHtml(r.headline || 'No headline')}</strong><p>${escapeHtml(r.comment || '')}</p><span class="muted">Deleted · Product ${escapeHtml(r.itemId)}</span></div>`).join('') : '<p class="muted">Trash is empty.</p>';
    } else {
      state.reviews = rows;
      renderReviewList();
    }
  }

  async function updateReviewStatus(id, status) {
    await api(withShop(`/api/admin/reviews/${encodeURIComponent(id)}/status`), { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Status updated to ${status}`);
    await loadReviews(false);
    await loadDashboard().catch(() => {});
  }

  async function saveReply(id) {
    const box = $(`reply-${id}`);
    const reply = box?.querySelector('textarea')?.value || '';
    await api(withShop(`/api/admin/reviews/${encodeURIComponent(id)}/reply`), { method: 'PATCH', body: JSON.stringify({ reply }) });
    showToast('Reply published');
    await loadReviews(false);
  }

  async function deleteReview(id) {
    if (!confirm('Move this review to trash?')) return;
    await api(withShop(`/api/admin/reviews/${encodeURIComponent(id)}`), { method: 'DELETE' });
    showToast('Review moved to trash');
    await loadReviews(false);
  }

  function fillReviewSettings(settings) {
    state.settings = settings || {};
    $('setAutoEnable').checked = Boolean(settings.autoApproveEnabled);
    $('setAutoType').value = settings.autoApproveType || 'verified';
    $('setMinStars').value = String(settings.autoApproveMinStars || 4);
    $('setSeo').checked = settings.seo?.richSnippets !== false;
    $('styleTitle').value = settings.widgetStyles?.widgetTitle || 'Customer Reviews';
    $('stylePrimary').value = settings.widgetStyles?.primaryColor || '#000000';
    $('styleStar').value = settings.widgetStyles?.starColor || '#ffc700';
    $('styleText').value = settings.widgetStyles?.textSize || 15;
    $('cardStar').value = settings.cardStyles?.starSize || 14;
    $('cardCount').checked = settings.cardStyles?.showCount !== false;
    $('carLayout').value = settings.carouselStyles?.layout || 'infinite';
    $('carAutoplay').checked = settings.carouselStyles?.autoplay !== false;
    $('carDelay').value = settings.carouselStyles?.delay || 4000;
    $('carArrows').checked = Boolean(settings.carouselStyles?.showArrows);
    $('carLimit').value = settings.carouselStyles?.limit || 10;
    updatePreview();
  }

  function readReviewSettings() {
    return {
      autoApproveEnabled: $('setAutoEnable').checked,
      autoApproveType: $('setAutoType').value,
      autoApproveMinStars: Number($('setMinStars').value || 4),
      seo: { richSnippets: $('setSeo').checked },
      widgetStyles: { widgetTitle: $('styleTitle').value || 'Customer Reviews', primaryColor: $('stylePrimary').value || '#000000', starColor: $('styleStar').value || '#ffc700', textSize: Number($('styleText').value || 15) },
      cardStyles: { starSize: Number($('cardStar').value || 14), showCount: $('cardCount').checked },
      carouselStyles: { layout: $('carLayout').value || 'infinite', autoplay: $('carAutoplay').checked, delay: Number($('carDelay').value || 4000), showArrows: $('carArrows').checked, limit: Number($('carLimit').value || 10) }
    };
  }

  async function loadReviewSettings() {
    const data = await api(withShop('/api/admin/reviews/settings'));
    fillReviewSettings(data.settings || data);
  }

  async function saveReviewSettings() {
    const data = await api(withShop('/api/admin/reviews/settings'), { method: 'PUT', body: JSON.stringify({ settings: readReviewSettings() }) });
    fillReviewSettings(data.settings || data);
    showToast('Settings saved');
  }

  function updatePreview() {
    $('preTitle').textContent = $('styleTitle').value || 'Customer Reviews';
    $('preStars').style.color = $('styleStar').value || '#ffc700';
    $('preText').style.fontSize = `${Number($('styleText').value || 15)}px`;
    $('previewBox').style.borderColor = $('stylePrimary').value || '#000000';
  }

  function fillDiscount(settings) {
    const reward = settings.reviewReward || {};
    $('discountEnabled').checked = reward.enabled !== false;
    $('discountSendEmail').checked = reward.sendEmail !== false;
    $('discountType').value = reward.type || 'percentage';
    $('discountValue').value = reward.value ?? 5;
    $('discountPrefix').value = reward.prefix || 'THANKYOU';
    $('discountUsageLimit').value = reward.usageLimit || 1;
    $('discountExpiresAfterDays').value = reward.expiresAfterDays || 60;
    $('discountOncePerCustomer').checked = reward.oncePerCustomer !== false;
  }

  function readDiscount() {
    return { reviewReward: { enabled: $('discountEnabled').checked, sendEmail: $('discountSendEmail').checked, type: $('discountType').value, value: Number($('discountValue').value || 0), prefix: $('discountPrefix').value || 'THANKYOU', usageLimit: Number($('discountUsageLimit').value || 1), expiresAfterDays: Number($('discountExpiresAfterDays').value || 60), oncePerCustomer: $('discountOncePerCustomer').checked } };
  }

  async function loadDiscountSettings() {
    const data = await api(withShop('/api/admin/discounts/settings'));
    fillDiscount(data.settings || {});
  }

  async function saveDiscountSettings() {
    await api(withShop('/api/admin/discounts/settings'), { method: 'PUT', body: JSON.stringify({ settings: readDiscount() }) });
    showToast('Reward settings saved');
  }

  async function loadReviewRewards() {
    const data = await api(withShop('/api/admin/discounts/review-rewards'));
    const rewards = data.rewards || [];
    $('reviewRewardsTable').innerHTML = rewards.length ? `<table><thead><tr><th>Code</th><th>Customer</th><th>Value</th><th>Status</th><th>Expires</th></tr></thead><tbody>${rewards.map((r) => `<tr><td><strong>${escapeHtml(r.discountCodePreview || '-')}</strong></td><td>${escapeHtml(r.customerRef || '-')}</td><td>${r.discountType === 'fixed_amount' ? '£' : ''}${escapeHtml(r.discountValue)}${r.discountType === 'percentage' ? '%' : ''}</td><td>${escapeHtml(r.status || '')}</td><td>${r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '-'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No reward codes yet.</p>';
  }

  function fillLoyalty(settings) {
    $('loyaltyEnabled').checked = settings.enabled !== false;
    $('pointsName').value = settings.pointsName || 'Nectar Drops';
    $('pointsIcon').value = settings.pointsIcon || '🍯';
    $('loyaltyIconPreview').textContent = settings.pointsIcon || '🍯';
    $('landingSlug').value = settings.landingPage?.slug || 'nectar-drops';
    $('orderDelayMode').value = settings.approvalDefaults?.orderDelayMode || 'after_fulfillment';
    $('orderDelayDays').value = settings.approvalDefaults?.orderDelayDays ?? 14;
  }

  function readLoyaltySettings() {
    return {
      enabled: $('loyaltyEnabled').checked,
      pointsName: $('pointsName').value || 'Nectar Drops',
      pointsIcon: $('pointsIcon').value || '🍯',
      landingPage: { enabled: true, slug: $('landingSlug').value || 'nectar-drops', heroTitle: `Earn ${$('pointsName').value || 'Nectar Drops'} every time you shop`, heroText: 'Collect points from purchases and reviews, then redeem them for money off future orders.' },
      approvalDefaults: { orderDelayMode: $('orderDelayMode').value, orderDelayDays: Number($('orderDelayDays').value || 0), reviewDelayMode: 'immediate', reviewDelayDays: 0 },
      refundHandling: { cancelPendingPoints: true, reverseApprovedPoints: true, allowNegativeBalance: false },
      privacy: { storeRawCustomerData: false, showOnlyCustomerRefsInAdmin: true }
    };
  }

  function renderOverview(data) {
    fillLoyalty(data.settings || {});
    const counts = data.counts || {};
    const points = data.points || {};
    $('loyaltyOverview').innerHTML = `<div class="grid"><div class="stat"><strong>${counts.rules || 0}</strong><br><span class="muted">Rules</span></div><div class="stat"><strong>${counts.accounts || 0}</strong><br><span class="muted">Accounts</span></div><div class="stat"><strong>${points.pending || 0}</strong><br><span class="muted">Pending Drops</span></div><div class="stat"><strong>${points.earned || 0}</strong><br><span class="muted">Approved Earned Drops</span></div><div class="stat"><strong>${points.spent || 0}</strong><br><span class="muted">Spent Drops</span></div><div class="stat"><strong>${counts.redemptions || 0}</strong><br><span class="muted">Redemptions</span></div></div>`;
  }

  async function loadLoyaltyOverview() {
    const data = await api(withShop('/api/admin/loyalty/overview'));
    renderOverview(data);
  }

  async function saveLoyaltySettings() {
    const data = await api(withShop('/api/admin/loyalty/settings'), { method: 'PUT', body: JSON.stringify({ settings: readLoyaltySettings() }) });
    fillLoyalty(data.settings || {});
    showToast('Nectar Drops settings saved');
  }

  async function loadLoyaltyAccounts() {
    const data = await api(withShop('/api/admin/loyalty/accounts?limit=100'));
    const accounts = data.accounts || [];
    $('loyaltyAccounts').innerHTML = accounts.length ? `<table><thead><tr><th>Customer Ref</th><th>Approved</th><th>Pending</th><th>Earned</th><th>Spent</th><th>Status</th></tr></thead><tbody>${accounts.map((a) => `<tr><td>${escapeHtml(a.customerRef)}</td><td>${a.approvedPoints}</td><td>${a.pendingPoints}</td><td>${a.lifetimeEarned}</td><td>${a.lifetimeSpent}</td><td>${escapeHtml(a.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No loyalty accounts yet.</p>';
  }

  function sampleEarnRule() {
    return { ruleType: 'earn', trigger: 'order_paid', name: 'Spend over £50 bonus', description: 'Award bonus Drops when a customer spends over £50.', enabled: true, priority: 50, conditions: { minimumSpend: 50, useTotalPrice: false }, reward: { mode: 'fixed_points', points: 300 }, delay: { mode: 'after_fulfillment', days: 14 }, limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 300 } };
  }
  function sampleRedeemRule() {
    return { ruleType: 'redeem', trigger: 'customer_redeem', name: '£10 off voucher', description: 'Redeem 1,000 Drops for £10 off.', enabled: true, priority: 110, conditions: { minimumSpend: 50 }, reward: { discountType: 'fixed_amount', pointsCost: 1000, amount: 10, currency: 'GBP', codePrefix: 'DROPS', expiresAfterDays: 30 }, delay: { mode: 'immediate', days: 0 }, limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 0 } };
  }

  function renderRules(rules) {
    state.rules = rules || [];
    $('rulesTable').innerHTML = state.rules.length ? `<table><thead><tr><th>Name</th><th>Type</th><th>Trigger</th><th>Reward</th><th>Delay</th><th>Status</th><th></th></tr></thead><tbody>${state.rules.map((r) => `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted small">${escapeHtml(r.description || '')}</span></td><td>${escapeHtml(r.ruleType)}</td><td>${escapeHtml(r.trigger)}</td><td><code>${escapeHtml(JSON.stringify(r.reward || {}))}</code></td><td>${escapeHtml(r.delay?.mode || '')} ${escapeHtml(r.delay?.days || 0)}d</td><td>${r.enabled ? '<span class="badge ok">Active</span>' : '<span class="badge warn">Paused</span>'}</td><td><button class="secondary" data-edit-rule="${escapeHtml(r._id)}">Edit JSON</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No rules yet.</p>';
    $$('[data-edit-rule]').forEach((button) => button.addEventListener('click', () => {
      const rule = state.rules.find((entry) => String(entry._id) === String(button.dataset.editRule));
      if (rule) $('ruleEditor').value = JSON.stringify(rule, null, 2);
    }));
  }

  async function loadRules() {
    const data = await api(withShop('/api/admin/loyalty/rules'));
    renderRules(data.rules || []);
  }

  async function saveRuleFromEditor() {
    const rule = JSON.parse($('ruleEditor').value || '{}');
    await api(withShop('/api/admin/loyalty/rules'), { method: 'POST', body: JSON.stringify(rule) });
    showToast('Rule saved');
    await loadRules();
  }

  async function loadEmailSettings() {
    const data = await api(withShop('/api/admin/messaging/email-settings'));
    const s = data.settings || {};
    $('emailEnabled').checked = Boolean(s.enabled);
    $('emailProvider').value = s.provider || 'smtp';
    $('smtpHost').value = s.smtpHost || '';
    $('smtpPort').value = s.smtpPort || 587;
    $('secureMode').value = s.secureMode || 'starttls';
    $('smtpUser').value = s.smtpUser || '';
    $('fromName').value = s.fromName || '';
    $('fromEmail').value = s.fromEmail || '';
    $('replyToEmail').value = s.replyToEmail || '';
    $('emailStatus').textContent = s.lastTestStatus ? `Last test: ${s.lastTestStatus}${s.lastTestError ? ` · ${s.lastTestError}` : ''}` : (s.smtpPasswordSet ? 'Password saved.' : 'No saved password yet.');
  }

  function readEmailSettings() {
    return { enabled: $('emailEnabled').checked, provider: $('emailProvider').value, smtpHost: $('smtpHost').value, smtpPort: Number($('smtpPort').value || 587), secureMode: $('secureMode').value, smtpUser: $('smtpUser').value, smtpPass: $('smtpPass').value, fromName: $('fromName').value, fromEmail: $('fromEmail').value, replyToEmail: $('replyToEmail').value };
  }

  async function saveEmailSettings() {
    await api(withShop('/api/admin/messaging/email-settings'), { method: 'PUT', body: JSON.stringify({ settings: readEmailSettings() }) });
    $('smtpPass').value = '';
    showToast('Email settings saved');
    await loadEmailSettings();
  }

  async function testEmail() {
    const to = prompt('Send test email to:');
    if (!to) return;
    await api(withShop('/api/admin/messaging/test-email'), { method: 'POST', body: JSON.stringify({ to }) });
    showToast('Test email sent');
    await loadEmailSettings();
  }

  async function loadModules() {
    const data = await api(withShop('/api/admin/modules'));
    state.modules = data.availableModules || [];
    const enabled = new Set((data.shopModules?.enabledModules || []).concat(boot.defaultEnabledModules || []));
    $('moduleGrid').innerHTML = state.modules.map((m) => `<label class="stat"><input type="checkbox" data-module="${escapeHtml(m.key)}" ${enabled.has(m.key) ? 'checked' : ''} /> <strong>${escapeHtml(m.name)}</strong><br><span class="muted">${escapeHtml(m.description || '')}</span></label>`).join('');
  }

  async function saveModules() {
    const enabledModules = $$('[data-module]').filter((input) => input.checked).map((input) => input.dataset.module);
    await api(withShop('/api/admin/modules'), { method: 'PUT', body: JSON.stringify({ enabledModules }) });
    showToast('Default modules saved');
    await loadModules();
  }

  async function loadAudit() {
    const data = await api(withShop('/api/admin/audit?limit=50')).catch((error) => ({ error: error.message, events: [] }));
    const events = data.events || [];
    $('auditTable').innerHTML = events.length ? `<table><thead><tr><th>Date</th><th>Event</th><th>Module</th><th>Actor</th></tr></thead><tbody>${events.map((e) => `<tr><td>${new Date(e.createdAt).toLocaleString()}</td><td>${escapeHtml(e.eventType)}</td><td>${escapeHtml(e.module)}</td><td>${escapeHtml(e.actorType)}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${escapeHtml(data.error || 'No activity yet.')}</p>`;
  }

  async function initialise() {
    if (state.shopDomain) sessionStorage.setItem('nectar.shopDomain', state.shopDomain);
    if (state.adminSession) sessionStorage.setItem('nectar.adminSession', state.adminSession);
    setStatus();
    if (!state.shopDomain) return;
    await Promise.allSettled([loadReviewSettings(), loadDiscountSettings(), loadLoyaltyOverview(), loadEmailSettings(), loadModules()]);
    await Promise.allSettled([loadDashboard(), loadReviews(false), loadReviewRewards(), loadRules()]);
  }

  $$('.nav button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $$('[data-view-jump]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewJump)));
  $$('.tabs [data-discount-tab]').forEach((button) => button.addEventListener('click', () => {
    $$('.tabs [data-discount-tab]').forEach((b) => b.classList.remove('active'));
    $$('.discount-tab').forEach((tab) => tab.classList.remove('active'));
    button.classList.add('active');
    $(`discount-tab-${button.dataset.discountTab}`)?.classList.add('active');
  }));
  $('shopDomain')?.addEventListener('change', () => { state.shopDomain = normaliseShop($('shopDomain').value); sessionStorage.setItem('nectar.shopDomain', state.shopDomain); setStatus(); initialise(); });
  bind('reloadAll', 'click', initialise);
  bind('loadReviews', 'click', () => loadReviews(false));
  bind('loadTrash', 'click', () => loadReviews(true));
  bind('reviewSearch', 'input', renderReviewList);
  bind('starFilter', 'change', renderReviewList);
  bind('statusFilter', 'change', renderReviewList);
  bind('loadDiscountSettings', 'click', loadDiscountSettings);
  bind('saveDiscountSettings', 'click', saveDiscountSettings);
  bind('loadReviewRewards', 'click', loadReviewRewards);
  bind('loadLoyaltyOverview', 'click', loadLoyaltyOverview);
  bind('saveLoyaltySettings', 'click', saveLoyaltySettings);
  bind('processPending', 'click', async () => { const data = await api(withShop('/api/admin/loyalty/process-pending'), { method: 'POST', body: JSON.stringify({}) }); showToast('Eligible pending Drops processed'); log(data); await loadLoyaltyOverview(); });
  bind('loadLoyaltyAccounts', 'click', loadLoyaltyAccounts);
  bind('loadRules', 'click', loadRules);
  bind('createBaseEarnRule', 'click', () => { $('ruleEditor').value = JSON.stringify(sampleEarnRule(), null, 2); });
  bind('createRedeemRule', 'click', () => { $('ruleEditor').value = JSON.stringify(sampleRedeemRule(), null, 2); });
  bind('saveRuleFromEditor', 'click', saveRuleFromEditor);
  bind('saveReviewSettings', 'click', saveReviewSettings);
  bind('saveStyles', 'click', saveReviewSettings);
  bind('updatePreview', 'click', updatePreview);
  ['styleTitle', 'stylePrimary', 'styleStar', 'styleText'].forEach((id) => bind(id, 'input', updatePreview));
  bind('loadEmailSettings', 'click', loadEmailSettings);
  bind('saveEmailSettings', 'click', saveEmailSettings);
  bind('testEmail', 'click', testEmail);
  bind('loadModules', 'click', loadModules);
  bind('saveModules', 'click', saveModules);
  bind('loadAudit', 'click', loadAudit);
  bind('runDiagnostics', 'click', async () => {
    const checks = [];
    checks.push(await fetch('/health').then((r) => r.json()).catch((e) => ({ error: e.message })));
    checks.push({ shopDomain: state.shopDomain, hasSession: Boolean(state.adminSession), installed: Boolean(boot.installed), sessionSource: boot.sessionSource || 'none' });
    log(checks);
  });

  initialise().catch((error) => { showToast(error.message); log({ error: error.message }); });
})();
