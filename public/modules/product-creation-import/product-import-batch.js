(() => {
  const state = { batch: null, batches: [] };
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const parentShopDomain = (() => {
    try { return window.parent?.SHOP_DOMAIN || ''; } catch (_) { return ''; }
  })();
  const shopDomain = (params.get('shop') || params.get('shopDomain') || parentShopDomain || '').toLowerCase();

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (shopDomain) headers['x-shop-domain'] = shopDomain;
    const res = await fetch(`/api/admin/product-creation-import${path}`, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.message || `Request failed (${res.status})`);
    return json;
  }

  function csv(id) { return ($(id)?.value || '').split(',').map((x) => x.trim()).filter(Boolean); }
  function defaults() {
    return {
      supplierName: $('default-supplier').value,
      brand: $('default-supplier').value,
      vendor: $('default-vendor').value || $('default-supplier').value,
      productType: $('default-product-type').value,
      productCategory: $('default-product-category').value,
      themeTemplate: $('default-template').value,
      collections: csv('default-collections'),
      recommendedTags: csv('default-tags'),
      currency: 'GBP',
    };
  }

  function setBusy(message) { $('batch-status').textContent = message; }
  function setLoadedControls() {
    const loaded = Boolean(state.batch?._id);
    ['add-links','scan-batch','approve-ready','create-drafts'].forEach((id) => { $(id).disabled = !loaded; });
  }

  async function loadRecentBatches() {
    if (!shopDomain) {
      $('recent-batches').innerHTML = '<p class="error-text">No Shopify shop domain was passed into this embedded workspace. Open the app from Shopify Admin again.</p>';
      return;
    }
    const data = await api('/batches?limit=20');
    state.batches = data.batches || [];
    $('recent-batches').innerHTML = state.batches.length ? state.batches.map((batch) => `
      <div class="recent-row">
        <div><strong>${escapeHtml(batch.name || 'Product import batch')}</strong><br><small class="muted">${batch.summary?.total || 0} items · ${batch.status || 'draft'} · ${new Date(batch.createdAt).toLocaleString()}</small></div>
        <button class="secondary-btn" data-open-batch="${batch._id}">Open</button>
      </div>`).join('') : '<p class="muted">No batches yet.</p>';
    document.querySelectorAll('[data-open-batch]').forEach((button) => button.addEventListener('click', () => openBatch(button.dataset.openBatch)));
  }

  async function openBatch(batchId) {
    const data = await api(`/batches/${batchId}`);
    state.batch = data.batch;
    setBusy(`Loaded batch: ${state.batch.name || state.batch._id}`);
    renderBatch();
    setLoadedControls();
  }

  async function createBatch() {
    setBusy('Creating batch…');
    const data = await api('/batches', {
      method: 'POST',
      body: JSON.stringify({ name: $('batch-name').value, defaults: defaults(), links: $('batch-links').value }),
    });
    state.batch = data.batch;
    setBusy(`Batch created with ${state.batch.summary?.total || state.batch.items?.length || 0} item(s).`);
    $('batch-links').value = '';
    renderBatch();
    setLoadedControls();
    await loadRecentBatches();
  }

  async function addLinks() {
    if (!state.batch?._id) return;
    setBusy('Adding links…');
    const data = await api(`/batches/${state.batch._id}/items`, { method: 'POST', body: JSON.stringify({ links: $('batch-links').value }) });
    state.batch = data.batch;
    $('batch-links').value = '';
    setBusy(`Added ${data.added || 0} new item(s).`);
    renderBatch();
  }

  async function scanBatch() {
    if (!state.batch?._id) return;
    setBusy('Scanning queued products. Large batches may process for a while in the current request…');
    const data = await api(`/batches/${state.batch._id}/scan`, { method: 'POST', body: JSON.stringify({ processAll: true, useAi: true }) });
    state.batch = data.batch;
    setBusy(`Scan complete. Processed ${data.processed || 0}; remaining ${data.remaining || 0}.`);
    renderBatch();
  }

  async function approveReady() {
    const ready = (state.batch?.items || []).filter((item) => ['ready','warning'].includes(item.validation?.status) && item.approvalStatus !== 'approved');
    for (const item of ready) {
      const data = await api(`/batches/${state.batch._id}/items/${item.itemId}/approval`, { method: 'POST', body: JSON.stringify({ approvalStatus: 'approved' }) });
      state.batch = data.batch;
    }
    setBusy(`Approved ${ready.length} ready/warning row(s).`);
    renderBatch();
  }

  async function createDrafts() {
    if (!state.batch?._id) return;
    setBusy('Creating Shopify draft products for approved rows…');
    const data = await api(`/batches/${state.batch._id}/create-shopify-drafts`, { method: 'POST', body: JSON.stringify({ approvedOnly: true }) });
    state.batch = data.batch;
    setBusy(`Created ${data.created || 0} Shopify draft(s). ${data.failed || 0} failed.`);
    renderBatch();
  }

  function renderBatch() {
    const batch = state.batch;
    if (!batch) return;
    const s = batch.summary || {};
    $('batch-summary').innerHTML = ['total','queued','analysed','needsReview','approved','created','failed'].map((key) => `<span class="summary-pill">${key}: ${s[key] || 0}</span>`).join('');
    $('batch-items').innerHTML = (batch.items || []).length ? batch.items.map(renderItemRow).join('') : '<p class="muted">No products in this batch yet.</p>';
    document.querySelectorAll('[data-view-item]').forEach((button) => button.addEventListener('click', () => viewItem(button.dataset.viewItem)));
    document.querySelectorAll('[data-approve-item]').forEach((button) => button.addEventListener('click', () => approveItem(button.dataset.approveItem)));
    document.querySelectorAll('[data-rescan-item]').forEach((button) => button.addEventListener('click', () => rescanItem(button.dataset.rescanItem)));
  }

  function renderItemRow(item) {
    const image = item.selectedImages?.[0]?.src || item.draft?.images?.[0]?.src || '';
    return `<div class="item-row">
      <div>${image ? `<img src="${escapeAttr(image)}" alt="">` : '<span class="badge blocked">No image</span>'}</div>
      <div class="item-title"><strong>${escapeHtml(item.draft?.title || item.title || item.originalInput || 'Queued product')}</strong><small>${escapeHtml(item.sourceUrl || item.originalInput || '')}</small></div>
      <span class="badge ${escapeAttr(item.status || '')}">${escapeHtml(item.status || 'queued')}</span>
      <span class="badge ${escapeAttr(item.approvalStatus || '')}">${escapeHtml(item.approvalStatus || 'pending')}</span>
      <span>${escapeHtml(item.draft?.productType || item.productType || '—')}</span>
      <span>${escapeHtml(item.nutrition?.productFlavour || '—')}</span>
      <span>${escapeHtml(item.nutrition?.caffeineMgPerServing !== undefined && item.nutrition?.caffeineMgPerServing !== '' ? `${item.nutrition.caffeineMgPerServing}mg` : '—')}</span>
      <div class="row-actions"><button class="secondary-btn" data-view-item="${escapeAttr(item.itemId)}">Review</button><button class="secondary-btn" data-rescan-item="${escapeAttr(item.itemId)}">Rescan</button><button class="primary-btn" data-approve-item="${escapeAttr(item.itemId)}">Approve</button></div>
    </div>`;
  }

  async function approveItem(itemId) {
    const data = await api(`/batches/${state.batch._id}/items/${itemId}/approval`, { method: 'POST', body: JSON.stringify({ approvalStatus: 'approved' }) });
    state.batch = data.batch;
    renderBatch();
  }

  async function rescanItem(itemId) {
    setBusy('Rescanning product…');
    const data = await api(`/batches/${state.batch._id}/scan`, { method: 'POST', body: JSON.stringify({ itemIds: [itemId], processAll: true, useAi: true }) });
    state.batch = data.batch;
    setBusy('Product rescan complete.');
    renderBatch();
  }

  function viewItem(itemId) {
    const item = (state.batch?.items || []).find((row) => row.itemId === itemId);
    if (!item) return;
    $('dialog-title').textContent = item.draft?.title || item.title || 'Product';
    $('dialog-subtitle').textContent = item.sourceUrl || item.originalInput || '';
    $('dialog-body').innerHTML = `<div class="dialog-body-grid">
      <div>
        <h3>Selected product images</h3>
        <div class="image-grid">${(item.selectedImages || []).map((img) => `<div class="image-card"><img src="${escapeAttr(img.src)}" alt=""><small>${escapeHtml(img.reason || '')}</small></div>`).join('') || '<p class="muted">No selected images.</p>'}</div>
        <h3>Rejected / possible images</h3>
        <div class="image-grid">${(item.rejectedImages || []).slice(0,12).map((img) => `<div class="image-card"><img src="${escapeAttr(img.src)}" alt=""><small>${escapeHtml(img.rejectReason || img.reason || '')}</small></div>`).join('') || '<p class="muted">No rejected images.</p>'}</div>
      </div>
      <div>
        <div class="kv">
          <div><span>SEO title</span><strong>${escapeHtml(item.draft?.seo?.title || '—')}</strong></div>
          <div><span>SEO description</span><strong>${escapeHtml(item.draft?.seo?.description || '—')}</strong></div>
          <div><span>Flavour</span><strong>${escapeHtml(item.nutrition?.productFlavour || '—')}</strong></div>
          <div><span>Sweet / Sour</span><strong>${escapeHtml(`${item.nutrition?.sweetness || '—'} / ${item.nutrition?.sourness || '—'}`)}</strong></div>
          <div><span>Servings</span><strong>${escapeHtml(item.nutrition?.servings || '—')}</strong></div>
          <div><span>Caffeine</span><strong>${escapeHtml(item.nutrition?.caffeineMgPerServing !== undefined && item.nutrition?.caffeineMgPerServing !== '' ? `${item.nutrition.caffeineMgPerServing}mg` : '—')}</strong></div>
          <div><span>Validation</span><strong>${escapeHtml(item.validation?.status || 'unchecked')}</strong><small>${escapeHtml((item.validation?.issues || []).join(' · '))}</small></div>
        </div>
        <h3>Metafield plan</h3>
        <pre class="codebox">${escapeHtml(JSON.stringify(item.metafieldPlan || item.draft?.metafields || [], null, 2))}</pre>
      </div>
    </div>`;
    $('item-dialog').showModal();
  }

  function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
  function escapeAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#096;'); }

  $('create-batch').addEventListener('click', () => createBatch().catch((e) => setBusy(e.message)));
  $('add-links').addEventListener('click', () => addLinks().catch((e) => setBusy(e.message)));
  $('scan-batch').addEventListener('click', () => scanBatch().catch((e) => setBusy(e.message)));
  $('approve-ready').addEventListener('click', () => approveReady().catch((e) => setBusy(e.message)));
  $('create-drafts').addEventListener('click', () => createDrafts().catch((e) => setBusy(e.message)));
  $('refresh-batches').addEventListener('click', () => loadRecentBatches().catch((e) => setBusy(e.message)));
  $('close-dialog').addEventListener('click', () => $('item-dialog').close());
  loadRecentBatches().catch((e) => { $('recent-batches').innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`; });
})();
