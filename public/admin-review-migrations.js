(function reviewMigrationCentre() {
  if (window.__NECTAR_REVIEW_MIGRATIONS_LOADED__) return;
  window.__NECTAR_REVIEW_MIGRATIONS_LOADED__ = true;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  let currentBatchId = '';
  let currentMapRowId = '';

  function adminFetch(path, options) {
    if (typeof window.adminFetch !== 'function') throw new Error('Admin API helper is not ready yet.');
    return window.adminFetch(path, options);
  }

  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  function findMigrationContainer() {
    return $('nectar-review-import-mount')
      || $('v-import')
      || $('v-migration')
      || $('v-migrations')
      || $('migration-centre')
      || Array.from(document.querySelectorAll('.view, section, main > div')).find((node) => /migration centre|review importer/i.test(node.textContent || ''))
      || document.querySelector('main')
      || document.body;
  }

  function statusBadge(status) {
    const clean = String(status || 'unknown').replace(/_/g, ' ');
    return `<span class="migration-badge migration-badge-${escapeHtml(status)}">${escapeHtml(clean)}</span>`;
  }

  function renderPanel() {
    const host = findMigrationContainer();
    if (!host || $('nectar-review-migration-panel')) return;
    if (host.id === 'nectar-review-import-mount') host.innerHTML = '';
    const panel = document.createElement('div');
    panel.id = 'nectar-review-migration-panel';
    panel.className = 'migration-panel';
    panel.innerHTML = `
      <style>
        .migration-panel { margin: 24px 0; padding: 22px; border: 1px solid #e5e7eb; border-radius: 18px; background: #fff; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06); }
        .migration-panel h3 { margin: 0 0 8px; font-size: 20px; }
        .migration-panel p { color: #64748b; line-height: 1.5; }
        .migration-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin: 16px 0; }
        .migration-card { padding: 14px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f8fafc; }
        .migration-card strong { display: block; margin-bottom: 6px; color: #111827; }
        .migration-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }
        .migration-row label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #475569; }
        .migration-row input[type="file"], .migration-row input[type="number"], .migration-row select, .migration-row textarea { min-width: 180px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
        .migration-check { flex-direction: row !important; align-items: center; gap: 8px !important; }
        .migration-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
        .migration-actions button, .migration-panel button { border: 0; border-radius: 999px; padding: 10px 16px; background: #111827; color: #fff; font-weight: 700; cursor: pointer; }
        .migration-actions button.secondary, .migration-panel button.secondary { background: #e2e8f0; color: #111827; }
        .migration-actions button.warning { background: #b45309; }
        .migration-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 14px; margin-top: 12px; }
        .migration-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .migration-table th, .migration-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
        .migration-table th { background: #f8fafc; color: #475569; }
        .migration-badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #e2e8f0; color: #334155; font-size: 12px; font-weight: 700; }
        .migration-badge-matched, .migration-badge-site_review, .migration-badge-imported, .migration-badge-completed { background: #dcfce7; color: #166534; }
        .migration-badge-needs_mapping, .migration-badge-preview, .migration-badge-partial { background: #fef3c7; color: #92400e; }
        .migration-badge-skipped, .migration-badge-duplicate, .migration-badge-failed { background: #fee2e2; color: #991b1b; }
        .migration-muted { color: #64748b; font-size: 13px; }
        .migration-note { padding: 12px; border-radius: 12px; background: #eff6ff; color: #1e3a8a; }
        .migration-mini-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .migration-mini-actions button { padding:7px 10px; font-size:12px; }
        .migration-map-modal { position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(15,23,42,.46); z-index:999999; padding:18px; }
        .migration-map-modal.active { display:flex; }
        .migration-map-card { width:min(760px,100%); max-height:82vh; overflow:auto; background:#fff; border-radius:20px; border:1px solid #e5e7eb; box-shadow:0 30px 90px rgba(15,23,42,.28); padding:20px; }
        .migration-map-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
        .migration-map-search { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:12px; }
        .migration-product-result { display:grid; grid-template-columns:56px 1fr auto; gap:12px; align-items:center; padding:12px; border:1px solid #e5e7eb; border-radius:14px; margin-top:8px; background:#fbfdff; }
        .migration-product-result img { width:56px; height:56px; border-radius:10px; object-fit:cover; background:#eef2f7; }
        .migration-flow-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:16px 0 18px; }
        .migration-step { border:1px solid #dbeafe; background:#eff6ff; border-radius:16px; padding:14px; color:#1e3a8a; }
        .migration-step span { display:inline-grid; place-items:center; width:26px; height:26px; border-radius:999px; background:#1d4ed8; color:#fff; font-weight:950; margin-bottom:8px; }
        .migration-step strong { display:block; color:#0f172a; margin-bottom:4px; }
        .migration-step p { margin:0; color:#475569; font-size:13px; }
        .migration-explain-btn { border:1px solid #c7d2fe!important; background:#eef2ff!important; color:#3730a3!important; }
      </style>
      <h3>Robust Migration Centre</h3>
      <p>Import Yotpo, Shop/exported, Judge.me or generic reviews into Nectar with staging, product mapping, site-review support and duplicate protection. The storefront scan detects public review signals going forward, but it does not claim private Shop app review data is automatically importable.</p>

      <div class="migration-flow-steps">
        <div class="migration-step"><span>1</span><strong>Keep the old app live</strong><p>Yotpo/Shop can stay visible while Nectar quietly stages the import.</p></div>
        <div class="migration-step"><span>2</span><strong>Preview the CSV</strong><p>No reviews go live yet. Rows are staged and categorised first.</p></div>
        <div class="migration-step"><span>3</span><strong>Map products</strong><p>Matched product reviews attach to products. Shop/site reviews attach to the store.</p></div>
        <div class="migration-step"><span>4</span><strong>Import and check</strong><p>Duplicates are blocked, then you preview widgets before switching schema/live display.</p></div>
      </div>
      <div class="migration-actions"><button class="secondary migration-explain-btn" type="button" onclick="window.NectarHelpAssistant?.open('Explain the Migration Centre and what I should do next on this page.')">Ask AI to explain this page</button></div>

      <div class="migration-grid" id="rmc-overview-cards">
        <div class="migration-card"><strong>Migration state</strong><span class="migration-muted">Loading…</span></div>
        <div class="migration-card"><strong>Imported reviews</strong><span class="migration-muted">Loading…</span></div>
        <div class="migration-card"><strong>Last scan</strong><span class="migration-muted">Loading…</span></div>
      </div>

      <div class="migration-card">
        <strong>1. Upload / preview import</strong>
        <p class="migration-muted">Upload an export from Yotpo/Shop/Judge.me/etc. Nectar will stage it first. Use <strong>Preview and stage import</strong>; do not import until matched/site rows look right.</p>
        <div class="migration-row">
          <label>Source
            <select id="rmc-source-platform">
              <option value="yotpo">Yotpo CSV</option>
              <option value="shop_app">Shop App / Shop-channel export</option>
              <option value="judgeme">Judge.me CSV</option>
              <option value="weebly">Weebly / Square CSV</option>
              <option value="generic">Generic CSV</option>
            </select>
          </label>
          <label>CSV file
            <input id="rmc-csv-file" type="file" accept=".csv,text/csv" />
          </label>
          <label class="migration-check"><input id="rmc-only-published" type="checkbox" checked /> Published/approved only</label>
          <label class="migration-check"><input id="rmc-verified" type="checkbox" checked /> Keep verified badge when source provides it</label>
        </div>
        <div class="migration-actions">
          <button id="rmc-preview-btn">Preview and stage import</button>
          <button id="rmc-refresh-btn" class="secondary">Refresh overview</button>
        </div>
        <div id="rmc-preview-result" class="migration-muted">No staged batch yet.</div>
      </div>

      <div class="migration-card" style="margin-top:14px;">
        <strong>2. Future-facing storefront / Shop review signal scan</strong>
        <p>This scans the live storefront for review widgets, Yotpo remnants, Shop-like review markup, and JSON-LD rating/review schema. It is designed to catch signs that reviews exist outside Nectar, not to scrape private third-party review databases.</p>
        <div class="migration-row">
          <label>Products to sample
            <input id="rmc-scan-limit" type="number" min="1" max="20" value="8" />
          </label>
        </div>
        <div class="migration-actions">
          <button id="rmc-scan-btn">Scan storefront review signals</button>
          <button id="rmc-shop-status-btn" class="secondary">Check Shop review sync status</button>
        </div>
        <div id="rmc-scan-result" class="migration-muted">No scan run yet.</div>
      </div>

      <div class="migration-card" style="margin-top:14px;">
        <strong>3. Recent batches</strong>
        <p class="migration-muted">A batch is an audit trail. Open a batch to map rows, mark shop/site reviews, skip rows, or import accepted rows.</p>
        <div id="rmc-batch-list" class="migration-muted">Loading batches…</div>
      </div>
    `;
    host.appendChild(panel);

    $('rmc-preview-btn')?.addEventListener('click', previewCsv);
    $('rmc-refresh-btn')?.addEventListener('click', loadOverview);
    $('rmc-scan-btn')?.addEventListener('click', runScan);
    $('rmc-shop-status-btn')?.addEventListener('click', loadShopStatus);
    loadOverview();
  }

  function summaryCard(title, content) {
    return `<div class="migration-card"><strong>${escapeHtml(title)}</strong><div>${content}</div></div>`;
  }

  async function loadOverview() {
    try {
      const data = await adminFetch('/admin/review-migrations/overview');
      const migration = data.settings || {};
      const counts = data.counts || [];
      const totalImported = counts.reduce((sum, item) => sum + Number(item.count || 0), 0);
      const siteImported = counts.filter((item) => item._id?.scope === 'site').reduce((sum, item) => sum + Number(item.count || 0), 0);
      const lastScan = data.scans?.[0];
      const yotpoOrShop = lastScan?.summary?.yotpoDetected || lastScan?.summary?.shopSignalsDetected;
      $('rmc-overview-cards').innerHTML = [
        summaryCard('Migration state', `${migration.enabled ? statusBadge('enabled') : statusBadge('disabled')}<div class="migration-muted">Source: ${escapeHtml(migration.sourcePlatform || 'not set')}</div>`),
        summaryCard('Review archive', `<strong>${totalImported}</strong><span class="migration-muted"> total current reviews, including ${siteImported} site/shop-level reviews.</span>`),
        summaryCard('Last scan', lastScan ? `${statusBadge(lastScan.status)}<div class="migration-muted">${escapeHtml(new Date(lastScan.createdAt).toLocaleString())}</div><div>External signals: ${yotpoOrShop ? 'Detected' : 'None found in sample'}</div>` : '<span class="migration-muted">No scan yet.</span>'),
      ].join('');
      renderBatches(data.batches || []);
    } catch (error) {
      $('rmc-overview-cards').innerHTML = summaryCard('Migration Centre', `<span class="migration-muted">${escapeHtml(error.message)}</span>`);
    }
  }

  function renderBatches(batches) {
    const host = $('rmc-batch-list');
    if (!host) return;
    if (!batches.length) {
      host.innerHTML = 'No migration batches yet.';
      return;
    }
    host.innerHTML = `
      <div class="migration-table-wrap"><table class="migration-table">
        <thead><tr><th>Date</th><th>Source</th><th>Status</th><th>Rows</th><th>Matched</th><th>Needs mapping</th><th>Imported</th><th></th></tr></thead>
        <tbody>${batches.map((batch) => `
          <tr>
            <td>${escapeHtml(new Date(batch.createdAt).toLocaleString())}</td>
            <td>${escapeHtml(batch.sourcePlatform)}</td>
            <td>${statusBadge(batch.status)}</td>
            <td>${escapeHtml(batch.summary?.totalRows || 0)}</td>
            <td>${escapeHtml(batch.summary?.matched || 0)}</td>
            <td>${escapeHtml(batch.summary?.needsMapping || 0)}</td>
            <td>${escapeHtml(batch.summary?.imported || 0)}</td>
            <td><button class="secondary" data-load-batch="${escapeHtml(batch._id)}">View</button></td>
          </tr>`).join('')}</tbody>
      </table></div>`;
    host.querySelectorAll('[data-load-batch]').forEach((btn) => {
      btn.addEventListener('click', () => loadBatch(btn.getAttribute('data-load-batch')));
    });
  }

  async function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  async function previewCsv() {
    const file = $('rmc-csv-file')?.files?.[0];
    if (!file) return toast('Choose a CSV file first.');
    const sourcePlatform = $('rmc-source-platform')?.value || 'generic';
    const result = $('rmc-preview-result');
    result.innerHTML = 'Reading and staging CSV…';
    try {
      const csvText = await readFile(file);
      const data = await adminFetch('/admin/review-migrations/csv/preview', {
        method: 'POST',
        body: JSON.stringify({
          sourcePlatform,
          fileName: file.name,
          csvText,
          importOnlyPublished: $('rmc-only-published')?.checked !== false,
          importVerifiedWhenAvailable: $('rmc-verified')?.checked !== false,
        }),
      });
      renderPreview(data.batch, data.rows || []);
      await loadOverview();
    } catch (error) {
      result.innerHTML = `<span class="migration-badge migration-badge-failed">${escapeHtml(error.message)}</span>`;
    }
  }

  function renderPreview(batch, rows) {
    const host = $('rmc-preview-result');
    const summary = batch?.summary || {};
    currentBatchId = batch?._id || '';
    host.innerHTML = `
      <div class="migration-note">
        Staged ${escapeHtml(summary.totalRows || 0)} rows. Matched ${escapeHtml(summary.matched || 0)}, site reviews ${escapeHtml(summary.siteReviews || 0)}, needs mapping ${escapeHtml(summary.needsMapping || 0)}, skipped ${escapeHtml(summary.skipped || 0)}, duplicates ${escapeHtml(summary.duplicates || 0)}.
      </div>
      <div class="migration-actions">
        <button class="warning" id="rmc-import-batch-btn">Import matched + site reviews</button>
        <button class="secondary" id="rmc-load-batch-btn">Open staged rows</button>
      </div>
      ${previewRowsTable(rows)}
    `;
    $('rmc-import-batch-btn')?.addEventListener('click', () => importBatch(batch._id));
    $('rmc-load-batch-btn')?.addEventListener('click', () => loadBatch(batch._id));
    bindRowActions(host);
  }

  function previewRowsTable(rows) {
    if (!rows.length) return '<p class="migration-muted">No rows to show.</p>';
    return `<div class="migration-table-wrap"><table class="migration-table">
      <thead><tr><th>Row</th><th>Status</th><th>Scope</th><th>Rating</th><th>Title</th><th>Review</th><th>Product match</th><th>Actions / Issue</th></tr></thead>
      <tbody>${rows.map((row) => {
        const normalized = row.normalized || {};
        const selected = row.selectedProduct;
        const rowId = row._id || row.id || '';
        const canMap = !['imported', 'duplicate', 'skipped'].includes(String(row.status || ''));
        const suggestedQuery = normalized.productTitle || normalized.externalProductId || normalized.productHandle || '';
        const actions = canMap ? `<div class="migration-mini-actions">
          <button class="secondary" type="button" data-rmc-map-row="${escapeHtml(rowId)}" data-rmc-query="${escapeHtml(suggestedQuery)}">Choose product</button>
          <button class="secondary" type="button" data-rmc-site-row="${escapeHtml(rowId)}">Mark as site/shop review</button>
          <button class="secondary" type="button" data-rmc-skip-row="${escapeHtml(rowId)}">Skip row</button>
        </div>` : '';
        return `<tr>
          <td>${escapeHtml(row.rowIndex)}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${escapeHtml(row.reviewScope)}</td>
          <td>${escapeHtml(normalized.rating)}</td>
          <td>${escapeHtml(normalized.headline || normalized.productTitle)}</td>
          <td>${escapeHtml(String(normalized.comment || '').slice(0, 140))}</td>
          <td>${selected ? `${escapeHtml(selected.title)}<div class="migration-muted">${escapeHtml(selected.gid || selected.id)}</div>` : escapeHtml(normalized.productTitle || normalized.externalProductId || '—')}</td>
          <td>${actions}<div class="migration-muted">${escapeHtml(row.issue || '')}</div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  function bindRowActions(root) {
    root.querySelectorAll('[data-rmc-map-row]').forEach((button) => {
      button.addEventListener('click', () => openProductMapModal(button.dataset.rmcMapRow, button.dataset.rmcQuery || ''));
    });
    root.querySelectorAll('[data-rmc-site-row]').forEach((button) => {
      button.addEventListener('click', () => updateStagedRow(button.dataset.rmcSiteRow, { status: 'site_review' }));
    });
    root.querySelectorAll('[data-rmc-skip-row]').forEach((button) => {
      button.addEventListener('click', () => updateStagedRow(button.dataset.rmcSkipRow, { status: 'skipped' }));
    });
  }

  async function updateStagedRow(rowId, payload) {
    if (!rowId) return;
    try {
      await adminFetch(`/admin/review-migrations/staged/${encodeURIComponent(rowId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (currentBatchId) await loadBatch(currentBatchId);
      await loadOverview();
    } catch (error) {
      toast(error.message || 'Could not update staged row.');
    }
  }

  function ensureMapModal() {
    let modal = $('rmc-product-map-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'rmc-product-map-modal';
    modal.className = 'migration-map-modal';
    modal.innerHTML = `<div class="migration-map-card">
      <div class="migration-map-head"><div><h3>Choose Shopify product</h3><p class="migration-muted">Search by product title, handle or ID. The selected product is saved to this staged import row before import.</p></div><button class="secondary" type="button" id="rmc-map-close">Close</button></div>
      <div class="migration-map-search"><input id="rmc-product-search" class="premium-input" placeholder="Search product title, handle or ID"><button id="rmc-product-search-btn" type="button">Search</button></div>
      <div id="rmc-product-search-results" class="migration-muted">Search for a product to map this row.</div>
    </div>`;
    document.body.appendChild(modal);
    $('rmc-map-close')?.addEventListener('click', () => modal.classList.remove('active'));
    $('rmc-product-search-btn')?.addEventListener('click', runProductSearch);
    $('rmc-product-search')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runProductSearch(); } });
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('active'); });
    return modal;
  }

  async function openProductMapModal(rowId, query) {
    currentMapRowId = rowId || '';
    const modal = ensureMapModal();
    modal.classList.add('active');
    const input = $('rmc-product-search');
    if (input) input.value = query || '';
    if (query) await runProductSearch();
  }

  async function runProductSearch() {
    const box = $('rmc-product-search-results');
    const query = String($('rmc-product-search')?.value || '').trim();
    if (!query) { box.innerHTML = 'Enter a product title, handle or ID.'; return; }
    box.innerHTML = 'Searching Shopify products…';
    try {
      const data = await adminFetch(`/admin/products/search?q=${encodeURIComponent(query)}`);
      const products = data.products || [];
      if (data.requiresOauth) {
        box.innerHTML = `<div class="migration-note">${escapeHtml(data.message || 'Product search needs Shopify OAuth.')} ${data.installUrl ? `<br><a href="${escapeHtml(data.installUrl)}">Reconnect Shopify</a>` : ''}</div>`;
        return;
      }
      box.innerHTML = products.length ? products.map((p) => `<div class="migration-product-result">
        <img src="${escapeHtml(p.image || '')}" alt="">
        <div><strong>${escapeHtml(p.title)}</strong><div class="migration-muted">${escapeHtml(p.handle || '')} · ${escapeHtml(p.id || '')}</div></div>
        <button type="button" data-rmc-select-product='${escapeHtml(JSON.stringify(p))}'>Select</button>
      </div>`).join('') : '<div class="migration-muted">No Shopify products matched that search.</div>';
      box.querySelectorAll('[data-rmc-select-product]').forEach((button) => {
        button.addEventListener('click', () => {
          try {
            const p = JSON.parse(button.dataset.rmcSelectProduct || '{}');
            selectMappedProduct(p);
          } catch (error) { toast('Could not select product.'); }
        });
      });
    } catch (error) {
      box.innerHTML = `<span class="migration-badge migration-badge-failed">${escapeHtml(error.message)}</span>`;
    }
  }

  async function selectMappedProduct(product) {
    if (!currentMapRowId || !product?.id) return;
    await updateStagedRow(currentMapRowId, {
      selectedProduct: {
        id: product.id,
        gid: `gid://shopify/Product/${product.id}`,
        title: product.title,
        handle: product.handle || '',
      },
    });
    $('rmc-product-map-modal')?.classList.remove('active');
  }

  async function loadBatch(batchId) {
    const host = $('rmc-preview-result');
    host.innerHTML = 'Loading staged batch…';
    try {
      const data = await adminFetch(`/admin/review-migrations/batches/${encodeURIComponent(batchId)}?limit=200`);
      renderPreview(data.batch, data.rows || []);
    } catch (error) {
      host.innerHTML = `<span class="migration-badge migration-badge-failed">${escapeHtml(error.message)}</span>`;
    }
  }

  async function importBatch(batchId) {
    if (!batchId) return;
    const host = $('rmc-preview-result');
    host.insertAdjacentHTML('afterbegin', '<p class="migration-muted">Importing matched rows…</p>');
    try {
      const data = await adminFetch(`/admin/review-migrations/batches/${encodeURIComponent(batchId)}/import`, {
        method: 'POST',
        body: JSON.stringify({ importStatus: 'accepted' }),
      });
      toast(`Imported ${data.summary?.imported || 0} reviews.`);
      await loadBatch(batchId);
      await loadOverview();
    } catch (error) {
      toast(error.message || 'Import failed');
    }
  }

  async function runScan() {
    const result = $('rmc-scan-result');
    result.innerHTML = 'Scanning storefront review signals…';
    try {
      const data = await adminFetch('/admin/review-migrations/scan/storefront', {
        method: 'POST',
        body: JSON.stringify({ limit: Number($('rmc-scan-limit')?.value || 8) }),
      });
      const scan = data.scan;
      const s = scan.summary || {};
      result.innerHTML = `
        <div class="migration-note">
          Scan complete. Checked ${escapeHtml(s.pagesChecked || 0)} pages and ${escapeHtml(s.productsChecked || 0)} products. Yotpo detected: ${s.yotpoDetected ? 'yes' : 'no'}. Shop-like signals: ${s.shopSignalsDetected ? 'yes' : 'no'}. Schema review/rating blocks: ${escapeHtml(s.aggregateRatingsDetected || 0)}.
        </div>
        ${scan.discoveries?.length ? `<div class="migration-table-wrap"><table class="migration-table"><thead><tr><th>Page</th><th>Signals</th><th>Rating schema</th></tr></thead><tbody>${scan.discoveries.slice(0, 20).map((item) => `<tr><td>${escapeHtml(item.url)}</td><td>${item.signals?.yotpoDetected ? 'Yotpo ' : ''}${item.signals?.shopSignalsDetected ? 'Shop-like ' : ''}${item.signals?.schemaReviewsDetected ? 'Reviews schema' : ''}</td><td>${escapeHtml(item.signals?.aggregateRatings?.length || 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      `;
      await loadOverview();
    } catch (error) {
      result.innerHTML = `<span class="migration-badge migration-badge-failed">${escapeHtml(error.message)}</span>`;
    }
  }

  async function loadShopStatus() {
    const result = $('rmc-scan-result');
    result.innerHTML = 'Checking Shop review sync status…';
    try {
      const data = await adminFetch('/admin/review-migrations/shop-review-sync/status');
      result.innerHTML = `
        <div class="migration-note">
          <strong>Direct Shop review pull:</strong> ${data.directShopReviewPullAvailable ? 'Available' : 'Not available as a normal public pull.'}<br />
          ${escapeHtml(data.sourceOfTruth)}
        </div>
        <ol>${(data.recommendedFlow || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
      `;
    } catch (error) {
      result.innerHTML = `<span class="migration-badge migration-badge-failed">${escapeHtml(error.message)}</span>`;
    }
  }

  window.renderReviewMigrationImporter = renderPanel;

  const oldTab = window.tab;
  if (typeof oldTab === 'function' && !oldTab.__reviewMigrationPatched) {
    const patched = function patchedTab(id) {
      const result = oldTab.apply(this, arguments);
      if (/migration|import/i.test(String(id || ''))) setTimeout(renderPanel, 50);
      return result;
    };
    patched.__reviewMigrationPatched = true;
    window.tab = patched;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel);
  } else {
    setTimeout(renderPanel, 100);
  }
})();
