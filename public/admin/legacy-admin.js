(function () {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const params = new URLSearchParams(window.location.search);
  const shop = cleanShop(params.get('shop') || params.get('shopDomain') || localStorage.getItem('nectar_shop') || 'gaming-nectar-development-store.myshopify.com');
  localStorage.setItem('nectar_shop', shop);

  const state = {
    shop,
    reviews: [],
    modules: [],
    stagedImport: [],
    campaigns: JSON.parse(localStorage.getItem('nectar_campaigns') || '[]'),
    sliderRules: JSON.parse(localStorage.getItem('nectar_slider_rules') || '[]'),
    calendarDate: new Date()
  };

  function cleanShop(value) {
    return String(value || '')
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/[^a-zA-Z0-9.-]/g, '') || 'gaming-nectar-development-store.myshopify.com';
  }

  function withShop(path) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}shop=${encodeURIComponent(state.shop)}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(withShop(path), {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
    if (!response.ok) {
      const message = data.error || data.message || `Request failed: ${response.status}`;
      const error = new Error(message);
      error.data = data;
      throw error;
    }
    return data;
  }

  function toast(message, type = 'info') {
    const el = qs('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.classList.remove('show'), 3200);
  }

  function stars(rating) {
    const number = Math.max(0, Math.min(5, Number(rating || 0)));
    return '★★★★★'.slice(0, Math.round(number)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(number));
  }

  function setText(id, value) {
    const el = qs(id);
    if (el) el.textContent = value;
  }

  function initNavigation() {
    qsa('[data-section]').forEach((button) => {
      button.addEventListener('click', () => showSection(button.dataset.section));
    });
    qsa('[data-section-jump]').forEach((button) => {
      button.addEventListener('click', () => showSection(button.dataset.sectionJump));
    });
  }

  function showSection(key) {
    qsa('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.section === key));
    qsa('.panel-section').forEach((section) => section.classList.remove('active'));
    const section = qs(`#section-${CSS.escape(key)}`);
    if (section) {
      section.classList.add('active');
      setText('#sectionTitle', section.dataset.title || key);
      setText('#sectionEyebrow', section.dataset.eyebrow || 'Nectar API');
      history.replaceState(null, '', `?shop=${encodeURIComponent(state.shop)}&section=${encodeURIComponent(key)}`);
    }
  }

  function initTabs() {
    qsa('[data-review-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        qsa('[data-review-tab]').forEach((b) => b.classList.remove('active'));
        qsa('.review-tab').forEach((tab) => tab.classList.remove('active'));
        button.classList.add('active');
        const pane = qs(`#review-tab-${button.dataset.reviewTab}`);
        if (pane) pane.classList.add('active');
      });
    });
    qsa('[data-visual-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        qsa('[data-visual-tab]').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
        renderStylePreview();
      });
    });
    qsa('[data-loyalty-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        qsa('[data-loyalty-tab]').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
      });
    });
  }

  async function loadReviews() {
    try {
      const data = await api('/api/reviews/admin/all?limit=250');
      state.reviews = data.reviews || [];
    } catch (error) {
      console.warn(error);
      state.reviews = JSON.parse(localStorage.getItem('nectar_demo_reviews') || '[]');
      if (!state.reviews.length) state.reviews = seedReviews();
      toast(`Review API note: ${error.message}. Showing local view.`, 'warning');
    }
    renderReviews();
    renderDashboard();
  }

  function seedReviews() {
    const rows = [
      { id: 'demo-1', itemId: 'gid://shopify/Product/123', rating: 5, title: 'Great product', body: 'Really clean experience and exactly what I expected.', authorName: 'Customer', status: 'pending', verifiedPurchase: false, source: 'manual-admin', createdAt: new Date().toISOString() },
      { id: 'demo-2', itemId: 'gid://shopify/Product/456', rating: 4, title: 'Would recommend', body: 'Good quality and easy to use.', authorName: 'Customer', status: 'approved', verifiedPurchase: true, source: 'merchant-import', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }
    ];
    localStorage.setItem('nectar_demo_reviews', JSON.stringify(rows));
    return rows;
  }

  function filteredReviews() {
    const rating = qs('#ratingFilter')?.value;
    const status = qs('#statusFilter')?.value;
    const query = String(qs('#reviewSearch')?.value || '').toLowerCase().trim();
    return state.reviews.filter((review) => {
      if (rating && Number(review.rating) !== Number(rating)) return false;
      if (status && review.status !== status) return false;
      if (query) {
        const haystack = [review.title, review.body, review.authorName, review.itemId, review.source, review.status].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function renderReviews() {
    const list = qs('#reviewList');
    if (!list) return;
    const reviews = filteredReviews();
    list.innerHTML = reviews.length ? reviews.map(renderReviewItem).join('') : '<div class="card">No reviews match these filters.</div>';

    const trash = state.reviews.filter((review) => ['rejected', 'spam', 'test'].includes(review.status));
    setText('#trashCount', trash.length);
    setText('#trashOldest', trash.length ? new Date(Math.min(...trash.map((r) => new Date(r.updatedAt || r.createdAt || Date.now()).getTime()))).toLocaleDateString() : '—');
    const trashList = qs('#trashList');
    if (trashList) trashList.innerHTML = trash.length ? trash.map(renderReviewItem).join('') : 'No trashed reviews.';
  }

  function renderReviewItem(review) {
    const id = String(review._id || review.id || '');
    const safeTitle = escapeHtml(review.title || 'Untitled review');
    const body = escapeHtml(review.body || review.review || '');
    const meta = `${stars(review.rating)} · ${escapeHtml(review.authorName || review.name || 'Customer')} · ${escapeHtml(review.status || 'pending')} · ${review.verifiedPurchase ? 'Verified' : 'Unverified'} · ${escapeHtml(review.source || 'storefront')}`;
    return `
      <article class="review-item" data-review-id="${escapeHtml(id)}">
        <div class="review-item-header">
          <div>
            <div class="review-item-title">${safeTitle}</div>
            <div class="review-meta"><span class="rating">${meta}</span><span>${escapeHtml(review.itemId || '')}</span></div>
          </div>
          <div class="review-actions">
            <button class="ghost small" data-review-action="verify" data-id="${escapeHtml(id)}">Verify</button>
            <button class="primary small" data-review-action="approved" data-id="${escapeHtml(id)}">Approve</button>
            <button class="ghost small" data-review-action="pending" data-id="${escapeHtml(id)}">Hold</button>
            <button class="danger small" data-review-action="rejected" data-id="${escapeHtml(id)}">Reject</button>
          </div>
        </div>
        ${body ? `<p>${body}</p>` : ''}
      </article>`;
  }

  async function updateReviewStatus(id, status, extra = {}) {
    if (!id || id.startsWith('demo-')) {
      state.reviews = state.reviews.map((review) => String(review.id || review._id) === id ? { ...review, status, ...extra, updatedAt: new Date().toISOString() } : review);
      localStorage.setItem('nectar_demo_reviews', JSON.stringify(state.reviews));
      renderReviews();
      renderDashboard();
      toast('Updated local review view.');
      return;
    }
    try {
      const patch = status === 'verify'
        ? { verifiedPurchase: true, verificationSource: 'manual-admin', verificationNote: 'Verified manually by merchant.' }
        : { status };
      await api(`/api/reviews/admin/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, ...extra }) });
      toast('Review updated.');
      await loadReviews();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderDashboard() {
    const total = state.reviews.length;
    const approved = state.reviews.filter((review) => review.status === 'approved').length;
    const pending = state.reviews.filter((review) => review.status === 'pending').length;
    const approvedReviews = state.reviews.filter((review) => review.status === 'approved');
    const average = approvedReviews.length
      ? approvedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / approvedReviews.length
      : 0;
    setText('#metricTotal', total);
    setText('#metricApproved', approved);
    setText('#metricPending', pending);
    setText('#metricAverage', average.toFixed(1));
    renderBars();
    renderStatusSplit();
    renderLeaderboard();
  }

  function renderBars() {
    const el = qs('#reviewBars');
    if (!el) return;
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleString(undefined, { month: 'short' }), count: 0 };
    });
    state.reviews.forEach((review) => {
      const date = new Date(review.createdAt || Date.now());
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = months.find((month) => month.key === key);
      if (bucket) bucket.count += 1;
    });
    const max = Math.max(1, ...months.map((month) => month.count));
    el.innerHTML = months.map((month) => `<div class="chart-bar" style="height:${Math.max(8, (month.count / max) * 100)}%"><span>${month.label}</span></div>`).join('');
  }

  function renderStatusSplit() {
    const el = qs('#statusSplit');
    if (!el) return;
    const statuses = ['pending', 'approved', 'rejected', 'spam', 'test'];
    const total = Math.max(1, state.reviews.length);
    el.innerHTML = statuses.map((status) => {
      const count = state.reviews.filter((review) => review.status === status).length;
      return `<div class="status-row"><span>${status}</span><div class="status-track"><div class="status-fill" style="width:${(count / total) * 100}%"></div></div><span>${count}</span></div>`;
    }).join('');
  }

  function renderLeaderboard() {
    const el = qs('#productLeaderboard');
    if (!el) return;
    const map = new Map();
    state.reviews.forEach((review) => {
      const key = review.itemId || 'Unknown product';
      const row = map.get(key) || { itemId: key, count: 0, rating: 0 };
      row.count += 1;
      row.rating += Number(review.rating || 0);
      map.set(key, row);
    });
    const rows = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 8);
    el.innerHTML = rows.length ? rows.map((row) => `<div class="table-row"><span><strong>${escapeHtml(row.itemId)}</strong><br><small>${row.count} reviews · ${(row.rating / row.count).toFixed(1)} avg</small></span><button class="ghost small" data-product-filter="${escapeHtml(row.itemId)}">View</button></div>`).join('') : 'No product data yet.';
  }

  async function submitReview() {
    const itemId = prompt('Product / item ID');
    if (!itemId) return;
    const body = prompt('Review text');
    if (!body) return;
    const rating = Number(prompt('Rating 1-5', '5') || 5);
    try {
      await api('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ itemId, rating, body, title: 'Manual admin review', authorName: 'Customer', testMode: true })
      });
      toast('Test review created.');
      await loadReviews();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function generateToken() {
    const payload = {
      itemId: qs('#tokenItemId')?.value,
      orderId: qs('#tokenOrderId')?.value,
      customerEmail: qs('#tokenEmail')?.value
    };
    try {
      const data = await api('/api/reviews/tokens', { method: 'POST', body: JSON.stringify(payload) });
      qs('#tokenOutput').textContent = JSON.stringify(data, null, 2);
      toast('One-use review token generated.');
    } catch (error) {
      qs('#tokenOutput').textContent = error.message;
      toast(error.message, 'error');
    }
  }

  async function loadModules() {
    try {
      const data = await api('/api/core/settings/modules');
      state.modules = data.modules || [];
    } catch (error) {
      state.modules = [
        { key: 'reviews', name: 'Reviews', description: 'Reviews, moderation, imports and widgets.', enabled: true },
        { key: 'loyalty', name: 'Loyalty', description: 'Points, ledgers and rewards.', enabled: false },
        { key: 'discounts', name: 'Discounts', description: 'Discount rules and reward codes.', enabled: false },
        { key: 'cart-rewards', name: 'Cart Rewards', description: 'Cart milestones and gift campaigns.', enabled: false },
        { key: 'campaigns', name: 'Campaigns', description: 'Campaign calendar and planning.', enabled: false },
        { key: 'help', name: 'Help Centre', description: 'Setup guides and support drawer.', enabled: true }
      ];
    }
    renderModules();
  }

  function renderModules() {
    const el = qs('#moduleList');
    if (!el) return;
    el.innerHTML = state.modules.map((module) => `
      <label class="module-row">
        <input type="checkbox" data-module-key="${escapeHtml(module.key)}" ${module.enabled ? 'checked' : ''} />
        <span><strong>${escapeHtml(module.name)}</strong><br><small>${escapeHtml(module.description || '')}</small></span>
        <span class="pill">${module.enabled ? 'ON' : 'OFF'}</span>
      </label>
    `).join('');
  }

  async function saveModules() {
    const modules = {};
    qsa('[data-module-key]').forEach((input) => { modules[input.dataset.moduleKey] = input.checked; });
    try {
      await api('/api/core/settings/modules', { method: 'PATCH', body: JSON.stringify({ modules }) });
      toast('Module settings saved.');
      await loadModules();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderEmailPreview() {
    const subject = qs('#emailSubject')?.value || 'How did we do?';
    const heading = qs('#emailHeading')?.value || 'Review your recent order';
    const body = qs('#emailBody')?.value || '';
    const accent = qs('#emailAccent')?.value || '#f5b301';
    const radius = Number(qs('#emailRadius')?.value || 14);
    const border = Number(qs('#emailBorder')?.value || 1);
    const el = qs('#emailPreview');
    if (!el) return;
    el.innerHTML = `
      <div class="email-box" style="border:${border}px solid ${accent}; border-radius:${radius + 8}px">
        <small style="color:#64748b;font-weight:900">${escapeHtml(subject)}</small>
        <h2>${escapeHtml(heading)}</h2>
        <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
        <a class="email-button" style="background:${accent}; border-radius:${radius}px" href="#">Leave a review</a>
      </div>
    `;
  }

  function renderCalendar() {
    const date = state.calendarDate;
    const label = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    setText('#calendarLabel', label);
    const el = qs('#campaignCalendar');
    if (!el) return;
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days = Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
    el.innerHTML = days.map((day) => {
      const iso = day.toISOString().slice(0, 10);
      const events = state.campaigns.filter((campaign) => campaign.date === iso);
      return `<div class="calendar-day"><strong>${day.getDate()}</strong>${events.map((event) => `<div class="calendar-event">${escapeHtml(event.name)}</div>`).join('')}</div>`;
    }).join('');
  }

  function addCampaign() {
    const name = prompt('Campaign name');
    if (!name) return;
    const date = prompt('Campaign date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!date) return;
    state.campaigns.push({ name, date, type: 'review' });
    localStorage.setItem('nectar_campaigns', JSON.stringify(state.campaigns));
    renderCalendar();
    toast('Campaign added to calendar.');
  }

  async function parseCsv() {
    const input = qs('#csvFile');
    const file = input?.files?.[0];
    if (!file) return toast('Choose a CSV first.', 'warning');
    const text = await file.text();
    const rows = csvToObjects(text);
    state.stagedImport = rows.map((row) => ({
      itemId: row.itemId || row.productId || row.product_id || row['Product ID'] || '',
      title: row.title || row.Title || 'Imported review',
      body: row.body || row.review || row.Review || row.content || '',
      rating: Number(row.rating || row.Rating || 5),
      authorName: row.name || row.author || row.Customer || 'Imported Customer',
      verifiedPurchase: true,
      status: 'approved'
    }));
    renderImportPreview();
  }

  function csvToObjects(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines.shift()).map((header) => header.trim());
    return lines.map((line) => {
      const values = splitCsvLine(line);
      return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] || '' }), {});
    });
  }

  function splitCsvLine(line) {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') { current += '"'; i += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === ',' && !quoted) { out.push(current); current = ''; continue; }
      current += char;
    }
    out.push(current);
    return out;
  }

  function renderImportPreview() {
    const el = qs('#importPreview');
    if (!el) return;
    el.innerHTML = state.stagedImport.length
      ? state.stagedImport.slice(0, 50).map((row, index) => `<div class="table-row"><span><strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.itemId || 'Needs product mapping')} · ${row.rating}★ · ${escapeHtml(row.authorName)}</small></span><button class="ghost small" data-map-row="${index}">Map</button></div>`).join('')
      : 'No CSV staged yet.';
  }

  async function publishImport() {
    if (!state.stagedImport.length) return toast('No staged reviews to import.', 'warning');
    const importable = state.stagedImport.filter((row) => row.itemId && row.body);
    try {
      const result = await api('/api/reviews/bulk', { method: 'POST', body: JSON.stringify({ reviews: importable }) });
      toast(`Import finished: ${(result.results || []).filter((r) => r.ok).length} added.`);
      state.stagedImport = [];
      renderImportPreview();
      await loadReviews();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function searchProducts() {
    const q = qs('#productSearch')?.value || '';
    const el = qs('#productResults');
    if (!el) return;
    el.textContent = 'Searching Shopify…';
    try {
      const data = await api(`/api/shopify/products?q=${encodeURIComponent(q)}&first=12`);
      const products = data.products || [];
      el.innerHTML = products.length ? products.map((product) => `<div class="table-row"><span><strong>${escapeHtml(product.title)}</strong><br><small>${escapeHtml(product.id)}</small></span><button class="ghost small" data-product-id="${escapeHtml(product.id)}">Use</button></div>`).join('') : 'No products found.';
    } catch (error) {
      el.innerHTML = `<div class="table-row"><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function addSliderRule() {
    const rule = {
      type: qs('#conditionType')?.value || 'Product Tag',
      condition: qs('#conditionValue')?.value || '',
      label: qs('#sliderLabel')?.value || ''
    };
    if (!rule.condition || !rule.label) return toast('Add a condition and slider label.', 'warning');
    state.sliderRules.push(rule);
    localStorage.setItem('nectar_slider_rules', JSON.stringify(state.sliderRules));
    renderSliderRules();
    toast('Slider rule added.');
  }

  function renderSliderRules() {
    const el = qs('#sliderRules');
    if (!el) return;
    el.innerHTML = state.sliderRules.length ? state.sliderRules.map((rule) => `<span class="chip">${escapeHtml(rule.type)}: ${escapeHtml(rule.condition)} → ${escapeHtml(rule.label)}</span>`).join('') : '<span class="chip">No rules yet</span>';
  }

  function renderStylePreview() {
    const brand = qs('#brandColor')?.value || '#0f172a';
    const star = qs('#starColor')?.value || '#f5b301';
    const textSize = Number(qs('#textSize')?.value || 15);
    const width = Number(qs('#widgetWidth')?.value || 860);
    const radius = Number(qs('#badgeRadius')?.value || 18);
    const showCount = qs('#showCount')?.checked;
    const el = qs('#stylePreview');
    if (!el) return;
    el.style.maxWidth = `${width}px`;
    el.innerHTML = `
      <div class="sample-review" style="font-size:${textSize}px; border-radius:${radius + 4}px">
        <div style="color:${star}; font-weight:900; font-size:${textSize + 4}px">★★★★★ ${showCount ? '<span style="color:#64748b;font-size:13px">(12)</span>' : ''}</div>
        <h3 style="color:${brand}; margin-top:10px">Amazing Quality</h3>
        <p>This is how the storefront review widget styling will feel.</p>
        <span style="display:inline-block; background:${brand}; color:white; padding:8px 12px; border-radius:${radius}px">Verified Customer</span>
      </div>`;
  }

  async function loadDiscounts() {
    const el = qs('#discountRules');
    if (!el) return;
    try {
      const data = await api('/api/discounts/rules');
      const rules = data.rules || [];
      el.innerHTML = rules.length ? rules.map((rule) => `<div class="table-row"><span><strong>${escapeHtml(rule.name || rule.title || 'Discount rule')}</strong><br><small>${escapeHtml(rule.type || 'review reward')}</small></span><span>${escapeHtml(String(rule.value || ''))}</span></div>`).join('') : 'No discount rules yet.';
    } catch (error) {
      el.innerHTML = `Discount module is currently off or unavailable. Enable it in Module Access.`;
    }
  }

  async function saveDiscountRule() {
    try {
      const payload = { name: qs('#discountName')?.value, type: 'percentage', value: Number(qs('#discountPercent')?.value || 10), trigger: qs('#discountTrigger')?.value, minimumStars: qs('#discountStars')?.value };
      await api('/api/discounts/rules', { method: 'POST', body: JSON.stringify(payload) });
      toast('Discount rule saved.');
      await loadDiscounts();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function loadLoyalty() {
    try {
      const summary = await api('/api/loyalty/summary');
      setText('#loyaltyCustomers', summary.customers || summary.customerCount || 0);
      setText('#loyaltyAvailable', summary.available || summary.availablePoints || 0);
      setText('#loyaltyPending', summary.pending || summary.pendingPoints || 0);
      const ledger = await api('/api/loyalty/ledger');
      renderLedger(ledger.ledger || []);
    } catch (error) {
      renderLedger([]);
    }
  }

  function renderLedger(rows) {
    const el = qs('#loyaltyLedger');
    if (!el) return;
    el.innerHTML = rows.length ? rows.map((row) => `<div class="table-row"><span><strong>${escapeHtml(row.reason || 'Loyalty event')}</strong><br><small>${escapeHtml(row.customerRefHash || row.customerReference || '')}</small></span><span>${escapeHtml(String(row.points || 0))}</span></div>`).join('') : 'No loyalty ledger rows yet.';
  }

  async function saveLoyaltyAdjustment() {
    try {
      await api('/api/loyalty/ledger', {
        method: 'POST',
        body: JSON.stringify({ customerRef: qs('#loyaltyCustomerRef')?.value, points: Number(qs('#loyaltyPoints')?.value || 0), status: qs('#loyaltyStatus')?.value, reason: qs('#loyaltyReason')?.value })
      });
      toast('Loyalty adjustment saved.');
      await loadLoyalty();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function loadCartRewards() {
    const el = qs('#cartRewardsList');
    if (!el) return;
    try {
      const data = await api('/api/cart-rewards/campaigns');
      const rows = data.campaigns || [];
      el.innerHTML = rows.length ? rows.map((row) => `<div class="table-row"><span><strong>${escapeHtml(row.name || 'Cart campaign')}</strong><br><small>${escapeHtml(row.status || 'draft')}</small></span><span>${escapeHtml(String(row.threshold || ''))}</span></div>`).join('') : 'No cart reward campaigns yet.';
    } catch (error) {
      el.innerHTML = 'Cart rewards module is currently off or unavailable. Enable it in Module Access.';
    }
  }

  async function saveCartReward() {
    try {
      const payload = { name: qs('#cartCampaignName')?.value, threshold: Number(qs('#cartThreshold')?.value || 0), rewardType: qs('#cartRewardType')?.value, startsAt: qs('#cartStart')?.value, status: 'draft' };
      await api('/api/cart-rewards/campaigns', { method: 'POST', body: JSON.stringify(payload) });
      toast('Cart reward campaign saved.');
      await loadCartRewards();
    } catch (error) { toast(error.message, 'error'); }
  }

  function bindEvents() {
    qs('#refreshBtn')?.addEventListener('click', refreshAll);
    qs('#generateToken')?.addEventListener('click', generateToken);
    qs('#saveModules')?.addEventListener('click', saveModules);
    qs('#clearReviewFilters')?.addEventListener('click', () => { qs('#ratingFilter').value = ''; qs('#statusFilter').value = ''; qs('#reviewSearch').value = ''; renderReviews(); });
    ['#ratingFilter', '#statusFilter', '#reviewSearch'].forEach((selector) => qs(selector)?.addEventListener('input', renderReviews));
    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-review-action]');
      if (action) updateReviewStatus(action.dataset.id, action.dataset.reviewAction);
      const filter = event.target.closest('[data-product-filter]');
      if (filter) { showSection('reviews'); qs('#reviewSearch').value = filter.dataset.productFilter; renderReviews(); }
    });
    qsa('#emailSubject, #emailHeading, #emailBody, #emailAccent, #emailRadius, #emailBorder').forEach((input) => input.addEventListener('input', renderEmailPreview));
    qsa('[data-token]').forEach((button) => button.addEventListener('click', () => { const body = qs('#emailBody'); body.value += ` ${button.dataset.token}`; renderEmailPreview(); }));
    qs('#saveEmailTemplate')?.addEventListener('click', () => { localStorage.setItem('nectar_email_template', JSON.stringify({ subject: qs('#emailSubject').value, heading: qs('#emailHeading').value, body: qs('#emailBody').value })); toast('Email template saved locally.'); });
    qs('#addCampaign')?.addEventListener('click', addCampaign);
    qs('#prevMonth')?.addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
    qs('#nextMonth')?.addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });
    qs('#parseCsv')?.addEventListener('click', parseCsv);
    qs('#publishImport')?.addEventListener('click', publishImport);
    qs('#searchProducts')?.addEventListener('click', searchProducts);
    qs('#createSliderRule')?.addEventListener('click', addSliderRule);
    qsa('#brandColor, #starColor, #textSize, #widgetWidth, #badgeRadius, #showCount').forEach((input) => input.addEventListener('input', renderStylePreview));
    qs('#publishStyles')?.addEventListener('click', () => toast('Styles saved locally. Connect this to theme publish when ready.'));
    qs('#saveRules')?.addEventListener('click', () => toast('Approval rules saved locally.'));
    qs('#saveTrashSettings')?.addEventListener('click', () => { setText('#trashRetentionLabel', `${qs('#trashRetention').value} days`); toast('Trash settings saved locally.'); });
    qs('#restoreAllVisible')?.addEventListener('click', () => bulkVisibleTrash('pending'));
    qs('#deleteAllVisible')?.addEventListener('click', () => bulkVisibleTrash('spam'));
    qs('#saveDiscountRule')?.addEventListener('click', saveDiscountRule);
    qs('#saveLoyaltyAdjustment')?.addEventListener('click', saveLoyaltyAdjustment);
    qs('#saveCartReward')?.addEventListener('click', saveCartReward);
  }

  async function bulkVisibleTrash(status) {
    const ids = state.reviews.filter((review) => ['rejected', 'spam', 'test'].includes(review.status)).map((review) => String(review._id || review.id || ''));
    for (const id of ids) await updateReviewStatus(id, status);
  }

  async function refreshAll() {
    setText('#shopLabel', 'Connected');
    setText('#shopSubLabel', state.shop);
    await Promise.allSettled([loadModules(), loadReviews(), loadDiscounts(), loadLoyalty(), loadCartRewards()]);
    renderEmailPreview();
    renderCalendar();
    renderSliderRules();
    renderStylePreview();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function init() {
    initNavigation();
    initTabs();
    bindEvents();
    const initialSection = params.get('section') || 'dashboard';
    showSection(initialSection);
    refreshAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
