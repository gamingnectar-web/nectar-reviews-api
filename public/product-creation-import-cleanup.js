/* Product Creation & Import cleanup layer - intentionally additive and safe */
(function ProductCreationImportCleanup() {
  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  const getValue = (id) => $(id)?.value?.trim?.() || '';

  const keyMetafields = /(caffeine|serving|allergen|flavour|flavor|sugar|calorie|formula|headline|product[_\s-]?type|sweet|sour|limited|badge|energy|hydration|ingredients|nutrition)/i;

  function insertWorkflow(paneId, active = 'source') {
    const pane = $(paneId);
    if (!pane || pane.querySelector('.pci-workflow-strip')) return;
    const head = pane.querySelector('.pci-pane-head') || pane.firstElementChild;
    const steps = [
      ['source', '1. Source', paneId.includes('batch') ? 'Paste links / shared defaults' : 'Paste supplier URL'],
      ['scan', '2. Scan', 'Extract product, media, SEO and identifiers'],
      ['review', '3. Review', 'Accept, reject or edit suggestions'],
      ['draft', '4. Draft', 'Create unpublished Shopify product']
    ];
    const html = `<div class="pci-workflow-strip">${steps.map(([key, title, body]) => `<div class="pci-workflow-step ${key === active ? 'active' : ''}" data-pci-step="${key}"><strong>${title}</strong><span>${body}</span></div>`).join('')}</div>`;
    (head || pane).insertAdjacentHTML('afterend', html);
  }

  function setWorkflow(paneId, active, done = []) {
    const pane = $(paneId);
    if (!pane) return;
    pane.querySelectorAll('.pci-workflow-step').forEach((step) => {
      const key = step.dataset.pciStep;
      step.classList.toggle('active', key === active);
      step.classList.toggle('done', done.includes(key));
    });
  }

  function ensureScannerMonitor() {
    const bar = document.querySelector('#pci-pane-url .pci-url-scan-bar');
    if (!bar || $('pci-url-scan-monitor')) return;
    bar.insertAdjacentHTML('afterend', `<div id="pci-url-scan-monitor" class="pci-scan-monitor" aria-live="polite"><div class="pci-scan-monitor-head"><div><strong id="pci-url-scan-title">Scanning product page…</strong><p class="pci-muted" id="pci-url-scan-detail">Fetching page data, media, pricing clues and product identifiers.</p></div><div class="pci-spinner" aria-hidden="true"></div></div><div class="pci-progress-track"><div class="pci-progress-bar"></div></div></div>`);
  }

  function ensureBatchMonitor() {
    const pane = $('pci-pane-batch');
    const frame = $('pci-batch-frame');
    if (!pane || !frame || $('pci-batch-monitor')) return;
    frame.insertAdjacentHTML('beforebegin', `<div id="pci-batch-monitor" class="pci-batch-monitor"><strong>Batch workspace status</strong><p class="pci-muted">Use this to see the batch import flow before opening each row in the embedded workspace.</p><div class="pci-batch-monitor-grid"><div class="pci-batch-monitor-card"><span>Queued</span><strong id="pci-batch-queued">—</strong></div><div class="pci-batch-monitor-card"><span>Scanning</span><strong id="pci-batch-scanning">—</strong></div><div class="pci-batch-monitor-card"><span>Needs review</span><strong id="pci-batch-review">—</strong></div><div class="pci-batch-monitor-card"><span>Approved</span><strong id="pci-batch-approved">—</strong></div></div></div>`);
  }

  function setScanning(active, title, detail) {
    ensureScannerMonitor();
    const monitor = $('pci-url-scan-monitor');
    if (!monitor) return;
    monitor.classList.toggle('active', Boolean(active));
    if (title) $('pci-url-scan-title').textContent = title;
    if (detail) $('pci-url-scan-detail').textContent = detail;
    setWorkflow('pci-pane-url', active ? 'scan' : 'review', active ? ['source'] : ['source', 'scan']);
  }

  function cleanSku(value = '', max = 80) {
    return String(value || '').trim().replace(/[^a-z0-9_-]/gi, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, max);
  }

  function vendorFirstTwo(vendor = '') {
    return String(vendor || '').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
  }

  function readSkuPrefixRules() {
    const mode = $('pci-settings-sku-prefix-mode')?.value || 'vendor_first_two';
    return {
      enabled: $('pci-settings-sku-prefix-enabled')?.checked !== false && mode !== 'none',
      mode,
      customPrefix: cleanSku($('pci-settings-default-sku-prefix')?.value || '', 14),
      separator: $('pci-settings-sku-prefix-separator')?.value || '-',
      overwriteExistingSku: $('pci-settings-sku-prefix-overwrite')?.checked === true,
    };
  }

  function prefixForVendor(vendor) {
    const rules = readSkuPrefixRules();
    if (rules.mode === 'none' || rules.enabled === false) return '';
    return rules.mode === 'custom' ? rules.customPrefix : (rules.customPrefix || vendorFirstTwo(vendor));
  }

  function prefixSkuField(prefix) {
    const skuInput = $(`${prefix}-sku`);
    const vendor = getValue(`${prefix}-vendor`);
    if (!skuInput || !skuInput.value.trim() || !vendor) return;
    const rules = readSkuPrefixRules();
    if (rules.enabled === false || rules.mode === 'none') return;
    const p = prefixForVendor(vendor);
    if (!p) return;
    const raw = cleanSku(skuInput.value.trim());
    if (!raw || raw === p || raw.startsWith(`${p}-`) || raw.startsWith(p)) return;
    if (raw.includes('-') && !rules.overwriteExistingSku) return;
    skuInput.value = `${p}${rules.separator || '-'}${raw}`.replace(/-{2,}/g, '-').toUpperCase();
    skuInput.classList.add('pci-pulse-highlight');
    setTimeout(() => skuInput.classList.remove('pci-pulse-highlight'), 2000);
  }

  function addSkuPrefixSetting() {
    const skuSection = Array.from(document.querySelectorAll('#pci-pane-settings .pci-settings-section')).find((el) => /SKU Conditions/i.test(el.textContent || ''));
    if (!skuSection || $('pci-settings-default-sku-prefix')) return;
    skuSection.insertAdjacentHTML('afterbegin', `<div class="pci-smart-panel"><h4>Imported vendor SKU prefix</h4><p class="pci-form-help">Default behaviour: add the first two vendor letters before the supplier SKU. Example: <strong>G FUEL + 12345 = GF-12345</strong>. A merchant can switch to a fixed custom prefix or turn prefixing off.</p><div class="pci-form-grid"><div><label class="pci-label">Prefix mode</label><select id="pci-settings-sku-prefix-mode" class="pci-input"><option value="vendor_first_two">First two vendor letters</option><option value="custom">Custom prefix</option><option value="none">No prefix</option></select></div><div><label class="pci-label">Custom import SKU prefix</label><input id="pci-settings-default-sku-prefix" class="pci-input" placeholder="Example: GF, ADV, XG"></div><div><label class="pci-label">Separator</label><input id="pci-settings-sku-prefix-separator" class="pci-input" value="-"></div><label class="pci-check"><input id="pci-settings-sku-prefix-enabled" type="checkbox" checked> Prefix imported supplier SKUs</label><label class="pci-check"><input id="pci-settings-sku-prefix-overwrite" type="checkbox"> Re-prefix SKUs that already contain a prefix</label></div></div>`);
  }

  function populateSkuPrefixSettings(settings = {}) {
    addSkuPrefixSetting();
    const rules = settings.skuPrefixRules || {};
    if ($('pci-settings-sku-prefix-mode')) $('pci-settings-sku-prefix-mode').value = rules.mode || 'vendor_first_two';
    if ($('pci-settings-default-sku-prefix')) $('pci-settings-default-sku-prefix').value = rules.customPrefix || '';
    if ($('pci-settings-sku-prefix-separator')) $('pci-settings-sku-prefix-separator').value = rules.separator || '-';
    if ($('pci-settings-sku-prefix-enabled')) $('pci-settings-sku-prefix-enabled').checked = rules.enabled !== false;
    if ($('pci-settings-sku-prefix-overwrite')) $('pci-settings-sku-prefix-overwrite').checked = Boolean(rules.overwriteExistingSku);
  }

  function smartSuggestionPanel(prefix) {
    const meta = $(`${prefix}-metafields`);
    if (!meta || $(`${prefix}-smart-suggestions`)) return;
    meta.insertAdjacentHTML('beforebegin', `<section id="${prefix}-smart-suggestions" class="pci-smart-panel"><h4>Smart checks from similar products</h4><p class="pci-muted">For the selected vendor/product line, the importer checks the fields usually completed on similar products and keeps the key ones visible first. Suggestions should be accepted or rejected before creating the draft.</p><div class="pci-smart-grid"><div class="pci-smart-card"><strong>Key metafields first</strong><small>Energy, caffeine, servings, flavour profile, allergens, formula/version and product headline are treated as review points.</small></div><div class="pci-smart-card"><strong>Suggested, not forced</strong><small>Suggested values appear as chips/notes so the merchant stays in control.</small></div><div class="pci-smart-card"><strong>Rare fields at bottom</strong><small>Low-use metafields remain available in advanced groups so the page feels less chaotic.</small></div></div><div class="pci-suggestion-chip-row" id="${prefix}-smart-suggestion-chips"></div></section>`);
  }

  function addSmartSuggestionChips(prefix) {
    const chipBox = $(`${prefix}-smart-suggestion-chips`);
    if (!chipBox) return;
    const vendor = getValue(`${prefix}-vendor`);
    const productType = getValue(`${prefix}-type`);
    const title = getValue(`${prefix}-title`);
    const chips = [];
    if (vendor) chips.push(`Vendor logic: ${vendor}`);
    if (/g\s*fuel|gfuel/i.test(vendor + ' ' + title)) chips.push('Check G FUEL metafield pattern');
    if (/energy|tub|hydration|powder|drink/i.test(productType + ' ' + title)) chips.push('Prioritise drink metafields');
    if (!chips.length) chips.push('Review similar product metafields');
    chipBox.innerHTML = chips.map((chip) => `<span class="pci-suggestion-chip">${esc(chip)}<button type="button" onclick="this.closest('.pci-suggestion-chip').remove()">Dismiss</button></span>`).join('');
  }

  function moveRareMetafieldsDown() {
    ['pci-url-metafields', 'pci-manual-metafields'].forEach((id) => {
      const box = $(id);
      if (!box) return;
      Array.from(box.children).forEach((child) => {
        const txt = child.textContent || '';
        child.classList.toggle('low-use', !keyMetafields.test(txt));
      });
    });
  }

  function patchAdminFetch() {
    if (window.__pciCleanupAdminFetchPatched || typeof window.adminFetch !== 'function') return;
    window.__pciCleanupAdminFetchPatched = true;
    const original = window.adminFetch.bind(window);
    window.adminFetch = function patchedAdminFetch(url, options = {}) {
      const urlText = String(url || '');
      const method = String(options.method || 'GET').toUpperCase();
      let nextOptions = options;

      if (/product-creation-import\/settings/.test(urlText) && method !== 'GET' && options?.body) {
        try {
          const body = JSON.parse(options.body);
          body.settings = body.settings || {};
          body.settings.skuPrefixRules = readSkuPrefixRules();
          nextOptions = { ...options, body: JSON.stringify(body) };
        } catch (_) {}
      }

      if (/product-creation-import\/url\/scan/.test(urlText)) {
        setScanning(true, 'Scanning product page…', 'Fetching supplier page, media, barcode/SKU clues, pricing and metafield hints.');
      }

      const responsePromise = original(url, nextOptions);
      Promise.resolve(responsePromise)
        .then((response) => {
          if (/product-creation-import\/settings/.test(urlText) && method === 'GET' && response?.clone) {
            response.clone().json().then((data) => populateSkuPrefixSettings(data?.settings || {})).catch(() => {});
          }
          if (/product-creation-import\/url\/scan/.test(urlText)) {
            setWorkflow('pci-pane-url', 'review', ['source', 'scan']);
            setTimeout(() => {
              setScanning(false);
              prefixSkuField('pci-url');
              addSmartSuggestionChips('pci-url');
              moveRareMetafieldsDown();
            }, 450);
          }
        })
        .catch(() => {
          if (/product-creation-import\/url\/scan/.test(urlText)) {
            setScanning(false, 'Scan failed', 'The supplier page could not be scanned. Check the URL or try again.');
          }
        });
      return responsePromise;
    };
  }

  function wireScanButton() {
    const btn = $('pci-scan-url');
    if (!btn || btn.dataset.cleanupWired) return;
    btn.dataset.cleanupWired = '1';
    btn.addEventListener('click', () => {
      const url = getValue('pci-url-input');
      if (!url) return;
      setScanning(true, 'Scanning product page…', 'Fetching supplier page, images, barcode/SKU clues, pricing and metafield hints.');
    }, true);
  }

  function wireSkuAutoPrefix() {
    ['pci-url', 'pci-manual'].forEach((prefix) => {
      ['sku', 'vendor'].forEach((field) => {
        const input = $(`${prefix}-${field}`);
        if (input && !input.dataset.skuPrefixWired) {
          input.dataset.skuPrefixWired = '1';
          input.addEventListener('blur', () => prefixSkuField(prefix));
          input.addEventListener('change', () => {
            addSmartSuggestionChips(prefix);
            moveRareMetafieldsDown();
          });
        }
      });
    });
  }

  function refresh() {
    if (!$('v-product-creation-import')) return;
    insertWorkflow('pci-pane-url', 'source');
    insertWorkflow('pci-pane-batch', 'source');
    ensureScannerMonitor();
    ensureBatchMonitor();
    addSkuPrefixSetting();
    smartSuggestionPanel('pci-url');
    smartSuggestionPanel('pci-manual');
    addSmartSuggestionChips('pci-url');
    addSmartSuggestionChips('pci-manual');
    moveRareMetafieldsDown();
    wireScanButton();
    wireSkuAutoPrefix();
    patchAdminFetch();
  }

  document.addEventListener('DOMContentLoaded', refresh);
  window.addEventListener('load', refresh);
  document.addEventListener('click', (event) => {
    if (event.target?.matches?.('[data-pci-tab], .pci-tab')) setTimeout(refresh, 120);
    if (event.target?.matches?.('[onclick*="createCurrentDraft"], #pci-create-manual')) {
      setWorkflow('pci-pane-url', 'draft', ['source', 'scan', 'review']);
      setWorkflow('pci-pane-manual', 'draft', ['source', 'scan', 'review']);
    }
  });
  setInterval(refresh, 1500);
})();
