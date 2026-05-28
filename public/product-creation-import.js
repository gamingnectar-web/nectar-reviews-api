(function ProductCreationImportAdmin(){
  const state = { latestImport: null, latestDraft: null, historyLoaded: false };
  const api = (path, options = {}) => window.adminFetch(`/admin/product-creation-import${path}`, options);
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  const money = (value) => value ? `£${esc(value)}` : '—';

  function setStatus(id, message, kind = '') {
    const el = byId(id);
    if (!el) return;
    el.className = `pci-status ${kind}`.trim();
    el.innerHTML = message;
  }

  function draftFromForm(prefix) {
    const imageUrl = byId(`${prefix}-image`)?.value.trim() || '';
    return {
      title: byId(`${prefix}-title`)?.value.trim() || '',
      vendor: byId(`${prefix}-vendor`)?.value.trim() || '',
      productType: byId(`${prefix}-type`)?.value.trim() || '',
      price: byId(`${prefix}-price`)?.value.trim() || '',
      cost: byId(`${prefix}-cost`)?.value.trim() || '',
      sku: byId(`${prefix}-sku`)?.value.trim() || '',
      barcode: byId(`${prefix}-barcode`)?.value.trim() || '',
      sourceUrl: byId(`${prefix}-source`)?.value.trim() || '',
      description: byId(`${prefix}-description`)?.value.trim() || '',
      tags: (byId(`${prefix}-tags`)?.value || '').split(',').map((x) => x.trim()).filter(Boolean),
      images: imageUrl ? [{ src: imageUrl, alt: byId(`${prefix}-title`)?.value.trim() || 'Imported product' }] : [],
    };
  }

  function fillDraftForm(prefix, draft = {}) {
    const firstImage = draft.images?.[0]?.src || draft.imageUrl || '';
    [['title', draft.title], ['vendor', draft.vendor], ['type', draft.productType], ['price', draft.price], ['cost', draft.cost], ['sku', draft.sku], ['barcode', draft.barcode], ['source', draft.sourceUrl], ['description', (draft.description || '').replace(/<[^>]+>/g, '')], ['tags', Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags], ['image', firstImage]].forEach(([key, value]) => {
      const el = byId(`${prefix}-${key}`);
      if (el) el.value = value || '';
    });
  }

  function renderDraft(prefix, draft, targetId) {
    state.latestDraft = draft;
    fillDraftForm(prefix, draft);
    const img = draft.images?.[0]?.src || '';
    const target = byId(targetId);
    if (!target) return;
    target.innerHTML = `<div class="pci-draft">${img ? `<img src="${esc(img)}" alt="">` : '<div class="pci-line-img"></div>'}<div><h3>${esc(draft.title || 'Product draft')}</h3><p class="pci-muted">Review, edit and create as a Shopify draft product. Nothing is published automatically.</p><div class="pci-actions"><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.createCurrentDraft('${prefix}')">Create Shopify draft product</button></div></div></div>`;
  }

  async function fileToCompressedDataUrl(file) {
    if (!file) return '';
    if (!/^image\//i.test(file.type)) return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(file); });
    const original = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(file); });
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; });
    const max = 1200;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  }

  function shopifyProductUrl(productId) {
    const id = String(productId || '').match(/(\d+)$/)?.[1] || '';
    return id && window.SHOP_DOMAIN ? `https://${window.SHOP_DOMAIN}/admin/products/${id}` : '';
  }

  function renderLines(importDoc) {
    const box = byId('pci-invoice-lines');
    if (!box) return;
    const lines = importDoc?.lines || [];
    if (!lines.length) {
      box.innerHTML = '<div class="pci-status warn">No product lines were detected. Add clearer notes, upload a sharper image, or use Manual Create.</div>';
      return;
    }
    box.innerHTML = lines.map((line, index) => {
      const m = line.match || {};
      const matchClass = m.status === 'assigned' || m.status === 'created' ? 'ok' : (m.status === 'suggested' ? 'warn' : '');
      const link = shopifyProductUrl(m.productId);
      return `<div class="pci-line" data-line-id="${esc(line.lineId)}"><div>${line.imageUrl ? `<img class="pci-line-img" src="${esc(line.imageUrl)}" alt="">` : '<div class="pci-line-img"></div>'}</div><div><h4>${esc(line.title || line.sku || 'Invoice product line')}</h4><small>SKU: ${esc(line.sku || line.supplierProductCode || '—')} · Barcode: ${esc(line.barcode || '—')}</small><small>Qty: ${esc(line.quantity || 1)} · Paid: ${money(line.unitCost)} · Suggested retail: ${money(line.suggestedRetailPrice)}</small><small>Match: <span class="pci-pill ${matchClass}">${esc(m.status || 'unmatched')}</span> ${esc(m.productTitle || m.reason || '')} ${link ? `<a class="pci-shopify-link" href="${esc(link)}" target="_blank">Open Shopify ↗</a>` : ''}</small><div id="pci-results-${index}" class="pci-search-results"></div></div><div class="pci-actions"><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.searchForLine(${index})">Search</button>${m.status === 'suggested' && m.productId ? `<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.assignLine(${index}, ${JSON.stringify(m).replace(/"/g,'&quot;')})">Assign suggested</button>` : ''}<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.createLine(${index})">Create draft</button></div></div>`;
    }).join('');
  }

  window.pciTab = function(name) {
    document.querySelectorAll('#v-product-creation-import .pci-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.pciTab === name));
    document.querySelectorAll('#v-product-creation-import .pci-pane').forEach((pane) => pane.classList.toggle('active', pane.id === `pci-pane-${name}`));
    if (name === 'history') window.ProductCreationImportAdmin.loadHistory();
  };

  async function loadHealth() {
    const box = byId('pci-health');
    if (!box) return;
    try {
      const data = await api('/health');
      const connected = data.shopify?.connected;
      box.innerHTML = `<strong>Shopify:</strong> ${connected ? 'Connected' : 'Needs OAuth'}<br><strong>Invoice vision:</strong> ${data.invoiceVision ? 'OPENAI_API_KEY ready' : 'Fallback mode'}<br><span class="pci-muted">${esc(data.shopify?.message || '')}</span>${!connected && data.shopify?.installUrl ? `<div class="pci-actions"><button class="primary-btn" onclick="window.openSecureAdminSession()">Reconnect Shopify</button></div>` : ''}`;
      box.className = `pci-status ${connected ? 'ok' : 'warn'}`;
    } catch (error) {
      setStatus('pci-health', esc(error.message || 'Could not load product import status.'), 'err');
    }
  }

  async function scanUrl() {
    const url = byId('pci-url-input')?.value.trim() || '';
    if (!url) return setStatus('pci-url-status', 'Paste a product URL first.', 'warn');
    setStatus('pci-url-status', 'Scanning product page…');
    try {
      const data = await api('/url/scan', { method: 'POST', body: JSON.stringify({ url }) });
      state.latestImport = data.import;
      renderDraft('pci-url', data.draft, 'pci-url-draft');
      setStatus('pci-url-status', `Product draft extracted with ${Math.round((data.draft?.confidence || 0) * 100)}% confidence.`, 'ok');
    } catch (error) {
      setStatus('pci-url-status', esc(error.message || 'URL scan failed.'), 'err');
    }
  }

  async function analyseInvoice() {
    const file = byId('pci-invoice-file')?.files?.[0];
    const notes = byId('pci-invoice-notes')?.value || '';
    const supplierUrl = byId('pci-invoice-supplier-url')?.value || '';
    if (!file && !notes.trim()) return setStatus('pci-invoice-status', 'Upload an invoice image or paste invoice line notes first.', 'warn');
    setStatus('pci-invoice-status', 'Reading invoice and matching Shopify products…');
    try {
      const imageDataUrl = file ? await fileToCompressedDataUrl(file) : '';
      const data = await api('/invoice/analyse', { method: 'POST', body: JSON.stringify({ imageDataUrl, mimeType: file?.type || '', filename: file?.name || '', notes, supplierUrl, autoMatch: true }) });
      state.latestImport = data.import;
      renderLines(data.import);
      setStatus('pci-invoice-status', `${data.import?.lines?.length || 0} product line(s) found.${data.warning ? `<br>${esc(data.warning)}` : ''}`, data.warning ? 'warn' : 'ok');
    } catch (error) {
      setStatus('pci-invoice-status', esc(error.message || 'Invoice analysis failed.'), 'err');
    }
  }

  async function createCurrentDraft(prefix) {
    const draft = draftFromForm(prefix);
    if (!draft.title) return setStatus(prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status', 'Title is required.', 'warn');
    const statusId = prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status';
    setStatus(statusId, 'Creating Shopify draft product…');
    try {
      const payload = { draft };
      if (state.latestImport?._id && prefix === 'pci-url') payload.importId = state.latestImport._id;
      const data = await api('/shopify/create', { method: 'POST', body: JSON.stringify(payload) });
      const link = shopifyProductUrl(data.product?.id);
      setStatus(statusId, `Created draft product: <strong>${esc(data.product?.title || draft.title)}</strong>${link ? ` · <a href="${esc(link)}" target="_blank">Open in Shopify ↗</a>` : ''}`, 'ok');
      state.historyLoaded = false;
    } catch (error) {
      setStatus(statusId, esc(error.message || 'Product creation failed.'), 'err');
    }
  }

  async function createManualDraft() {
    await createCurrentDraft('pci-manual');
  }

  async function searchForLine(index) {
    const line = state.latestImport?.lines?.[index];
    if (!line) return;
    const box = byId(`pci-results-${index}`);
    if (box) box.innerHTML = '<div class="pci-status">Searching Shopify…</div>';
    try {
      const q = line.sku || line.barcode || line.supplierProductCode || line.title;
      const data = await api(`/products/search?q=${encodeURIComponent(q)}&first=8`);
      const products = data.products || [];
      if (!products.length) { box.innerHTML = '<div class="pci-status warn">No matching products found. Try creating a draft product.</div>'; return; }
      box.innerHTML = products.map((p) => `<div class="pci-result"><div>${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</div><div><strong>${esc(p.title)}</strong><small>SKU: ${esc(p.sku || '—')} · ${esc(p.handle || '')}</small></div><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.assignLine(${index}, ${JSON.stringify(p).replace(/"/g,'&quot;')})">Assign</button></div>`).join('');
    } catch (error) {
      if (box) box.innerHTML = `<div class="pci-status err">${esc(error.message || 'Search failed.')}</div>`;
    }
  }

  async function assignLine(index, product) {
    const line = state.latestImport?.lines?.[index];
    if (!line || !state.latestImport?._id) return;
    setStatus('pci-invoice-status', 'Assigning product…');
    try {
      const data = await api('/shopify/assign', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, lineId: line.lineId, productId: product.productId || product.id, variantId: product.variantId || '', productTitle: product.productTitle || product.title, handle: product.handle || '', image: product.image || '' }) });
      state.latestImport = data.import;
      renderLines(data.import);
      setStatus('pci-invoice-status', 'Product assigned.', 'ok');
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Assign failed.'), 'err'); }
  }

  async function createLine(index) {
    const line = state.latestImport?.lines?.[index];
    if (!line || !state.latestImport?._id) return;
    setStatus('pci-invoice-status', `Creating draft product for ${esc(line.title || 'line')}…`);
    try {
      const data = await api('/shopify/create', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, lineId: line.lineId }) });
      state.latestImport = data.import;
      renderLines(data.import);
      setStatus('pci-invoice-status', `Created Shopify draft product: <strong>${esc(data.product?.title || line.title)}</strong>`, 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Create failed.'), 'err'); }
  }

  async function loadHistory(force = false) {
    if (state.historyLoaded && !force) return;
    const box = byId('pci-history-box');
    if (!box) return;
    box.innerHTML = '<div class="pci-status">Loading import history…</div>';
    try {
      const data = await api('/history?limit=30');
      const items = data.items || [];
      state.historyLoaded = true;
      box.innerHTML = items.length ? `<table class="pci-history"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Source</th><th>Lines</th></tr></thead><tbody>${items.map((item) => `<tr><td>${esc(new Date(item.createdAt).toLocaleString())}</td><td>${esc(item.type)}</td><td><span class="pci-pill ${item.status === 'created' || item.status === 'matched' ? 'ok' : 'warn'}">${esc(item.status)}</span></td><td>${esc(item.sourceUrl || item.supplierName || item.originalFilename || 'Manual')}</td><td>${esc(item.lines?.length || (item.draft?.title ? 1 : 0))}</td></tr>`).join('')}</tbody></table>` : '<div class="pci-status warn">No product imports yet.</div>';
    } catch (error) {
      box.innerHTML = `<div class="pci-status err">${esc(error.message || 'History failed.')}</div>`;
    }
  }

  function init() {
    loadHealth();
    byId('pci-scan-url')?.addEventListener('click', scanUrl);
    byId('pci-analyse-invoice')?.addEventListener('click', analyseInvoice);
    byId('pci-create-manual')?.addEventListener('click', createManualDraft);
    byId('pci-history-refresh')?.addEventListener('click', () => loadHistory(true));
  }

  window.ProductCreationImportAdmin = { init, scanUrl, analyseInvoice, createCurrentDraft, createManualDraft, searchForLine, assignLine, createLine, loadHistory };
  document.addEventListener('DOMContentLoaded', init);
})();
