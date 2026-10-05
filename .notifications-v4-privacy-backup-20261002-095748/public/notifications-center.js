(function(){
  if (window.__ELEV8_NOTIFICATIONS_CENTER_V3__) return;
  window.__ELEV8_NOTIFICATIONS_CENTER_V3__ = true;

  const state = {
    tab: 'overview',
    summary: null,
    config: null,
    demand: { items: [], archivedItems: [], hiddenItems: [], missingItems: [], totals: {} },
    subscriptions: [],
    events: [],
    flowConnections: { selectedRestock: 'legacy-tags', selectedArchived: 'none', connections: [] },
    emailType: 'restock',
    emailSample: null,
    previewMode: 'desktop',
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m]));
  const api = (path, opts = {}) => window.adminFetch(path, { ...opts, headers: { 'Content-Type':'application/json', ...(opts.headers || {}) } });
  const val = (id, fallback = '') => document.getElementById(id)?.value ?? fallback;
  const checked = (id, fallback = false) => document.getElementById(id)?.checked ?? fallback;
  const toast = (msg) => window.showToast?.(msg);
  const fmt = (d) => d ? new Intl.DateTimeFormat('en-GB', { dateStyle:'medium', timeStyle:'short' }).format(new Date(d)) : '—';
  const fmtShort = (d) => d ? new Intl.DateTimeFormat('en-GB', { dateStyle:'medium' }).format(new Date(d)) : 'Not recorded yet';

  function mode(){ return state.config?.delivery?.mode || 'flow'; }
  function sf(){ return state.config?.storefront || {}; }
  function currentEmail(){ return state.emailType === 'archived' ? (state.config?.archivedEmail || {}) : (state.config?.email || {}); }
  function selectedFlowKey(type = state.emailType){
    if (type === 'archived') return state.config?.delivery?.archivedFlowConnectionKey || 'none';
    return state.config?.delivery?.flowConnectionKey || 'legacy-tags';
  }
  function connectionFor(key){ return (state.flowConnections?.connections || []).find((x) => x.key === key) || null; }
  function flowReady(connection){
    if (!connection) return false;
    if (connection.key === 'legacy-tags') return Boolean(state.summary?.readiness?.readCustomersScope && state.summary?.readiness?.writeCustomersScope);
    return Boolean(connection.connected);
  }
  function deliveryLabel(){
    if (mode() !== 'flow') return 'ELEV8 direct email';
    const c = connectionFor(selectedFlowKey('restock'));
    return c?.label || 'Shopify Flow';
  }

  function installNav(){
    if (document.querySelector('[data-product-key="notifications"]')) return;
    const group = [...document.querySelectorAll('.sidebar .nav-group')].find((g) => g.querySelector('.nav-title')?.textContent.trim() === 'Products');
    if (!group) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn product-tab-btn';
    btn.dataset.productKey = 'notifications';
    btn.innerHTML = '<span>Notifications <span id="nav-status-notifications" class="tab-status-dot hidden"></span></span><span class="pill">Beta</span>';
    btn.onclick = () => window.Elev8Notifications.open();
    group.appendChild(btn);
  }

  function installView(){
    if (document.getElementById('v-notifications')) return;
    const main = document.querySelector('.main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'v-notifications';
    section.className = 'view';
    section.innerHTML = `
      <div class="n-head">
        <div><h2 class="page-title" style="margin-bottom:6px">Notifications Center</h2><p>Restock demand, archived demand, Flow connections, customer messaging and storefront controls.</p></div>
        <button class="primary-btn" id="n-save-top" type="button">Save changes</button>
      </div>
      <div class="n-tabs" role="tablist">
        <button class="n-tab active" data-n-tab="overview">Overview</button>
        <button class="n-tab" data-n-tab="restock">Live demand</button>
        <button class="n-tab" data-n-tab="archived">Archived demand</button>
        <button class="n-tab" data-n-tab="button">Button & popup</button>
        <button class="n-tab" data-n-tab="email">Email designer</button>
        <button class="n-tab" data-n-tab="activity">Activity</button>
        <button class="n-tab" data-n-tab="settings">Settings</button>
      </div>
      <div id="n-pane-overview" class="n-pane active"></div>
      <div id="n-pane-restock" class="n-pane"></div>
      <div id="n-pane-archived" class="n-pane"></div>
      <div id="n-pane-button" class="n-pane"></div>
      <div id="n-pane-email" class="n-pane"></div>
      <div id="n-pane-activity" class="n-pane"></div>
      <div id="n-pane-settings" class="n-pane"></div>`;
    main.appendChild(section);
    section.addEventListener('click', handleClick);
    section.addEventListener('input', handleInput);
    section.addEventListener('change', handleInput);
    document.getElementById('n-save-top').onclick = () => saveConfig();
  }

  function injectHomeTile(){
    const tiles = document.querySelector('#elev8-launch .e8-tiles');
    if (!tiles || tiles.querySelector('[data-open-notifications]')) return;
    const b = document.createElement('button');
    b.className = 'e8-tile';
    b.setAttribute('data-open-notifications', 'true');
    b.innerHTML = '<span class="e8-tile-icon">◔</span><h3>Notifications Center</h3><p>Live and archived product demand, Flow connections and customer notification design.</p><span class="n-home-tile-badge">New</span><b>→</b>';
    b.onclick = (e) => { e.preventDefault(); window.Elev8Notifications.open(); };
    tiles.appendChild(b);
  }

  function installHomeObserver(){
    injectHomeTile();
    const root = document.getElementById('elev8-launch');
    if (root) new MutationObserver(injectHomeTile).observe(root, { childList:true, subtree:true });
  }

  function setTab(name){
    state.tab = name;
    document.querySelectorAll('#v-notifications .n-tab').forEach((x) => x.classList.toggle('active', x.dataset.nTab === name));
    document.querySelectorAll('#v-notifications .n-pane').forEach((x) => x.classList.toggle('active', x.id === `n-pane-${name}`));
    if (name === 'restock' || name === 'archived') loadDemand();
    if (name === 'restock') loadSubscriptions();
    if (name === 'activity') loadEvents();
  }

  async function load(){
    try {
      const [summary, config, demand, flowConnections] = await Promise.all([
        api('/admin/notifications/summary'),
        api('/admin/notifications/config'),
        api('/admin/notifications/demand').catch((e) => ({ items:[], archivedItems:[], hiddenItems:[], missingItems:[], totals:{}, error:e.message })),
        api('/admin/notifications/flow-connections').catch(() => ({ connections:[] })),
      ]);
      state.summary = summary;
      state.config = config;
      state.demand = demand;
      state.flowConnections = flowConnections;
      renderAll();
      updateDot();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Could not load Notifications Center');
    }
  }

  async function loadDemand(){
    try {
      state.demand = await api('/admin/notifications/demand');
      renderOverview(); renderRestock(); renderArchived(); renderEmail();
    } catch (e) {
      state.demand = { items:[], archivedItems:[], hiddenItems:[], missingItems:[], totals:{}, error:e.message };
      renderRestock(); renderArchived();
      toast(e.message || 'Could not refresh Shopify restock demand');
    }
  }
  async function loadSubscriptions(){
    try { state.subscriptions = await api('/admin/notifications/subscriptions?limit=250'); renderRestock(); }
    catch (e) { toast(e.message || 'Could not load ELEV8 subscriptions'); }
  }
  async function loadEvents(){
    try { state.events = await api('/admin/notifications/events?limit=150'); renderActivity(); }
    catch (e) { toast(e.message || 'Could not load activity'); }
  }
  async function loadFlowConnections(){
    try { state.flowConnections = await api('/admin/notifications/flow-connections'); renderSettings(); renderEmail(); updateDot(); }
    catch (e) { toast(e.message || 'Could not refresh Flow connections'); }
  }

  function updateDot(){
    const dot = document.getElementById('nav-status-notifications');
    if (!dot) return;
    const r = state.summary?.readiness || {};
    const base = state.config?.enabled !== false && state.config?.restockEnabled !== false;
    let live = false;
    if (mode() === 'flow') live = base && flowReady(connectionFor(selectedFlowKey('restock'))) && r.readCustomersScope;
    else live = base && r.email && r.webhook && r.readInventoryScope;
    dot.classList.toggle('hidden', false);
    dot.classList.toggle('live', live);
    dot.classList.toggle('warning', !live);
    dot.title = live ? `${deliveryLabel()} ready` : 'Notifications need setup';
  }

  function renderAll(){ renderOverview(); renderRestock(); renderArchived(); renderButton(); renderEmail(); renderActivity(); renderSettings(); }
  function stat(label, value, help = ''){ return `<div class="n-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${help ? `<small>${esc(help)}</small>` : ''}</div>`; }
  function readiness(label, ok, help){ return `<div class="n-ready-row"><div><strong>${esc(label)}</strong><div>${esc(help || '')}</div></div><span class="n-pill ${ok ? 'good':'warn'}">${ok ? 'Ready':'Needs setup'}</span></div>`; }

  function renderOverview(){
    const p = document.getElementById('n-pane-overview'); if (!p) return;
    const t = state.demand?.totals || {}, r = state.summary?.readiness || {}, items = (state.demand?.items || []).slice(0, 7);
    const connection = connectionFor(selectedFlowKey('restock'));
    p.innerHTML = `
      <div class="n-stat-grid">
        ${stat('Live customers waiting', t.customers || 0, `${t.products || 0} live variants`)}
        ${stat('Archived demand', t.archivedCustomers || 0, `${t.archivedProducts || 0} archived variants`)}
        ${stat('Shopify-tag customers', t.legacyCustomers || 0, 'Existing + new restock tags')}
        ${stat('Hidden / missing', Number(t.hiddenProducts || 0) + Number(t.missingProducts || 0), 'Draft, unpublished or deleted')}
      </div>
      <div class="n-grid-2">
        <div class="n-card"><div class="n-card-head"><div><h3>Most wanted live products</h3><p>Only ACTIVE products published to the Online Store appear here.</p></div><button class="secondary-btn" data-n-action="refresh-demand">Refresh</button></div>${demandTable(items, 'live', true)}</div>
        <div class="n-card"><h3>Current delivery connection</h3><p>${mode()==='flow' ? 'ELEV8 keeps customer demand in Shopify and hands notification events to the selected Flow connection.' : 'ELEV8 sends directly through the shared email provider.'}</p><div class="n-delivery-chip"><span class="n-live-dot"></span>${esc(mode()==='flow' ? (connection?.label || 'Shopify Flow') : 'ELEV8 direct email')}</div><div class="n-readiness" style="margin-top:14px">${mode()==='flow' ? `${readiness('Selected Flow connection', flowReady(connection), connection?.description || 'Choose a Flow connection')}${readiness('Customer tag access', r.readCustomersScope && r.writeCustomersScope, 'read_customers + write_customers')}${readiness('Stock history webhook', r.webhook, 'inventory_levels/update')}` : `${readiness('Email provider', r.email, 'Shared ELEV8 SMTP provider')}${readiness('Inventory webhook', r.webhook, 'Stock transition detection')}${readiness('Inventory permission', r.readInventoryScope, 'read_inventory')}`}</div><div class="n-actions"><button class="secondary-btn" data-n-goto="settings">Flow connections</button><button class="secondary-btn" data-n-goto="email">Email designer</button></div></div>
      </div>`;
  }

  function productCell(x){
    return `<div class="n-product-cell">${x.productImage ? `<img src="${esc(x.productImage)}" alt="">` : '<span class="n-product-placeholder"></span>'}<div><strong>${esc(x.productTitle || 'Product')}</strong><small>${esc(x.variantTitle || 'Default')} · ${esc(x.variantId)}</small>${x.productUrl ? `<a href="${esc(x.productUrl)}" target="_blank" rel="noopener">View product ↗</a>` : ''}</div></div>`;
  }

  function demandTable(items, type = 'live', compact = false){
    if (state.demand?.error) return `<div class="n-empty"><strong>Could not read Shopify demand.</strong><br>${esc(state.demand.error)}</div>`;
    if (!items.length) return `<div class="n-empty">${type === 'archived' ? 'No archived products currently have outstanding restock demand.' : 'No live restock demand found.'}</div>`;
    if (type === 'archived') {
      return `<div class="n-table-wrap"><table class="n-table"><thead><tr><th>Product</th><th>Waiting</th><th>Last in stock</th><th>First request</th><th></th></tr></thead><tbody>${items.map((x) => `<tr><td>${productCell(x)}</td><td><span class="n-demand-count">${Number(x.totalWaiting || 0)}</span></td><td><strong>${fmtShort(x.lastInStockAt)}</strong>${x.lastObservedAt ? `<small class="n-block-muted">Last observed ${fmt(x.lastObservedAt)}</small>` : '<small class="n-block-muted">History starts after V3 telemetry is enabled</small>'}</td><td>${fmt(x.firstRequestedAt)}</td><td><div class="n-row-actions"><button class="secondary-btn n-small-btn" data-n-action="prepare-archive-email" data-variant-id="${esc(x.variantId)}">Prepare email</button><button class="secondary-btn n-small-btn" data-n-action="dispatch-archive" data-variant-id="${esc(x.variantId)}" ${flowReady(connectionFor(selectedFlowKey('archived'))) ? '' : 'disabled'}>Send via Flow</button></div></td></tr>`).join('')}</tbody></table></div>`;
    }
    return `<div class="n-table-wrap"><table class="n-table"><thead><tr><th>Product</th><th>Waiting</th>${compact ? '' : '<th>Sources</th><th>Stock now</th><th>Last in stock</th><th>Out of stock since</th>'}<th>First request</th></tr></thead><tbody>${items.map((x) => `<tr><td>${productCell(x)}</td><td><span class="n-demand-count">${Number(x.totalWaiting || 0)}</span></td>${compact ? '' : `<td><small>Shopify ${Number(x.legacyWaiting || 0)}<br>ELEV8 ${Number(x.elev8Waiting || 0)}</small></td><td><span class="n-pill ${x.availableForSale ? 'good':'warn'}">${x.availableForSale ? `${Number(x.inventoryQuantity || 0)} available` : 'Sold out'}</span></td><td>${fmtShort(x.lastInStockAt)}</td><td>${x.outOfStockSince ? fmt(x.outOfStockSince) : '—'}</td>`}<td>${fmt(x.firstRequestedAt)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderRestock(){
    const p = document.getElementById('n-pane-restock'); if (!p) return;
    const items = state.demand?.items || [], t = state.demand?.totals || {};
    p.innerHTML = `<div class="n-card"><div class="n-card-head"><div><h3>Live restock demand</h3><p>Only products that are ACTIVE and published to the Online Store are shown. Draft, unpublished and archived products are removed from this purchasing view.</p></div><button class="secondary-btn" data-n-action="refresh-demand">Refresh Shopify</button></div><div class="n-mini-stats"><span><strong>${Number(t.customers || 0)}</strong> customers waiting</span><span><strong>${Number(t.products || 0)}</strong> live variants</span><span><strong>${Number(t.legacyCustomers || 0)}</strong> Shopify-tag customers</span></div>${demandTable(items, 'live', false)}${state.demand?.refreshedAt ? `<div class="n-refresh-note">Refreshed ${fmt(state.demand.refreshedAt)} · live product state comes from Shopify</div>` : ''}</div><div class="n-card" style="margin-top:16px"><h3>Individual ELEV8 subscriptions</h3><p>Useful for delivery and debugging. The table above is the stock-selection view.</p>${subscriptionTable()}</div>`;
  }

  function renderArchived(){
    const p = document.getElementById('n-pane-archived'); if (!p) return;
    const items = state.demand?.archivedItems || [], t = state.demand?.totals || {};
    p.innerHTML = `<div class="n-card"><div class="n-card-head"><div><h3>Archived demand</h3><p>Customers who asked for stock before the product was archived. Nothing is emailed automatically unless you explicitly enable archived auto-send.</p></div><button class="secondary-btn" data-n-action="refresh-demand">Refresh Shopify</button></div><div class="n-mini-stats"><span><strong>${Number(t.archivedCustomers || 0)}</strong> customers waiting</span><span><strong>${Number(t.archivedProducts || 0)}</strong> archived variants</span><span><strong>${Number(t.hiddenProducts || 0)}</strong> draft/unpublished hidden</span><span><strong>${Number(t.missingProducts || 0)}</strong> deleted/missing</span></div>${demandTable(items, 'archived', false)}<div class="n-setup-note" style="margin-top:16px"><strong>Last in stock</strong> is recorded from the inventory webhook from V3 onwards. Existing sold-out products may initially say “Not recorded yet” because Shopify does not provide a historical last-in-stock timestamp through the current product snapshot.</div></div>`;
  }

  function subscriptionTable(){
    if (!state.subscriptions.length) return '<div class="n-empty">No ELEV8 subscriptions loaded.</div>';
    return `<div class="n-table-wrap"><table class="n-table"><thead><tr><th>Customer</th><th>Product</th><th>Status</th><th>Subscribed</th></tr></thead><tbody>${state.subscriptions.slice(0,100).map((x) => `<tr><td>${esc(x.email || 'Hidden')}</td><td><strong>${esc(x.productTitle || 'Product')}</strong><small class="n-block-muted">${esc(x.variantTitle || x.variantId || '')}</small></td><td><span class="n-pill ${x.status === 'active' ? 'good' : ''}">${esc(x.status)}</span></td><td>${fmt(x.subscribedAt)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderButton(){
    const p = document.getElementById('n-pane-button'); if (!p) return;
    const c = sf();
    p.innerHTML = `<div class="n-grid-2"><div class="n-card"><h3>Product page buttons</h3><p>ELEV8 keeps the in-stock and sold-out CTA geometry consistent.</p><div class="n-form-grid"><div class="n-field full"><label>In-stock label</label><input id="n-sf-instock-label" value="${esc(c.inStockLabel || 'Add to cart')}"></div><div class="n-field"><label>Add to Cart background</label><input id="n-sf-instock-bg" type="color" value="${esc(c.inStockBackground || '#111111')}"></div><div class="n-field"><label>Add to Cart text</label><input id="n-sf-instock-text" type="color" value="${esc(c.inStockTextColor || '#ffffff')}"></div><div class="n-field full"><label>Sold-out label</label><input id="n-sf-label" value="${esc(c.soldOutLabel || 'Notify me when available')}"></div><div class="n-field full"><label>Subscribed label</label><input id="n-sf-subscribed" value="${esc(c.subscribedLabel || 'Notification active')}"></div><div class="n-field"><label>Style</label><select id="n-sf-style"><option value="outline" ${c.style !== 'solid' ? 'selected':''}>Outline</option><option value="solid" ${c.style === 'solid' ? 'selected':''}>Solid</option></select></div><div class="n-field"><label>Height</label><input id="n-sf-height" type="number" min="44" max="72" value="${Number(c.height || 56)}"></div><div class="n-field"><label>Radius</label><input id="n-sf-radius" type="number" min="0" max="30" value="${Number(c.radius || 8)}"></div><div class="n-field"><label>Notify background</label><input id="n-sf-bg" type="color" value="${esc(c.background || '#111111')}"></div><div class="n-field"><label>Notify text</label><input id="n-sf-text" type="color" value="${esc(c.textColor || '#ffffff')}"></div><div class="n-field"><label>Outline</label><input id="n-sf-outline" type="color" value="${esc(c.outlineColor || '#d7dce1')}"></div><div class="n-field full"><label class="n-check"><input id="n-sf-bell" type="checkbox" ${c.showBellIcon !== false ? 'checked':''}><span>Show notification icon</span></label></div><div class="n-field full"><label>Popup heading</label><input id="n-sf-modal-title" value="${esc(c.modalTitle || 'Get notified when it’s back')}"></div><div class="n-field full"><label>Popup copy</label><textarea id="n-sf-modal-copy">${esc(c.modalCopy || '')}</textarea></div></div></div><div class="n-card"><h3>Live button preview</h3><div class="n-preview-wrap"><div class="n-preview-stack"><button id="n-atc-preview" class="n-preview-button">Add to cart</button><button id="n-button-preview" class="n-preview-button">Notify me when available</button></div></div></div></div>`;
    updateButtonPreview();
  }

  function emailDefaults(type){
    if (type === 'archived') return { subject:'An update about {{ product_title }}', preheader:'An update on the item you asked us to restock.', eyebrow:'Product update', heading:'A quick update.', body:'{{ product_title }} is no longer part of our current range. We’re sorry we couldn’t get this one back for you.', buttonLabel:'Browse alternatives', footer:'You received this message because you asked us to notify you about this product.', align:'center', backgroundColor:'#f5f7f8', cardColor:'#ffffff', accentColor:'#8a5a00', textColor:'#111827', mutedTextColor:'#667085', buttonBackground:'#111827', buttonTextColor:'#ffffff', buttonRadius:9, cardRadius:18, imageRadius:14, contentWidth:620, showProductImage:true, showVariant:true, logoUrl:'' };
    return { subject:'{{ product_title }} is back in stock', preheader:'The item you asked us to watch is available again.', eyebrow:'Back in stock', heading:'It’s back.', body:'{{ product_title }} is available again. Stock can move quickly, so take another look while it’s here.', buttonLabel:'Shop now', footer:'You received this one-time message because you asked to be notified when this item returned.', align:'center', backgroundColor:'#f5f7f8', cardColor:'#ffffff', accentColor:'#17657a', textColor:'#111827', mutedTextColor:'#667085', buttonBackground:'#111827', buttonTextColor:'#ffffff', buttonRadius:9, cardRadius:18, imageRadius:14, contentWidth:620, showProductImage:true, showVariant:true, logoUrl:'' };
  }

  function flowOptions(type){
    const purpose = type === 'archived' ? 'archived' : 'restock';
    const selected = selectedFlowKey(type);
    const rows = (state.flowConnections?.connections || []).filter((x) => x.purpose === purpose);
    let html = type === 'archived' ? `<option value="none" ${selected === 'none' ? 'selected':''}>No Flow — prepare only</option>` : '';
    html += rows.map((x) => `<option value="${esc(x.key)}" ${selected === x.key ? 'selected':''}>${esc(x.label)}${flowReady(x) ? ' · connected' : x.key === 'legacy-tags' ? ' · tag based' : ' · not enabled'}</option>`).join('');
    return html;
  }

  function renderEmail(){
    const p = document.getElementById('n-pane-email'); if (!p || !state.config) return;
    const e = { ...emailDefaults(state.emailType), ...currentEmail() };
    const selected = connectionFor(selectedFlowKey(state.emailType));
    const connected = selectedFlowKey(state.emailType) === 'none' ? false : flowReady(selected);
    const isLegacy = selectedFlowKey(state.emailType) === 'legacy-tags';
    p.innerHTML = `<div class="n-email-topbar"><div class="n-field"><label>Email type</label><select id="n-email-type"><option value="restock" ${state.emailType === 'restock' ? 'selected':''}>Back in stock</option><option value="archived" ${state.emailType === 'archived' ? 'selected':''}>Archived product</option></select></div><div class="n-field"><label>Flow connection</label><select id="n-email-flow-connection">${flowOptions(state.emailType)}</select></div><div class="n-connection-inline ${connected ? 'good':''}"><span></span><strong>${selectedFlowKey(state.emailType) === 'none' ? 'Prepare only' : connected ? 'Connected' : isLegacy ? 'Tag-based compatibility' : 'Not enabled in Shopify Flow'}</strong></div></div>
      <div class="n-delivery-banner ${mode() === 'flow' ? 'flow':'direct'}"><div><span class="n-kicker">How this template is used</span><strong>${state.emailType === 'archived' ? 'Archived product notification' : 'Back-in-stock notification'}</strong><p>${mode() !== 'flow' ? 'ELEV8 sends this design directly through your shared email provider.' : isLegacy ? 'Your existing tag-based Shopify Flow stays in control. You can still copy the generated HTML if that existing Flow needs its email body updated.' : connected ? 'No workflow URL is needed. ELEV8 passes the current subject and rendered HTML into the connected Flow trigger automatically.' : 'Design can be completed now. Connect an ELEV8 Flow trigger in Settings before using it for delivery.'}</p></div><div class="n-actions n-actions-tight">${mode()==='flow' && isLegacy ? '<button class="secondary-btn" data-n-action="copy-flow">Copy Flow HTML</button>' : ''}<button class="secondary-btn" data-n-action="test-email">Send test</button></div></div>
      <div class="n-email-builder"><div class="n-stack"><div class="n-card"><h3>Message</h3><div class="n-form-grid"><div class="n-field full"><label>Subject</label><input id="n-em-subject" value="${esc(e.subject)}"></div><div class="n-field full"><label>Preheader</label><input id="n-em-preheader" value="${esc(e.preheader)}"></div><div class="n-field"><label>Eyebrow</label><input id="n-em-eyebrow" value="${esc(e.eyebrow)}"></div><div class="n-field"><label>Heading</label><input id="n-em-heading" value="${esc(e.heading)}"></div><div class="n-field full"><label>Body</label><textarea id="n-em-body">${esc(e.body)}</textarea></div><div class="n-field"><label>Button label</label><input id="n-em-button" value="${esc(e.buttonLabel)}"></div><div class="n-field"><label>Logo URL</label><input id="n-em-logo" value="${esc(e.logoUrl || '')}"></div><div class="n-field full"><label>Footer</label><textarea id="n-em-footer">${esc(e.footer)}</textarea></div><div class="n-field full"><div class="n-token-row"><code>{{ product_title }}</code><code>{{ variant_title }}</code><code>{{ product_url }}</code></div></div></div></div>
      <div class="n-card"><h3>Appearance</h3><div class="n-form-grid"><div class="n-field"><label>Alignment</label><select id="n-em-align"><option value="center" ${e.align !== 'left' ? 'selected':''}>Centre</option><option value="left" ${e.align === 'left' ? 'selected':''}>Left</option></select></div><div class="n-field"><label>Email width</label><input id="n-em-width" type="number" min="420" max="760" value="${Number(e.contentWidth || 620)}"></div><div class="n-field"><label>Background</label><input id="n-em-bg" type="color" value="${esc(e.backgroundColor)}"></div><div class="n-field"><label>Card</label><input id="n-em-card" type="color" value="${esc(e.cardColor)}"></div><div class="n-field"><label>Accent</label><input id="n-em-accent" type="color" value="${esc(e.accentColor)}"></div><div class="n-field"><label>Text</label><input id="n-em-text" type="color" value="${esc(e.textColor)}"></div><div class="n-field"><label>Muted text</label><input id="n-em-muted" type="color" value="${esc(e.mutedTextColor)}"></div><div class="n-field"><label>Button</label><input id="n-em-button-bg" type="color" value="${esc(e.buttonBackground)}"></div><div class="n-field"><label>Button text</label><input id="n-em-button-text" type="color" value="${esc(e.buttonTextColor)}"></div><div class="n-field"><label>Button radius</label><input id="n-em-button-radius" type="number" min="0" max="30" value="${Number(e.buttonRadius || 9)}"></div><div class="n-field"><label>Card radius</label><input id="n-em-card-radius" type="number" min="0" max="36" value="${Number(e.cardRadius || 18)}"></div><div class="n-field"><label>Image radius</label><input id="n-em-image-radius" type="number" min="0" max="36" value="${Number(e.imageRadius || 14)}"></div><div class="n-field full"><label class="n-check"><input id="n-em-show-image" type="checkbox" ${e.showProductImage !== false ? 'checked':''}><span>Show product image</span></label></div><div class="n-field full"><label class="n-check"><input id="n-em-show-variant" type="checkbox" ${e.showVariant !== false ? 'checked':''}><span>Show variant name</span></label></div></div></div>
      <div class="n-card"><h3>Test</h3><div class="n-field"><label>Recipient</label><input id="n-test-email" type="email" placeholder="you@example.com"></div><div class="n-actions"><button class="primary-btn" data-n-action="save">Save design</button><button class="secondary-btn" data-n-action="test-email">Send test</button></div></div></div>
      <div class="n-preview-column"><div class="n-card n-email-preview-card"><div class="n-card-head"><div><h3>Live preview</h3><p>${state.emailType === 'archived' ? 'Archived product message' : 'Back-in-stock message'}</p></div><div class="n-preview-switch"><button class="${state.previewMode === 'desktop' ? 'active':''}" data-n-preview="desktop">Desktop</button><button class="${state.previewMode === 'mobile' ? 'active':''}" data-n-preview="mobile">Mobile</button></div></div><div class="n-email-preview-stage"><div id="n-email-preview-wrap" class="${state.previewMode === 'mobile' ? 'mobile':''}"><div id="n-email-preview"></div></div></div></div></div></div>`;
    updateEmailPreview();
  }

  function captureEmailFromDom(){
    if (!state.config || !document.getElementById('n-em-subject')) return;
    const base = { ...emailDefaults(state.emailType), ...currentEmail() };
    const next = {
      subject:val('n-em-subject',base.subject), preheader:val('n-em-preheader',base.preheader), eyebrow:val('n-em-eyebrow',base.eyebrow), heading:val('n-em-heading',base.heading), body:val('n-em-body',base.body), buttonLabel:val('n-em-button',base.buttonLabel), footer:val('n-em-footer',base.footer), logoUrl:val('n-em-logo',base.logoUrl || ''), showProductImage:checked('n-em-show-image',base.showProductImage !== false), showVariant:checked('n-em-show-variant',base.showVariant !== false), align:val('n-em-align',base.align || 'center'), backgroundColor:val('n-em-bg',base.backgroundColor), cardColor:val('n-em-card',base.cardColor), accentColor:val('n-em-accent',base.accentColor), textColor:val('n-em-text',base.textColor), mutedTextColor:val('n-em-muted',base.mutedTextColor), buttonBackground:val('n-em-button-bg',base.buttonBackground), buttonTextColor:val('n-em-button-text',base.buttonTextColor), buttonRadius:Number(val('n-em-button-radius',base.buttonRadius || 9)), cardRadius:Number(val('n-em-card-radius',base.cardRadius || 18)), imageRadius:Number(val('n-em-image-radius',base.imageRadius || 14)), contentWidth:Number(val('n-em-width',base.contentWidth || 620)),
    };
    if (state.emailType === 'archived') state.config.archivedEmail = next; else state.config.email = next;
  }

  function updateEmailPreview(){
    const box = document.getElementById('n-email-preview'); if (!box) return;
    const e = { ...emailDefaults(state.emailType), ...currentEmail() };
    const sample = state.emailSample || (state.emailType === 'archived' ? state.demand?.archivedItems?.[0] : state.demand?.items?.[0]) || {};
    const replace = (s) => String(s || '').replace(/{{\s*product_title\s*}}/gi, sample.productTitle || 'Example product').replace(/{{\s*variant_title\s*}}/gi, sample.variantTitle || 'Example variant').replace(/{{\s*product_url\s*}}/gi, '#');
    const align = e.align === 'left' ? 'left' : 'center';
    const logo = e.logoUrl ? `<img src="${esc(e.logoUrl)}" alt="" style="display:block;max-width:160px;max-height:52px;margin:${align==='center'?'0 auto 22px':'0 0 22px'}">` : '';
    const productImg = e.showProductImage !== false ? (sample.productImage ? `<img src="${esc(sample.productImage)}" alt="" style="display:block;width:100%;max-width:310px;border-radius:${Number(e.imageRadius || 14)}px;margin:${align==='center'?'0 auto 22px':'0 0 22px'}">` : `<div class="n-email-placeholder" style="border-radius:${Number(e.imageRadius || 14)}px">Product image</div>`) : '';
    const variant = e.showVariant !== false ? `<div style="font-size:13px;color:${esc(e.mutedTextColor)};margin:8px 0 0">${esc(sample.variantTitle || 'Example variant')}</div>` : '';
    box.innerHTML = `<div style="background:${esc(e.backgroundColor)};padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${esc(e.textColor)}"><div style="max-width:${Number(e.contentWidth || 620)}px;margin:0 auto;background:${esc(e.cardColor)};border:1px solid #e5e7eb;border-radius:${Number(e.cardRadius || 18)}px;padding:30px;text-align:${align}">${logo}${productImg}<div style="color:${esc(e.accentColor)};font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em">${esc(replace(e.eyebrow))}</div><h2 style="margin:8px 0 0;font-size:28px;color:${esc(e.textColor)}">${esc(replace(e.heading))}</h2>${variant}<p style="color:${esc(e.mutedTextColor)};line-height:1.6;margin:16px ${align==='center'?'auto':'0'} 22px;max-width:480px">${esc(replace(e.body))}</p><a href="#" onclick="return false" style="display:inline-block;padding:13px 22px;background:${esc(e.buttonBackground)};color:${esc(e.buttonTextColor)};text-decoration:none;border-radius:${Number(e.buttonRadius || 9)}px;font-weight:850">${esc(replace(e.buttonLabel))}</a><p style="color:${esc(e.mutedTextColor)};font-size:11px;line-height:1.5;margin:26px ${align==='center'?'auto':'0'} 0;max-width:500px">${esc(replace(e.footer))}</p></div></div>`;
  }

  function renderActivity(){
    const p = document.getElementById('n-pane-activity'); if (!p) return;
    p.innerHTML = `<div class="n-card"><h3>Notification activity</h3><p>Subscriptions, Shopify tag sync, stock observations, Flow lifecycle events, archived-demand prompts and sends.</p><div id="n-event-list">${eventList()}</div></div>`;
  }
  function eventList(){
    if (!state.events.length) return '<div class="n-empty">Open this tab to load recent activity.</div>';
    return state.events.map((x) => { const kind = String(x.type || '').replace('restock_',''); return `<div class="n-event"><span class="n-event-dot ${esc(kind)}"></span><div><strong>${esc(String(x.type || 'Notification event').replaceAll('_',' '))}</strong><p>${esc(x.productTitle || x.variantId || '')}${x.detail ? ` · ${esc(x.detail)}` : ''} · ${fmt(x.occurredAt)}</p></div></div>`; }).join('');
  }

  function connectionCards(){
    const r = state.summary?.readiness || {};
    const rows = state.flowConnections?.connections || [];
    if (!rows.length) return '<div class="n-empty">No Flow connections have been discovered yet.</div>';
    return `<div class="n-flow-list">${rows.map((x) => { const ready = x.key === 'legacy-tags' ? Boolean(r.readCustomersScope && r.writeCustomersScope) : Boolean(x.connected); return `<div class="n-flow-card"><div class="n-flow-card-head"><div><span class="n-connection-dot ${ready ? 'good':''}"></span><strong>${esc(x.label)}</strong></div><span class="n-pill ${ready ? 'good':'warn'}">${ready ? (x.key === 'legacy-tags' ? 'Available':'Enabled') : 'Not enabled'}</span></div><p>${esc(x.description || '')}</p>${x.lastChangedAt ? `<small>Last Flow status change: ${fmt(x.lastChangedAt)}</small>` : ''}</div>`; }).join('')}</div>`;
  }

  function renderSettings(){
    const p = document.getElementById('n-pane-settings'); if (!p || !state.config) return;
    const c = state.config, d = c.delivery || {}, r = state.summary?.readiness || {};
    p.innerHTML = `<div class="n-grid-2"><div class="n-card"><h3>Delivery & module settings</h3><div class="n-form-grid"><div class="n-field full"><label class="n-check"><input id="n-enabled" type="checkbox" ${c.enabled !== false ? 'checked':''}><span><strong>Enable Notifications Center</strong><br><span>Master switch for storefront notification features.</span></span></label></div><div class="n-field full"><label class="n-check"><input id="n-restock-enabled" type="checkbox" ${c.restockEnabled !== false ? 'checked':''}><span><strong>Enable back-in-stock notifications</strong></span></label></div><div class="n-field full"><label>Delivery engine</label><select id="n-delivery-mode"><option value="flow" ${mode()==='flow'?'selected':''}>Shopify Flow</option><option value="elev8" ${mode()==='elev8'?'selected':''}>ELEV8 direct email</option></select><small>Only one engine sends a back-in-stock event.</small></div><div class="n-field full"><label class="n-check"><input id="n-sync-tags" type="checkbox" ${d.syncShopifyTags !== false ? 'checked':''}><span><strong>Sync Shopify restock tags</strong><br><span>Keeps existing segments and legacy Flow logic compatible.</span></span></label></div><div class="n-field"><label>Minimum available stock</label><input id="n-threshold" type="number" min="1" max="9999" value="${Number(c.sendThreshold || 1)}"></div><div class="n-field"><label>After direct send</label><select id="n-one-shot"><option value="true" ${c.oneShot !== false ? 'selected':''}>Close ELEV8 alert</option><option value="false" ${c.oneShot === false ? 'selected':''}>Keep alert active</option></select></div><div class="n-field full"><label class="n-check"><input id="n-archive-enabled" type="checkbox" ${c.archiveNotifications?.enabled !== false ? 'checked':''}><span><strong>Track archived demand</strong><br><span>Move archived products out of Live Demand and retain their waiting customers.</span></span></label></div><div class="n-field full"><label class="n-check"><input id="n-archive-auto" type="checkbox" ${c.archiveNotifications?.autoSend === true ? 'checked':''}><span><strong>Automatically trigger archived-product Flow</strong><br><span>Off by default. Leave off if you want to review the email before contacting customers.</span></span></label></div></div><div class="n-actions"><button class="primary-btn" data-n-action="save">Save settings</button></div></div>
      <div class="n-card"><h3>Shopify connection</h3><p>These webhooks now collect stock history even when Shopify Flow remains the sender.</p><div class="n-readiness">${readiness('Read customer tags', r.readCustomersScope, 'Live demand')}${readiness('Write customer tags', r.writeCustomersScope, 'New subscriptions + legacy compatibility')}${readiness('Read inventory', r.readInventoryScope, 'Stock history')}${readiness('Inventory updates', r.webhook, 'Last-in-stock telemetry')}${readiness('Product updates', r.productWebhook, 'Archive detection')}${readiness('SMTP provider', r.email, 'Direct sends + tests')}</div><div class="n-actions"><button class="primary-btn" data-n-action="register-webhook">Connect / repair webhooks</button><button class="secondary-btn" data-n-action="refresh-demand">Test Shopify access</button></div></div></div>
      <div class="n-card" style="margin-top:16px"><div class="n-card-head"><div><h3>Flow Connections</h3><p>No workflow URL is stored. The dropdowns contain the existing tag-based connection plus ELEV8 Flow triggers that Shopify reports as enabled.</p></div><button class="secondary-btn" data-n-action="refresh-flow-connections">Refresh connections</button></div><div class="n-form-grid"><div class="n-field"><label>Back-in-stock workflow</label><select id="n-flow-connection">${flowOptions('restock')}</select></div><div class="n-field"><label>Archived-product workflow</label><select id="n-archive-flow-connection">${flowOptions('archived')}</select></div></div>${connectionCards()}<div class="n-setup-note" style="margin-top:16px"><strong>Why this is a connection list rather than every Flow in Shopify:</strong> Shopify does not expose a general workflow-list API to apps. Once an ELEV8 Flow trigger is added to a workflow and enabled, Shopify sends ELEV8 a signed lifecycle callback and the connection appears here automatically. Day-to-day editing stays in ELEV8; Shopify Flow only needs the one-time workflow setup.</div></div>`;
  }

  function gather(){
    captureEmailFromDom();
    const c = state.config || {}, d = c.delivery || {};
    return {
      enabled:checked('n-enabled', c.enabled !== false), restockEnabled:checked('n-restock-enabled', c.restockEnabled !== false), sendThreshold:Number(val('n-threshold', c.sendThreshold || 1)), oneShot:val('n-one-shot', String(c.oneShot !== false)) === 'true',
      archiveNotifications:{ enabled:checked('n-archive-enabled', c.archiveNotifications?.enabled !== false), autoSend:checked('n-archive-auto', c.archiveNotifications?.autoSend === true) },
      delivery:{ mode:val('n-delivery-mode', d.mode || 'flow'), syncShopifyTags:checked('n-sync-tags', d.syncShopifyTags !== false), flowConnectionKey:val('n-flow-connection', d.flowConnectionKey || 'legacy-tags'), archivedFlowConnectionKey:val('n-archive-flow-connection', d.archivedFlowConnectionKey || 'none'), flowVariables:d.flowVariables || {} },
      storefront:{ inStockLabel:val('n-sf-instock-label', sf().inStockLabel), inStockBackground:val('n-sf-instock-bg', sf().inStockBackground), inStockTextColor:val('n-sf-instock-text', sf().inStockTextColor), soldOutLabel:val('n-sf-label', sf().soldOutLabel), subscribedLabel:val('n-sf-subscribed', sf().subscribedLabel), style:val('n-sf-style', sf().style), radius:Number(val('n-sf-radius', sf().radius || 8)), height:Number(val('n-sf-height', sf().height || 56)), background:val('n-sf-bg', sf().background), textColor:val('n-sf-text', sf().textColor), outlineColor:val('n-sf-outline', sf().outlineColor), showBellIcon:checked('n-sf-bell', sf().showBellIcon !== false), modalTitle:val('n-sf-modal-title', sf().modalTitle), modalCopy:val('n-sf-modal-copy', sf().modalCopy) },
      email:state.config.email || emailDefaults('restock'), archivedEmail:state.config.archivedEmail || emailDefaults('archived'),
    };
  }

  async function saveConfig({ quiet = false } = {}){
    try {
      state.config = await api('/admin/notifications/config', { method:'PUT', body:JSON.stringify(gather()) });
      const [summary, flows] = await Promise.all([api('/admin/notifications/summary'), api('/admin/notifications/flow-connections')]);
      state.summary = summary; state.flowConnections = flows;
      renderAll(); updateDot();
      if (!quiet) toast('Notifications settings saved');
      return true;
    } catch (e) { toast(e.message || 'Could not save notifications'); return false; }
  }

  async function registerWebhook(){
    try { const result = await api('/admin/notifications/webhook/register', { method:'POST', body:'{}' }); toast(result.productConnected ? 'Inventory + product archive webhooks connected' : 'Inventory webhook connected; product webhook still needs attention'); state.summary = await api('/admin/notifications/summary'); renderAll(); updateDot(); }
    catch (e) { toast(e.message || 'Webhook connection failed'); }
  }

  async function testEmail(){
    captureEmailFromDom();
    const email = val('n-test-email', ''); if (!email) return toast('Enter a test recipient email');
    if (!(await saveConfig({ quiet:true }))) return;
    try { await api('/admin/notifications/test-email', { method:'POST', body:JSON.stringify({ email, templateType:state.emailType }) }); toast(`${state.emailType === 'archived' ? 'Archived':'Back-in-stock'} test email sent`); }
    catch (e) { toast(e.message || 'Test email failed'); }
  }

  async function copyFlow(){
    captureEmailFromDom();
    if (!(await saveConfig({ quiet:true }))) return;
    try { const template = await api(`/admin/notifications/flow-template?type=${encodeURIComponent(state.emailType)}`); await navigator.clipboard.writeText(template.html || ''); toast('Flow email HTML copied'); }
    catch (e) { toast(e.message || 'Could not copy Flow HTML'); }
  }

  function prepareArchivedEmail(variantId){
    state.emailSample = (state.demand?.archivedItems || []).find((x) => String(x.variantId) === String(variantId)) || null;
    state.emailType = 'archived';
    setTab('email');
    renderEmail();
  }

  async function dispatchArchived(variantId){
    const item = (state.demand?.archivedItems || []).find((x) => String(x.variantId) === String(variantId));
    const connection = connectionFor(selectedFlowKey('archived'));
    if (!flowReady(connection)) return toast('Choose an enabled Archived Product Flow connection first.');
    if (!window.confirm(`Trigger the archived-product Flow for ${Number(item?.totalWaiting || 0)} waiting customer(s) for ${item?.productTitle || 'this product'}?`)) return;
    if (!(await saveConfig({ quiet:true }))) return;
    try { const result = await api(`/admin/notifications/archived-demand/${encodeURIComponent(variantId)}/dispatch`, { method:'POST', body:'{}' }); toast(`Archived Flow triggered for ${Number(result.triggered || 0)} customer(s)`); await loadEvents(); }
    catch (e) { toast(e.message || 'Could not trigger archived-product Flow'); }
  }

  function updateButtonPreview(){
    const notify = document.getElementById('n-button-preview'), atc = document.getElementById('n-atc-preview');
    const radius = val('n-sf-radius', 8), height = val('n-sf-height', 56);
    if (atc) { const bg = val('n-sf-instock-bg', '#111111'), text = val('n-sf-instock-text', '#ffffff'); atc.style.borderRadius=`${radius}px`; atc.style.minHeight=`${height}px`; atc.style.background=bg; atc.style.color=text; atc.style.borderColor=bg; atc.textContent=val('n-sf-instock-label','Add to cart'); }
    if (notify) { const style=val('n-sf-style','outline'), bg=val('n-sf-bg','#111111'), text=val('n-sf-text','#ffffff'), outline=val('n-sf-outline','#d7dce1'), bell=checked('n-sf-bell',true); notify.style.borderRadius=`${radius}px`; notify.style.minHeight=`${height}px`; notify.style.background=style==='solid'?bg:'#fff'; notify.style.color=style==='solid'?text:'#111'; notify.style.borderColor=style==='solid'?bg:outline; notify.textContent=`${bell?'◔ ':''}${val('n-sf-label','Notify me when available')}`; }
  }

  function handleInput(e){
    const id = String(e.target?.id || '');
    if (id.startsWith('n-sf-')) updateButtonPreview();
    if (id.startsWith('n-em-')) { captureEmailFromDom(); updateEmailPreview(); }
    if (id === 'n-email-type') { captureEmailFromDom(); state.emailType = e.target.value === 'archived' ? 'archived':'restock'; state.emailSample = null; renderEmail(); }
    if (id === 'n-email-flow-connection') { if (state.emailType === 'archived') { state.config.delivery.archivedFlowConnectionKey = e.target.value; const peer=document.getElementById('n-archive-flow-connection'); if(peer) peer.value=e.target.value; } else { state.config.delivery.flowConnectionKey = e.target.value; const peer=document.getElementById('n-flow-connection'); if(peer) peer.value=e.target.value; } renderEmail(); updateDot(); }
    if (id === 'n-flow-connection') { state.config.delivery.flowConnectionKey = e.target.value; renderEmail(); updateDot(); }
    if (id === 'n-archive-flow-connection') { state.config.delivery.archivedFlowConnectionKey = e.target.value; renderEmail(); }
    if (id === 'n-delivery-mode') { state.config.delivery.mode = e.target.value; renderOverview(); renderEmail(); renderSettings(); updateDot(); }
  }

  function handleClick(e){
    const tab = e.target.closest('[data-n-tab]'); if (tab) { setTab(tab.dataset.nTab); return; }
    const goto = e.target.closest('[data-n-goto]'); if (goto) { setTab(goto.dataset.nGoto); return; }
    const pv = e.target.closest('[data-n-preview]'); if (pv) { state.previewMode = pv.dataset.nPreview; renderEmail(); return; }
    const a = e.target.closest('[data-n-action]'); if (!a) return;
    const action = a.dataset.nAction;
    if (action === 'save') saveConfig();
    if (action === 'register-webhook') registerWebhook();
    if (action === 'refresh-demand') loadDemand();
    if (action === 'refresh-flow-connections') loadFlowConnections();
    if (action === 'test-email') testEmail();
    if (action === 'copy-flow') copyFlow();
    if (action === 'prepare-archive-email') prepareArchivedEmail(a.dataset.variantId);
    if (action === 'dispatch-archive') dispatchArchived(a.dataset.variantId);
  }

  window.Elev8Notifications = {
    open(){ document.body.classList.remove('elev8-home-open'); window.tab?.('v-notifications'); document.querySelector('[data-product-key="notifications"]')?.classList.add('active'); setTab(state.tab || 'overview'); load(); },
    load,
    setTab,
  };

  function init(){ installNav(); installView(); installHomeObserver(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 80)); else setTimeout(init, 80);
})();
