(() => {
  const state = { batch: null, batches: [], activeItemId: '', metadata: {} };
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

  function optionLabel(item = {}, keys = []) {
    for (const key of keys) {
      const value = item?.[key];
      if (value) return String(value);
    }
    return typeof item === 'string' ? item : '';
  }

  function setDatalist(id, values = []) {
    const el = $(id);
    if (!el) return;
    const seen = new Set();
    el.innerHTML = values.map((value) => String(value || '').trim()).filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 250).map((value) => `<option value="${escapeAttr(value)}"></option>`).join('');
  }

  function populateMetadataControls() {
    const meta = state.metadata || {};
    setDatalist('vendor-options', (meta.vendors || []).map((item) => optionLabel(item, ['vendor'])));
    setDatalist('product-type-options', (meta.productTypes || []).map((item) => optionLabel(item, ['productType'])));
    setDatalist('product-category-options', (meta.productCategories || []).map((item) => optionLabel(item, ['category', 'productType'])));
    setDatalist('template-options', (meta.themeTemplates || []).map((item) => optionLabel(item, ['template'])));
    setDatalist('collection-options', (meta.collections || []).flatMap((item) => [item.handle, item.title]).filter(Boolean));
    setDatalist('tag-options', (meta.tags || []).map((item) => optionLabel(item, ['tag'])));
  }

  async function loadMetadata() {
    if (!shopDomain) return;
    try {
      state.metadata = await api('/metadata');
      populateMetadataControls();
    } catch (error) {
      state.metadata = {};
    }
  }

  function listForField(name = '') {
    if (/vendor/i.test(name)) return 'vendor-options';
    if (/productType/i.test(name)) return 'product-type-options';
    if (/productCategory/i.test(name)) return 'product-category-options';
    if (/themeTemplate/i.test(name)) return 'template-options';
    if (/collections/i.test(name)) return 'collection-options';
    if (/tags/i.test(name)) return 'tag-options';
    return '';
  }

  function siteOptionPills(kind = '') {
    const meta = state.metadata || {};
    const values = kind === 'collections'
      ? (meta.collections || []).map((item) => item.handle || item.title).filter(Boolean)
      : (kind === 'tags' || kind === 'recommended-tags')
        ? (meta.tags || []).map((item) => item.tag).filter(Boolean)
        : [];
    return values.slice(0, 18).map((value) => `<button type="button" class="option-pill" data-append-${kind}="${escapeAttr(value)}">${escapeHtml(value)}</button>`).join('');
  }

  function csv(id) { return ($(id)?.value || '').split(',').map((x) => x.trim()).filter(Boolean); }
  function parseCsv(value) { return String(value || '').split(',').map((x) => x.trim()).filter(Boolean); }
  function joinCsv(value) { return Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || ''); }
  function defaults() {
    return {
      supplierName: $('default-supplier').value,
      brand: $('default-supplier').value,
      vendor: $('default-vendor').value || $('default-supplier').value,
      productType: $('default-product-type').value,
      productCategory: $('default-product-category').value,
      themeTemplate: $('default-template').value,
      handleFormat: $('default-format')?.value || '',
      handleLocation: $('default-location')?.value || '',
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
        <button class="secondary-btn" data-open-batch="${escapeAttr(batch._id)}">Open</button>
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
    const ready = (state.batch?.items || []).filter((item) => item.validation?.status === 'ready' && item.approvalStatus !== 'approved');
    for (const item of ready) {
      const data = await api(`/batches/${state.batch._id}/items/${item.itemId}/approval`, { method: 'POST', body: JSON.stringify({ approvalStatus: 'approved' }) });
      state.batch = data.batch;
    }
    setBusy(`Approved ${ready.length} fully ready row(s). Rows with warnings still need manual review.`);
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
    const issues = item.validation?.issues || [];
    const validationStatus = item.validation?.status || 'unchecked';
    return `<div class="item-row">
      <div>${image ? `<img src="${escapeAttr(image)}" alt="">` : '<span class="badge blocked">No image</span>'}</div>
      <div class="item-title"><strong>${escapeHtml(item.draft?.title || item.title || item.originalInput || 'Queued product')}</strong><small>${escapeHtml(item.sourceUrl || item.originalInput || '')}</small>${issues.length ? `<small class="issue-preview">${escapeHtml(issues.slice(0, 2).join(' · '))}${issues.length > 2 ? ` +${issues.length - 2} more` : ''}</small>` : ''}</div>
      <span class="badge ${escapeAttr(item.status || '')}">${escapeHtml(item.status || 'queued')}</span>
      <span class="badge ${escapeAttr(validationStatus)}">${escapeHtml(validationStatus)}</span>
      <span class="badge ${escapeAttr(item.approvalStatus || '')}">${escapeHtml(item.approvalStatus || 'pending')}</span>
      <span>${escapeHtml(item.draft?.productType || item.productType || '—')}</span>
      <span>${escapeHtml(item.nutrition?.productFlavour || '—')}</span>
      <span>${escapeHtml(item.nutrition?.caffeineMgPerServing !== undefined && item.nutrition?.caffeineMgPerServing !== '' ? `${item.nutrition.caffeineMgPerServing}mg` : '—')}</span>
      <div class="row-actions"><button class="secondary-btn" data-view-item="${escapeAttr(item.itemId)}">Review / edit</button><button class="secondary-btn" data-rescan-item="${escapeAttr(item.itemId)}">Rescan</button><button class="primary-btn" data-approve-item="${escapeAttr(item.itemId)}">Approve</button></div>
    </div>`;
  }

  async function approveItem(itemId) {
    const item = findItem(itemId);
    if (!item) return;
    if (item.validation?.status === 'blocked' && !window.confirm('This item is still blocked. Approve anyway?')) return;
    const data = await api(`/batches/${state.batch._id}/items/${itemId}/approval`, { method: 'POST', body: JSON.stringify({ approvalStatus: 'approved' }) });
    state.batch = data.batch;
    renderBatch();
    if ($('item-dialog')?.open && state.activeItemId === itemId) viewItem(itemId, { keepOpen: true });
  }

  async function rescanItem(itemId) {
    setBusy('Rescanning product…');
    const data = await api(`/batches/${state.batch._id}/scan`, { method: 'POST', body: JSON.stringify({ itemIds: [itemId], processAll: true, useAi: true }) });
    state.batch = data.batch;
    setBusy('Product rescan complete.');
    renderBatch();
    if ($('item-dialog')?.open && state.activeItemId === itemId) viewItem(itemId, { keepOpen: true });
  }

  function findItem(itemId) {
    return (state.batch?.items || []).find((row) => row.itemId === itemId);
  }

  function viewItem(itemId, options = {}) {
    const item = findItem(itemId);
    if (!item) return;
    state.activeItemId = itemId;
    $('dialog-title').textContent = item.draft?.title || item.title || 'Product';
    $('dialog-subtitle').textContent = item.sourceUrl || item.originalInput || '';
    $('dialog-body').innerHTML = renderEditor(item);
    bindEditorEvents(itemId);
    if (!$('item-dialog').open || !options.keepOpen) $('item-dialog').showModal();
  }

  function renderEditor(item) {
    const draft = item.draft || {};
    const nutrition = item.nutrition || {};
    const selected = item.selectedImages?.length ? item.selectedImages : draft.images || [];
    const rejected = item.rejectedImages || [];
    const supplementLabels = item.supplementLabelImages || [];
    const metafields = item.metafieldPlan?.length ? item.metafieldPlan : draft.metafields || [];
    const clientIssues = getClientValidationIssues(item);
    const confidence = Math.round(Number(item.confidence || item.aiEnrichment?.confidence || 0) * 100);

    return `<div class="editor-shell">
      <aside class="editor-nav">
        <div class="readiness-card ${escapeAttr(item.validation?.status || 'unchecked')}">
          <span class="eyebrow">READINESS</span>
          <strong>${escapeHtml(item.validation?.status || 'unchecked')}</strong>
          <small>${confidence ? `${confidence}% source confidence` : 'AI/source confidence unavailable'}</small>
        </div>
        <a href="#product-basics">Basics</a>
        <a href="#product-description">Description</a>
        <a href="#product-media">Media</a>
        <a href="#product-pricing">Pricing & inventory</a>
        <a href="#product-seo">SEO</a>
        <a href="#product-metafields">Metafields</a>
        <a href="#product-validation">Validation</a>
      </aside>

      <section class="editor-main">
        <div class="editor-alert ${clientIssues.length ? 'warning' : 'ready'}">
          <strong>${clientIssues.length ? 'Needs review before you trust this product' : 'No obvious review issues found'}</strong>
          ${clientIssues.length ? `<ul>${clientIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : '<p>Still check the product carefully before creating the Shopify draft.</p>'}
        </div>

        ${section('product-basics', 'Product basics', 'Core Shopify fields. These are editable overrides; saving writes them back to the batch item.', `
          <div class="field-grid two">
            ${field('Product title', 'title', draft.title || item.title || '', 'text', 'Shown as the Shopify product title.')}
            ${field('URL handle', 'handle', draft.handle || '', 'text', 'This becomes the Shopify product URL handle.')}
            ${field('Vendor', 'vendor', draft.vendor || item.vendor || '', 'text', 'Brand/vendor used in Shopify.')}
            ${field('Product type', 'productType', draft.productType || item.productType || '', 'text', 'Your Shopify product type.')}
            ${field('Shopify category', 'productCategory', draft.productCategory || item.productCategory || '', 'text', 'Taxonomy/category for the product.')}
            ${field('Theme template', 'themeTemplate', draft.themeTemplate || item.templateSuffix || '', 'text', 'Template suffix only, e.g. gfuel.')}
            ${field('Collections', 'collections', joinCsv(draft.collections), 'text', 'Comma-separated collection handles/names. Use existing Shopify collection names/handles.')}<div class="option-pills">${siteOptionPills('collections')}</div>
            ${field('Suggested tags', 'recommendedTags', joinCsv(draft.recommendedTags), 'text', 'Suggestions only, drawn from existing site tags where possible. Tags below are the ones actually saved.')}<div class="option-pills">${siteOptionPills('recommended-tags')}</div>
            ${field('Approved Shopify tags', 'tags', joinCsv(draft.tags), 'text', 'Comma-separated tags to apply. Nothing is added unless it is here.')}<div class="option-pills">${siteOptionPills('tags')}</div>
            ${field('Product status', 'status', draft.status || 'draft', 'select', 'Shopify product status.', ['draft','active','archived'])}
          </div>
        `)}

        ${section('product-description', 'Description', 'The description is now visible and directly editable, so you can confirm the AI has not invented or truncated content.', `
          ${field('Product description / body HTML', 'descriptionHtml', draft.descriptionHtml || '', 'textarea', 'Accepts HTML. This is the Shopify product body.')}
          ${renderAiEvidence(item)}
        `)}

        ${section('product-media', 'Media', 'Pick the main Shopify media order. Selected images are saved in this order; rejected images are only suggestions.', `
          <div class="media-toolbar">
            <strong>Selected product images</strong>
            <span class="muted">First selected image becomes the main Shopify image.</span>
          </div>
          <div class="editor-image-grid selected-images" data-selected-images>
            ${selected.length ? selected.map((img, index) => renderSelectedImage(img, index)).join('') : '<p class="muted">No selected images. Choose from possible images below.</p>'}
          </div>
          <div class="media-toolbar label-toolbar">
            <strong>Ingredients / supplement label image</strong>
            <span class="muted">These are excluded from the main media roster and written to the Ingredients Label metafield.</span>
          </div>
          <div class="editor-image-grid label-images" data-label-images>
            ${supplementLabels.length ? supplementLabels.map((img, index) => renderLabelImage(img, index)).join('') : '<p class="muted">No label image detected. Use “Use as label” on any image below if the supplement facts panel appears.</p>'}
          </div>
          <details class="foldout" open>
            <summary>Rejected / possible images</summary>
            <div class="editor-image-grid rejected-images">
              ${rejected.length ? rejected.slice(0, 24).map((img, index) => renderRejectedImage(img, index)).join('') : '<p class="muted">No rejected images were returned.</p>'}
            </div>
          </details>
        `)}

        ${section('product-pricing', 'Pricing & inventory', 'Commercial fields are shown before SEO/metafields because they are core product creation data.', `
          ${renderCommercialSuggestions(item)}
          <div class="field-grid three">
            ${field('Price', 'price', draft.price || '', 'number', 'Retail price in GBP.')}
            ${field('Compare-at price', 'compareAtPrice', draft.compareAtPrice || '', 'number', 'Optional crossed-out price.')}
            ${field('Cost per item', 'cost', draft.cost || '', 'number', 'Your landed/product cost.')}
            ${field('SKU', 'sku', draft.sku || '', 'text', 'Stock keeping unit.')}
            ${field('Barcode / GTIN', 'barcode', draft.barcode || '', 'text', 'Optional barcode.')}
            ${field('Quantity', 'quantity', draft.quantity || 1, 'number', 'Initial stock quantity for draft context.')}
            ${field('Weight', 'weight', draft.weight || '', 'number', 'Shipping weight.')}
            ${field('Weight unit', 'weightUnit', draft.weightUnit || 'g', 'select', 'Weight unit.', ['g','kg','oz','lb'])}
          </div>
        `)}

        ${section('product-seo', 'SEO preview and override', 'The importer rewrites SEO into your merchant pattern: vendor - product name - product format - location. Truncation is flagged before approval.', `
          <div class="field-grid two">
            ${field('SEO page title', 'seoTitle', draft.seo?.title || '', 'text', 'Appears in search results and browser title.')}
            ${field('SEO meta description', 'seoDescription', draft.seo?.description || '', 'textarea', 'Search result description. Keep it readable and complete.')}
          </div>
          ${renderSearchPreview(draft)}
        `)}

        ${section('product-metafields', 'Metafields and flavour profile', 'Metafields are editable boxes, not raw JSON. Rich text fields render as larger text areas.', `
          <div class="field-grid three">
            ${field('Flavour', 'nutrition.productFlavour', nutrition.productFlavour || '', 'text', 'Used for core product flavour.')}
            ${field('Flavour family', 'nutrition.flavourFamily', nutrition.flavourFamily || '', 'text', 'Fruit, candy, cola, etc.')}
            ${field('Sweetness', 'nutrition.sweetness', nutrition.sweetness ?? '', 'number', '1-5 scale.')}
            ${field('Sourness', 'nutrition.sourness', nutrition.sourness ?? '', 'number', '1-5 scale.')}
            ${field('Servings', 'nutrition.servings', nutrition.servings ?? '', 'number', 'Servings per tub/pack.')}
            ${field('Caffeine mg per serving', 'nutrition.caffeineMgPerServing', nutrition.caffeineMgPerServing ?? '', 'number', 'Leave blank only if genuinely unknown.')}
            ${field('Formula version', 'nutrition.formulaVersion', nutrition.formulaVersion || '', 'text', 'Formula / version when visible.')}
            ${field('Ingredients label image', 'nutrition.ingredientsLabelImage', nutrition.ingredientsLabelImage || nutrition.supplementLabelImage || (supplementLabels[0]?.src || ''), 'text', 'Image URL saved to the Ingredients Label metafield.')}
            ${field('Allergen', 'nutrition.allergen', nutrition.allergen || '', 'text', 'Known allergen text.')}
            ${field('Flavour profile', 'nutrition.flavourProfile', nutrition.flavourProfile || '', 'textarea', 'Short flavour profile.')}
          </div>
          <div class="metafield-toolbar"><strong>Editable metafield plan</strong><button type="button" class="secondary-btn compact" data-add-metafield>Add metafield</button></div>
          <div class="metafield-list" data-metafield-list>
            ${metafields.length ? metafields.map((meta, index) => renderMetafield(meta, index)).join('') : '<p class="muted">No metafields found. Add any required core fields manually before approving.</p>'}
          </div>
        `)}

        ${section('product-validation', 'Validation and debug', 'Use this to see exactly why a product is not ready. Raw AI output is folded away for developer checks only.', `
          <div class="validation-list">
            ${(item.validation?.issues || []).length ? item.validation.issues.map((issue) => `<div class="validation-issue">${escapeHtml(issue)}</div>`).join('') : '<div class="validation-issue good">Backend validation has no issues.</div>'}
            ${clientIssues.length ? clientIssues.map((issue) => `<div class="validation-issue warning">${escapeHtml(issue)}</div>`).join('') : '<div class="validation-issue good">Frontend review checks have no obvious issues.</div>'}
          </div>
          <details class="foldout debug-foldout">
            <summary>Raw AI / developer debug JSON</summary>
            <pre class="codebox">${escapeHtml(JSON.stringify({ draft, nutrition, metafieldPlan: item.metafieldPlan || [], selectedImages: item.selectedImages || [], supplementLabelImages: item.supplementLabelImages || [], rejectedImages: item.rejectedImages || [], extractedData: item.extractedData || {}, aiEnrichment: item.aiEnrichment || {} }, null, 2))}</pre>
          </details>
        `)}
      </section>

      <aside class="editor-inspector">
        <div class="sticky-card">
          <h3>Review actions</h3>
          <p class="muted">Save overrides first, then approve once the product reads correctly.</p>
          <button type="button" class="primary-btn full" data-save-item>Save overrides</button>
          <button type="button" class="secondary-btn full" data-approve-current>Approve item</button>
          <button type="button" class="secondary-btn full" data-rescan-current>Rescan item</button>
          <div class="save-status" data-save-status></div>
          <hr>
          <h4>Source confidence</h4>
          <p class="muted">${confidence ? `${confidence}%` : 'Unavailable'} · ${escapeHtml(item.sourceUrl || item.originalInput || 'Manual item')}</p>
        </div>
      </aside>
    </div>`;
  }

  function renderCommercialSuggestions(item = {}) {
    const suggestions = item.suggestions || item.draft?.suggestions || item.aiEnrichment?.suggestions || {};
    const rows = [
      ['price', 'Price', 'price'],
      ['compareAtPrice', 'Compare-at price', 'compareAtPrice'],
      ['weight', 'Weight', 'weight'],
      ['sku', 'SKU', 'sku'],
      ['barcode', 'Barcode', 'barcode'],
    ].map(([key, label, fieldName]) => {
      const suggestion = suggestions[key];
      const value = suggestion?.value || '';
      if (!value) return '';
      const weightUnit = key === 'weight' && suggestion.weightUnit ? ` ${suggestion.weightUnit}` : '';
      const source = suggestion.source || 'similar Shopify products';
      const confidence = suggestion.confidence ? `${Math.round(Number(suggestion.confidence) * 100)}%` : '';
      return `<div class="suggestion-row"><div><strong>${escapeHtml(label)} suggestion:</strong> ${escapeHtml(value)}${escapeHtml(weightUnit)}<br><small>${escapeHtml(source)}${confidence ? ` · ${escapeHtml(confidence)}` : ''}</small></div><button type="button" class="secondary-btn compact" data-apply-suggestion="${escapeAttr(fieldName)}" data-suggestion-value="${escapeAttr(value)}" data-suggestion-unit="${escapeAttr(suggestion.weightUnit || '')}">Apply</button></div>`;
    }).filter(Boolean).join('');
    if (!rows) return '<div class="suggestion-box muted">No pricing/SKU/weight suggestions found from similar Shopify products. Leave blank unless you can verify them.</div>';
    return `<div class="suggestion-box"><strong>Suggestions from your existing Shopify catalogue</strong>${rows}</div>`;
  }

  function section(id, title, help, body) {
    return `<article class="editor-section" id="${escapeAttr(id)}"><div class="section-title"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(help)}</p></div>${body}</article>`;
  }

  function field(label, name, value, type = 'text', help = '', options = []) {
    const common = `data-field="${escapeAttr(name)}"`;
    const safeValue = value === undefined || value === null ? '' : String(value);
    let control;
    if (type === 'textarea') {
      control = `<textarea ${common} rows="7">${escapeHtml(safeValue)}</textarea>`;
    } else if (type === 'select') {
      control = `<select ${common}>${options.map((option) => `<option value="${escapeAttr(option)}" ${String(option) === safeValue ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
    } else {
      const inputType = type === 'number' ? 'number' : 'text';
      const step = type === 'number' ? ' step="any"' : '';
      const listId = inputType === 'text' ? listForField(name) : '';
      const listAttr = listId ? ` list="${escapeAttr(listId)}"` : '';
      control = `<input ${common} type="${inputType}"${step}${listAttr} value="${escapeAttr(safeValue)}">`;
    }
    return `<label class="editor-field"><span>${escapeHtml(label)}</span>${control}${help ? `<small>${escapeHtml(help)}</small>` : ''}</label>`;
  }

  function renderSearchPreview(draft = {}) {
    const title = draft.seo?.title || draft.title || 'SEO title missing';
    const description = draft.seo?.description || 'SEO description missing';
    const handle = draft.handle || 'product-url-handle';
    const flagged = looksTruncated(description);
    return `<div class="search-preview ${flagged ? 'warning' : ''}">
      <span>Search preview</span>
      <strong>${escapeHtml(title)}</strong>
      <small>gamingnectar.com/products/${escapeHtml(handle)}</small>
      <p>${escapeHtml(description)}</p>
      ${flagged ? '<em>Possible truncation detected. Rewrite this before approval.</em>' : ''}
    </div>`;
  }

  function renderAiEvidence(item = {}) {
    const enrichment = item.aiEnrichment || {};
    const summary = enrichment.summary || enrichment.reason || enrichment.source || item.extractedData?.description || '';
    return `<div class="evidence-card"><strong>AI/source evidence</strong><p>${escapeHtml(summary || 'No readable evidence was stored for this field. Treat the content as unverified until checked.')}</p></div>`;
  }

  function renderSelectedImage(img = {}, index = 0) {
    return `<div class="editor-image-card" data-image-index="${index}">
      <img src="${escapeAttr(img.src || '')}" alt="${escapeAttr(img.alt || '')}">
      <label>Alt text<input data-image-alt="${index}" value="${escapeAttr(img.alt || '')}"></label>
      <small>${escapeHtml(img.reason || img.source || 'Selected product image')}</small>
      <div class="image-actions">
        <button type="button" class="secondary-btn compact" data-move-image="${index}" data-direction="up">↑</button>
        <button type="button" class="secondary-btn compact" data-move-image="${index}" data-direction="down">↓</button>
        <button type="button" class="secondary-btn compact" data-mark-label="${index}">Use as label</button>
        <button type="button" class="secondary-btn compact danger" data-remove-image="${index}">Remove</button>
      </div>
    </div>`;
  }

  function renderRejectedImage(img = {}, index = 0) {
    return `<div class="editor-image-card possible" data-rejected-index="${index}">
      <img src="${escapeAttr(img.src || '')}" alt="${escapeAttr(img.alt || '')}">
      <small>${escapeHtml(img.rejectReason || img.roleReason || img.reason || 'Possible image')}</small>
      <button type="button" class="secondary-btn compact" data-use-rejected-image="${index}">Use image</button>
      <button type="button" class="secondary-btn compact" data-use-rejected-label="${index}">Use as label</button>
    </div>`;
  }

  function renderLabelImage(img = {}, index = 0) {
    return `<div class="editor-image-card label-card" data-label-index="${index}">
      <img src="${escapeAttr(img.src || '')}" alt="${escapeAttr(img.alt || '')}">
      <label>Alt text<input data-label-alt="${index}" value="${escapeAttr(img.alt || '')}"></label>
      <small>${escapeHtml(img.roleReason || img.reason || 'Ingredients / supplement label image')}</small>
      <div class="image-actions">
        <button type="button" class="secondary-btn compact" data-label-to-product="${index}">Move to product media</button>
        <button type="button" class="secondary-btn compact danger" data-remove-label="${index}">Remove label</button>
      </div>
    </div>`;
  }

  function renderMetafield(meta = {}, index = 0) {
    const isRich = /rich_text|multi_line|json/i.test(meta.type || '');
    return `<div class="metafield-card" data-metafield-index="${index}">
      <div class="metafield-head">
        <strong>${escapeHtml(meta.label || `${meta.namespace || 'custom'}.${meta.key || 'field'}`)}</strong>
        <button type="button" class="secondary-btn compact danger" data-remove-metafield="${index}">Remove</button>
      </div>
      <div class="field-grid four">
        ${field('Namespace', `metafields.${index}.namespace`, meta.namespace || 'custom', 'text', '')}
        ${field('Key', `metafields.${index}.key`, meta.key || '', 'text', '')}
        ${field('Type', `metafields.${index}.type`, meta.type || 'single_line_text_field', 'text', '')}
        ${field('Label', `metafields.${index}.label`, meta.label || '', 'text', '')}
      </div>
      ${field('Value', `metafields.${index}.value`, meta.value || '', isRich ? 'textarea' : 'text', meta.source ? `Source: ${meta.source}${meta.confidence ? ` · Confidence: ${Math.round(Number(meta.confidence) * 100)}%` : ''}` : '')}
    </div>`;
  }

  function bindEditorEvents(itemId) {
    const body = $('dialog-body');
    body.querySelector('[data-save-item]')?.addEventListener('click', () => saveCurrentItem(itemId).catch((e) => setEditorStatus(e.message, true)));
    body.querySelector('[data-approve-current]')?.addEventListener('click', () => approveItem(itemId).catch((e) => setEditorStatus(e.message, true)));
    body.querySelector('[data-rescan-current]')?.addEventListener('click', () => rescanItem(itemId).catch((e) => setEditorStatus(e.message, true)));
    body.querySelector('[data-add-metafield]')?.addEventListener('click', () => addMetafieldCard());
    body.querySelectorAll('[data-use-rejected-image]').forEach((button) => button.addEventListener('click', () => useRejectedImage(Number(button.dataset.useRejectedImage))));
    body.querySelectorAll('[data-use-rejected-label]').forEach((button) => button.addEventListener('click', () => useRejectedAsLabel(Number(button.dataset.useRejectedLabel))));
    body.querySelectorAll('[data-mark-label]').forEach((button) => button.addEventListener('click', () => markSelectedAsLabel(Number(button.dataset.markLabel))));
    body.querySelectorAll('[data-remove-label]').forEach((button) => button.addEventListener('click', () => removeLabelImage(Number(button.dataset.removeLabel))));
    body.querySelectorAll('[data-label-to-product]').forEach((button) => button.addEventListener('click', () => labelToProduct(Number(button.dataset.labelToProduct))));
    body.querySelectorAll('[data-remove-image]').forEach((button) => button.addEventListener('click', () => removeSelectedImage(Number(button.dataset.removeImage))));
    body.querySelectorAll('[data-move-image]').forEach((button) => button.addEventListener('click', () => moveSelectedImage(Number(button.dataset.moveImage), button.dataset.direction)));
    body.querySelectorAll('[data-remove-metafield]').forEach((button) => button.addEventListener('click', () => button.closest('.metafield-card')?.remove()));
    body.querySelectorAll('[data-append-collections]').forEach((button) => button.addEventListener('click', () => appendCsvField('collections', button.dataset.appendCollections)));
    body.querySelectorAll('[data-append-recommended-tags]').forEach((button) => button.addEventListener('click', () => appendCsvField('recommendedTags', button.dataset.appendRecommendedTags)));
    body.querySelectorAll('[data-append-tags]').forEach((button) => button.addEventListener('click', () => appendCsvField('tags', button.dataset.appendTags)));
    body.querySelectorAll('[data-apply-suggestion]').forEach((button) => button.addEventListener('click', () => applySuggestion(button.dataset.applySuggestion, button.dataset.suggestionValue, button.dataset.suggestionUnit)));
  }

  function appendCsvField(fieldName, value) {
    if (!value) return;
    const el = $('dialog-body').querySelector(`[data-field="${cssEscape(fieldName)}"]`);
    if (!el) return;
    const values = parseCsv(el.value);
    if (!values.some((item) => item.toLowerCase() === String(value).toLowerCase())) values.push(value);
    el.value = joinCsv(values);
  }

  function applySuggestion(fieldName, value, unit = '') {
    const body = $('dialog-body');
    const el = body.querySelector(`[data-field="${cssEscape(fieldName)}"]`);
    if (el) el.value = value || '';
    if (fieldName === 'weight' && unit) {
      const unitEl = body.querySelector(`[data-field="weightUnit"]`);
      if (unitEl) unitEl.value = unit;
    }
  }

  function currentSelectedImages() {
    const item = findItem(state.activeItemId);
    const selected = item?.selectedImages?.length ? item.selectedImages : item?.draft?.images || [];
    return selected.map((img, index) => ({
      ...img,
      src: img.src || '',
      alt: $('dialog-body').querySelector(`[data-image-alt="${index}"]`)?.value || img.alt || item?.draft?.title || '',
    })).filter((img) => img.src);
  }


  function currentLabelImages() {
    const item = findItem(state.activeItemId);
    const labels = item?.supplementLabelImages || [];
    return labels.map((img, index) => ({
      ...img,
      src: img.src || '',
      alt: $('dialog-body').querySelector(`[data-label-alt="${index}"]`)?.value || img.alt || item?.draft?.title || '',
      role: 'supplement_label',
      rejected: true,
      selected: false,
      rejectReason: 'supplement-label-metafield',
    })).filter((img) => img.src);
  }

  function rerenderActiveEditor() {
    if (state.activeItemId) viewItem(state.activeItemId, { keepOpen: true });
  }

  function useRejectedImage(index) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const img = item.rejectedImages?.[index];
    if (!img?.src) return;
    const selected = currentSelectedImages();
    item.selectedImages = [...selected, { ...img, selected: true, rejected: false, rejectReason: '' }];
    item.rejectedImages = (item.rejectedImages || []).filter((_, i) => i !== index);
    item.draft = { ...(item.draft || {}), images: item.selectedImages };
    rerenderActiveEditor();
  }


  function markSelectedAsLabel(index) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const selected = currentSelectedImages();
    const img = selected[index];
    if (!img?.src) return;
    item.selectedImages = selected.filter((_, i) => i !== index);
    item.supplementLabelImages = [...currentLabelImages(), { ...img, role: 'supplement_label', selected: false, rejected: true, rejectReason: 'supplement-label-metafield' }];
    item.draft = { ...(item.draft || {}), images: item.selectedImages };
    rerenderActiveEditor();
  }

  function useRejectedAsLabel(index) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const img = item.rejectedImages?.[index];
    if (!img?.src) return;
    item.supplementLabelImages = [...currentLabelImages(), { ...img, role: 'supplement_label', selected: false, rejected: true, rejectReason: 'supplement-label-metafield' }];
    item.rejectedImages = (item.rejectedImages || []).filter((_, i) => i !== index);
    rerenderActiveEditor();
  }

  function removeLabelImage(index) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const labels = currentLabelImages();
    const removed = labels[index];
    item.supplementLabelImages = labels.filter((_, i) => i !== index);
    if (removed) item.rejectedImages = [{ ...removed, rejected: true, selected: false, rejectReason: 'Manually removed label' }, ...(item.rejectedImages || [])];
    rerenderActiveEditor();
  }

  function labelToProduct(index) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const labels = currentLabelImages();
    const img = labels[index];
    if (!img?.src) return;
    item.supplementLabelImages = labels.filter((_, i) => i !== index);
    item.selectedImages = [...currentSelectedImages(), { ...img, role: 'product_image', selected: true, rejected: false, rejectReason: '' }];
    item.draft = { ...(item.draft || {}), images: item.selectedImages };
    rerenderActiveEditor();
  }

  function removeSelectedImage(index) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const selected = currentSelectedImages();
    const removed = selected[index];
    item.selectedImages = selected.filter((_, i) => i !== index);
    if (removed) item.rejectedImages = [{ ...removed, rejected: true, selected: false, rejectReason: 'Manually removed' }, ...(item.rejectedImages || [])];
    item.draft = { ...(item.draft || {}), images: item.selectedImages };
    rerenderActiveEditor();
  }

  function moveSelectedImage(index, direction) {
    const item = findItem(state.activeItemId);
    if (!item) return;
    const selected = currentSelectedImages();
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= selected.length) return;
    [selected[index], selected[nextIndex]] = [selected[nextIndex], selected[index]];
    item.selectedImages = selected;
    item.draft = { ...(item.draft || {}), images: item.selectedImages };
    rerenderActiveEditor();
  }

  function addMetafieldCard() {
    const list = $('dialog-body').querySelector('[data-metafield-list]');
    const index = list.querySelectorAll('.metafield-card').length;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMetafield({ namespace: 'custom', key: '', type: 'single_line_text_field', label: '', value: '', source: 'manual' }, index);
    const card = wrapper.firstElementChild;
    list.appendChild(card);
    card.querySelector('[data-remove-metafield]')?.addEventListener('click', () => card.remove());
  }

  function readField(name) {
    const el = $('dialog-body').querySelector(`[data-field="${cssEscape(name)}"]`);
    return el ? el.value : '';
  }

  function readNumberField(name) {
    const value = readField(name);
    return value === '' ? '' : Number(value);
  }

  function readMetafields() {
    return Array.from($('dialog-body').querySelectorAll('.metafield-card')).map((card) => {
      const fieldValue = (suffix) => {
        const field = Array.from(card.querySelectorAll('[data-field]')).find((el) => String(el.dataset.field || '').endsWith(`.${suffix}`));
        return field?.value || '';
      };
      return {
        namespace: fieldValue('namespace').trim(),
        key: fieldValue('key').trim(),
        type: fieldValue('type').trim() || 'single_line_text_field',
        label: fieldValue('label').trim(),
        value: fieldValue('value'),
        source: 'manual_review',
        confidence: 1,
      };
    }).filter((meta) => meta.namespace && meta.key && meta.value !== '');
  }

  async function saveCurrentItem(itemId) {
    const selectedImages = currentSelectedImages();
    const supplementLabelImages = currentLabelImages();
    const draft = {
      title: readField('title'),
      handle: readField('handle'),
      descriptionHtml: readField('descriptionHtml'),
      vendor: readField('vendor'),
      productType: readField('productType'),
      productCategory: readField('productCategory'),
      themeTemplate: readField('themeTemplate'),
      collections: parseCsv(readField('collections')),
      recommendedTags: parseCsv(readField('recommendedTags')),
      tags: parseCsv(readField('tags')),
      status: readField('status') || 'draft',
      price: readField('price'),
      compareAtPrice: readField('compareAtPrice'),
      cost: readField('cost'),
      sku: readField('sku'),
      barcode: readField('barcode'),
      quantity: readNumberField('quantity') || 1,
      weight: readField('weight'),
      weightUnit: readField('weightUnit') || 'g',
      images: selectedImages,
      seo: { title: readField('seoTitle'), description: readField('seoDescription') },
      metafields: readMetafields(),
    };
    const nutrition = {
      productFlavour: readField('nutrition.productFlavour'),
      flavourFamily: readField('nutrition.flavourFamily'),
      sweetness: readNumberField('nutrition.sweetness'),
      sourness: readNumberField('nutrition.sourness'),
      servings: readNumberField('nutrition.servings'),
      caffeineMgPerServing: readNumberField('nutrition.caffeineMgPerServing'),
      formulaVersion: readField('nutrition.formulaVersion'),
      ingredientsLabelImage: readField('nutrition.ingredientsLabelImage') || supplementLabelImages[0]?.src || '',
      allergen: readField('nutrition.allergen'),
      flavourProfile: readField('nutrition.flavourProfile'),
    };
    setEditorStatus('Saving overrides…');
    const data = await api(`/batches/${state.batch._id}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ draft, nutrition, selectedImages, supplementLabelImages, metafieldPlan: draft.metafields }),
    });
    state.batch = data.batch;
    renderBatch();
    setEditorStatus('Saved. Validation has been refreshed.');
    viewItem(itemId, { keepOpen: true });
  }

  function setEditorStatus(message, isError = false) {
    const el = $('dialog-body').querySelector('[data-save-status]');
    if (!el) return;
    el.textContent = message;
    el.className = `save-status ${isError ? 'error' : ''}`;
  }

  function stripHtml(value = '') {
    return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function looksTruncated(value = '') {
    const text = String(value || '').trim();
    if (!text) return false;
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    return (text.length > 135 && !/[.!?)]$/.test(text)) || (text.length > 45 && lastWord.length <= 2 && !/[.!?)]$/.test(text));
  }

  function getClientValidationIssues(item = {}) {
    const draft = item.draft || {};
    const nutrition = item.nutrition || {};
    const issues = [];
    if (!stripHtml(draft.descriptionHtml)) issues.push('Description is blank or not visible.');
    if (!draft.productCategory) issues.push('Shopify category is missing.');
    if (!draft.price) issues.push('Price is missing.');
    if (!draft.handle) issues.push('URL handle is missing.');
    if (!draft.seo?.title) issues.push('SEO title is missing.');
    if (!draft.seo?.description) issues.push('SEO description is missing.');
    if (looksTruncated(draft.seo?.description)) issues.push('SEO description looks truncated or unfinished.');
    if (!item.selectedImages?.length && !draft.images?.length) issues.push('Main product image has not been selected.');
    if (!draft.metafields?.length && !item.metafieldPlan?.length) issues.push('No metafields are ready for review.');
    if (nutrition.caffeineMgPerServing === undefined || nutrition.caffeineMgPerServing === null || nutrition.caffeineMgPerServing === '') issues.push('Caffeine is unknown; confirm whether this is caffeine-free or missing data.');
    return issues;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value || '').replace(/"/g, '\\"');
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
  Promise.all([loadMetadata(), loadRecentBatches()]).catch((e) => { $('recent-batches').innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`; });
})();
