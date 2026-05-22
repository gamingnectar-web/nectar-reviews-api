(function(){
  function html(value){
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }
  function pointsName(){ return document.getElementById('loyalty-points-label')?.value || document.getElementById('loyalty-points-label-overview')?.value || 'Points'; }
  function fmtDate(value){ try { return value ? new Date(value).toLocaleDateString() : '—'; } catch { return '—'; } }

  function renderCustomerStates(rows){
    const list = document.getElementById('loyalty-customer-state-list');
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML = '<p class="muted">No customer balances yet. Balances appear after review rewards, manual adjustments, or future purchase events.</p>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <div class="loyalty-ledger-row">
        <div><strong>${html(row.customerRefHint || 'Private customer')}</strong><span>${html(row.currentTierName || 'Bronze')} · last activity ${fmtDate(row.lastActivityAt)}</span></div>
        <span class="loyalty-ledger-badge">${Number(row.availablePoints || 0)} ${html(pointsName())}</span>
        <strong>${Number(row.pendingPoints || 0)} pending</strong>
      </div>
    `).join('');
  }

  function renderLedger(rows){
    const list = document.getElementById('loyalty-ledger-list');
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML = '<p class="muted">No loyalty ledger rows yet. Rows will appear after matching review events or manual adjustments.</p>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <div class="loyalty-ledger-row">
        <div><strong>${html(row.ruleName || row.eventType)}</strong><span>${html(row.customerRefHint || String(row.customerRefHash || '').slice(0,14) + '…')} · ${fmtDate(row.availableAt)}</span></div>
        <span class="loyalty-ledger-badge">${html(row.status || 'pending')}</span>
        <strong>${row.points ? `${Number(row.points)} ${html(pointsName())}` : `${Number(row.discountValue || 0)}${row.discountType === 'percentage' ? '%' : ''}`}</strong>
      </div>
    `).join('');
  }

  function updateLoyaltyStats(rows){
    const customerCount = rows.length;
    const available = rows.reduce((sum, row) => sum + Number(row.availablePoints || 0), 0);
    const pending = rows.reduce((sum, row) => sum + Number(row.pendingPoints || 0), 0);
    const a = document.getElementById('loyalty-stat-customers'); if (a) a.textContent = customerCount;
    const b = document.getElementById('loyalty-stat-available'); if (b) b.textContent = available;
    const c = document.getElementById('loyalty-stat-pending'); if (c) c.textContent = pending;
  }

  async function loadCustomerRows(){
    const data = await adminFetch('/admin/loyalty/customers?limit=50');
    const rows = data.rows || [];
    renderCustomerStates(rows);
    updateLoyaltyStats(rows);
    return rows;
  }

  const originalLoad = window.loadLoyaltyConfig;
  window.loadLoyaltyConfig = async function(){
    try {
      const config = await adminFetch('/admin/loyalty/config');
      if (typeof window.hydrateLoyalty === 'function') window.hydrateLoyalty(config || {});
      else if (typeof hydrateLoyalty === 'function') hydrateLoyalty(config || {});
      const [ledger] = await Promise.all([
        adminFetch('/admin/loyalty/ledger?limit=25'),
        loadCustomerRows(),
      ]);
      renderLedger(ledger.rows || []);
      window.updateLoyaltyPreview?.();
      window.updateLoyaltyCheckoutPreview?.();
      window.loadLoyaltyRedemptions?.();
    } catch (error) {
      console.warn('Could not load loyalty foundation:', error);
      if (originalLoad) return originalLoad();
      window.showToast?.(error.message || 'Could not load loyalty config');
    }
  };

  window.searchLoyaltyCustomers = async function(){
    const q = document.getElementById('loyalty-customer-search')?.value || '';
    const box = document.getElementById('loyalty-customer-results');
    if (!box) return;
    if (!q || q.trim().length < 2) { box.innerHTML = '<p class="muted">Enter at least 2 characters.</p>'; return; }
    box.innerHTML = '<p class="muted">Searching Shopify customers…</p>';
    try {
      const data = await adminFetch(`/admin/loyalty/customers/search?q=${encodeURIComponent(q.trim())}`);
      const rows = data.customers || [];
      if (!rows.length) { box.innerHTML = '<p class="muted">No Shopify customers found. You can still enter a store-only customer code manually.</p>'; return; }
      box.innerHTML = rows.map((customer) => `
        <div class="loyalty-customer-result">
          <div><strong>${html(customer.displayName || 'Customer')}</strong><span>${html(customer.maskedEmail || '')} · ${Number(customer.ordersCount || 0)} orders</span></div>
          <button class="secondary-btn" type="button" data-loyalty-select-customer="${html(customer.id)}" data-loyalty-customer-label="${html(customer.displayName || 'Customer')}">Use</button>
        </div>
      `).join('');
    } catch (error) {
      box.innerHTML = `<div class="notice-box error"><strong>Customer search unavailable.</strong><br>${html(error.message || 'Reconnect Shopify with read_customers scope.')}</div>`;
    }
  };

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-loyalty-select-customer]');
    if (!btn) return;
    const customerRef = btn.getAttribute('data-loyalty-select-customer') || '';
    const label = btn.getAttribute('data-loyalty-customer-label') || 'Shopify customer';
    const input = document.getElementById('loyalty-adjust-ref');
    if (input) input.value = customerRef;
    const selected = document.getElementById('loyalty-selected-customer');
    if (selected) selected.textContent = `${label} selected. Only the Shopify customer ID hash will be saved in loyalty.`;
    try { await adminFetch('/admin/loyalty/customers/resolve', { method:'POST', body: JSON.stringify({ customerRef }) }); await loadCustomerRows(); } catch {}
  });

  window.manualLoyaltyAdjustment = async function(){
    const customerRef = document.getElementById('loyalty-adjust-ref')?.value || '';
    const points = Number(document.getElementById('loyalty-adjust-points')?.value || 0);
    if (!customerRef || !points) { window.showToast?.('Enter a customer reference and points change.'); return; }
    try {
      await adminFetch('/admin/loyalty/ledger/manual-adjust', {
        method: 'POST',
        body: JSON.stringify({ customerRef, points, status: document.getElementById('loyalty-adjust-status')?.value || 'available', reason: document.getElementById('loyalty-adjust-reason')?.value || 'Manual adjustment' }),
      });
      window.showToast?.('Loyalty points adjusted.');
      await window.loadLoyaltyConfig?.();
    } catch (error) {
      window.showToast?.(error.message || 'Could not adjust points');
    }
  };

  window.processLoyaltyPending = async function(){
    try {
      const result = await adminFetch('/admin/loyalty/ledger/process-pending', { method:'POST', body: JSON.stringify({}) });
      window.showToast?.(`Processed ${Number(result.matured || 0)} pending rows.`);
      await window.loadLoyaltyConfig?.();
    } catch (error) {
      window.showToast?.(error.message || 'Could not process pending points');
    }
  };

  const prevSave = window.saveLoyaltyConfig;
  window.saveLoyaltyConfig = async function(){
    if (prevSave) await prevSave();
    try { await loadCustomerRows(); await window.loadLoyaltyRedemptions?.(); window.updateLoyaltyCheckoutPreview?.(); } catch {}
  };
})();
