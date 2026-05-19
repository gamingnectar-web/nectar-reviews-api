(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  $('shopDomain').value = params.get('shopDomain') || params.get('shop') || '';
  $('adminToken').value = sessionStorage.getItem('nectarAdminToken') || '';
  let availableModules = [];
  let enabledModules = [];
  let currentRules = [];

  function shop() { return $('shopDomain').value.trim(); }
  function adminToken() { return $('adminToken')?.value?.trim() || ''; }
  function log(value) { $('output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }

  $('adminToken')?.addEventListener('change', () => sessionStorage.setItem('nectarAdminToken', adminToken()));

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (path.startsWith('/api/admin')) headers['X-Nectar-Admin-Token'] = adminToken();
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }

  function withShop(path) {
    const joiner = path.includes('?') ? '&' : '?';
    return `${path}${joiner}shopDomain=${encodeURIComponent(shop())}`;
  }

  function bind(id, event, handler) {
    const el = $(id);
    if (!el) return;
    el.addEventListener(event, async (...args) => {
      try { await handler(...args); }
      catch (error) { log({ error: error.message }); }
    });
  }

  document.querySelectorAll('nav button[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('nav button[data-tab]').forEach((entry) => entry.classList.remove('active'));
      document.querySelectorAll('section.tab').forEach((entry) => entry.classList.remove('active'));
      button.classList.add('active');
      $(`tab-${button.dataset.tab}`).classList.add('active');
    });
  });

  function renderModules() {
    $('moduleGrid').innerHTML = availableModules.map((module) => `
      <label class="module">
        <input type="checkbox" value="${escapeHtml(module.key)}" ${enabledModules.includes(module.key) ? 'checked' : ''} />
        <span><strong>${escapeHtml(module.name)}</strong><br><span class="muted">${escapeHtml(module.description || module.key)}</span></span>
      </label>
    `).join('');
  }

  bind('loadModules', 'click', async () => {
    const data = await api(withShop('/api/admin/modules'));
    availableModules = data.availableModules || [];
    enabledModules = data.shopModules?.enabledModules || [];
    renderModules();
    log(data);
  });

  bind('saveModules', 'click', async () => {
    enabledModules = Array.from(document.querySelectorAll('#moduleGrid input:checked')).map((input) => input.value);
    const data = await api('/api/admin/modules', { method: 'PUT', body: JSON.stringify({ shopDomain: shop(), enabledModules }) });
    log(data);
  });

  bind('healthCheck', 'click', async () => log(await api('/health')));
  bind('loadReviews', 'click', async () => log(await api(withShop('/api/admin/reviews'))));
  bind('loadReviewAnalytics', 'click', async () => {
    const data = await api(withShop('/api/admin/reviews/analytics'));
    $('reviewCount').textContent = data.summary?.count ?? '-';
    $('averageRating').textContent = data.summary?.averageRating ?? '-';
    log(data);
  });

  function fillDiscount(settings) {
    const reward = settings.reviewReward || {};
    $('discountEnabled').checked = Boolean(reward.enabled);
    $('discountSendEmail').checked = reward.sendEmail !== false;
    $('discountType').value = reward.type || 'percentage';
    $('discountValue').value = reward.value ?? 10;
    $('discountPrefix').value = reward.prefix || 'THANKYOU';
    $('discountUsageLimit').value = reward.usageLimit || 1;
    $('discountExpiresAfterDays').value = reward.expiresAfterDays || 30;
    $('discountOncePerCustomer').checked = reward.oncePerCustomer !== false;
  }

  function readDiscount() {
    return { reviewReward: { enabled: $('discountEnabled').checked, sendEmail: $('discountSendEmail').checked, type: $('discountType').value, value: Number($('discountValue').value || 0), prefix: $('discountPrefix').value || 'THANKYOU', usageLimit: Number($('discountUsageLimit').value || 1), expiresAfterDays: Number($('discountExpiresAfterDays').value || 30), oncePerCustomer: $('discountOncePerCustomer').checked } };
  }

  bind('loadDiscountSettings', 'click', async () => { const data = await api(withShop('/api/admin/discounts/settings')); fillDiscount(data.settings || {}); log(data); });
  bind('saveDiscountSettings', 'click', async () => { const data = await api(withShop('/api/admin/discounts/settings'), { method: 'PUT', body: JSON.stringify({ settings: readDiscount() }) }); log(data); });
  bind('loadReviewRewards', 'click', async () => {
    const data = await api(withShop('/api/admin/discounts/review-rewards'));
    const rewards = data.rewards || [];
    $('reviewRewardsTable').innerHTML = rewards.length ? `<table><thead><tr><th>Code preview</th><th>Customer ref</th><th>Value</th><th>Status</th><th>Created</th></tr></thead><tbody>${rewards.map((reward) => `<tr><td><strong>${escapeHtml(reward.discountCodePreview || '-')}</strong></td><td>${escapeHtml(reward.customerRef || '-')}</td><td>${reward.discountType === 'fixed_amount' ? '£' : ''}${escapeHtml(reward.discountValue)}${reward.discountType === 'percentage' ? '%' : ''}</td><td>${escapeHtml(reward.status || '')}</td><td>${new Date(reward.createdAt).toLocaleString()}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No review rewards yet.</p>';
    log(data);
  });

  function fillLoyalty(settings) {
    $('loyaltyEnabled').checked = Boolean(settings.enabled);
    $('pointsName').value = settings.pointsName || 'Nectar Drops';
    $('pointsIcon').value = settings.pointsIcon || '🍯';
    $('loyaltyIconPreview').textContent = settings.pointsIcon || '🍯';
    $('landingSlug').value = settings.landingPage?.slug || 'nectar-drops';
    $('orderDelayMode').value = settings.approvalDefaults?.orderDelayMode || 'after_order_paid';
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
    $('loyaltyOverview').innerHTML = `<div class="three"><div class="stat"><strong>${counts.rules ?? 0}</strong><br><span class="muted">Rules</span></div><div class="stat"><strong>${counts.accounts ?? 0}</strong><br><span class="muted">Accounts</span></div><div class="stat"><strong>${points.pending ?? 0}</strong><br><span class="muted">Pending Drops</span></div><div class="stat"><strong>${points.earned ?? 0}</strong><br><span class="muted">Approved earned Drops</span></div><div class="stat"><strong>${points.spent ?? 0}</strong><br><span class="muted">Spent Drops</span></div><div class="stat"><strong>${counts.redemptions ?? 0}</strong><br><span class="muted">Redemptions</span></div></div>`;
  }

  bind('loadLoyaltyOverview', 'click', async () => { const data = await api(withShop('/api/admin/loyalty/overview')); renderOverview(data); log(data); });
  bind('saveLoyaltySettings', 'click', async () => { const data = await api(withShop('/api/admin/loyalty/settings'), { method: 'PUT', body: JSON.stringify({ settings: readLoyaltySettings() }) }); fillLoyalty(data.settings || {}); log(data); });
  bind('processPending', 'click', async () => { const data = await api(withShop('/api/admin/loyalty/process-pending'), { method: 'POST', body: JSON.stringify({}) }); log(data); });

  bind('loadLoyaltyAccounts', 'click', async () => {
    const data = await api(withShop('/api/admin/loyalty/accounts'));
    const accounts = data.accounts || [];
    $('loyaltyAccounts').innerHTML = accounts.length ? `<table><thead><tr><th>Customer ref</th><th>Approved</th><th>Pending</th><th>Earned</th><th>Spent</th><th>Status</th></tr></thead><tbody>${accounts.map((a) => `<tr><td>${escapeHtml(a.customerRef)}</td><td>${a.approvedPoints}</td><td>${a.pendingPoints}</td><td>${a.lifetimeEarned}</td><td>${a.lifetimeSpent}</td><td>${escapeHtml(a.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No loyalty accounts yet.</p>';
    log(data);
  });

  function sampleEarnRule() {
    return { ruleType: 'earn', trigger: 'order_paid', name: 'Spend over £50 bonus', description: 'Award bonus Drops when a customer spends over £50.', enabled: true, priority: 50, conditions: { minimumSpend: 50, useTotalPrice: false }, reward: { mode: 'fixed_points', points: 300 }, delay: { mode: 'after_order_paid', days: 14 }, limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 300 } };
  }
  function sampleRedeemRule() {
    return { ruleType: 'redeem', trigger: 'customer_redeem', name: '£10 off voucher', description: 'Redeem 1,000 Drops for £10 off.', enabled: true, priority: 110, conditions: { minimumSpend: 50 }, reward: { discountType: 'fixed_amount', pointsCost: 1000, amount: 10, currency: 'GBP', codePrefix: 'DROPS', expiresAfterDays: 30 }, delay: { mode: 'immediate', days: 0 }, limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 0 } };
  }
  function renderRules(rules) {
    currentRules = rules || [];
    $('rulesTable').innerHTML = currentRules.length ? `<table><thead><tr><th>Name</th><th>Type</th><th>Trigger</th><th>Reward</th><th>Delay</th><th>Status</th><th>Action</th></tr></thead><tbody>${currentRules.map((r) => `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.description || '')}</span></td><td>${escapeHtml(r.ruleType)}</td><td>${escapeHtml(r.trigger)}</td><td><code>${escapeHtml(JSON.stringify(r.reward || {}))}</code></td><td>${escapeHtml(r.delay?.mode || '')} ${escapeHtml(r.delay?.days || 0)}d</td><td>${r.enabled ? 'Active' : 'Paused'}</td><td><button class="secondary" data-edit-rule="${escapeHtml(r._id)}">Edit JSON</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No rules yet.</p>';
    document.querySelectorAll('[data-edit-rule]').forEach((button) => button.addEventListener('click', () => {
      const rule = currentRules.find((entry) => String(entry._id) === String(button.dataset.editRule));
      if (rule) $('ruleEditor').value = JSON.stringify(rule, null, 2);
    }));
  }
  bind('loadRules', 'click', async () => { const data = await api(withShop('/api/admin/loyalty/rules')); renderRules(data.rules || []); log(data); });
  bind('createBaseEarnRule', 'click', async () => { $('ruleEditor').value = JSON.stringify(sampleEarnRule(), null, 2); });
  bind('createRedeemRule', 'click', async () => { $('ruleEditor').value = JSON.stringify(sampleRedeemRule(), null, 2); });
  bind('saveRuleFromEditor', 'click', async () => {
    const rule = JSON.parse($('ruleEditor').value || '{}');
    const data = await api(withShop('/api/admin/loyalty/rules'), { method: 'POST', body: JSON.stringify(rule) });
    log(data);
    const loaded = await api(withShop('/api/admin/loyalty/rules'));
    renderRules(loaded.rules || []);
  });

  bind('loadAudit', 'click', async () => {
    const qs = new URLSearchParams({ shopDomain: shop(), limit: $('auditLimit').value || '100' });
    if ($('auditModule').value) qs.set('module', $('auditModule').value);
    if ($('auditEventType').value) qs.set('eventType', $('auditEventType').value);
    const data = await api(`/api/admin/audit?${qs.toString()}`);
    const events = data.events || [];
    $('auditTable').innerHTML = events.length ? `<table><thead><tr><th>Date</th><th>Event</th><th>Actor</th><th>Entity</th><th>Metadata</th></tr></thead><tbody>${events.map((e) => `<tr><td>${new Date(e.createdAt).toLocaleString()}</td><td><strong>${escapeHtml(e.eventType)}</strong><br><span class="muted">${escapeHtml(e.module)} / ${escapeHtml(e.action)}</span></td><td>${escapeHtml(e.actorType)}<br><span class="muted">${escapeHtml(e.actorKey || '-')}</span></td><td>${escapeHtml(e.entityType)}<br><span class="muted">${escapeHtml(e.entityKey || '-')}</span></td><td><code>${escapeHtml(JSON.stringify(e.metadata || {}))}</code></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No activity yet.</p>';
    log(data);
  });
})();
