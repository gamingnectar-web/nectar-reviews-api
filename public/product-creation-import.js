(function ProductCreationImportAdmin(){
  const state = { latestImport: null, latestDraft: null, historyLoaded: false, poLoaded: false, metadata: null, settings: null, modalLineIndex: null };
  const api = (path, options = {}) => window.adminFetch(`/admin/product-creation-import${path}`, options);
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  const money = (value) => value !== undefined && value !== null && String(value) !== '' ? `${esc(state.latestImport?.currency || byId('pci-invoice-currency')?.value || state.settings?.defaultCurrency || 'GBP')} ${esc(value)}` : '—';
  const compoundId = (prefix, namespace, key) => `${prefix}-mf-${String(namespace).replace(/[^a-z0-9_-]/gi,'_')}-${String(key).replace(/[^a-z0-9_-]/gi,'_')}`;

  function canonicalImageKey(src = '') {
    try {
      const url = new URL(src);
      return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase().replace(/_(\d+x\d+|small|medium|large|master)(?=\.)/i, '')}`;
    } catch (_) {
      return String(src || '').split('?')[0].toLowerCase();
    }
  }

  function imageQualityScore(src = '') {
    let score = 0;
    try {
      const url = new URL(src);
      const width = Number(url.searchParams.get('width') || url.searchParams.get('w') || 0);
      if (width) score += width; else score += 5000;
    } catch (_) {}
    if (/cdn\/shop\/products|product|gallery|media/i.test(src)) score += 1000;
    if (/logo|icon|sprite|avatar|payment|trust|badge/i.test(src)) score -= 10000;
    return score;
  }

  function dedupeImageUrls(urls = []) {
    const best = new Map();
    urls.map((x) => String(x || '').trim()).filter(Boolean).forEach((src) => {
      const key = canonicalImageKey(src);
      const current = best.get(key);
      if (!current || imageQualityScore(src) > imageQualityScore(current)) best.set(key, src);
    });
    return Array.from(best.values());
  }

  function setStatus(id, message, kind = '') {
    const el = byId(id);
    if (!el) return;
    el.className = `pci-status ${kind}`.trim();
    el.innerHTML = message;
  }


  function imageSrcList(draft = {}) {
    return dedupeImageUrls((draft.images || []).map((img) => typeof img === 'string' ? img : img.src).filter(Boolean));
  }

  function imageIsSelected(prefix, src) {
    const selected = new Set((byId(`${prefix}-images`)?.value || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean));
    return selected.has(src);
  }

  function syncImagePickerFromTextarea(prefix) {
    const picker = byId(`${prefix}-image-picker`);
    if (!picker) return;
    picker.querySelectorAll('[data-pci-image-src]').forEach((card) => {
      const src = card.dataset.pciImageSrc || '';
      const selected = imageIsSelected(prefix, src);
      card.classList.toggle('selected', selected);
      const input = card.querySelector('input[type="checkbox"]');
      if (input) input.checked = selected;
    });
  }

  function setSelectedImageUrls(prefix, urls = []) {
    const clean = dedupeImageUrls((urls || []).map((x) => String(x || '').trim()).filter(Boolean));
    const textarea = byId(`${prefix}-images`);
    if (textarea) textarea.value = clean.join('\n');
    const first = byId(`${prefix}-image`);
    if (first) first.value = clean[0] || first.value || '';
    syncImagePickerFromTextarea(prefix);
  }

  function renderImagePicker(prefix, allImages = []) {
    const picker = byId(`${prefix}-image-picker`);
    if (!picker) return;
    const urls = dedupeImageUrls((allImages || []).map((x) => typeof x === 'string' ? x : x.src).filter(Boolean)).slice(0, 80);
    if (!urls.length) {
      picker.innerHTML = '<div class="pci-status warn">No product images found yet. Add image URLs manually above.</div>';
      return;
    }
    picker.innerHTML = `<div class="pci-image-picker-head"><strong>Select images to import</strong><span class="pci-muted">Click images to include/exclude them. Only selected images are sent to Shopify.</span><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.selectAllImages('${prefix}')">Select all</button><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.clearImages('${prefix}')">Clear</button></div><div class="pci-image-picker-grid">${urls.map((src, idx) => `<button type="button" class="pci-image-choice ${imageIsSelected(prefix, src) ? 'selected' : ''}" data-pci-image-src="${esc(src)}" onclick="window.ProductCreationImportAdmin.toggleImageSelectionFromCard('${prefix}', this)"><input type="checkbox" ${imageIsSelected(prefix, src) ? 'checked' : ''} tabindex="-1"><img src="${esc(src)}" alt="Product image ${idx + 1}"><span>${idx + 1}</span></button>`).join('')}</div>`;
  }

  function toggleImageSelection(prefix, src) {
    const current = new Set((byId(`${prefix}-images`)?.value || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean));
    if (current.has(src)) current.delete(src); else current.add(src);
    setSelectedImageUrls(prefix, Array.from(current));
  }

  function toggleImageSelectionFromCard(prefix, el) { toggleImageSelection(prefix, el?.dataset?.pciImageSrc || ''); }

  function selectAllImages(prefix) {
    const urls = Array.from(document.querySelectorAll(`#${prefix}-image-picker [data-pci-image-src]`)).map((el) => el.dataset.pciImageSrc).filter(Boolean);
    setSelectedImageUrls(prefix, urls);
  }

  function clearImages(prefix) { setSelectedImageUrls(prefix, []); }

  function parseImageUrls(prefix) {
    const first = byId(`${prefix}-image`)?.value.trim() || '';
    const raw = byId(`${prefix}-images`)?.value || '';
    const urls = raw.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    const title = byId(`${prefix}-title`)?.value.trim() || 'Imported product';
    return dedupeImageUrls([first, ...urls].filter(Boolean)).map((src, idx) => ({ src, alt: idx === 0 ? title : `${title} product image ${idx + 1}` }));
  }

  function getVisibleMetafieldDefinitions() {
    const defs = state.metadata?.metafieldDefinitions || [];
    const coreKeys = new Set(['core.formula_version','core.grouped_profiles','core.sourness','core.sweetness','core.flavour_profile']);
    return defs
      .filter((definition) => coreKeys.has(`${definition.namespace}.${definition.key}`) || !definition.namespace?.startsWith('shopify'))
      .slice(0, 100);
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
    return {
      title: byId(`${prefix}-title`)?.value.trim() || '',
      handle: byId(`${prefix}-handle`)?.value.trim() || '',
      vendor: byId(`${prefix}-vendor`)?.value.trim() || '',
      productType: byId(`${prefix}-type`)?.value.trim() || '',
      handleFormat: byId(`${prefix}-handle-format`)?.value.trim() || '',
      handleLocation: byId(`${prefix}-handle-location`)?.value.trim() || '',
      price: byId(`${prefix}-price`)?.value.trim() || '',
      compareAtPrice: byId(`${prefix}-compare`)?.value.trim() || '',
      cost: byId(`${prefix}-cost`)?.value.trim() || '',
      sku: byId(`${prefix}-sku`)?.value.trim() || '',
      barcode: byId(`${prefix}-barcode`)?.value.trim() || '',
      weight: byId(`${prefix}-weight`)?.value.trim() || '',
      weightUnit: byId(`${prefix}-weight-unit`)?.value.trim() || 'g',
      sourceUrl: byId(`${prefix}-source`)?.value.trim() || '',
      description: byId(`${prefix}-description`)?.value.trim() || '',
      tags: (byId(`${prefix}-tags`)?.value || '').split(',').map((x) => x.trim()).filter(Boolean),
      images: parseImageUrls(prefix),
      saveImagesToFiles: Boolean(state.settings?.imageRules?.saveSelectedImagesToFiles),
      metafields: readMetafields(prefix),
    };
  }

  function renderDataLists() {
    const tags = state.metadata?.tags || [];
    const datalist = byId('pci-tag-list');
    if (datalist) datalist.innerHTML = tags.slice(0, 250).map((item) => `<option value="${esc(item.tag || item)}"></option>`).join('');
    const vendors = [...(state.metadata?.vendors || []).map((v) => v.vendor || v), ...(state.settings?.vendorPresets || [])];
    const vendorList = byId('pci-vendor-list');
    if (vendorList) vendorList.innerHTML = Array.from(new Set(vendors.filter(Boolean))).slice(0, 250).map((vendor) => `<option value="${esc(vendor)}"></option>`).join('');
    const mfList = byId('pci-metafield-list');
    if (mfList) mfList.innerHTML = (state.metadata?.metafieldDefinitions || []).slice(0, 250).map((mf) => `<option value="${esc(mf.namespace + '.' + mf.key)}">${esc(mf.name || '')}</option>`).join('');
  }

  function renderTagChips(prefix) {
    const target = byId(`${prefix}-tag-suggestions`);
    if (!target) return;
    renderDataLists();
    const tags = state.metadata?.tags || [];
    if (!tags.length) { target.innerHTML = '<small class="pci-muted">No previous tags loaded yet.</small>'; return; }
    target.innerHTML = tags.slice(0, 28).map((item) => `<button type="button" class="pci-chip" onclick="window.ProductCreationImportAdmin.addTag('${prefix}', '${esc(String(item.tag || item).replace(/'/g, "\\'"))}')">${esc(item.tag || item)}</button>`).join('');
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
      const formulaHelp = compound === 'core.formula_version' ? '<small class="pci-muted">This field is used by SKU/settings rules for product-line logic such as EN / EN2.</small>' : (['core.sourness','core.sweetness'].includes(compound) ? '<small class="pci-muted">Use a 1-5 gauge. 1 = very low, 3 = medium, 5 = very high.</small>' : '');
      return `<div class="pci-mf-field ${isCore ? 'core' : ''}">
        <label class="pci-label" for="${compoundId(prefix, definition.namespace, definition.key)}">${esc(definition.name || compound)} <span>${esc(compound)}</span></label>
        <input id="${compoundId(prefix, definition.namespace, definition.key)}" class="pci-input" data-pci-mf-prefix="${prefix}" data-namespace="${esc(definition.namespace)}" data-key="${esc(definition.key)}" data-type="${esc(definition.type || 'single_line_text_field')}" data-label="${esc(definition.name || '')}" value="${esc(current.value || '')}" placeholder="${esc(definition.description || definition.help || '')}">
        ${formulaHelp}
      </div>`;
    }).join('');
  }

  function fillDraftForm(prefix, draft = {}) {
    const images = imageSrcList(draft);
    const firstImage = images[0] || draft.imageUrl || '';
    [['title', draft.title], ['handle', draft.handle], ['vendor', draft.vendor], ['type', draft.productType], ['handle-format', draft.handleFormat || state.settings?.handleRules?.format || ''], ['handle-location', draft.handleLocation || state.settings?.handleRules?.location || ''], ['price', draft.price], ['compare', draft.compareAtPrice], ['cost', draft.cost], ['sku', draft.sku], ['barcode', draft.barcode], ['weight', draft.weight], ['weight-unit', draft.weightUnit || 'g'], ['source', draft.sourceUrl], ['description', (draft.description || draft.descriptionHtml || '').replace(/<[^>]+>/g, '')], ['tags', Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags], ['image', firstImage], ['images', images.join('\n')]].forEach(([key, value]) => {
      const el = byId(`${prefix}-${key}`);
      if (el) el.value = value || '';
    });
    renderTagChips(prefix);
    renderMetafieldFields(prefix, draft);
    renderImagePicker(prefix, images);
  }

  function renderDraft(prefix, draft, targetId) {
    state.latestDraft = draft;
    fillDraftForm(prefix, draft);
    const images = imageSrcList(draft);
    const target = byId(targetId);
    if (!target) return;
    const thumbs = images.length ? `<div class="pci-thumb-row">${images.slice(0, 12).map((src) => `<img src="${esc(src)}" alt="">`).join('')}${images.length > 12 ? `<span class="pci-pill">+${images.length - 12} more</span>` : ''}</div>` : '<div class="pci-line-img"></div>';
    target.innerHTML = `<div class="pci-draft"><div>${thumbs}</div><div><h3>${esc(draft.title || 'Product draft')}</h3><p class="pci-muted">Review price, compare-at price, handle, SKU, tags, images and metafields, then create as a Shopify draft product. Nothing is published automatically.</p><p class="pci-muted"><strong>Images:</strong> ${parseImageUrls(prefix).length || 0} selected of ${images.length || 0} found. Only selected images will be sent to Shopify.</p>${draft.enrichment?.aiNotes ? `<p class="pci-muted"><strong>AI note:</strong> ${esc(draft.enrichment.aiNotes)}</p>` : ''}<div class="pci-actions"><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.suggestProfile('${prefix}')">Generate tags, SKU & metafields</button><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.createCurrentDraft('${prefix}')">Create Shopify draft product</button></div></div></div>`;
  }

  async function fileToCompressedDataUrl(file) {
    if (!file) return '';
    if (!/^image\//i.test(file.type)) return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(file); });
    const original = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = reject; r.readAsDataURL(file); });
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; });
    const max = 1800;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
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
      if (state.latestImport.lines[index] && field) {
        state.latestImport.lines[index][field] = input.value;
        if (field === 'poLineType') {
          state.latestImport.lines[index].includeInPurchaseOrder = input.value === 'stock';
          if (!state.latestImport.lines[index].poTreatmentNote) {
            state.latestImport.lines[index].poTreatmentNote = input.value === 'non_stock_charge' ? 'Non-stock charge / insurance. Keep as cost only.' : input.value === 'landing_item' ? 'Unknown/mystery landed item. Exclude from stock PO until identified.' : input.value === 'excluded' ? 'Removed from PO by merchant.' : '';
          }
        }
      }
    });
    return state.latestImport.lines;
  }

  function syncInvoiceMetaInputs() {
    if (!state.latestImport) return;
    state.latestImport.supplierName = byId('pci-invoice-supplier-name')?.value.trim() || state.latestImport.supplierName || '';
    state.latestImport.supplierUrl = byId('pci-invoice-supplier-url')?.value.trim() || state.latestImport.supplierUrl || '';
    state.latestImport.currency = byId('pci-invoice-currency')?.value.trim() || state.latestImport.currency || state.settings?.defaultCurrency || 'GBP';
    state.latestImport.discountTotal = byId('pci-invoice-discount-total')?.value.trim() || state.latestImport.discountTotal || '';
    state.latestImport.shippingTotal = byId('pci-invoice-shipping-total')?.value.trim() || state.latestImport.shippingTotal || '';
    state.latestImport.taxTotal = byId('pci-invoice-tax-total')?.value.trim() || state.latestImport.taxTotal || '';
  }

  function fillInvoiceMeta(importDoc = {}) {
    if (byId('pci-invoice-supplier-name')) byId('pci-invoice-supplier-name').value = importDoc.supplierName || byId('pci-invoice-supplier-name').value || '';
    if (byId('pci-invoice-supplier-url')) byId('pci-invoice-supplier-url').value = importDoc.supplierUrl || byId('pci-invoice-supplier-url').value || '';
    if (byId('pci-invoice-currency')) byId('pci-invoice-currency').value = importDoc.currency || byId('pci-invoice-currency').value || state.settings?.defaultCurrency || 'GBP';
    if (byId('pci-invoice-discount-total')) byId('pci-invoice-discount-total').value = importDoc.discountTotal || importDoc.poLevelDiscount || byId('pci-invoice-discount-total').value || '';
    if (byId('pci-invoice-shipping-total')) byId('pci-invoice-shipping-total').value = importDoc.shippingTotal || byId('pci-invoice-shipping-total').value || '';
    if (byId('pci-invoice-tax-total')) byId('pci-invoice-tax-total').value = importDoc.taxTotal || byId('pci-invoice-tax-total').value || '';
  }


  function poLineTypeLabel(type) {
    return ({ stock: 'Stock product', non_stock_charge: 'Non-stock cost / insurance', landing_item: 'Landing item / unknown', excluded: 'Remove from PO' })[type || 'stock'] || 'Stock product';
  }

  function poLineTypeNote(type) {
    return ({
      stock: 'Include as product stock in the PO.',
      non_stock_charge: 'Keep the cost for reconciliation, but do not create stock.',
      landing_item: 'Do not add to the PO yet; add manually when the actual landed item is known.',
      excluded: 'Completely exclude from the PO product lines.'
    })[type || 'stock'] || '';
  }

  async function setLinePoTreatment(index, poLineType = 'stock') {
    syncLineInputs();
    const line = state.latestImport?.lines?.[index];
    if (!line) return;
    line.poLineType = poLineType;
    line.includeInPurchaseOrder = poLineType === 'stock';
    line.poTreatmentNote = poLineTypeNote(poLineType);
    if (!state.latestImport?._id) return renderLines(state.latestImport);
    setStatus('pci-invoice-status', `Updating PO treatment for ${esc(line.title || 'line')}…`);
    try {
      const data = await api('/purchase-order/line-treatment', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, lineId: line.lineId, poLineType, includeInPurchaseOrder: poLineType === 'stock', poTreatmentNote: line.poTreatmentNote }) });
      state.latestImport = data.import;
      renderLines(state.latestImport);
      if (data.purchaseOrder?.status === 'draft' || data.purchaseOrder?.status === 'formalised') renderPoDraft(data.purchaseOrder);
      setStatus('pci-invoice-status', `${esc(line.title || 'Line')} set to ${esc(poLineTypeLabel(poLineType))}. Rebuild/formalise the internal PO when ready.`, 'ok');
      state.poLoaded = false;
      state.historyLoaded = false;
    } catch (error) {
      setStatus('pci-invoice-status', esc(error.message || 'Could not update PO treatment.'), 'err');
    }
  }

  function setLinePoTreatmentById(lineId, poLineType = 'excluded') {
    const index = (state.latestImport?.lines || []).findIndex((line) => String(line.lineId) === String(lineId));
    if (index >= 0) return setLinePoTreatment(index, poLineType);
    setStatus('pci-invoice-status', 'Could not find that source invoice line. Open the original invoice import and rebuild the PO.', 'warn');
  }

  function renderLines(importDoc) {
    fillInvoiceMeta(importDoc || {});
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
      const poType = line.poLineType || (line.includeInPurchaseOrder === false ? 'excluded' : 'stock');
      const removed = poType !== 'stock' || line.includeInPurchaseOrder === false;
      return `<div class="pci-line ${removed ? 'pci-line-excluded' : ''}" data-line-id="${esc(line.lineId)}"><div>${image ? `<img class="pci-line-img" src="${esc(image)}" alt="">` : '<div class="pci-line-img"></div>'}</div><div><h4>${esc(line.title || line.sku || 'Invoice product line')} ${removed ? `<span class="pci-pill warn">${esc(poLineTypeLabel(poType))}</span>` : ''}</h4><small>SKU: ${esc(line.sku || line.supplierProductCode || '—')} · Barcode: ${esc(line.barcode || '—')}</small><small>Match: <span class="pci-pill ${matchClass}">${esc(m.status || 'unmatched')}</span> ${esc(m.productTitle || m.reason || '')} ${link ? `<a class="pci-shopify-link" href="${esc(link)}" target="_blank">Open Shopify ↗</a>` : ''}</small>${imageHint ? `<small>Image hint: ${esc(imageHint)}</small>` : ''}${line.poTreatmentNote ? `<small>PO treatment: ${esc(line.poTreatmentNote)}</small>` : ''}
        <div class="pci-line-edit-grid">
          <label>Qty<input class="pci-input pci-line-field" data-index="${index}" data-field="quantity" value="${esc(line.quantity || 1)}"></label>
          <label>Price paid / unit cost after discount<input class="pci-input pci-line-field" data-index="${index}" data-field="unitCost" value="${esc(line.unitCost || '')}"></label>
          <label>Compare-at / original unit price<input class="pci-input pci-line-field" data-index="${index}" data-field="originalUnitPrice" value="${esc(line.originalUnitPrice || '')}"></label>
          <label>Line/product discount total<input class="pci-input pci-line-field" data-index="${index}" data-field="discountAmount" value="${esc(line.discountAmount || '')}"></label>
          <label>Promo label<input class="pci-input pci-line-field" data-index="${index}" data-field="discountLabel" value="${esc(line.discountLabel || '')}"></label>
          <label>Retail price<input class="pci-input pci-line-field" data-index="${index}" data-field="suggestedRetailPrice" value="${esc(line.suggestedRetailPrice || '')}"></label>
          <label>PO treatment<select class="pci-input pci-line-field" data-index="${index}" data-field="poLineType"><option value="stock" ${poType === 'stock' ? 'selected' : ''}>Stock product</option><option value="non_stock_charge" ${poType === 'non_stock_charge' ? 'selected' : ''}>Non-stock cost / insurance</option><option value="landing_item" ${poType === 'landing_item' ? 'selected' : ''}>Landing item / unknown</option><option value="excluded" ${poType === 'excluded' ? 'selected' : ''}>Remove from PO</option></select></label>
        </div><div id="pci-results-${index}" class="pci-search-results"></div></div><div class="pci-actions pci-line-actions"><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.searchForLine(${index})">Search store</button>${m.status === 'suggested' && m.productId ? `<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.confirmSuggestedLine(${index})">Confirm match</button>` : ''}<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.openLineCreateMenu(${index})">Create…</button><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.setLinePoTreatment(${index}, 'non_stock_charge')">Non-stock cost</button><button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.setLinePoTreatment(${index}, 'landing_item')">Landing later</button><button type="button" class="secondary-btn danger" onclick="window.ProductCreationImportAdmin.setLinePoTreatment(${index}, 'excluded')">Remove from PO</button>${removed ? `<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.setLinePoTreatment(${index}, 'stock')">Put back in PO</button>` : ''}</div></div>`;
    }).join('')}<div class="pci-po-actions"><button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.createPurchaseOrderDraft()">Create draft PO</button><span class="pci-muted">Creates a PO draft using vendor, currency, quantities, gross product cost, line/product discounts and matched/created products.</span></div><div id="pci-po-draft"></div>`;
    if (importDoc.purchaseOrder?.status === 'draft' || importDoc.purchaseOrder?.status === 'formalised') renderPoDraft(importDoc.purchaseOrder);
  }

  function renderPoDraft(po) {
    const target = byId('pci-po-draft');
    if (!target || !po) return;
    const rows = po.lines || [];
    const excludedRows = po.excludedLines || [];
    const productRows = rows.length ? rows.map((line) => `<tr><td><strong>${esc(line.title)}</strong><br><small>${esc(line.sku || line.productTitle || '')}</small></td><td>${esc(line.quantity)}</td><td>${money(line.grossUnitCost || line.originalUnitPrice || line.unitCost)}</td><td>${money(line.netUnitCost || line.unitCost)}</td><td>${line.lineDiscountTotal || line.discountAmount ? money(line.lineDiscountTotal || line.discountAmount) : '—'}<br><small>${esc(line.discountLabel || '')}</small></td><td>${money(line.netLineTotal || line.totalCost)}</td><td><span class="pci-pill ${['assigned','created'].includes(line.matchStatus) ? 'ok' : 'warn'}">${esc(line.matchStatus)}</span></td><td><button type="button" class="secondary-btn danger" onclick="window.ProductCreationImportAdmin.setLinePoTreatmentById('${esc(line.lineId || '')}', 'excluded')">Remove</button></td></tr>`).join('') : '<tr><td colspan="8"><span class="pci-muted">No stock product lines are currently included in this PO.</span></td></tr>';
    const excludedTable = excludedRows.length ? `<div class="pci-po-excluded"><h4>Not included as stock</h4><p class="pci-muted">These rows are kept out of the product stock PO. Non-stock costs can still be mentioned in the prompt for reconciliation; mystery/landing rows can be added later once the landed item is known.</p><table class="pci-history"><thead><tr><th>Line</th><th>Type</th><th>Qty</th><th>Amount</th><th>Reason</th><th>Action</th></tr></thead><tbody>${excludedRows.map((line) => `<tr><td><strong>${esc(line.title)}</strong><br><small>${esc(line.discountLabel || '')}</small></td><td><span class="pci-pill warn">${esc(poLineTypeLabel(line.poLineType))}</span></td><td>${esc(line.quantity || 1)}</td><td>${money(line.netLineTotal || line.totalCost)}</td><td><small>${esc(line.poTreatmentNote || line.note || '')}</small></td><td><button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.setLinePoTreatmentById('${esc(line.lineId || '')}', 'stock')">Put back in PO</button></td></tr>`).join('')}</tbody></table></div>` : '';
    target.innerHTML = `<div class="pci-po-card"><div class="pci-po-head"><div><h3>Internal Draft PO: ${esc(po.poNumber || 'Purchase Order')}</h3><p class="pci-muted">This is an internal supplier PO record inside the app. Shopify's visible Purchase Orders screen cannot currently be created through the public Admin API. Use Remove/Non-stock/Landing to keep mystery items and insurance out of the stock product lines before creating the prompt.</p></div><span class="pci-pill ${po.status === 'formalised' ? 'ok' : 'warn'}">${esc(po.status || 'draft')}</span></div><div class="pci-form-grid"><div><label class="pci-label">Supplier / Vendor</label><input id="pci-po-supplier-name" class="pci-input" value="${esc(po.supplierName || '')}"></div><div><label class="pci-label">Currency</label><input id="pci-po-currency" class="pci-input" value="${esc(po.currency || 'GBP')}"></div></div><table class="pci-history"><thead><tr><th>Product</th><th>Qty</th><th>Gross/unit</th><th>Paid/unit</th><th>Product discount</th><th>Net line</th><th>Match</th><th>Action</th></tr></thead><tbody>${productRows}</tbody></table>${excludedTable}<div class="pci-po-totals"><span>Gross product subtotal <strong>${money(po.grossSubtotal || po.subtotal)}</strong></span><span>Product discounts <strong>${money(po.productDiscountTotal || po.lineDiscountTotal)}</strong></span><span>Extra order discount <strong>${money(po.orderLevelDiscount || '')}</strong></span><span>Net stock product cost <strong>${money(po.netProductSubtotal)}</strong></span><span>Non-stock charges <strong>${money(po.nonStockChargesTotal)}</strong></span><span>Removed/landing lines <strong>${money(po.removedLinesTotal)}</strong></span><span>Shipping <strong>${money(po.shippingTotal)}</strong></span><span>Tax <strong>${money(po.taxTotal)}</strong></span><span>Total <strong>${money(po.total)}</strong></span></div><label class="pci-label">PO notes</label><textarea id="pci-po-notes" class="pci-textarea">${esc(po.notes || '')}</textarea><div class="pci-actions">${po.status === 'formalised' ? `<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.createPurchaseOrderPrompt()">Create prompt</button><span class="pci-muted">Copies stock lines, exclusions, non-stock charges and final paid totals into a prompt you can paste into Shopify.</span>` : `<button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.formalisePurchaseOrderDraft()">Formalise internal PO</button>`}</div></div>`;
  }


  window.pciTab = function(name) {
    document.querySelectorAll('#v-product-creation-import .pci-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.pciTab === name));
    document.querySelectorAll('#v-product-creation-import .pci-pane').forEach((pane) => pane.classList.toggle('active', pane.id === `pci-pane-${name}`));
    if (name === 'history') window.ProductCreationImportAdmin.loadHistory();
    if (name === 'po') window.ProductCreationImportAdmin.loadPurchaseOrders(true);
    if (name === 'metafields') window.ProductCreationImportAdmin.loadSettings(true);
    if (name === 'settings') window.ProductCreationImportAdmin.loadSettings(true);
  };

  async function loadHealth() {
    const box = byId('pci-health');
    if (!box) return;
    try {
      const data = await api('/health');
      const connected = data.shopify?.connected;
      const missingScopes = data.shopify?.missingRequiredScopes || [];
      const scopeNote = missingScopes.length ? `<br><strong>Missing scopes:</strong> ${esc(missingScopes.join(', '))}` : '';
      box.innerHTML = `<strong>Shopify:</strong> ${connected ? (missingScopes.length ? 'Connected, scope update needed' : 'Connected') : 'Needs OAuth'}<br><strong>Invoice vision:</strong> ${data.invoiceVision ? 'OPENAI_API_KEY ready' : 'Fallback mode'}${scopeNote}<br><span class="pci-muted">${esc(data.shopify?.message || '')}</span>${(!connected || missingScopes.length) && data.shopify?.installUrl ? `<div class="pci-actions"><button class="primary-btn" onclick="window.openSecureAdminSession()">Reconnect Shopify</button></div>` : ''}`;
      box.className = `pci-status ${connected && !missingScopes.length ? 'ok' : 'warn'}`;
    } catch (error) {
      setStatus('pci-health', esc(error.message || 'Could not load product import status.'), 'err');
    }
  }

  async function loadMetadata() {
    try {
      state.metadata = await api('/metadata');
      state.settings = state.metadata.settings || state.settings;
      renderDataLists();
      if (byId('pci-invoice-currency') && state.settings?.defaultCurrency) byId('pci-invoice-currency').value = state.settings.defaultCurrency;
      ['pci-url','pci-manual'].forEach((prefix) => { renderTagChips(prefix); renderMetafieldFields(prefix, draftFromForm(prefix)); });
      renderSettings();
    } catch (error) {
      state.metadata = { tags: [], vendors: [], metafieldDefinitions: [] };
    }
  }

  async function loadSettings(force = false) {
    if (state.settings && !force) return state.settings;
    try {
      const data = await api('/settings');
      state.settings = data.settings || {};
      renderSettings();
      renderDataLists();
      setStatus('pci-settings-status', 'Settings loaded.', 'ok');
      return state.settings;
    } catch (error) {
      setStatus('pci-settings-status', esc(error.message || 'Could not load settings.'), 'err');
      return null;
    }
  }

  function skuRuleRow(rule = {}, index) {
    return `<div class="pci-rule-row" data-sku-rule-index="${index}">
      <label>Name<input class="pci-input pci-sku-rule" data-field="name" value="${esc(rule.name || '')}"></label>
      <label>Vendor contains<input class="pci-input pci-sku-rule" data-field="vendorContains" value="${esc(rule.vendorContains || '')}" list="pci-vendor-list"></label>
      <label>Vendor code<input class="pci-input pci-sku-rule" data-field="vendorCode" value="${esc(rule.vendorCode || '')}" placeholder="GFUEL"></label>
      <label>Formula/product line contains<input class="pci-input pci-sku-rule" data-field="productLineContains" value="${esc(rule.productLineContains || '')}" placeholder="EN / EN2"></label>
      <label>Line code<input class="pci-input pci-sku-rule" data-field="lineCode" value="${esc(rule.lineCode || '')}" placeholder="EN"></label>
      <label>Tag contains<input class="pci-input pci-sku-rule" data-field="tagContains" value="${esc(rule.tagContains || '')}"></label>
      <label>Template<input class="pci-input pci-sku-rule" data-field="template" value="${esc(rule.template || '{vendorCode}-{lineCode}-{titleCode}')}"></label>
      <label class="pci-check"><input type="checkbox" class="pci-sku-rule" data-field="overwriteExistingSku" ${rule.overwriteExistingSku ? 'checked' : ''}> Overwrite existing SKU</label>
      <label class="pci-check"><input type="checkbox" class="pci-sku-rule" data-field="enabled" ${rule.enabled === false ? '' : 'checked'}> Enabled</label>
      <button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.removeSkuRule(${index})">Remove</button>
    </div>`;
  }

  function conditionalRuleRow(rule = {}, index) {
    return `<div class="pci-rule-row" data-conditional-rule-index="${index}">
      <label>Name<input class="pci-input pci-conditional-rule" data-field="name" value="${esc(rule.name || '')}"></label>
      <label>When field<input class="pci-input pci-conditional-rule" data-field="whenField" value="${esc(rule.whenField || 'title')}" placeholder="title, vendor, tags, metafield:core.formula_version"></label>
      <label>Operator<select class="pci-input pci-conditional-rule" data-field="operator"><option ${rule.operator === 'contains' ? 'selected' : ''}>contains</option><option ${rule.operator === 'equals' ? 'selected' : ''}>equals</option><option ${rule.operator === 'starts_with' ? 'selected' : ''}>starts_with</option><option ${rule.operator === 'ends_with' ? 'selected' : ''}>ends_with</option><option ${rule.operator === 'exists' ? 'selected' : ''}>exists</option></select></label>
      <label>Value<input class="pci-input pci-conditional-rule" data-field="value" value="${esc(rule.value || '')}"></label>
      <label>Action<select class="pci-input pci-conditional-rule" data-field="actionType"><option value="add_tag" ${rule.actionType === 'add_tag' ? 'selected' : ''}>add_tag</option><option value="set_product_type" ${rule.actionType === 'set_product_type' ? 'selected' : ''}>set_product_type</option><option value="set_vendor" ${rule.actionType === 'set_vendor' ? 'selected' : ''}>set_vendor</option><option value="set_metafield" ${rule.actionType === 'set_metafield' ? 'selected' : ''}>set_metafield</option><option value="title_prefix" ${rule.actionType === 'title_prefix' ? 'selected' : ''}>title_prefix</option><option value="title_suffix" ${rule.actionType === 'title_suffix' ? 'selected' : ''}>title_suffix</option></select></label>
      <label>Action target<input class="pci-input pci-conditional-rule" data-field="actionTarget" value="${esc(rule.actionTarget || '')}" placeholder="core.formula_version"></label>
      <label>Action value<input class="pci-input pci-conditional-rule" data-field="actionValue" value="${esc(rule.actionValue || '')}"></label>
      <label class="pci-check"><input type="checkbox" class="pci-conditional-rule" data-field="enabled" ${rule.enabled === false ? '' : 'checked'}> Enabled</label>
      <button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.removeConditionalRule(${index})">Remove</button>
    </div>`;
  }


  function metafieldMappingRuleRow(rule = {}, index) {
    return `<div class="pci-rule-row pci-mf-map-row" data-metafield-rule-index="${index}">
      <label>Name<input class="pci-input pci-metafield-rule" data-field="name" value="${esc(rule.name || '')}"></label>
      <label>Vendor contains<input class="pci-input pci-metafield-rule" data-field="vendorContains" value="${esc(rule.vendorContains || '')}" list="pci-vendor-list"></label>
      <label>Product category/type contains<input class="pci-input pci-metafield-rule" data-field="productTypeContains" value="${esc(rule.productTypeContains || '')}"></label>
      <label>Tag contains<input class="pci-input pci-metafield-rule" data-field="tagContains" value="${esc(rule.tagContains || '')}" list="pci-tag-list"></label>
      <label>Title contains<input class="pci-input pci-metafield-rule" data-field="titleContains" value="${esc(rule.titleContains || '')}"></label>
      <label>Metafield<input class="pci-input pci-metafield-rule" data-field="target" value="${esc(rule.target || '')}" list="pci-metafield-list" placeholder="core.flavour_profile"></label>
      <label>Mode<select class="pci-input pci-metafield-rule" data-field="mode"><option value="fixed" ${rule.mode === 'fixed' ? 'selected' : ''}>fixed/manual value</option><option value="ai" ${rule.mode === 'ai' ? 'selected' : ''}>ask AI from page/images</option><option value="copy_from_similar" ${rule.mode === 'copy_from_similar' ? 'selected' : ''}>copy common value from similar products</option></select></label>
      <label>Value / AI instruction<input class="pci-input pci-metafield-rule" data-field="value" value="${esc(rule.value || '')}" placeholder="e.g. Find calories from label image"></label>
      <label class="pci-check"><input type="checkbox" class="pci-metafield-rule" data-field="enabled" ${rule.enabled === false ? '' : 'checked'}> Enabled</label>
      <button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.removeMetafieldRule(${index})">Remove</button>
    </div>`;
  }

  function renderSettings() {
    const settings = state.settings || {};
    if (byId('pci-settings-handle-pattern')) byId('pci-settings-handle-pattern').value = settings.handleRules?.pattern || '{vendor}-{title}-{format}-{location}';
    if (byId('pci-settings-handle-format')) byId('pci-settings-handle-format').value = settings.handleRules?.format || 'tub';
    if (byId('pci-settings-handle-location')) byId('pci-settings-handle-location').value = settings.handleRules?.location || 'uk';
    if (byId('pci-settings-handle-prefix')) byId('pci-settings-handle-prefix').value = settings.handleRules?.prefix || '';
    if (byId('pci-settings-handle-suffix')) byId('pci-settings-handle-suffix').value = settings.handleRules?.suffix || '';
    if (byId('pci-settings-handle-max')) byId('pci-settings-handle-max').value = settings.handleRules?.maxLength || 180;
    if (byId('pci-settings-handle-overwrite')) byId('pci-settings-handle-overwrite').checked = Boolean(settings.handleRules?.overwriteExistingHandle);
    if (byId('pci-settings-default-currency')) byId('pci-settings-default-currency').value = settings.defaultCurrency || 'GBP';
    if (byId('pci-settings-vendors')) byId('pci-settings-vendors').value = (settings.vendorPresets || []).join('\n');
    if (byId('pci-settings-save-images-files')) byId('pci-settings-save-images-files').checked = Boolean(settings.imageRules?.saveSelectedImagesToFiles);
    if (byId('pci-settings-generate-alt')) byId('pci-settings-generate-alt').checked = settings.imageRules?.generateSeoAltText !== false;
    const skuBox = byId('pci-sku-rules');
    if (skuBox) skuBox.innerHTML = (settings.skuRules || []).map(skuRuleRow).join('') || '<div class="pci-status warn">No SKU rules yet.</div>';
    const condBox = byId('pci-conditional-rules');
    if (condBox) condBox.innerHTML = (settings.conditionalRules || []).map(conditionalRuleRow).join('') || '<div class="pci-status warn">No conditional rules yet.</div>';
    const mfBox = byId('pci-metafield-mapping-rules');
    if (mfBox) mfBox.innerHTML = (settings.metafieldMappingRules || []).map(metafieldMappingRuleRow).join('') || '<div class="pci-status warn">No metafield mapping rules yet. Add rules that map categories/tags to Shopify product metafields.</div>';
  }

  function collectSettings() {
    const skuRules = Array.from(document.querySelectorAll('[data-sku-rule-index]')).map((row) => {
      const rule = {};
      row.querySelectorAll('.pci-sku-rule').forEach((input) => { rule[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value; });
      return rule;
    });
    const conditionalRules = Array.from(document.querySelectorAll('[data-conditional-rule-index]')).map((row) => {
      const rule = {};
      row.querySelectorAll('.pci-conditional-rule').forEach((input) => { rule[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value; });
      return rule;
    });
    const metafieldMappingRules = Array.from(document.querySelectorAll('[data-metafield-rule-index]')).map((row) => {
      const rule = {};
      row.querySelectorAll('.pci-metafield-rule').forEach((input) => { rule[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value; });
      return rule;
    });
    return {
      handleRules: {
        pattern: byId('pci-settings-handle-pattern')?.value || '{vendor}-{title}-{format}-{location}',
        format: byId('pci-settings-handle-format')?.value || '',
        location: byId('pci-settings-handle-location')?.value || '',
        prefix: byId('pci-settings-handle-prefix')?.value || '',
        suffix: byId('pci-settings-handle-suffix')?.value || '',
        maxLength: byId('pci-settings-handle-max')?.value || 180,
        overwriteExistingHandle: Boolean(byId('pci-settings-handle-overwrite')?.checked),
      },
      defaultCurrency: byId('pci-settings-default-currency')?.value || 'GBP',
      vendorPresets: (byId('pci-settings-vendors')?.value || '').split(/\n+/).map((x) => x.trim()).filter(Boolean),
      imageRules: {
        saveSelectedImagesToFiles: Boolean(byId('pci-settings-save-images-files')?.checked),
        generateSeoAltText: byId('pci-settings-generate-alt') ? Boolean(byId('pci-settings-generate-alt')?.checked) : true,
        dedupeByCanonicalUrl: true,
      },
      skuRules,
      conditionalRules,
      metafieldMappingRules,
    };
  }

  function addSkuRule() { state.settings = { ...(state.settings || {}), skuRules: [...(state.settings?.skuRules || []), { enabled: true, template: '{vendorCode}-{lineCode}-{titleCode}' }] }; renderSettings(); }
  function removeSkuRule(index) { state.settings = collectSettings(); state.settings.skuRules.splice(index, 1); renderSettings(); }
  function addConditionalRule() { state.settings = { ...(state.settings || {}), conditionalRules: [...(state.settings?.conditionalRules || []), { enabled: true, whenField: 'title', operator: 'contains', actionType: 'add_tag' }] }; renderSettings(); }
  function removeConditionalRule(index) { state.settings = collectSettings(); state.settings.conditionalRules.splice(index, 1); renderSettings(); }
  function addMetafieldRule() { state.settings = { ...(state.settings || {}), metafieldMappingRules: [...(state.settings?.metafieldMappingRules || []), { enabled: true, mode: 'fixed', target: 'core.flavour_profile' }] }; renderSettings(); }
  function removeMetafieldRule(index) { state.settings = collectSettings(); state.settings.metafieldMappingRules.splice(index, 1); renderSettings(); }

  async function saveSettings() {
    const settings = collectSettings();
    setStatus('pci-settings-status', 'Saving product import settings…');
    try {
      const data = await api('/settings', { method: 'POST', body: JSON.stringify({ settings }) });
      state.settings = data.settings;
      renderSettings();
      renderDataLists();
      setStatus('pci-settings-status', 'Settings saved. Future URL/manual/invoice creates will use these handle, SKU and conditional rules.', 'ok');
    } catch (error) { setStatus('pci-settings-status', esc(error.message || 'Settings save failed.'), 'err'); }
  }

  async function suggestProfile(prefix, opts = {}) {
    const draft = draftFromForm(prefix);
    const statusId = prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status';
    if (!opts.quiet) setStatus(statusId, 'Generating product handle, SKU, tags and metafields…');
    try {
      const data = await api('/profile/suggest', { method: 'POST', body: JSON.stringify({ draft }) });
      const suggestion = data.suggestion || {};
      fillDraftForm(prefix, { ...draft, title: suggestion.title || draft.title, handle: suggestion.handle || draft.handle, vendor: suggestion.vendor || draft.vendor, productType: suggestion.productType || draft.productType, sku: suggestion.sku || draft.sku, barcode: suggestion.barcode || draft.barcode, weight: suggestion.weight || draft.weight, weightUnit: suggestion.weightUnit || draft.weightUnit, tags: suggestion.tags || draft.tags, metafields: suggestion.metafields || draft.metafields });
      if (!opts.quiet) setStatus(statusId, `Profile suggestions applied.${suggestion.existingProfileMatchedProducts ? ` Based on ${suggestion.existingProfileMatchedProducts} similar product(s).` : ''}${suggestion.aiNotes ? `<br>${esc(suggestion.aiNotes)}` : ''}`, 'ok');
    } catch (error) {
      if (!opts.quiet) setStatus(statusId, esc(error.message || 'Profile suggestion failed.'), 'err');
    }
  }

  async function scanUrl() {
    const url = byId('pci-url-input')?.value.trim() || '';
    if (!url) return setStatus('pci-url-status', 'Paste a product URL first.', 'warn');
    setStatus('pci-url-status', 'Scanning product page, collecting all gallery images and building product profile…');
    try {
      const data = await api('/url/scan', { method: 'POST', body: JSON.stringify({ url }) });
      state.latestImport = data.import;
      renderDraft('pci-url', data.draft, 'pci-url-draft');
      setStatus('pci-url-status', `Product draft extracted with ${Math.round((data.draft?.confidence || 0) * 100)}% confidence. ${data.draft?.images?.length || 0} image(s) found.`, 'ok');
    } catch (error) { setStatus('pci-url-status', esc(error.message || 'URL scan failed.'), 'err'); }
  }

  async function analyseInvoice() {
    const file = byId('pci-invoice-file')?.files?.[0];
    const notes = byId('pci-invoice-notes')?.value || '';
    const supplierUrl = byId('pci-invoice-supplier-url')?.value || '';
    const supplierName = byId('pci-invoice-supplier-name')?.value || '';
    const currency = byId('pci-invoice-currency')?.value || state.settings?.defaultCurrency || 'GBP';
    const discountTotal = byId('pci-invoice-discount-total')?.value || '';
    const shippingTotal = byId('pci-invoice-shipping-total')?.value || '';
    const taxTotal = byId('pci-invoice-tax-total')?.value || '';
    if (!file && !notes.trim()) return setStatus('pci-invoice-status', 'Upload an invoice/order image or paste invoice line notes first.', 'warn');
    setStatus('pci-invoice-status', 'Reading invoice, looking for thumbnails, discounts and matching Shopify products…');
    try {
      const imageDataUrl = file ? await fileToCompressedDataUrl(file) : '';
      const data = await api('/invoice/analyse', { method: 'POST', body: JSON.stringify({ imageDataUrl, mimeType: file?.type || '', filename: file?.name || '', notes, supplierUrl, supplierName, currency, discountTotal, shippingTotal, taxTotal, autoMatch: true }) });
      state.latestImport = data.import;
      renderLines(data.import);
      setStatus('pci-invoice-status', `${data.import?.lines?.length || 0} product line(s) found.${data.warning ? `<br>${esc(data.warning)}` : ''}`, data.warning ? 'warn' : 'ok');
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Invoice analysis failed.'), 'err'); }
  }


  async function findBarcode(prefix) {
    const draft = draftFromForm(prefix);
    const statusId = prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status';
    if (!draft.title && !draft.sourceUrl) return setStatus(statusId, 'Add a title or source URL first, then search barcode.', 'warn');
    setStatus(statusId, 'Searching source page / configured barcode provider for GTIN/EAN/UPC…');
    try {
      const data = await api('/barcode/suggest', { method: 'POST', body: JSON.stringify({ draft }) });
      if (data.barcode) {
        const field = byId(`${prefix}-barcode`);
        if (field) field.value = data.barcode;
        setStatus(statusId, `Barcode found: <strong>${esc(data.barcode)}</strong>${data.source ? ` · ${esc(data.source)}` : ''}`, 'ok');
      } else {
        setStatus(statusId, data.message || 'No barcode found. For full web lookup, add BARCODE_LOOKUP_API_URL to your environment.', 'warn');
      }
    } catch (error) { setStatus(statusId, esc(error.message || 'Barcode lookup failed.'), 'err'); }
  }

  async function createCurrentDraft(prefix) {
    const draft = draftFromForm(prefix);
    if (!draft.title) return setStatus(prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status', 'Title is required.', 'warn');
    const statusId = prefix === 'pci-url' ? 'pci-url-status' : 'pci-manual-status';
    setStatus(statusId, `Creating Shopify draft product with ${draft.images.length} image(s)…`);
    try {
      const payload = { draft };
      if (state.latestImport?._id && prefix === 'pci-url') payload.importId = state.latestImport._id;
      const data = await api('/shopify/create', { method: 'POST', body: JSON.stringify(payload) });
      const link = shopifyProductUrl(data.product?.id);
      const warnings = [data.product?.imageCreateWarning, data.product?.metafieldCreateWarning, data.product?.inventoryCostWarning, data.product?.fileCreateWarning].filter(Boolean).map((msg) => `<br>${esc(msg)}`).join('');
      setStatus(statusId, `Created draft product: <strong>${esc(data.product?.title || draft.title)}</strong>${link ? ` · <a href="${esc(link)}" target="_blank">Open in Shopify ↗</a>` : ''}${warnings}${data.product?.attachedImageCount !== undefined ? `<br>Attached ${esc(data.product.attachedImageCount || 0)} of ${esc(data.product.imageCount || 0)} selected image(s).` : ''}${data.product?.filesCreatedCount ? `<br>Copied ${esc(data.product.filesCreatedCount)} image(s) to Shopify Files.` : ''}`, warnings ? 'warn' : 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus(statusId, esc(error.message || 'Product creation failed.'), 'err'); }
  }

  async function createManualDraft() { await createCurrentDraft('pci-manual'); }

  function openSearchModal(index) {
    syncLineInputs();
    state.modalLineIndex = index;
    const line = state.latestImport?.lines?.[index];
    const modal = byId('pci-product-search-modal');
    if (!modal || !line) return;
    const q = line.sku || line.barcode || line.supplierProductCode || line.title || '';
    modal.innerHTML = `<div class="pci-modal-backdrop" onclick="window.ProductCreationImportAdmin.closeSearchModal()"></div><div class="pci-modal-panel"><div class="pci-modal-head"><div><h3>Search Shopify products</h3><p class="pci-muted">Select the correct product for: <strong>${esc(line.title || 'invoice line')}</strong></p></div><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.closeSearchModal()">Close</button></div><div class="pci-modal-search"><input id="pci-modal-search-input" class="pci-input" value="${esc(q)}" placeholder="Search title, handle, SKU or barcode"><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.runModalProductSearch()">Search</button></div><div id="pci-modal-results" class="pci-search-results"><div class="pci-status">Ready to search.</div></div></div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { byId('pci-modal-search-input')?.focus(); runModalProductSearch(); }, 50);
  }

  function closeSearchModal() {
    const modal = byId('pci-product-search-modal');
    if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); modal.innerHTML = ''; }
    state.modalLineIndex = null;
  }

  async function runModalProductSearch() {
    const q = byId('pci-modal-search-input')?.value.trim() || '';
    const box = byId('pci-modal-results');
    if (!box) return;
    if (!q) { box.innerHTML = '<div class="pci-status warn">Enter a product title, handle, SKU or barcode.</div>'; return; }
    box.innerHTML = '<div class="pci-status">Searching Shopify…</div>';
    try {
      const data = await api(`/products/search?q=${encodeURIComponent(q)}&first=12`);
      const seenProducts = new Set();
      const products = (data.products || []).filter((p) => { const key = p.id || p.legacyResourceId || p.handle || `${p.title}-${p.sku}`; if (seenProducts.has(key)) return false; seenProducts.add(key); return true; });
      if (!products.length) { box.innerHTML = '<div class="pci-status warn">No matching products found. Close this and use Create… to create manually or from a URL.</div>'; return; }
      box.innerHTML = products.map((p) => `<div class="pci-result"><div>${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</div><div><strong>${esc(p.title)}</strong><small>Vendor: ${esc(p.vendor || '—')} · SKU: ${esc(p.sku || '—')} · ${esc(p.handle || '')}</small></div><button class="primary-btn" type="button" onclick="window.ProductCreationImportAdmin.assignLineFromModal(${JSON.stringify(p).replace(/"/g,'&quot;')})">Select & assign</button></div>`).join('');
    } catch (error) { box.innerHTML = `<div class="pci-status err">${esc(error.message || 'Search failed.')}</div>`; }
  }

  async function searchForLine(index) { openSearchModal(index); }

  async function assignLineFromModal(product) {
    const index = state.modalLineIndex;
    await assignLine(index, product);
    closeSearchModal();
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
      vendor: state.latestImport?.supplierName || byId('pci-invoice-supplier-name')?.value || '',
      price: line.suggestedRetailPrice || '',
      compareAtPrice: line.originalUnitPrice || '',
      cost: line.unitCost || '',
      sku: line.sku || line.supplierProductCode || '',
      barcode: line.barcode || '',
      weight: line.weight || '',
      weightUnit: line.weightUnit || 'g',
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
    } else { setStatus('pci-url-status', 'Line details have been copied. Add a product URL and scan, or create from these fields.', 'warn'); }
  }

  function prefillManualFromLine(index) {
    window.pciTab('manual');
    fillDraftForm('pci-manual', lineToDraft(index));
    setStatus('pci-manual-status', 'Invoice line copied into Manual Create. Review price, compare-at price, SKU, tags and metafields before creating.', 'ok');
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
      const warnings = [data.product?.imageCreateWarning, data.product?.metafieldCreateWarning, data.product?.inventoryCostWarning, data.product?.fileCreateWarning].filter(Boolean).map((msg) => `<br>${esc(msg)}`).join('');
      setStatus('pci-invoice-status', `Created Shopify draft product: <strong>${esc(data.product?.title || line.title)}</strong>${warnings}${data.product?.attachedImageCount !== undefined ? `<br>Attached ${esc(data.product.attachedImageCount || 0)} of ${esc(data.product.imageCount || 0)} selected image(s).` : ''}${data.product?.filesCreatedCount ? `<br>Copied ${esc(data.product.filesCreatedCount)} image(s) to Shopify Files.` : ''}`, warnings ? 'warn' : 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Create failed.'), 'err'); }
  }

  async function createPurchaseOrderDraft() {
    if (!state.latestImport?._id) return setStatus('pci-invoice-status', 'Analyse an invoice/order first.', 'warn');
    syncLineInputs();
    syncInvoiceMetaInputs();
    setStatus('pci-invoice-status', 'Creating purchase order draft…');
    try {
      const purchaseOrder = {
        supplierName: byId('pci-invoice-supplier-name')?.value || state.latestImport.supplierName || '',
        supplierUrl: byId('pci-invoice-supplier-url')?.value || state.latestImport.supplierUrl || '',
        currency: byId('pci-invoice-currency')?.value || state.latestImport.currency || 'GBP',
        poLevelDiscount: byId('pci-invoice-discount-total')?.value || state.latestImport.discountTotal || '',
        discountTotal: byId('pci-invoice-discount-total')?.value || state.latestImport.discountTotal || '',
        shippingTotal: byId('pci-invoice-shipping-total')?.value || state.latestImport.shippingTotal || '',
        taxTotal: byId('pci-invoice-tax-total')?.value || state.latestImport.taxTotal || '',
      };
      const data = await api('/purchase-order/draft', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, lines: state.latestImport.lines, purchaseOrder }) });
      state.latestImport = data.import;
      fillInvoiceMeta(data.import);
      renderPoDraft(data.purchaseOrder);
      setStatus('pci-invoice-status', 'Draft PO created. You can now formalise it at the bottom of the invoice import page.', 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'PO draft failed.'), 'err'); }
  }

  async function formalisePurchaseOrderDraft() {
    if (!state.latestImport?._id) return;
    const notes = byId('pci-po-notes')?.value || '';
    const supplierName = byId('pci-po-supplier-name')?.value || state.latestImport.purchaseOrder?.supplierName || '';
    const currency = byId('pci-po-currency')?.value || state.latestImport.purchaseOrder?.currency || 'GBP';
    setStatus('pci-invoice-status', 'Formalising PO…');
    try {
      const data = await api('/purchase-order/formalise', { method: 'POST', body: JSON.stringify({ importId: state.latestImport._id, purchaseOrder: { ...(state.latestImport.purchaseOrder || {}), notes, supplierName, currency } }) });
      state.latestImport = data.import;
      renderPoDraft(data.purchaseOrder);
      setStatus('pci-invoice-status', `Internal PO ${esc(data.purchaseOrder?.poNumber || '')} formalised. Use Create prompt to copy all PO details into Shopify/Sidekick as a workaround.`, 'ok');
      state.historyLoaded = false;
    } catch (error) { setStatus('pci-invoice-status', esc(error.message || 'Formalise failed.'), 'err'); }
  }

  function closePromptModal() {
    const modal = byId('pci-product-search-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '';
  }

  async function copyPurchaseOrderPrompt() {
    const text = byId('pci-po-prompt-text')?.value || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const note = byId('pci-po-prompt-copy-status');
      if (note) note.textContent = 'Copied to clipboard.';
    } catch (_) {
      const textarea = byId('pci-po-prompt-text');
      textarea?.focus();
      textarea?.select();
      const note = byId('pci-po-prompt-copy-status');
      if (note) note.textContent = 'Select the prompt text and copy it manually.';
    }
  }

  async function createPurchaseOrderPrompt(importId = '') {
    const targetImportId = importId || state.latestImport?._id;
    if (!targetImportId) return setStatus('pci-invoice-status', 'Create or select a PO first.', 'warn');
    const modal = byId('pci-product-search-modal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.innerHTML = `<div class="pci-modal-backdrop" onclick="window.ProductCreationImportAdmin.closePromptModal()"></div><div class="pci-modal-panel"><div class="pci-modal-head"><div><h3>Create Shopify PO prompt</h3><p class="pci-muted">Copy this prompt into Shopify/Sidekick or your internal purchasing workflow. It includes the supplier, products, quantities, costs, discounts and totals from the internal PO.</p></div><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.closePromptModal()">Close</button></div><div class="pci-status">Generating prompt…</div></div>`;
    try {
      const data = await api('/purchase-order/prompt', { method: 'POST', body: JSON.stringify({ importId: targetImportId }) });
      modal.innerHTML = `<div class="pci-modal-backdrop" onclick="window.ProductCreationImportAdmin.closePromptModal()"></div><div class="pci-modal-panel"><div class="pci-modal-head"><div><h3>Create Shopify PO prompt</h3><p class="pci-muted">This is a workaround for Shopify's missing public PO-create API. Paste it into Shopify's assistant/PO flow and it has all the information from the Nectar PO.</p></div><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.closePromptModal()">Close</button></div><label class="pci-label">Prompt</label><textarea id="pci-po-prompt-text" class="pci-textarea pci-prompt-textarea" readonly>${esc(data.prompt || '')}</textarea><div class="pci-actions"><button type="button" class="primary-btn" onclick="window.ProductCreationImportAdmin.copyPurchaseOrderPrompt()">Copy prompt</button><span id="pci-po-prompt-copy-status" class="pci-muted">Ready to copy.</span></div></div>`;
      setTimeout(() => byId('pci-po-prompt-text')?.select(), 50);
    } catch (error) {
      modal.innerHTML = `<div class="pci-modal-backdrop" onclick="window.ProductCreationImportAdmin.closePromptModal()"></div><div class="pci-modal-panel"><div class="pci-modal-head"><h3>Create Shopify PO prompt</h3><button class="secondary-btn" type="button" onclick="window.ProductCreationImportAdmin.closePromptModal()">Close</button></div><div class="pci-status err">${esc(error.message || 'Prompt generation failed.')}</div></div>`;
    }
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
    } catch (error) { box.innerHTML = `<div class="pci-status err">${esc(error.message || 'History failed.')}</div>`; }
  }


  async function loadPurchaseOrders(force = false) {
    if (state.poLoaded && !force) return;
    const box = byId('pci-po-list-box');
    if (!box) return;
    box.innerHTML = '<div class="pci-status">Loading draft/formalised POs…</div>';
    try {
      const data = await api('/purchase-orders?limit=40');
      const items = data.items || [];
      state.poLoaded = true;
      box.innerHTML = items.length ? `<table class="pci-history"><thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Lines</th><th>Total</th><th>Created</th><th>Action</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${esc(item.purchaseOrder?.poNumber || 'PO')}</strong><br><small>${esc(item.invoiceNumber || item.originalFilename || '')}</small></td><td>${esc(item.purchaseOrder?.supplierName || item.supplierName || '')}</td><td><span class="pci-pill ${item.purchaseOrder?.status === 'formalised' ? 'ok' : 'warn'}">${esc(item.purchaseOrder?.status || '')}</span></td><td>${esc(item.purchaseOrder?.lines?.length || 0)}</td><td>${esc(item.purchaseOrder?.currency || item.currency || 'GBP')} ${esc(item.purchaseOrder?.total || '')}</td><td>${esc(new Date(item.createdAt).toLocaleString())}</td><td>${item.purchaseOrder?.status === 'formalised' ? `<button type="button" class="secondary-btn" onclick="window.ProductCreationImportAdmin.createPurchaseOrderPrompt('${esc(String(item._id || ''))}')">Create prompt</button>` : '<span class="pci-muted">Formalise first</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="pci-status warn">No draft POs yet. Create one from Invoice Import after product lines are extracted.</div>';
    } catch (error) { box.innerHTML = `<div class="pci-status err">${esc(error.message || 'Could not load POs.')}</div>`; }
  }

  function init() {
    loadHealth();
    loadMetadata();
    loadSettings();
    byId('pci-scan-url')?.addEventListener('click', scanUrl);
    byId('pci-analyse-invoice')?.addEventListener('click', analyseInvoice);
    byId('pci-create-manual')?.addEventListener('click', createManualDraft);
    byId('pci-url-suggest-profile')?.addEventListener('click', () => suggestProfile('pci-url'));
    byId('pci-manual-suggest-profile')?.addEventListener('click', () => suggestProfile('pci-manual'));
    byId('pci-url-tags')?.addEventListener('change', () => suggestProfile('pci-url', { quiet: true }));
    byId('pci-manual-tags')?.addEventListener('change', () => suggestProfile('pci-manual', { quiet: true }));
    byId('pci-history-refresh')?.addEventListener('click', () => loadHistory(true));
    byId('pci-add-sku-rule')?.addEventListener('click', addSkuRule);
    byId('pci-add-conditional-rule')?.addEventListener('click', addConditionalRule);
    byId('pci-add-metafield-rule')?.addEventListener('click', addMetafieldRule);
    byId('pci-save-metafield-settings')?.addEventListener('click', saveSettings);
    byId('pci-save-settings')?.addEventListener('click', saveSettings);
    byId('pci-po-refresh')?.addEventListener('click', () => loadPurchaseOrders(true));
    ['pci-url','pci-manual'].forEach((prefix) => {
      byId(`${prefix}-images`)?.addEventListener('input', () => syncImagePickerFromTextarea(prefix));
      byId(`${prefix}-find-barcode`)?.addEventListener('click', () => findBarcode(prefix));
    });
  }

  window.ProductCreationImportAdmin = { init, scanUrl, analyseInvoice, createCurrentDraft, createManualDraft, searchForLine, confirmSuggestedLine, assignLine, assignLineFromModal, openLineCreateMenu, prefillUrlFromLine, prefillManualFromLine, createLine, setLinePoTreatment, setLinePoTreatmentById, createPurchaseOrderDraft, formalisePurchaseOrderDraft, loadHistory, loadPurchaseOrders, addTag, suggestProfile, loadSettings, saveSettings, addSkuRule, removeSkuRule, addConditionalRule, removeConditionalRule, addMetafieldRule, removeMetafieldRule, closeSearchModal, closePromptModal, runModalProductSearch, createPurchaseOrderPrompt, copyPurchaseOrderPrompt, toggleImageSelection, toggleImageSelectionFromCard, selectAllImages, clearImages, findBarcode };
  document.addEventListener('DOMContentLoaded', init);
})();
