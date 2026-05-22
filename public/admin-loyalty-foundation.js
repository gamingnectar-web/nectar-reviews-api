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

/* v23 loyalty product-grade admin builder */
(function(){
  const state = { config:null, rewards:[], tiers:[], emailTemplates:[], emailModules:[], pointsRules:[] };
  const esc = (v) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2,8)}`;
  const pointsName = () => document.getElementById('loyalty-points-label')?.value || document.getElementById('loyalty-points-label-overview')?.value || state.config?.pointName || 'Points';
  const money = (v) => Number(v || 0).toLocaleString(undefined, { style:'currency', currency:'GBP' });

  function installStyles(){
    if (document.getElementById('loyalty-v23-styles')) return;
    const style = document.createElement('style');
    style.id = 'loyalty-v23-styles';
    style.textContent = `
      .loyalty-tabs{display:flex!important;gap:10px!important;border-bottom:1px solid var(--border)!important;margin:8px 0 22px!important;flex-wrap:wrap!important}
      .loyalty-tabs button{appearance:none!important;border:0!important;background:transparent!important;color:#667085!important;padding:14px 16px!important;font:inherit!important;font-weight:900!important;cursor:pointer!important;border-bottom:3px solid transparent!important;border-radius:0!important;box-shadow:none!important}
      .loyalty-tabs button.active{color:var(--blue)!important;border-bottom-color:var(--blue)!important;background:transparent!important}
      .loyalty-v23-grid{display:grid;grid-template-columns:minmax(320px,420px) minmax(0,1fr);gap:18px;align-items:start}
      .loyalty-builder-card{background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);padding:20px}
      .loyalty-builder-card h3{margin:0 0 6px;font-size:18px;letter-spacing:-.02em}.loyalty-builder-card p{margin:0 0 16px;color:#667085;line-height:1.5}
      .loyalty-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.loyalty-field-grid.one{grid-template-columns:1fr}
      .loyalty-field-grid label,.loyalty-builder-card label{display:block;font-size:12px;font-weight:900;color:#344054}.loyalty-builder-card input,.loyalty-builder-card select,.loyalty-builder-card textarea{width:100%;margin-top:7px}.loyalty-builder-card textarea{resize:none;min-height:92px}
      .loyalty-action-row{display:flex;gap:10px;align-items:end;margin-top:14px}.loyalty-action-row .premium-input{flex:1}.loyalty-action-row .primary-btn,.loyalty-action-row .secondary-btn{white-space:nowrap}
      .loyalty-list{display:grid;gap:12px}.loyalty-list-card{border:1px solid #dfe5ee;border-radius:16px;background:#fff;padding:14px;display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:14px;align-items:center}.loyalty-list-card img{width:72px;height:72px;border-radius:12px;object-fit:cover;background:#f3f4f6}.loyalty-list-card .placeholder-img{width:72px;height:72px;border-radius:12px;background:#eef2f7;display:grid;place-items:center;color:#667085;font-weight:900}.loyalty-list-card h4{margin:0 0 4px;font-size:15px}.loyalty-list-card p{margin:0;color:#667085;font-size:13px;line-height:1.4}.loyalty-card-actions{display:flex;gap:8px;align-items:center}.loyalty-card-actions button{min-height:36px;padding:8px 11px}.loyalty-danger{color:#d72c0d!important;border-color:#fed7d7!important;background:#fff5f5!important}.loyalty-muted-pill{display:inline-flex;align-items:center;border-radius:999px;background:#f2f4f7;color:#475467;padding:5px 8px;font-size:11px;font-weight:900;margin-right:4px}
      .loyalty-product-picked{margin-top:10px;border:1px solid #dbeafe;background:#eff6ff;border-radius:14px;padding:10px;display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center}.loyalty-product-picked img{width:54px;height:54px;object-fit:cover;border-radius:10px;background:#fff}.loyalty-product-picked strong{display:block}.loyalty-product-picked span{display:block;color:#475467;font-size:12px}
      .loyalty-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:none;align-items:center;justify-content:center;padding:22px}.loyalty-modal-backdrop.active{display:flex}.loyalty-modal{width:min(760px,96vw);max-height:86vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 24px 80px rgba(15,23,42,.28);border:1px solid #e5e7eb}.loyalty-modal-head{display:flex;justify-content:space-between;gap:16px;padding:22px 24px;border-bottom:1px solid var(--border)}.loyalty-modal-head h3{margin:0}.loyalty-modal-body{padding:20px 24px}.loyalty-modal-search{display:grid;grid-template-columns:1fr auto;gap:10px}.loyalty-modal-results{display:grid;gap:10px;margin-top:16px}.loyalty-product-result{display:grid;grid-template-columns:58px 1fr auto;gap:12px;align-items:center;border:1px solid var(--border);border-radius:14px;background:#fff;padding:10px}.loyalty-product-result img{width:58px;height:58px;border-radius:10px;object-fit:cover;background:#f3f4f6}.loyalty-product-result strong{display:block}.loyalty-product-result span{display:block;color:#667085;font-size:12px}
      .loyalty-tier-list{display:grid;gap:12px}.loyalty-tier-card{border:1px solid #dfe5ee;border-radius:16px;background:#fff;padding:14px}.loyalty-tier-head{display:grid;grid-template-columns:1fr 160px 160px auto;gap:10px;align-items:end}.loyalty-benefits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.loyalty-benefits label{display:flex!important;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:12px;padding:9px 10px;background:#fbfdff}.loyalty-benefits input{width:auto!important;margin:0!important}
      .loyalty-email-designer{display:grid;grid-template-columns:420px minmax(0,1fr);gap:18px;align-items:start}.loyalty-module-row{border:1px solid #dfe5ee;border-radius:14px;padding:12px;background:#fff;margin-top:10px}.loyalty-module-row-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.loyalty-module-row-head strong{display:block}.loyalty-module-move{display:flex;gap:6px}.loyalty-module-move button{min-height:32px;padding:6px 9px;border-radius:9px}.loyalty-checkout-customer-preview{border:1px solid #e5e7eb;border-radius:18px;background:#fff;padding:18px;box-shadow:0 12px 34px rgba(15,23,42,.07);max-width:520px}.loyalty-checkout-balance{display:block;color:#667085;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.loyalty-checkout-customer-preview h4{margin:6px 0 12px;font-size:18px}.loyalty-checkout-input-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.loyalty-checkout-input-row input{min-height:48px;border:1px solid #d1d5db;border-radius:12px;padding:10px 12px;font:inherit}.loyalty-checkout-help{color:#667085;font-size:13px;margin-top:10px;line-height:1.45}
      @media(max-width:1100px){.loyalty-v23-grid,.loyalty-email-designer{grid-template-columns:1fr}.loyalty-tier-head{grid-template-columns:1fr 1fr}.loyalty-benefits{grid-template-columns:1fr}.loyalty-list-card{grid-template-columns:58px 1fr}.loyalty-card-actions{grid-column:1/-1;justify-content:flex-end}}
    `;
    document.head.appendChild(style);
  }

  function ensureProductModal(){
    let modal = document.getElementById('loyalty-product-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'loyalty-product-modal';
    modal.className = 'loyalty-modal-backdrop';
    modal.innerHTML = `<div class="loyalty-modal"><div class="loyalty-modal-head"><div><h3>Select reward product</h3><p class="muted">Choose the Shopify product customers can redeem with points.</p></div><button class="secondary-btn" type="button" data-close>×</button></div><div class="loyalty-modal-body"><div class="loyalty-modal-search"><input id="loyalty-product-query" class="premium-input" placeholder="Search products by title or ID"><button class="primary-btn" id="loyalty-product-search" type="button">Search</button></div><div id="loyalty-product-results" class="loyalty-modal-results"><p class="muted">Search the Shopify catalogue.</p></div></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) modal.classList.remove('active'); });
    modal.querySelector('#loyalty-product-search').addEventListener('click', runProductSearch);
    modal.querySelector('#loyalty-product-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runProductSearch(); } });
    return modal;
  }

  function defaultEmailModules(){
    return [{ id: uid('email_module'), type:'reward_box', title:'Reward unlocked', body:'Your reward is ready to use on your next order.', backgroundColor:'#f8fafc', borderColor:'#e5e7eb', radius:16, padding:16, position:'after_body' }];
  }
  function defaultEmailTemplate(){ return { id:'loyalty_email_primary', name:'Reward ready', primary:true, status:'primary', subject:'Your reward is ready', heading:'Your reward is ready', subtitle:'A little thank-you from us.', body:'Thanks for being part of our rewards programme. Your {{ reward_type }} is now ready.', accentColor:'#111827', buttonText:'Shop now', modules: defaultEmailModules() }; }
  function defaultRewards(){ return [{ id:'reward_checkout_discount', name:'£5 off coupon', type:'discount', pointsCost:500, discountValue:5, enabled:true, betaCheckoutEnabled:true, discountMode:'draft_only', redeemQuantity:1, stockLimit:0 }]; }
  function defaultTiers(){ return [{id:'bronze',name:'Bronze',threshold:0,multiplier:1,perks:'Entry tier',ruleIds:[],rewardIds:[]},{id:'silver',name:'Silver',threshold:500,multiplier:1.2,perks:'Earn faster',ruleIds:[],rewardIds:[]},{id:'gold',name:'Gold',threshold:1500,multiplier:1.5,perks:'Best earn rate',ruleIds:[],rewardIds:[]}]; }

  function enhanceLoyaltyShell(){
    installStyles();
    const tabs = document.querySelector('.loyalty-tabs');
    if (tabs) tabs.classList.add('admin-sub-tabs');
    const rewardTab = document.getElementById('loyalty-tab-rewards');
    if (rewardTab && !rewardTab.dataset.v23) {
      rewardTab.dataset.v23='1';
      rewardTab.innerHTML = `<div class="loyalty-v23-grid"><div class="loyalty-builder-card"><h3>Add a reward</h3><p>Create catalogue rewards, checkout discounts, free shipping, or manual vouchers.</p><div class="loyalty-field-grid one"><label>Reward name<input id="loyalty-new-reward-name" class="premium-input" placeholder="£5 off coupon"></label></div><div class="loyalty-field-grid"><label>Reward type<select id="loyalty-new-reward-type" class="filter-select"><option value="discount">Checkout discount</option><option value="catalogue_item">Catalogue product</option><option value="free_shipping">Free shipping</option></select></label><label>Cost in points<input id="loyalty-new-reward-cost" class="premium-input" type="number" value="500" min="0"></label><label>Discount / value<input id="loyalty-new-reward-value" class="premium-input" type="number" value="5" min="0"></label><label>Redeem quantity<input id="loyalty-new-reward-quantity" class="premium-input" type="number" value="1" min="1"></label><label>Available to redeem<input id="loyalty-new-reward-stock" class="premium-input" type="number" value="0" min="0"><small class="muted">0 = no set limit.</small></label><label>Checkout beta<select id="loyalty-new-reward-checkout" class="filter-select"><option value="true">Available in checkout beta</option><option value="false">Not in checkout beta</option></select></label></div><div id="loyalty-picked-product" class="loyalty-product-picked" style="display:none"></div><div class="loyalty-action-row"><button class="secondary-btn" type="button" onclick="window.openLoyaltyProductPicker()">Search catalogue product</button><button class="primary-btn" type="button" onclick="window.addLoyaltyReward()">Add reward</button></div></div><div class="loyalty-builder-card"><h3>Rewards list</h3><p>Saved rewards appear here and can be used by tiers, checkout beta and future loyalty emails.</p><div id="loyalty-reward-list" class="loyalty-list"></div></div></div>`;
    }
    const tiersTab = document.getElementById('loyalty-tab-tiers');
    if (tiersTab && !tiersTab.dataset.v23) {
      tiersTab.dataset.v23='1';
      tiersTab.innerHTML = `<div class="loyalty-v23-grid"><div class="loyalty-builder-card"><h3>Add a tier</h3><p>Set thresholds and attach benefits from available earning rules and rewards.</p><div class="loyalty-field-grid"><label>Tier name<input id="loyalty-new-tier-name" class="premium-input" placeholder="VIP"></label><label>Points needed<input id="loyalty-new-tier-threshold" class="premium-input" type="number" min="0" value="3000"></label><label>Purchase multiplier<input id="loyalty-new-tier-multiplier" class="premium-input" type="number" step="0.1" value="2"></label><label>Birthday reward<select id="loyalty-new-tier-birthday" class="filter-select"><option value="false">No birthday reward</option><option value="true">Birthday reward enabled</option></select></label></div><label class="loyalty-full-label">Benefits text<textarea id="loyalty-new-tier-perks" class="premium-input" placeholder="Free shipping reward, birthday bonus, early access..."></textarea></label><div class="loyalty-benefits" id="loyalty-new-tier-benefits"></div><div class="loyalty-action-row"><button class="primary-btn" type="button" onclick="window.addLoyaltyTier()">Add tier</button></div></div><div class="loyalty-builder-card"><h3>Tier list</h3><p>Edit thresholds and benefits. Highest matching threshold becomes the customer tier.</p><div id="loyalty-tier-list" class="loyalty-tier-list"></div></div></div>`;
    }
    const emailTab = document.getElementById('loyalty-tab-email');
    if (emailTab && !emailTab.dataset.v23) {
      emailTab.dataset.v23='1';
      emailTab.innerHTML = `<div class="loyalty-email-designer"><div class="loyalty-builder-card"><h3>Loyalty email builder</h3><p>Create reward emails with reusable modules. Drafts can be worked on while the primary template stays live.</p><div class="loyalty-field-grid"><label>Template name<input id="loyalty-email-template-name" class="premium-input" value="Reward ready"></label><label>Status<select id="loyalty-email-template-primary" class="filter-select"><option value="primary">Primary/live</option><option value="draft">Draft</option></select></label></div><label class="loyalty-full-label">Subject<input id="loyalty-email-subject" class="premium-input" value="Your reward is ready"></label><label class="loyalty-full-label">Heading<input id="loyalty-email-heading" class="premium-input" value="Your reward is ready"></label><label class="loyalty-full-label">Email sub-title<input id="loyalty-email-subtitle" class="premium-input" value="A little thank-you from us."></label><label class="loyalty-full-label">Email body<textarea id="loyalty-email-body" class="premium-input">Thanks for being part of our rewards programme. Your {{ reward_type }} is now ready.</textarea></label><div class="loyalty-field-grid"><label>Accent colour<input id="loyalty-email-accent" class="premium-input" value="#111827"></label><label>Button text<input id="loyalty-email-button" class="premium-input" value="Shop now"></label></div><div class="loyalty-action-row"><select id="loyalty-module-type" class="filter-select"><option value="reward_box">Reward box</option><option value="notice">Notice</option><option value="offer">Offer</option><option value="support">Support note</option><option value="text">Plain text</option></select><button class="secondary-btn" type="button" onclick="window.addLoyaltyEmailModule()">Add module</button></div><div id="loyalty-email-module-list"></div><div class="loyalty-test-row input-action-row"><input id="loyalty-test-to" class="premium-input" placeholder="you@example.com"><button class="primary-btn" type="button" onclick="window.sendLoyaltyTestEmail()">Send Test</button></div><div class="loyalty-footer"><button class="primary-btn loyalty-save-btn" type="button" onclick="window.saveLoyaltyConfig()">Save email template</button></div></div><div class="loyalty-builder-card loyalty-preview-panel"><h3>Live preview</h3><div class="loyalty-preview-shell" id="loyalty-email-preview"></div></div></div>`;
    }
    const checkoutPreview = document.getElementById('loyalty-checkout-preview');
    if (checkoutPreview) window.updateLoyaltyCheckoutPreview?.();
  }

  function setFormValues(config){
    state.config = config || {};
    state.rewards = Array.isArray(config?.redemptionRewards) && config.redemptionRewards.length ? config.redemptionRewards.map(r => ({...r})) : defaultRewards();
    state.tiers = Array.isArray(config?.tiers) && config.tiers.length ? config.tiers.map(t => ({...t})) : defaultTiers();
    state.emailTemplates = Array.isArray(config?.emailTemplates) && config.emailTemplates.length ? config.emailTemplates.map(t => ({...defaultEmailTemplate(), ...t, modules: Array.isArray(t.modules) ? t.modules : defaultEmailModules()})) : [defaultEmailTemplate()];
    state.pointsRules = Array.isArray(config?.pointsRules) ? config.pointsRules.map(r => ({...r})) : [];
    const template = state.emailTemplates[0] || defaultEmailTemplate();
    const map = {
      'loyalty-email-template-name': template.name, 'loyalty-email-template-primary': template.status || (template.primary ? 'primary':'draft'), 'loyalty-email-subject': template.subject,
      'loyalty-email-heading': template.heading, 'loyalty-email-subtitle': template.subtitle || '', 'loyalty-email-body': template.body, 'loyalty-email-accent': template.accentColor, 'loyalty-email-button': template.buttonText,
      'loyalty-points-label': config?.pointName || 'Points', 'loyalty-points-label-overview': config?.pointName || 'Points'
    };
    Object.entries(map).forEach(([id,val]) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; });
    const enabled = document.getElementById('loyalty-enabled'); if (enabled) enabled.checked = Boolean(config?.enabled);
    const checkoutBeta = config?.settings?.checkoutBeta || {};
    ['loyalty-checkout-enabled','loyalty-checkout-native-codes'].forEach((id) => { const el=document.getElementById(id); if(el) el.checked = id==='loyalty-checkout-enabled' ? Boolean(checkoutBeta.enabled) : Boolean(checkoutBeta.allowNativeDiscountCodes); });
    const checkoutMap = {'loyalty-checkout-min-points':checkoutBeta.minimumPointsToShow ?? 1,'loyalty-checkout-max-points':checkoutBeta.maximumPointsPerCheckout ?? 5000,'loyalty-checkout-point-value':checkoutBeta.pointValueMinorUnits ?? 1,'loyalty-checkout-label':checkoutBeta.betaLabel || 'Use your points at checkout','loyalty-checkout-note':checkoutBeta.betaNote || 'Customers must be logged in before checkout redemption appears.'};
    Object.entries(checkoutMap).forEach(([id,val]) => { const el=document.getElementById(id); if(el) el.value=val; });
    renderRewards(); renderTiers(); renderEmailModules(); updateEmailPreview(); updateCheckoutPreview();
  }

  function renderRewards(){
    const list = document.getElementById('loyalty-reward-list'); if (!list) return;
    if (!state.rewards.length) { list.innerHTML = '<p class="muted">No rewards yet. Add one from the left.</p>'; return; }
    list.innerHTML = state.rewards.map((r, i) => `<div class="loyalty-list-card"><div>${r.productImage ? `<img src="${esc(r.productImage)}" alt="">` : '<div class="placeholder-img">★</div>'}</div><div><h4>${esc(r.name)}</h4><p><span class="loyalty-muted-pill">${esc(r.type || 'discount')}</span>${Number(r.pointsCost||0)} ${esc(pointsName())}${r.discountValue ? ` · ${esc(r.discountValue)} off` : ''}${r.productTitle ? `<br>${esc(r.productTitle)}${r.productPrice ? ` · ${money(r.productPrice)}` : ''}` : ''}<br>Redeem quantity: ${Number(r.redeemQuantity||1)} · Available: ${Number(r.stockLimit||0) || 'Unlimited'}${r.betaCheckoutEnabled ? ' · checkout beta' : ''}</p></div><div class="loyalty-card-actions"><button class="secondary-btn" type="button" onclick="window.editLoyaltyReward(${i})">Edit</button><button class="secondary-btn loyalty-danger" type="button" onclick="window.removeLoyaltyReward(${i})">×</button></div></div>`).join('');
  }
  function renderTierBenefits(targetId, selectedRules=[], selectedRewards=[]){
    const box = document.getElementById(targetId); if (!box) return;
    const rules = state.pointsRules || [];
    const rewards = state.rewards || [];
    box.innerHTML = [
      ...rules.map((r) => `<label><input type="checkbox" data-benefit-rule="${esc(r.id)}" ${selectedRules.includes(r.id)?'checked':''}> ${esc(r.name || r.trigger || 'Points rule')}</label>`),
      ...rewards.map((r) => `<label><input type="checkbox" data-benefit-reward="${esc(r.id)}" ${selectedRewards.includes(r.id)?'checked':''}> ${esc(r.name || 'Reward')}</label>`),
      '<label><input type="checkbox" data-benefit-birthday="true"> Birthday reward</label>'
    ].join('') || '<p class="muted">Add rewards or point rules first, then attach them to tiers.</p>';
  }
  function renderTiers(){
    renderTierBenefits('loyalty-new-tier-benefits');
    const list = document.getElementById('loyalty-tier-list'); if (!list) return;
    list.innerHTML = state.tiers.map((tier, i) => `<div class="loyalty-tier-card"><div class="loyalty-tier-head"><label>Tier name<input class="premium-input" value="${esc(tier.name)}" onchange="window.updateLoyaltyTier(${i},'name',this.value)"></label><label>Points needed<input class="premium-input" type="number" value="${Number(tier.threshold||0)}" onchange="window.updateLoyaltyTier(${i},'threshold',this.value)"></label><label>Multiplier<input class="premium-input" type="number" step="0.1" value="${Number(tier.multiplier||1)}" onchange="window.updateLoyaltyTier(${i},'multiplier',this.value)"></label><button class="secondary-btn loyalty-danger" type="button" onclick="window.removeLoyaltyTier(${i})">Remove</button></div><label class="loyalty-full-label">Benefits text<textarea class="premium-input" onchange="window.updateLoyaltyTier(${i},'perks',this.value)">${esc(tier.perks||'')}</textarea></label><div class="loyalty-benefits" id="tier-benefits-${i}"></div></div>`).join('');
    state.tiers.forEach((tier, i) => renderTierBenefits(`tier-benefits-${i}`, tier.ruleIds||[], tier.rewardIds||[]));
  }
  function renderEmailModules(){
    const template = state.emailTemplates[0] || defaultEmailTemplate();
    state.emailModules = Array.isArray(template.modules) ? template.modules : defaultEmailModules();
    const list = document.getElementById('loyalty-email-module-list'); if (!list) return;
    list.innerHTML = state.emailModules.map((m, i) => `<div class="loyalty-module-row"><div class="loyalty-module-row-head"><strong>${esc(m.title || m.type)}</strong><div class="loyalty-module-move"><button class="secondary-btn" type="button" onclick="window.moveLoyaltyEmailModule(${i},-1)">↕</button><button class="secondary-btn loyalty-danger" type="button" onclick="window.removeLoyaltyEmailModule(${i})">×</button></div></div><div class="loyalty-field-grid"><label>Title<input class="premium-input" value="${esc(m.title||'')}" oninput="window.updateLoyaltyEmailModule(${i},'title',this.value)"></label><label>Position<select class="filter-select" onchange="window.updateLoyaltyEmailModule(${i},'position',this.value)"><option value="before_body" ${m.position==='before_body'?'selected':''}>Before body</option><option value="after_body" ${m.position!=='before_body'&&m.position!=='after_reward'?'selected':''}>After body</option><option value="after_reward" ${m.position==='after_reward'?'selected':''}>After reward</option></select></label><label>Background<input class="premium-input" value="${esc(m.backgroundColor||'#f8fafc')}" oninput="window.updateLoyaltyEmailModule(${i},'backgroundColor',this.value)"></label><label>Border<input class="premium-input" value="${esc(m.borderColor||'#e5e7eb')}" oninput="window.updateLoyaltyEmailModule(${i},'borderColor',this.value)"></label></div><label class="loyalty-full-label">Text<textarea class="premium-input" oninput="window.updateLoyaltyEmailModule(${i},'body',this.value)">${esc(m.body||'')}</textarea></label></div>`).join('');
  }

  window.openLoyaltyProductPicker = function(){ const modal=ensureProductModal(); modal.classList.add('active'); setTimeout(()=>modal.querySelector('#loyalty-product-query')?.focus(),50); };
  async function runProductSearch(){
    const modal=ensureProductModal(); const q=modal.querySelector('#loyalty-product-query')?.value.trim()||''; const box=modal.querySelector('#loyalty-product-results');
    if(!q){ box.innerHTML='<p class="muted">Enter a search term.</p>'; return; }
    box.innerHTML='<p class="muted">Searching Shopify products…</p>';
    try{ const data=await adminFetch(`/admin/products/search?q=${encodeURIComponent(q)}`); const products=data.products||[]; if(!products.length){ box.innerHTML='<p class="muted">No products found.</p>'; return; }
      box.innerHTML=products.map((p,i)=>`<div class="loyalty-product-result"><img src="${esc(p.image||'')}" alt=""><div><strong>${esc(p.title)}</strong><span>ID ${esc(p.id)} · ${p.price?money(p.price):'No price'} · Stock ${Number(p.inventoryQuantity||0)}</span></div><button class="primary-btn" type="button" data-product-index="${i}">Select</button></div>`).join('');
      box.querySelectorAll('[data-product-index]').forEach((btn)=>btn.onclick=()=>{ const p=products[Number(btn.dataset.productIndex)]; window.loyaltyPickedProduct=p; const picked=document.getElementById('loyalty-picked-product'); picked.style.display='grid'; picked.innerHTML=`<img src="${esc(p.image||'')}" alt=""><div><strong>${esc(p.title)}</strong><span>${p.price?money(p.price):'No price'} · Stock ${Number(p.inventoryQuantity||0)}</span></div><button class="secondary-btn loyalty-danger" type="button" onclick="window.clearLoyaltyPickedProduct()">×</button>`; modal.classList.remove('active'); });
    } catch(error){ box.innerHTML=`<div class="notice-box error">${esc(error.message||'Product search failed')}</div>`; }
  }
  window.clearLoyaltyPickedProduct = function(){ window.loyaltyPickedProduct=null; const picked=document.getElementById('loyalty-picked-product'); if(picked){ picked.style.display='none'; picked.innerHTML=''; } };
  window.addLoyaltyReward = function(){
    const p=window.loyaltyPickedProduct || {};
    state.rewards.push({ id:uid('reward'), name:document.getElementById('loyalty-new-reward-name')?.value || p.title || 'New reward', type:document.getElementById('loyalty-new-reward-type')?.value || 'discount', pointsCost:Number(document.getElementById('loyalty-new-reward-cost')?.value||500), discountValue:Number(document.getElementById('loyalty-new-reward-value')?.value||0), redeemQuantity:Number(document.getElementById('loyalty-new-reward-quantity')?.value||1), stockLimit:Number(document.getElementById('loyalty-new-reward-stock')?.value||0), betaCheckoutEnabled:document.getElementById('loyalty-new-reward-checkout')?.value !== 'false', discountMode:'draft_only', enabled:true, shopifyProductId:p.id||'', shopifyVariantId:p.variantId||'', productTitle:p.title||'', productImage:p.image||'', productHandle:p.handle||'', productPrice:Number(p.price||0), minimumCartValue:0 });
    window.clearLoyaltyPickedProduct(); renderRewards(); renderTiers(); updateCheckoutPreview(); window.showToast?.('Reward added. Save loyalty settings to keep it.');
  };
  window.removeLoyaltyReward = function(i){ state.rewards.splice(i,1); renderRewards(); renderTiers(); updateCheckoutPreview(); };
  window.editLoyaltyReward = function(i){ const r=state.rewards[i]; if(!r) return; const name=prompt('Reward name', r.name); if(name!==null) r.name=name; const cost=prompt(`Cost in ${pointsName()}`, r.pointsCost); if(cost!==null) r.pointsCost=Number(cost||r.pointsCost); renderRewards(); updateCheckoutPreview(); };

  window.addLoyaltyTier = function(){
    const benefitBox = document.getElementById('loyalty-new-tier-benefits');
    state.tiers.push({ id:uid('tier'), name:document.getElementById('loyalty-new-tier-name')?.value || 'New tier', threshold:Number(document.getElementById('loyalty-new-tier-threshold')?.value||0), multiplier:Number(document.getElementById('loyalty-new-tier-multiplier')?.value||1), perks:document.getElementById('loyalty-new-tier-perks')?.value || '', birthdayRewardEnabled:document.getElementById('loyalty-new-tier-birthday')?.value==='true', ruleIds:[...benefitBox.querySelectorAll('[data-benefit-rule]:checked')].map(x=>x.dataset.benefitRule), rewardIds:[...benefitBox.querySelectorAll('[data-benefit-reward]:checked')].map(x=>x.dataset.benefitReward) });
    renderTiers(); window.showToast?.('Tier added. Save loyalty settings to keep it.');
  };
  window.removeLoyaltyTier = function(i){ if(state.tiers.length<=1){ window.showToast?.('Keep at least one tier.'); return; } state.tiers.splice(i,1); renderTiers(); };
  window.updateLoyaltyTier = function(i,k,v){ if(!state.tiers[i]) return; state.tiers[i][k] = ['threshold','multiplier'].includes(k) ? Number(v||0) : v; };

  window.addLoyaltyEmailModule = function(){ const t=state.emailTemplates[0] || defaultEmailTemplate(); if(!Array.isArray(t.modules)) t.modules=[]; const type=document.getElementById('loyalty-module-type')?.value || 'notice'; t.modules.push({ id:uid('email_module'), type, title:type==='offer'?'Special offer':type==='support'?'Need help?':type==='reward_box'?'Reward unlocked':'Notice', body:type==='offer'?'Use this reward on your next order.':type==='support'?'Reply to this email if you need help.':'A quick note for your customer.', backgroundColor:'#f8fafc', borderColor:'#e5e7eb', radius:16, padding:16, position:'after_body' }); renderEmailModules(); updateEmailPreview(); };
  window.removeLoyaltyEmailModule = function(i){ const t=state.emailTemplates[0]; t.modules.splice(i,1); renderEmailModules(); updateEmailPreview(); };
  window.moveLoyaltyEmailModule = function(i,dir){ const t=state.emailTemplates[0]; const j=i+dir; if(j<0||j>=t.modules.length) return; [t.modules[i],t.modules[j]]=[t.modules[j],t.modules[i]]; renderEmailModules(); updateEmailPreview(); };
  window.updateLoyaltyEmailModule = function(i,k,v){ const t=state.emailTemplates[0]; if(!t?.modules?.[i]) return; t.modules[i][k]=['radius','padding'].includes(k)?Number(v||0):v; updateEmailPreview(); };

  function syncEmailTemplateFromInputs(){
    const t = state.emailTemplates[0] || defaultEmailTemplate();
    t.name=document.getElementById('loyalty-email-template-name')?.value || t.name;
    t.status=document.getElementById('loyalty-email-template-primary')?.value || t.status;
    t.primary=t.status==='primary'; t.subject=document.getElementById('loyalty-email-subject')?.value || t.subject; t.heading=document.getElementById('loyalty-email-heading')?.value || t.heading; t.subtitle=document.getElementById('loyalty-email-subtitle')?.value || ''; t.body=document.getElementById('loyalty-email-body')?.value || t.body; t.accentColor=document.getElementById('loyalty-email-accent')?.value || t.accentColor; t.buttonText=document.getElementById('loyalty-email-button')?.value || t.buttonText; state.emailTemplates[0]=t; return t;
  }
  function moduleHtml(module){ return `<div style="margin:12px 0;padding:${Number(module.padding||16)}px;background:${esc(module.backgroundColor||'#f8fafc')};border:1px solid ${esc(module.borderColor||'#e5e7eb')};border-radius:${Number(module.radius||16)}px;text-align:left;"><strong style="display:block;margin-bottom:6px;">${esc(module.title||'')}</strong><div style="color:#4b5563;line-height:1.55;">${esc(module.body||'')}</div></div>`; }
  function updateEmailPreview(){ const box=document.getElementById('loyalty-email-preview'); if(!box) return; const t=syncEmailTemplateFromInputs(); const accent=t.accentColor||'#111827'; const mods=t.modules||[]; const before=mods.filter(m=>m.position==='before_body').map(moduleHtml).join(''); const after=mods.filter(m=>m.position!=='before_body'&&m.position!=='after_reward').map(moduleHtml).join(''); const reward=mods.filter(m=>m.position==='after_reward').map(moduleHtml).join(''); box.innerHTML=`<div style="background:#f3f4f6;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#111827;"><div style="max-width:580px;margin:0 auto;background:#fff;border-radius:20px;padding:30px;border:1px solid #e5e7eb;text-align:center;"><div style="display:inline-flex;border-radius:999px;background:${esc(accent)};color:#fff;padding:6px 10px;font-size:12px;font-weight:800;margin-bottom:14px;">Rewards</div><h1 style="margin:0 0 8px;font-size:30px;line-height:1.15;">${esc(t.heading)}</h1><p style="margin:0 0 16px;color:#667085;">${esc(t.subtitle||'')}</p>${before}<p style="font-size:16px;line-height:1.65;color:#4b5563;">${esc(t.body).replace(/\{\{\s*reward_type\s*\}\}/g,'10% discount')}</p>${after}<div style="margin:22px auto;padding:18px;border:2px dashed ${esc(accent)};border-radius:16px;font-weight:900;font-size:28px;max-width:280px;color:${esc(accent)};">10% OFF</div>${reward}<a href="https://${esc(window.SHOP_DOMAIN||'')}" style="display:inline-block;background:${esc(accent)};color:#fff;text-decoration:none;border-radius:14px;padding:14px 20px;font-weight:900;">${esc(t.buttonText)}</a><p style="margin-top:20px;font-size:12px;color:#667085;">Sent by ${esc(window.SHOP_DOMAIN||'your store')}</p></div></div>`; }
  window.updateLoyaltyPreview = updateEmailPreview;
  function updateCheckoutPreview(){ const box=document.getElementById('loyalty-checkout-preview'); if(!box) return; const available=1250; const pointName=pointsName(); const max=Number(document.getElementById('loyalty-checkout-max-points')?.value||5000); const valueMinor=Number(document.getElementById('loyalty-checkout-point-value')?.value||1); const redeem=Math.min(500, available, max); box.innerHTML=`<div class="loyalty-checkout-customer-preview"><span class="loyalty-checkout-balance">Available: ${available.toLocaleString()} ${esc(pointName)} · about ${money((available*valueMinor)/100)}</span><h4>${esc(document.getElementById('loyalty-checkout-label')?.value||'Use your points at checkout')}</h4><div class="loyalty-checkout-input-row"><label style="display:block;font-size:12px;font-weight:900;color:#344054;">${esc(pointName)} to redeem<input value="${redeem}" readonly></label><button class="primary-btn" type="button" disabled>Apply</button></div><p class="loyalty-checkout-help">Customers can type how many ${esc(pointName)} to use, up to their balance and your checkout beta maximum. This is built as a Checkout UI Extension scaffold, not Liquid.</p></div>`; }
  window.updateLoyaltyCheckoutPreview = updateCheckoutPreview;

  function buildPayload(){
    const t=syncEmailTemplateFromInputs();
    return { enabled:Boolean(document.getElementById('loyalty-enabled')?.checked), pointName:pointsName(), emailTemplates:state.emailTemplates, tiers:state.tiers, redemptionRewards:state.rewards, rewardTemplates:state.config?.rewardTemplates||[], pointsRules:state.config?.pointsRules||[], settings:{ ...(state.config?.settings||{}), reuseCoreEmailProvider:Boolean(document.getElementById('loyalty-reuse-email-provider')?.checked ?? true), checkoutBeta:{ ...(state.config?.settings?.checkoutBeta||{}), enabled:Boolean(document.getElementById('loyalty-checkout-enabled')?.checked), betaLabel:document.getElementById('loyalty-checkout-label')?.value || 'Use your points at checkout', minimumPointsToShow:Number(document.getElementById('loyalty-checkout-min-points')?.value||1), maximumPointsPerCheckout:Number(document.getElementById('loyalty-checkout-max-points')?.value||5000), pointValueMinorUnits:Number(document.getElementById('loyalty-checkout-point-value')?.value||1), allowNativeDiscountCodes:Boolean(document.getElementById('loyalty-checkout-native-codes')?.checked), requireLoggedInCustomer:true, allowPartialRedemption:true, betaNote:document.getElementById('loyalty-checkout-note')?.value || 'Customers must be logged in before checkout redemption appears.' } } };
  }
  async function loadAll(){
    enhanceLoyaltyShell();
    const config=await adminFetch('/admin/loyalty/config');
    setFormValues(config||{});
    try{ const [ledger] = await Promise.all([adminFetch('/admin/loyalty/ledger?limit=25'), window.loadLoyaltyRedemptions?.(), window.searchLoyaltyCustomers?Promise.resolve():Promise.resolve()]); if (typeof renderLedger === 'function') renderLedger(ledger.rows||[]); }catch{}
  }
  window.loadLoyaltyConfig = async function(){ try{ await loadAll(); }catch(error){ console.warn('Could not load loyalty config:', error); window.showToast?.(error.message||'Could not load loyalty config'); } };
  window.saveLoyaltyConfig = async function(){ try{ const saved=await adminFetch('/admin/loyalty/config',{method:'PATCH',body:JSON.stringify(buildPayload())}); setFormValues(saved||{}); window.showToast?.('Loyalty settings saved'); }catch(error){ window.showToast?.(error.message||'Could not save loyalty settings'); } };
  document.addEventListener('input', (event)=>{ if(event.target.closest('#loyalty-tab-email')) updateEmailPreview(); if(event.target.closest('#loyalty-tab-checkout')) updateCheckoutPreview(); });
  document.addEventListener('change', (event)=>{ if(event.target.closest('#loyalty-tab-email')) updateEmailPreview(); if(event.target.closest('#loyalty-tab-checkout')) updateCheckoutPreview(); });
  document.addEventListener('click', (event)=>{ const btn=event.target.closest('[data-loyalty-tab]'); if(!btn) return; setTimeout(()=>{ enhanceLoyaltyShell(); renderRewards(); renderTiers(); renderEmailModules(); updateEmailPreview(); updateCheckoutPreview(); }, 25); });
  setTimeout(()=>{ enhanceLoyaltyShell(); renderRewards(); renderTiers(); renderEmailModules(); updateEmailPreview(); updateCheckoutPreview(); }, 700);
})();

/* v23 loyalty test email override */
(function(){
  window.sendLoyaltyTestEmail = async function(){
    const to = document.getElementById('loyalty-test-to')?.value || '';
    if (!to) { window.showToast?.('Enter a test recipient email.'); return; }
    if (typeof window.updateLoyaltyPreview === 'function') window.updateLoyaltyPreview();
    const preview = document.getElementById('loyalty-email-preview')?.innerHTML || '<p>Your reward is ready.</p>';
    try {
      await adminFetch('/admin/loyalty/test-email', {
        method: 'POST',
        body: JSON.stringify({ to, subject: document.getElementById('loyalty-email-subject')?.value || 'Your reward is ready', html: preview }),
      });
      window.showToast?.('Loyalty test email sent.');
    } catch (error) {
      window.showToast?.(error.message || 'Could not send loyalty test email');
    }
  };
})();
