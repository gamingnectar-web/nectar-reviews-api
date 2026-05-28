(function ProductCreationImportAdmin(){
  const state = { latestImport: null, latestDraft: null, historyLoaded: false, metadata: null };
  const api = (path, options = {}) => window.adminFetch(`/admin/product-creation-import${path}`, options);
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  const money = (value) => value !== undefined && value !== null && String(value) !== '' ? `£${esc(value)}` : '—';
  const compoundId = (prefix, namespace, key) => `${prefix}-mf-${String(namespace).replace(/[^a-z0-9_-]/gi,'_')}-${String(key).replace(/[^a-z0-9_-]/gi,'_')}`;

  function setStatus(id, message, kind = '') {
    const el = byId(id);
    if (!el) return;
    el.className = `pci-status ${kind}`.trim();
    el.innerHTML = message;
  }

  function getVisibleMetafieldDefinitions() {
    const defs = state.metadata?.metafieldDefinitions || [];
    const coreKeys = new Set(['core.formula_version','core.grouped_profiles','core.sourness','core.sweetness','core.flavour_profile']);
    return defs
      .filter((definition) => coreKeys.has(`${definition.namespace}.${definition.key}`) || !definition.namespace?.startsWith('shopify'))
      .slice(0, 80);
  }

  function readMetafields(prefix) {
    return Array.from(document.querySelectorAll(`[data-pci-mf-prefix="${prefix}"]`)).map((input) => ({
      namespace: input.dataset.namespace,
      key: input.dataset.key,
      type: input.dataset.type || 'single_line_text_field',
      value: input.value.trim(),
      label: input.dataset.label || '',
      source: 'merchant-edit',
    })).filter((item) => item.namespace && item.key && item.value !== '');
  }

  function draftFromForm(prefix) {
    const imageUrl = byId(`${prefix}-image`)?.value.trim() || '';
    return {
      title: byId(`${prefix}-title`)?.value.trim() || '',
      handle: byId(`${prefix}-handle`)?.value.trim() || '',
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
      metafields: readMetafields(prefix),
    };
  }

  function renderTagChips(prefix) {
    const target = byId(`${prefix}-tag-suggestions`);
    if (!target) return;
    const tags = state.metadata?.tags || [];
    const datalist = byId('pci-tag-list');
    if (datalist) datalist.innerHTML = tags.slice(0, 200).map((item) => `<option value="${esc(item.tag || item)}"></option>`).join('');
    if (!tags.length) { target.innerHTML = '<small class="pci-muted">No previous tags loaded yet.</small>'; return; }
    target.innerHTML = tags.slice(0, 24).map((item) => `<button type="button" class="pci-chip" onclick="window.ProductCreationImportAdmin.addTag('${prefix}', '${esc(String(item.tag || item).replace(/'/g, "\\'"))}')">${esc(item.tag || item)}</button>`).join('');
  }

  function addTag(prefix, tag) {
    const input = byId(`${prefix}-tags`);
    if (!input || !tag) return;
    const tags = new Set((input.value || '').split(',').map((x) => x.trim()).filter(Boolean));
    tags.add(tag);
    input.value = Array.from(tags).join(', ');
    suggestProfile(prefix, { quiet: true });
  }

  function renderMetafieldFields(prefix, draft = {}) {
    const target = byId(`${prefix}-metafields`);
    if (!target) return;
    const definitions = getVisibleMetafieldDefinitions();
    const values = new Map((draft.metafields || []).map((item) => [`${item.namespace}.${item.key}`, item]));
    if (!definitions.length) {
      target.innerHTML = '<div class="pci-status warn">No product metafield definitions could be loaded yet. Core G Fuel profile fields are still supported server-side.</div>';
      return;
    }
    target.innerHTML = definitions.map((definition) => {
      const compound = `${definition.namespace}.${definition.key}`;
      const current = values.get(compound) || {};
      const isCore = ['core.formula_version','core.grouped_profiles','core.sourness','core.sweetness','core.flavour_profile'].includes(compound);
      return `<div class="pci-mf-field ${isCore ? 'core' : ''}">
        <label class="pci-label" for="${compoundId(prefix, definition.namespace, definition.key)}">${esc(definition.name || compound)} <span>${esc(compound)}</span></label>
        <input id="${compoundId(prefix, definition.namespace, definition.key)}" class="pci-input" data-pci-mf-prefix="${prefix}" data-namespace="${esc(definition.namespace)}" data-key="${esc(definition.key)}" data-type="${esc(definition.type || 'single_line_text_field')}" data-label="${esc(definition.name || '')}" value="${esc(current.value || '')}" placeholder="${esc(definition.description || definition.help || '')}">
      </div>`;
    }).join('');
  }

  function fillDraftForm(prefix, draft = {}) {
    const firstImage = draft.images?.[0]?.src || draft.imageUrl || '';
    [['title', draft.title], ['handle', draft.handle], ['vendor', draft.vendor], ['type', draft.productType], ['price', draft.price], ['cost', draft.cost], ['sku', draft.sku], ['barcode', draft.barcode], ['source', draft.sourceUrl], ['description', (draft.description || draft.descriptionHtml || '').replace(/<[^>]+>/g, '')], ['tags', Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags], ['image', firstImage]].forEach(([key, value]) => {
      const el = byId(`${prefix}-${key}`);
      if (el) el.value = value || '';
    });
    renderTagChips(prefix);
    renderMetafieldFields(prefix, draft);
  }

  function renderDraft(prefix, draft, targetId) {
    state.latestDraft = draft;
    fillDraftForm(prefix, draft);
    const img = draft.images?.[0]?.src || '';
    const target = byId(targetId);
    if (!target) return;
    target.innerHTML = `<div class="pci-draft">${img ? `<img src="${esc(img)}" alt="">` : '<div class="pci-line-img"></div>'}<div><h3>${esc(draft.title || 'Product draft')}</h3><p class="pci-muted">Review the handle, tags and metafields, then create as a Shopify draft product. Nothing is published automatically.</p>${draft.enrichment?.aiNotes ? `<p class="pci-muted"><strong>AI note:</strong> ${esc(draft.enrichment.aiNotes)}</p>` : ''}<div class="pci-actions"><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.suggestProfile('${prefix}')">Generate tags & metafields</button><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.createCurrentDraft('${prefix}')">Create Shopify draft product</button></div></div></div>`;
  }

  async function fileToCompressedDataUrl(file) {
    if (!file) return '';
    if (!/^image\//i.test(file.type)) return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(file); });
    const original = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(file); });
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function shopifyProductUrl(productId) {
    const id = String(productId || '').match(/(\d+)$/)?.[1] || '';
    return id && window.SHOP_DOMAIN ? `https://${window.SHOP_DOMAIN}/admin/products/${id}` : '';
  }

  function syncLineInputs() {
    if (!state.latestImport?.lines) return [];
    document.querySelectorAll('.pci-line-field').forEach((input) => {
      const index = Number(input.dataset.index);
      const field = input.dataset.field;
      if (state.latestImport.lines[index] && field) state.latestImport.lines[index][field] = input.value;
    });
    return state.latestImport.lines;
  }

  function renderLines(importDoc) {
    const box = byId('pci-invoice-lines');
    if (!box) return;
    const lines = importDoc?.lines || [];
    if (!lines.length) {
      box.innerHTML = '<div class="pci-status warn">No product lines were detected. Add clearer notes, upload a sharper image, or use Manual Create.</div>';
      return;
    }
    box.innerHTML = `${lines.map((line, index) => {
      const m = line.match || {};
      const matchClass = m.status === 'assigned' || m.status === 'created' ? 'ok' : (m.status === 'suggested' ? 'warn' : '');
      const link = shopifyProductUrl(m.productId);
      const image = line.imageUrl || m.image || '';
      const imageHint = line.imageSearchQuery || line.imageDescription || '';
      return `<div class="pci-line" data-line-id="${esc(line.lineId)}"><div>${image ? `<img class="pci-line-img" src="${esc(image)}" alt="">` : '<div class="pci-line-img"></div>'}</div><div><h4>${esc(line.title || line.sku || 'Invoice product line')}</h4><small>SKU: ${esc(line.sku || line.supplierProductCode || '—')} · Barcode: ${esc(line.barcode || '—')}</small><small>Match: <span class="pci-pill ${matchClass}">${esc(m.status || 'unmatched')}</span> ${esc(m.productTitle || m.reason || '')} ${link ? `<a class="pci-shopify-link" href="${esc(link)}" target="_blank">Open Shopify ↗</a>` : ''}</small>${imageHint ? `<small>Image hint: ${esc(imageHint)}</small>` : ''}
        <div class="pci-line-edit-grid">
          <label>Qty<input class="pci-input pci-line-field" data-index="${index}" data-field="quantity" value="${esc(line.quantity || 1)}"></label>
          <label>Price paid / unit cost<input class="pci-input pci-line-field" data-index="${index}" data-field="unitCost" value="${esc(line.unitCost || '')}"></label>
          <label>Original price<input class="pci-input pci-line-field" data-index="${index}" data-field="originalUnitPrice" value="${esc(line.originalUnitPrice || '')}"></label>
          <label>Discount<input class="pci-input pci-line-field" data-index="${index}" data-field="discountAmount" value="${esc(line.discountAmount || '')}"></label>
          <label>Discount / promo label<input class="pci-input pci-line-field" data-index="${index}" data-field="discountLabel" value="${esc(line.discountLabel || '')}"></label>
          <label>Suggested retail<input class="pci-input pci-line-field" data-index="${index}" data-field="suggestedRetailPrice" value="${esc(line.suggestedRetailPrice || '')}"></label>
        </div><div id="pci-results-${index}" class="pci-search-results"></div></div><div class="pci-actions pci-line-actions"><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.searchForLine(${index})">Search</button>${m.status === 'suggested' && m.productId ? `<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.confirmSuggestedLine(${index})">Confirm match</button>` : ''}<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.openLineCreateMenu(${index})">Create…</button></div></div>`;
    }).join('')}<div class="pci-po-actions"><button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.createPurchaseOrderDraft()">Create draft PO</button><span class="pci-muted">Creates a purchase order draft from quantities, price paid, discounts and matched/created products.</span></div><div id="pci-po-draft"></div>`;
    if (importDoc.purchaseOrder?.status === 'draft' || importDoc.purchaseOrder?.status === 'formalised') renderPoDraft(importDoc.purchaseOrder);
  }

  function renderPoDraft(po) {
    const target = byId('pci-po-draft');
    if (!target || !po) return;
    const rows = po.lines || [];
    target.innerHTML = `<div class="pci-po-card"><div class="pci-po-head"><div><h3>Draft PO: ${esc(po.poNumber || 'Purchase Order')}</h3><p class="pci-muted">Formalise this once every product line has the right Shopify product, quantity and cost.</p></div><span class="pci-pill ${po.status === 'formalised' ? 'ok' : 'warn'}">${esc(po.status || 'draft')}</span></div><table class="pci-history"><thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Discount</th><th>Line total</th><th>Match</th></tr></thead><tbody>${rows.map((line) => `<tr><td><strong>${esc(line.title)}</strong><br><small>${esc(line.sku || line.productTitle || '')}</small></td><td>${esc(line.quantity)}</td><td>${money(line.unitCost)}</td><td>${line.discountAmount ? money(line.discountAmount) : '—'}<br><small>${esc(line.discountLabel || '')}</small></td><td>${money(line.totalCost)}</td><td><span class="pci-pill ${['assigned','created'].includes(line.matchStatus) ? 'ok' : 'warn'}">${esc(line.matchStatus)}</span></td></tr>`).join('')}</tbody></table><div class="pci-po-totals"><span>Subtotal <strong>${money(po.subtotal)}</strong></span><span>Discounts <strong>${money(po.discountTotal)}</strong></span><span>Shipping <strong>${money(po.shippingTotal)}</strong></span><span>Tax <strong>${money(po.taxTotal)}</strong></span><span>Total <strong>${money(po.total)}</strong></span></div><label class="pci-label">PO notes</label><textarea id="pci-po-notes" class="pci-textarea">${esc(po.notes || '')}</textarea><div class="pci-actions"><button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.formalisePurchaseOrderDraft()">Formalise PO</button></div></div>`;
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

  async function loadMetadata() {
    try {
      state.metadata = await api('/metadata');
      ['pci-url','pci-manual'].forEach((prefix) => { renderTagChips(prefix); renderMetafieldFields(prefix, draftFromForm(prefix)); });
    } catch (error) {
      state.metadata = { tags: [], metafieldDefinitions: [] };
    }
  }

  async function suggestProfile(prefix, opts = {}) {
    const draft = draftFromForm(prefix);
    const statusId = prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status';
    if (!opts.quiet) setStatus(statusId, 'Generating product handle, tags and metafields…');
    try {
      const data = await api('/profile/suggest', { method: 'POST', body: JSON.stringify({ draft }) });
      const suggestion = data.suggestion || {};
      fillDraftForm(prefix, { ...draft, handle: suggestion.handle || draft.handle, productType: suggestion.productType || draft.productType, tags: suggestion.tags || draft.tags, metafields: suggestion.metafields || draft.metafields });
      if (!opts.quiet) setStatus(statusId, `Profile suggestions applied.${suggestion.existingProfileMatchedProducts ? ` Based on ${suggestion.existingProfileMatchedProducts} similar product(s).` : ''}${suggestion.aiNotes ? `<br>${esc(suggestion.aiNotes)}` : ''}`, 'ok');
    } catch (error) {
      if (!opts.quiet) setStatus(statusId, esc(error.message || 'Profile suggestion failed.'), 'err');
    }
  }

  async function scanUrl() {
    const url = byId('pci-url-input')?.value.trim() || '';
    if (!url) return setStatus('pci-url-status', 'Paste a product URL first.', 'warn');
    setStatus('pci-url-status', 'Scanning product page and building product profile…');
    try {
      const data = await api('/url/scan', { method: 'POST', body: JSON.stringify({ url }) });
      state.latestImport = data.import;
      renderDraft('pci-url', data.draft, 'pci-url-draft');
      setStatus('pci-url-status', `Product draft extracted with ${Math.round((data.draft?.confidence || 0) * 100)}% confidence. Handle, tags and metafields are editable before creation.`, 'ok');
    } catch (error) {
      setStatus('pci-url-status', esc(error.message || 'URL scan failed.'), 'err');
    }
  }

  async function analyseInvoice() {
    const file = byId('pci-invoice-file')?.files?.[0];
    const notes = byId('pci-invoice-notes')?.value || '';
    const supplierUrl = byId('pci-invoice-supplier-url')?.value || '';
    if (!file && !notes.trim()) return setStatus('pci-invoice-status', 'Upload an invoice/order image or paste invoice line notes first.', 'warn');
    setStatus('pci-invoice-status', 'Reading invoice, looking for thumbnails, discounts and matching Shopify products…');
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

  async function createManualDraft() { await createCurrentDraft('pci-manual'); }

  async function searchForLine(index) {
    syncLineInputs();
    const line = state.latestImport?.lines?.[index];
    if (!line) return;
    const box = byId(`pci-results-${index}`);
    if (box) box.innerHTML = '<div class="pci-status">Searching Shopify…</div>';
    try {
      const q = line.sku || line.barcode || line.supplierProductCode || line.title;
      const data = await api(`/products/search?q=${encodeURIComponent(q)}&first=8`);
      const products = data.products || [];
      if (!products.length) { box.innerHTML = '<div class="pci-status warn">No matching products found. Use Create… to create manually or from a URL.</div>'; return; }
      box.innerHTML = products.map((p) => `<div class="pci-result"><div>${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</div><div><strong>${esc(p.title)}</strong><small>SKU: ${esc(p.sku || '—')} · ${esc(p.handle || '')}</small></div><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.assignLine(${index}, ${JSON.stringify(p).replace(/"/g,'&quot;')})">Assign</button></div>`).join('');
    } catch (error) {
      if (box) box.innerHTML = `<div class="pci-status err">${esc(error.message || 'Search failed.')}</div>`;
    }
  }

  async function confirmSuggestedLine(index) {
    const line = state.latestImport?.lines?.[index];
    const m = line?.match || {};
    if (!m.productId) return;
    if (!window.confirm(`Confirm that "${m.productTitle}" is the correct Shopify product for "${line.title}"?`)) return;
    return assignLine(index, m);
  }

  async function assignLine(index, product) {
    syncLineInputs();
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

  function openLineCreateMenu(index) {
    syncLineInputs();
    const line = state.latestImport?.lines?.[index];
    const box = byId(`pci-results-${index}`);
    if (!line || !box) return;
    box.innerHTML = `<div class="pci-create-menu"><h4>Create product from invoice line</h4><p class="pci-muted">Choose URL import if you have a supplier/product page. Choose manual create to pre-fill the manual form. Quick draft creates immediately from invoice data.</p><label class="pci-label">Product URL for this line</label><input id="pci-line-url-${index}" class="pci-input" value="${esc(line.sourceUrl || byId('pci-invoice-supplier-url')?.value || '')}" placeholder="https://supplier.example/product"><div class="pci-actions"><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.prefillUrlFromLine(${index})">Use URL import</button><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.prefillManualFromLine(${index})">Manual create</button><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.createLine(${index})">Quick draft now</button></div></div>`;
  }

  function lineToDraft(index) {
    syncLineInputs();
    const line = state.latestImport?.lines?.[index] || {};
    return {
      title: line.title || line.sku || '',
      vendor: state.latestImport?.supplierName || '',
      price: line.suggestedRetailPrice || '',
      cost: line.unitCost || '',
      compareAtPrice: line.originalUnitPrice || '',
      sku: line.sku || line.supplierProductCode || '',
      barcode: line.barcode || '',
      sourceUrl: line.sourceUrl || '',
      description: `${line.discountLabel ? `Promotion: ${line.discountLabel}. ` : ''}${line.imageDescription ? `Image note: ${line.imageDescription}.` : ''}`,
      tags: ['invoice-import', state.latestImport?.supplierName ? `supplier-${state.latestImport.supplierName}` : ''].filter(Boolean),
      images: line.imageUrl ? [{ src: line.imageUrl, alt: line.title }] : [],
    };
  }

  async function prefillUrlFromLine(index) {
    const url = byId(`pci-line-url-${index}`)?.value.trim() || '';
    window.pciTab('url');
    const draft = lineToDraft(index);
    fillDraftForm('pci-url', { ...draft, sourceUrl: url || draft.sourceUrl });
    if (url) {
      byId('pci-url-input').value = url;
      await scanUrl();
    } else {
      setStatus('pci-url-status', 'Line details have been copied. Add a product URL and scan, or create from these fields.', 'warn');
    }
  }

  function prefillManualFromLine(index) {
    window.pciTab('manual');
    fillDraftForm('pci-manual', lineToDraft(index));
    setStatus('pci-manual-status', 'Invoice line copied into Manual Create. Review fields, tags and metafields before creating.', 'ok');
  }

  async function createLine(index) {
    syncLineInputs();
    const line = state.latestImport?.lines?.[index];
    if (!line || !state.latestImport?._id) return;
    if (!window.confirm(`Create a new Shopify draft product for "${line.title || 'this line'}"?`)) return;
    setStatus('pci-invoice-status', `Creating draft product for ${esc(line.title || 'line')}…`);
    try {
      const data = await api('/shopify/create', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, lineId: line.lineId }) });
      state.latestImport = data.import;
      renderLines(data.import);
      setStatus('pci-invoice-status', `Created Shopify draft product: <strong>${esc(data.product?.title || line.title)}</strong>`, 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Create failed.'), 'err'); }
  }

  async function createPurchaseOrderDraft() {
    if (!state.latestImport?._id) return setStatus('pci-invoice-status', 'Analyse an invoice/order first.', 'warn');
    syncLineInputs();
    setStatus('pci-invoice-status', 'Creating purchase order draft…');
    try {
      const data = await api('/purchase-order/draft', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, lines: state.latestImport.lines }) });
      state.latestImport = data.import;
      renderPoDraft(data.purchaseOrder);
      setStatus('pci-invoice-status', 'Draft PO created. You can now formalise it at the bottom of the invoice import page.', 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'PO draft failed.'), 'err'); }
  }

  async function formalisePurchaseOrderDraft() {
    if (!state.latestImport?._id) return;
    const notes = byId('pci-po-notes')?.value || '';
    setStatus('pci-invoice-status', 'Formalising PO…');
    try {
      const data = await api('/purchase-order/formalise', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, purchaseOrder: { ...(state.latestImport.purchaseOrder || {}), notes } }) });
      state.latestImport = data.import;
      renderPoDraft(data.purchaseOrder);
      setStatus('pci-invoice-status', `PO ${esc(data.purchaseOrder?.poNumber || '')} formalised.`, 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Formalise failed.'), 'err'); }
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
      box.innerHTML = items.length ? `<table class="pci-history"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Source</th><th>Lines</th><th>PO</th></tr></thead><tbody>${items.map((item) => `<tr><td>${esc(new Date(item.createdAt).toLocaleString())}</td><td>${esc(item.type)}</td><td><span class="pci-pill ${item.status === 'created' || item.status === 'matched' ? 'ok' : 'warn'}">${esc(item.status)}</span></td><td>${esc(item.sourceUrl || item.supplierName || item.originalFilename || 'Manual')}</td><td>${esc(item.lines?.length || (item.draft?.title ? 1 : 0))}</td><td>${item.purchaseOrder?.status && item.purchaseOrder.status !== 'none' ? `<span class="pci-pill ${item.purchaseOrder.status === 'formalised' ? 'ok' : 'warn'}">${esc(item.purchaseOrder.status)}</span><br><small>${esc(item.purchaseOrder.poNumber || '')}</small>` : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="pci-status warn">No product imports yet.</div>';
    } catch (error) {
      box.innerHTML = `<div class="pci-status err">${esc(error.message || 'History failed.')}</div>`;
    }
  }

  function init() {
    loadHealth();
    loadMetadata();
    byId('pci-scan-url')?.addEventListener('click', scanUrl);
    byId('pci-analyse-invoice')?.addEventListener('click', analyseInvoice);
    byId('pci-create-manual')?.addEventListener('click', createManualDraft);
    byId('pci-url-suggest-profile')?.addEventListener('click', () => suggestProfile('pci-url'));
    byId('pci-manual-suggest-profile')?.addEventListener('click', () => suggestProfile('pci-manual'));
    byId('pci-url-tags')?.addEventListener('change', () => suggestProfile('pci-url', { quiet: true }));
    byId('pci-manual-tags')?.addEventListener('change', () => suggestProfile('pci-manual', { quiet: true }));
    byId('pci-history-refresh')?.addEventListener('click', () => loadHistory(true));
  }

  window.ProductCreationImportAdmin = { init, scanUrl, analyseInvoice, createCurrentDraft, createManualDraft, searchForLine, confirmSuggestedLine, assignLine, openLineCreateMenu, prefillUrlFromLine, prefillManualFromLine, createLine, createPurchaseOrderDraft, formalisePurchaseOrderDraft, loadHistory, addTag, suggestProfile };
  document.addEventListener('DOMContentLoaded', init);
})();
