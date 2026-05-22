(function(){
  const state = {
    config: null,
    emailTemplates: [],
    emailModuleLibrary: [],
    rewards: [],
    tiers: [],
    pointsRules: [],
    rewardTemplates: [],
    customers: [],
    ledger: [],
    selectedCustomerRef: '',
    selectedCustomerLabel: '',
    editingModuleId: null,
    editingRewardProduct: null,
  };

  const esc = (value) => (typeof window.escapeHtml === 'function'
    ? window.escapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2,8)}`;
  const money = (value) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'GBP' });
  const pointsName = () => document.getElementById('loyalty-points-label')?.value || document.getElementById('loyalty-points-label-overview')?.value || state.config?.pointName || 'Points';
  const fmtDate = (value) => { try { return value ? new Date(value).toLocaleDateString() : '—'; } catch { return '—'; } };

  function api(path, options = {}) {
    if (typeof window.adminFetch !== 'function') throw new Error('Admin API helper is not ready.');
    return window.adminFetch(path, options);
  }
  function toast(message) { (window.showToast || console.log)(message); }

  function defaultModule(type = 'notice') {
    const names = { reward_box: 'Reward box', notice: 'Notice', offer: 'Offer', support: 'Support note', text: 'Plain text', image_text: 'Image + text', button: 'Button' };
    return {
      id: uid('module'),
      name: names[type] || 'Content module',
      type,
      title: names[type] || 'Content module',
      body: type === 'reward_box' ? 'Your reward is ready to use.' : type === 'offer' ? 'Add a special offer or benefit here.' : type === 'support' ? 'Need help? Reply to this email and we will sort it.' : 'Add your content here.',
      imageUrl: '',
      buttonText: type === 'button' ? 'Shop now' : '',
      buttonUrl: '',
      backgroundColor: '#f8fafc',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      radius: 16,
      padding: 16,
      alignment: 'left',
      position: 'after_body',
    };
  }
  function defaultTemplate() {
    return {
      id: 'loyalty_email_primary', name: 'Reward ready', primary: true, status: 'primary',
      subject: 'Your reward is ready', heading: 'Your reward is ready', subtitle: 'A little thank-you from us.',
      body: 'Thanks for being part of our rewards programme. Your {{ reward_type }} is now ready.',
      modules: [defaultModule('reward_box')], accentColor: '#111827', buttonText: 'Shop now',
    };
  }
  function defaultRewards() {
    return [{ id: 'reward_checkout_discount', name: '£5 off coupon', type: 'discount', pointsCost: 500, discountValue: 5, discountValueType: 'fixed_amount', enabled: true, betaCheckoutEnabled: true, discountMode: 'draft_only' }];
  }
  function defaultTiers() {
    return [{ id: 'bronze', name: 'Bronze', threshold: 0, multiplier: 1, perks: 'Entry tier', ruleIds: [], rewardIds: [] }];
  }

  function installStyles(){
    if (document.getElementById('loyalty-v24-styles')) return;
    const style = document.createElement('style');
    style.id = 'loyalty-v24-styles';
    style.textContent = `
      .loyalty-tabs{display:flex!important;gap:12px!important;border-bottom:1px solid var(--border)!important;margin:14px 0 24px!important;flex-wrap:wrap!important}
      .loyalty-tabs button{appearance:none!important;border:0!important;background:transparent!important;color:#667085!important;padding:14px 4px!important;margin:0 16px 0 0!important;font:inherit!important;font-weight:900!important;cursor:pointer!important;border-bottom:3px solid transparent!important;border-radius:0!important;box-shadow:none!important}
      .loyalty-tabs button.active{color:var(--blue)!important;border-bottom-color:var(--blue)!important;background:transparent!important}
      .loyalty-v24-grid{display:grid;grid-template-columns:minmax(360px,520px) minmax(0,1fr);gap:18px;align-items:start}
      .loyalty-v24-grid.three{grid-template-columns:minmax(340px,450px) minmax(340px,450px) minmax(0,1fr)}
      .loyalty-card{background:#fff;border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:22px;margin-bottom:18px}
      .loyalty-card h3{margin:0 0 6px;font-size:18px;letter-spacing:-.02em}.loyalty-card p{margin:0 0 16px;color:#667085;line-height:1.5}
      .loyalty-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.loyalty-form-grid.one{grid-template-columns:1fr}.loyalty-form-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .loyalty-field,label.loyalty-field{display:block;font-size:12px;font-weight:900;color:#344054}.loyalty-field input,.loyalty-field select,.loyalty-field textarea{margin-top:7px;width:100%}
      .loyalty-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
      .loyalty-actions.left{justify-content:flex-start}.loyalty-actions.between{justify-content:space-between}
      .loyalty-pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:900;border:1px solid #e5e7eb;background:#f8fafc;color:#475467}.loyalty-pill.good{background:#ecfdf3;border-color:#abefc6;color:#027a48}.loyalty-pill.warn{background:#fff7ed;border-color:#fed7aa;color:#c2410c}
      .loyalty-list{display:grid;gap:12px}.loyalty-list-card{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;border:1px solid #e5e7eb;border-radius:16px;background:#fbfdff;padding:14px}.loyalty-list-card img,.loyalty-thumb{width:64px;height:64px;object-fit:cover;border-radius:12px;background:#eef2f7;border:1px solid #e5e7eb}.loyalty-list-card h4{margin:0 0 5px}.loyalty-list-card p{margin:0;color:#667085;font-size:13px;line-height:1.45}.loyalty-card-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .loyalty-module-card{border:1px solid #e5e7eb;background:#fff;border-radius:16px;padding:14px;margin-bottom:10px}.loyalty-module-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.loyalty-module-card h4{margin:0}.loyalty-small-actions{display:flex;gap:6px;align-items:center}.loyalty-icon-btn{border:1px solid #d0d5dd;background:#fff;border-radius:10px;min-width:34px;min-height:34px;font-weight:900;cursor:pointer}.loyalty-danger{color:#d72c0d!important;border-color:#fecaca!important;background:#fff5f5!important}
      .loyalty-preview-shell{border:1px solid #e5e7eb;border-radius:18px;background:#f3f4f6;overflow:hidden;min-height:420px}.loyalty-preview-inner{max-width:620px;margin:0 auto;background:#fff;border-radius:22px;padding:32px;text-align:center;border:1px solid #e5e7eb}.loyalty-preview-wrap{padding:34px}.loyalty-email-module-preview{text-align:left;margin:12px 0}.loyalty-customer-result{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid var(--border);border-radius:14px;background:#fff;padding:12px;margin-bottom:8px}.loyalty-customer-result strong{display:block}.loyalty-customer-result span{display:block;color:#667085;font-size:12px;margin-top:2px}.loyalty-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0 16px}.loyalty-mini-stat{border:1px solid var(--border);border-radius:14px;background:#fbfdff;padding:13px}.loyalty-mini-stat span{display:block;color:#667085;font-size:11px;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.loyalty-mini-stat strong{display:block;font-size:24px;margin-top:5px}.loyalty-ledger-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;border:1px solid var(--border);border-radius:14px;background:#fff;padding:12px;margin-bottom:8px}.loyalty-selected-customer{border:1px dashed var(--border);background:#fbfdff;border-radius:12px;padding:12px;margin:10px 0 14px}.loyalty-modal-backdrop{position:fixed;inset:0;z-index:2147483400;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px}.loyalty-modal{width:min(880px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:20px;border:1px solid #e5e7eb;box-shadow:0 30px 100px rgba(15,23,42,.35)}.loyalty-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 24px;border-bottom:1px solid #e5e7eb}.loyalty-modal-body{padding:20px 24px}.loyalty-product-row{display:grid;grid-template-columns:62px 1fr auto;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:14px;background:#fbfdff;padding:12px;margin-top:10px}.loyalty-product-row img{width:62px;height:62px;border-radius:12px;object-fit:cover;background:#eef2f7}.loyalty-checkout-preview{border:1px solid var(--border);border-radius:18px;background:#fff;padding:18px}.loyalty-checkout-input-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-top:12px}.muted-small{font-size:12px;color:#667085}.loyalty-checkbox-list{display:grid;gap:8px;margin-top:10px}.loyalty-checkbox-list label{display:flex;gap:8px;align-items:center;border:1px solid #e5e7eb;border-radius:12px;padding:9px;background:#fff}.loyalty-checkbox-list input{width:auto;margin:0}.loyalty-optout{background:#fff1f3;border-color:#fecdd3;color:#be123c}
      @media(max-width:1200px){.loyalty-v24-grid,.loyalty-v24-grid.three{grid-template-columns:1fr}.loyalty-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.loyalty-form-grid,.loyalty-form-grid.three,.loyalty-actions,.loyalty-checkout-input-row{grid-template-columns:1fr;display:grid}.loyalty-list-card{grid-template-columns:1fr}.loyalty-metrics{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function activeTemplate(){
    if (!state.emailTemplates.length) state.emailTemplates = [defaultTemplate()];
    return state.emailTemplates[0];
  }
  function syncTemplateFromInputs(){
    const t = activeTemplate();
    const map = {
      name:'loyalty-email-template-name', status:'loyalty-email-template-status', subject:'loyalty-email-subject', heading:'loyalty-email-heading', subtitle:'loyalty-email-subtitle', body:'loyalty-email-body', accentColor:'loyalty-email-accent', buttonText:'loyalty-email-button'
    };
    Object.entries(map).forEach(([key,id]) => { const el = document.getElementById(id); if (el) t[key] = el.value; });
    t.primary = t.status === 'primary';
    state.emailTemplates[0] = t;
    return t;
  }

  function moduleHtml(module){
    const align = module.alignment === 'center' ? 'center' : 'left';
    const img = module.imageUrl ? `<img src="${esc(module.imageUrl)}" alt="" style="display:block;max-width:100%;height:auto;border-radius:${Number(module.radius||16)}px;margin:${align==='center'?'0 auto 10px':'0 0 10px'};">` : '';
    const button = module.buttonText ? `<a href="${esc(module.buttonUrl || '#')}" style="display:inline-block;margin-top:10px;background:#111827;color:#fff;text-decoration:none;border-radius:12px;padding:10px 14px;font-weight:800;">${esc(module.buttonText)}</a>` : '';
    return `<div class="loyalty-email-module-preview" style="text-align:${align};background:${esc(module.backgroundColor||'#f8fafc')};border:${Number(module.borderWidth||1)}px solid ${esc(module.borderColor||'#e5e7eb')};border-radius:${Number(module.radius||16)}px;padding:${Number(module.padding||16)}px;">${img}<strong style="display:block;margin-bottom:6px;">${esc(module.title||'')}</strong><div style="color:#4b5563;line-height:1.55;white-space:pre-wrap;">${esc(module.body||'')}</div>${button}</div>`;
  }
  function renderEmailPreview(){
    const box = document.getElementById('loyalty-email-preview'); if (!box) return;
    const t = syncTemplateFromInputs();
    const accent = t.accentColor || '#111827';
    const before = (t.modules || []).filter(m => m.position === 'before_body').map(moduleHtml).join('');
    const after = (t.modules || []).filter(m => m.position === 'after_body').map(moduleHtml).join('');
    const reward = (t.modules || []).filter(m => m.position === 'after_reward').map(moduleHtml).join('');
    box.innerHTML = `<div class="loyalty-preview-wrap"><div class="loyalty-preview-inner"><div style="display:inline-flex;border-radius:999px;background:${esc(accent)};color:#fff;padding:7px 12px;font-size:12px;font-weight:900;margin-bottom:16px;">Rewards</div><h1 style="font-size:30px;line-height:1.15;margin:0 0 8px;">${esc(t.heading || '')}</h1><p style="margin:0 0 18px;color:#667085;">${esc(t.subtitle || '')}</p>${before}<p style="font-size:16px;line-height:1.65;color:#344054;white-space:pre-wrap;">${esc(t.body || '').replace(/\{\{\s*reward_type\s*\}\}/g,'10% discount')}</p>${after}<div style="margin:22px auto;padding:18px;border:2px dashed ${esc(accent)};border-radius:16px;font-weight:900;font-size:30px;max-width:280px;color:${esc(accent)};">10% OFF</div>${reward}<a href="https://${esc(window.SHOP_DOMAIN || '')}" style="display:inline-block;background:${esc(accent)};color:#fff;text-decoration:none;border-radius:14px;padding:14px 20px;font-weight:900;">${esc(t.buttonText || 'Shop now')}</a><p style="margin-top:20px;font-size:12px;color:#667085;">Sent by ${esc(window.SHOP_DOMAIN || 'your store')}</p></div></div>`;
  }

  function renderTabs(){
    document.querySelectorAll('#v-loyalty [data-loyalty-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.loyaltyTab === currentTab());
    });
    document.querySelectorAll('#v-loyalty .loyalty-tab-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`loyalty-tab-${currentTab()}`)?.classList.add('active');
  }
  function currentTab(){ return document.querySelector('#v-loyalty [data-loyalty-tab].active')?.dataset.loyaltyTab || 'overview'; }

  function renderOverview(){
    const status = document.getElementById('loyalty-status-text'); if (status) status.textContent = state.config?.enabled ? 'Enabled' : 'Configured but inactive';
    const help = document.getElementById('loyalty-status-help'); if (help) help.textContent = state.config?.enabled ? 'Rewards can be created when rules match.' : 'Turn on the module when you are ready to award points and rewards.';
    const enabled = document.getElementById('loyalty-enabled'); if (enabled) enabled.checked = Boolean(state.config?.enabled);
    const pn = document.getElementById('loyalty-points-label-overview'); if (pn) pn.value = state.config?.pointName || 'Points';
  }

  function renderEmail(){
    const panel = document.getElementById('loyalty-tab-email'); if (!panel) return;
    const t = activeTemplate();
    panel.innerHTML = `<div class="loyalty-v24-grid three">
      <div class="loyalty-card"><h3>Module library</h3><p>Create reusable sections once, then add them to any loyalty email.</p>
        <div class="loyalty-form-grid"><label class="loyalty-field">Module type<select id="loyalty-new-module-type" class="filter-select"><option value="reward_box">Reward box</option><option value="notice">Notice</option><option value="offer">Offer</option><option value="support">Support note</option><option value="text">Plain text</option><option value="image_text">Image + text</option><option value="button">Button</option></select></label><label class="loyalty-field">Name<input id="loyalty-new-module-name" class="premium-input" placeholder="VIP offer block"></label></div>
        <div class="loyalty-actions"><button class="secondary-btn" type="button" onclick="window.loyaltyAddModuleToLibrary()">Create module</button></div>
        <div id="loyalty-module-library" class="loyalty-list"></div>
      </div>
      <div class="loyalty-card"><h3>Email template</h3><p>Build the live or draft reward email from reusable modules.</p>
        <div class="loyalty-form-grid"><label class="loyalty-field">Template name<input id="loyalty-email-template-name" class="premium-input" value="${esc(t.name)}"></label><label class="loyalty-field">Status<select id="loyalty-email-template-status" class="filter-select"><option value="primary" ${t.status==='primary'?'selected':''}>Primary/live</option><option value="draft" ${t.status==='draft'?'selected':''}>Draft</option><option value="archived" ${t.status==='archived'?'selected':''}>Archived</option></select></label></div>
        <label class="loyalty-field">Subject<input id="loyalty-email-subject" class="premium-input" value="${esc(t.subject)}"></label>
        <label class="loyalty-field">Heading<input id="loyalty-email-heading" class="premium-input" value="${esc(t.heading)}"></label>
        <label class="loyalty-field">Email sub-title<input id="loyalty-email-subtitle" class="premium-input" value="${esc(t.subtitle||'')}"></label>
        <label class="loyalty-field">Email body<textarea id="loyalty-email-body" class="premium-input" rows="5">${esc(t.body)}</textarea></label>
        <div class="loyalty-form-grid"><label class="loyalty-field">Accent colour<input id="loyalty-email-accent" class="premium-input" value="${esc(t.accentColor||'#111827')}"></label><label class="loyalty-field">Button text<input id="loyalty-email-button" class="premium-input" value="${esc(t.buttonText||'Shop now')}"></label></div>
        <div class="loyalty-actions between"><select id="loyalty-insert-module-id" class="filter-select">${state.emailModuleLibrary.map(m=>`<option value="${esc(m.id)}">${esc(m.name || m.title)}</option>`).join('')}</select><button class="secondary-btn" type="button" onclick="window.loyaltyInsertModuleIntoEmail()">Add selected module</button></div>
        <div id="loyalty-email-module-list"></div>
        <div class="loyalty-actions"><input id="loyalty-test-to" class="premium-input" placeholder="you@example.com"><button class="primary-btn" type="button" onclick="window.sendLoyaltyTestEmail()">Send Test</button><button class="primary-btn" type="button" onclick="window.saveLoyaltyConfig()">Save email template</button></div>
      </div>
      <div class="loyalty-card"><h3>Live preview</h3><div class="loyalty-preview-shell" id="loyalty-email-preview"></div></div>
    </div>`;
    renderModuleLibrary(); renderEmailTemplateModules(); renderEmailPreview();
  }

  function renderModuleLibrary(){
    const list = document.getElementById('loyalty-module-library'); if (!list) return;
    list.innerHTML = state.emailModuleLibrary.map((m, i) => `<div class="loyalty-module-card"><div class="loyalty-module-card-head"><div><h4>${esc(m.name || m.title)}</h4><p class="muted-small">${esc(m.type)} · ${esc(m.position || 'after_body')}</p></div><div class="loyalty-small-actions"><button class="loyalty-icon-btn" type="button" onclick="window.loyaltyEditLibraryModule(${i})">Edit</button><button class="loyalty-icon-btn loyalty-danger" type="button" onclick="window.loyaltyRemoveLibraryModule(${i})">×</button></div></div>${state.editingModuleId===m.id ? moduleEditor(m, `library:${i}`) : `<p>${esc(m.title || '')}</p>`}</div>`).join('') || '<p class="muted">No modules yet. Create one above.</p>';
  }
  function moduleEditor(m, ref){
    return `<div class="loyalty-form-grid"><label class="loyalty-field">Name<input class="premium-input" value="${esc(m.name||'')}" onchange="window.loyaltyUpdateModule('${ref}','name',this.value)"></label><label class="loyalty-field">Title<input class="premium-input" value="${esc(m.title||'')}" onchange="window.loyaltyUpdateModule('${ref}','title',this.value)"></label><label class="loyalty-field">Image URL<input class="premium-input" value="${esc(m.imageUrl||'')}" onchange="window.loyaltyUpdateModule('${ref}','imageUrl',this.value)"></label><label class="loyalty-field">Position<select class="filter-select" onchange="window.loyaltyUpdateModule('${ref}','position',this.value)"><option value="before_body" ${m.position==='before_body'?'selected':''}>Before body</option><option value="after_body" ${m.position==='after_body'?'selected':''}>After body</option><option value="after_reward" ${m.position==='after_reward'?'selected':''}>After reward</option></select></label><label class="loyalty-field">Background<input class="premium-input" value="${esc(m.backgroundColor||'#f8fafc')}" onchange="window.loyaltyUpdateModule('${ref}','backgroundColor',this.value)"></label><label class="loyalty-field">Border<input class="premium-input" value="${esc(m.borderColor||'#e5e7eb')}" onchange="window.loyaltyUpdateModule('${ref}','borderColor',this.value)"></label><label class="loyalty-field">Border width<input type="number" class="premium-input" value="${Number(m.borderWidth||1)}" onchange="window.loyaltyUpdateModule('${ref}','borderWidth',this.value)"></label><label class="loyalty-field">Radius<input type="number" class="premium-input" value="${Number(m.radius||16)}" onchange="window.loyaltyUpdateModule('${ref}','radius',this.value)"></label><label class="loyalty-field">Padding<input type="number" class="premium-input" value="${Number(m.padding||16)}" onchange="window.loyaltyUpdateModule('${ref}','padding',this.value)"></label><label class="loyalty-field">Alignment<select class="filter-select" onchange="window.loyaltyUpdateModule('${ref}','alignment',this.value)"><option value="left" ${m.alignment!=='center'?'selected':''}>Left</option><option value="center" ${m.alignment==='center'?'selected':''}>Center</option></select></label><label class="loyalty-field">Button text<input class="premium-input" value="${esc(m.buttonText||'')}" onchange="window.loyaltyUpdateModule('${ref}','buttonText',this.value)"></label><label class="loyalty-field">Button URL<input class="premium-input" value="${esc(m.buttonUrl||'')}" onchange="window.loyaltyUpdateModule('${ref}','buttonUrl',this.value)"></label></div><label class="loyalty-field">Text<textarea class="premium-input" rows="4" onchange="window.loyaltyUpdateModule('${ref}','body',this.value)">${esc(m.body||'')}</textarea></label>`;
  }
  function renderEmailTemplateModules(){
    const list = document.getElementById('loyalty-email-module-list'); if (!list) return;
    const t = activeTemplate();
    list.innerHTML = (t.modules || []).map((m, i) => `<div class="loyalty-module-card"><div class="loyalty-module-card-head"><div><h4>${esc(m.name || m.title)}</h4><p class="muted-small">${esc(m.type)} · ${esc(m.position || 'after_body')}</p></div><div class="loyalty-small-actions"><button class="loyalty-icon-btn" type="button" onclick="window.loyaltyMoveTemplateModule(${i},-1)">↑</button><button class="loyalty-icon-btn" type="button" onclick="window.loyaltyMoveTemplateModule(${i},1)">↓</button><button class="loyalty-icon-btn" type="button" onclick="window.loyaltyToggleTemplateModuleEdit(${i})">Edit</button><button class="loyalty-icon-btn loyalty-danger" type="button" onclick="window.loyaltyRemoveTemplateModule(${i})">×</button></div></div>${state.editingModuleId===`template:${i}` ? moduleEditor(m, `template:${i}`) : moduleHtml(m)}</div>`).join('') || '<p class="muted">No sections added to this template yet.</p>';
  }

  function renderMembers(){
    const panel = document.getElementById('loyalty-tab-members'); if (!panel) return;
    const totals = state.customers.reduce((a,r)=>{ a.available+=Number(r.availablePoints||0); a.pending+=Number(r.pendingPoints||0); if(r.optOut)a.optedOut+=1; return a; }, {available:0,pending:0,optedOut:0});
    panel.innerHTML = `<div class="loyalty-v24-grid"><div class="loyalty-card"><h3>Userboard</h3><p>Sync Shopify customers to create private loyalty accounts. Customers tagged <strong>NO_LOY</strong> are opted out.</p><div class="loyalty-metrics"><div class="loyalty-mini-stat"><span>Customers</span><strong>${state.customers.length}</strong></div><div class="loyalty-mini-stat"><span>Available</span><strong>${totals.available}</strong></div><div class="loyalty-mini-stat"><span>Pending</span><strong>${totals.pending}</strong></div><div class="loyalty-mini-stat"><span>Opted out</span><strong>${totals.optedOut}</strong></div></div><div class="loyalty-actions left"><button class="primary-btn" type="button" onclick="window.loyaltySyncCustomers()">Sync Shopify customers</button><button class="secondary-btn" type="button" onclick="window.loadLoyaltyConfig()">Refresh</button></div><div class="input-action-row" style="margin:14px 0;"><input id="loyalty-customer-search" class="premium-input" placeholder="Search Shopify customers by name, email or ID"><button class="primary-btn" type="button" onclick="window.searchLoyaltyCustomers()">Search Shopify</button></div><div id="loyalty-customer-results"><p class="muted">Search results are shown live from Shopify and are not stored in the loyalty database.</p></div><h4>Private customer balances</h4><div id="loyalty-customer-state-list" class="loyalty-list">${renderCustomerRows()}</div></div><div class="loyalty-card"><h3>Manual points adjustment</h3><p>Add or remove points from the selected private customer reference.</p><label class="loyalty-field">Selected customer reference<input id="loyalty-adjust-ref" class="premium-input" value="${esc(state.selectedCustomerRef)}" placeholder="Select a Shopify customer or enter a store-only code"></label><div id="loyalty-selected-customer" class="loyalty-selected-customer muted">${esc(state.selectedCustomerLabel || 'No customer selected.')}</div><div class="loyalty-form-grid"><label class="loyalty-field">Points change<input id="loyalty-adjust-points" class="premium-input" type="number" value="100"></label><label class="loyalty-field">Status<select id="loyalty-adjust-status" class="filter-select"><option value="available">Available now</option><option value="pending">Pending</option></select></label></div><label class="loyalty-field">Reason<input id="loyalty-adjust-reason" class="premium-input" placeholder="Manual support adjustment"></label><div class="loyalty-actions"><button class="primary-btn" type="button" onclick="window.manualLoyaltyAdjustment()">Save adjustment</button></div><h4>Recent ledger</h4><div id="loyalty-ledger-list">${renderLedgerRows()}</div><div class="loyalty-actions"><button class="secondary-btn" type="button" onclick="window.processLoyaltyPending()">Process pending</button></div></div></div>`;
  }
  function renderCustomerRows(){
    return state.customers.map(row => `<div class="loyalty-ledger-row"><div><strong>${esc(row.customerRefHint || 'Private customer')}</strong><span>${esc(row.currentTierName || 'Bronze')} · ${Number(row.purchaseCount||0)} purchases · last activity ${fmtDate(row.lastActivityAt)}</span></div><span class="loyalty-pill ${row.optOut?'loyalty-optout':'good'}">${row.optOut?'NO_LOY':'Active'}</span><strong>${Number(row.availablePoints||0)} ${esc(pointsName())}</strong></div>`).join('') || '<p class="muted">No customer accounts yet. Click Sync Shopify customers.</p>';
  }
  function renderLedgerRows(){
    return state.ledger.map(row => `<div class="loyalty-ledger-row"><div><strong>${esc(row.ruleName || row.eventType)}</strong><span>${esc(row.customerRefHint || '')} · ${fmtDate(row.createdAt || row.availableAt)}</span></div><span class="loyalty-pill">${esc(row.status || 'pending')}</span><strong>${Number(row.points||0)} ${esc(pointsName())}</strong></div>`).join('') || '<p class="muted">No loyalty ledger rows yet.</p>';
  }

  function renderRewards(){
    const panel = document.getElementById('loyalty-tab-rewards'); if (!panel) return;
    panel.innerHTML = `<div class="loyalty-v24-grid"><div class="loyalty-card"><h3>Add a reward</h3><p>Rewards can be checkout discounts, free shipping or catalogue product redemptions.</p><div class="loyalty-form-grid"><label class="loyalty-field">Reward name<input id="loyalty-reward-name" class="premium-input" value="£5 off coupon"></label><label class="loyalty-field">Cost in points<input id="loyalty-reward-cost" class="premium-input" type="number" value="500"></label><label class="loyalty-field">Reward type<select id="loyalty-reward-type" class="filter-select" onchange="window.loyaltyRewardTypeChanged()"><option value="discount">Discount code</option><option value="catalogue_item">Catalogue product</option><option value="free_shipping">Free shipping</option></select></label><label class="loyalty-field">Discount value type<select id="loyalty-reward-value-type" class="filter-select"><option value="fixed_amount">Fixed amount</option><option value="percentage">Percentage</option></select></label><label class="loyalty-field">Discount value<input id="loyalty-reward-value" class="premium-input" type="number" value="5"></label><label class="loyalty-field">Redeem quantity<input id="loyalty-reward-qty" class="premium-input" type="number" value="1"></label><label class="loyalty-field">Available to redeem<input id="loyalty-reward-stock" class="premium-input" type="number" value="0"><small class="muted-small">0 = unlimited, or set lower than Shopify stock.</small></label><label class="loyalty-field">Discount issuing<select id="loyalty-reward-discount-mode" class="filter-select"><option value="draft_only">Record reward only</option><option value="native_discount_code">Issue Shopify discount code</option></select></label></div><div id="loyalty-selected-product-reward"></div><div class="loyalty-actions between"><button class="secondary-btn" type="button" onclick="window.loyaltyOpenProductPicker()">Search product reward</button><button class="primary-btn" type="button" onclick="window.addLoyaltyReward()">Add reward</button></div></div><div class="loyalty-card"><h3>Reward list</h3><p>Saved rewards appear here and can be assigned to tiers or checkout beta.</p><div id="loyalty-reward-list" class="loyalty-list"></div></div></div>`;
    renderRewardList();
  }
  function renderRewardList(){
    const list = document.getElementById('loyalty-reward-list'); if (!list) return;
    list.innerHTML = state.rewards.map((r,i)=>`<div class="loyalty-list-card"><div>${r.productImage?`<img src="${esc(r.productImage)}" alt="">`:'<div class="loyalty-thumb">★</div>'}</div><div><h4>${esc(r.name)}</h4><p>${esc(r.type || 'discount')} · ${Number(r.pointsCost||0)} ${esc(pointsName())}${r.discountValue?` · ${esc(r.discountValueType==='percentage'?'%':'£')}${Number(r.discountValue)}`:''}${r.productTitle?`<br>${esc(r.productTitle)} · ${money(r.productPrice)}`:''}<br>Redeem qty ${Number(r.redeemQuantity||1)} · Available ${Number(r.stockLimit||0)||'Unlimited'} · ${r.discountMode==='native_discount_code'?'Shopify code':'Record only'}</p></div><div class="loyalty-card-actions"><label class="loyalty-pill"><input type="checkbox" ${r.enabled!==false?'checked':''} onchange="window.updateLoyaltyReward(${i},'enabled',this.checked)"> Enabled</label><label class="loyalty-pill"><input type="checkbox" ${r.betaCheckoutEnabled?'checked':''} onchange="window.updateLoyaltyReward(${i},'betaCheckoutEnabled',this.checked)"> Checkout</label><button class="secondary-btn loyalty-danger" type="button" onclick="window.removeLoyaltyReward(${i})">×</button></div></div>`).join('') || '<p class="muted">No rewards yet.</p>';
  }

  function renderTiers(){
    const panel = document.getElementById('loyalty-tab-tiers'); if (!panel) return;
    panel.innerHTML = `<div class="loyalty-v24-grid"><div class="loyalty-card"><h3>Add a tier</h3><p>Attach rewards and earning opportunities to each tier.</p><div class="loyalty-form-grid"><label class="loyalty-field">Tier name<input id="loyalty-tier-name" class="premium-input" placeholder="VIP"></label><label class="loyalty-field">Points needed<input id="loyalty-tier-threshold" class="premium-input" type="number" value="3000"></label><label class="loyalty-field">Purchase multiplier<input id="loyalty-tier-multiplier" class="premium-input" type="number" step="0.1" value="2"></label></div><label class="loyalty-field">Benefits text<textarea id="loyalty-tier-perks" class="premium-input" rows="3"></textarea></label><div id="loyalty-tier-benefits" class="loyalty-checkbox-list"></div><div class="loyalty-actions"><button class="primary-btn" type="button" onclick="window.addLoyaltyTier()">Add tier</button></div></div><div class="loyalty-card"><h3>Tiers</h3><div id="loyalty-tier-list"></div></div></div>`;
    renderTierBenefitOptions('loyalty-tier-benefits', [], []); renderTierList();
  }
  function renderTierBenefitOptions(id, ruleIds=[], rewardIds=[]){
    const box = document.getElementById(id); if(!box) return;
    const rules = state.pointsRules || [];
    const rewards = state.rewards || [];
    box.innerHTML = `${rules.map(r=>`<label><input type="checkbox" data-tier-rule="${esc(r.id)}" ${ruleIds.includes(r.id)?'checked':''}> ${esc(r.name || r.trigger || 'Points rule')}</label>`).join('')}${rewards.map(r=>`<label><input type="checkbox" data-tier-reward="${esc(r.id)}" ${rewardIds.includes(r.id)?'checked':''}> ${esc(r.name || 'Reward')}</label>`).join('')}<label><input type="checkbox" data-tier-birthday="true"> Birthday reward</label>`;
  }
  function renderTierList(){
    const list = document.getElementById('loyalty-tier-list'); if(!list) return;
    list.innerHTML = state.tiers.map((t,i)=>`<div class="loyalty-module-card"><div class="loyalty-module-card-head"><div><h4>${esc(t.name)}</h4><p class="muted-small">${Number(t.threshold||0)} ${esc(pointsName())} · ${Number(t.multiplier||1)}x purchase multiplier</p></div><button class="loyalty-icon-btn loyalty-danger" type="button" onclick="window.removeLoyaltyTier(${i})">×</button></div><label class="loyalty-field">Benefits text<textarea class="premium-input" rows="2" onchange="window.updateLoyaltyTier(${i},'perks',this.value)">${esc(t.perks||'')}</textarea></label></div>`).join('') || '<p class="muted">No tiers yet.</p>';
  }

  function renderCheckout(){
    const panel = document.getElementById('loyalty-tab-checkout'); if (!panel) return;
    const beta = state.config?.settings?.checkoutBeta || {};
    panel.innerHTML = `<div class="loyalty-v24-grid"><div class="loyalty-card"><span class="loyalty-pill warn">Beta rule</span><h3>Checkout redemption controls</h3><p>Keep this separate from the main loyalty launch until checkout extension and discount code issuing have been tested.</p><label class="loyalty-pill"><input id="loyalty-checkout-enabled" type="checkbox" ${beta.enabled?'checked':''}> Enable checkout beta</label><label class="loyalty-pill"><input id="loyalty-checkout-native-codes" type="checkbox" ${beta.allowNativeDiscountCodes?'checked':''}> Allow Shopify discount codes</label><div class="loyalty-form-grid"><label class="loyalty-field">Minimum points to show<input id="loyalty-checkout-min-points" class="premium-input" type="number" value="${Number(beta.minimumPointsToShow||1)}"></label><label class="loyalty-field">Maximum points per checkout<input id="loyalty-checkout-max-points" class="premium-input" type="number" value="${Number(beta.maximumPointsPerCheckout||5000)}"></label><label class="loyalty-field">Point value in minor units<input id="loyalty-checkout-point-value" class="premium-input" type="number" value="${Number(beta.pointValueMinorUnits||1)}"></label><label class="loyalty-field">Checkout label<input id="loyalty-checkout-label" class="premium-input" value="${esc(beta.betaLabel||'Use your points at checkout')}"></label></div><label class="loyalty-field">Beta note<textarea id="loyalty-checkout-note" class="premium-input" rows="3">${esc(beta.betaNote||'Customers must be logged in before checkout redemption appears.')}</textarea></label><div class="loyalty-actions"><button class="primary-btn" onclick="window.saveLoyaltyConfig()">Save checkout beta</button></div></div><div class="loyalty-card"><h3>Checkout preview</h3><div class="loyalty-checkout-preview" id="loyalty-checkout-preview"></div><h4>Recent redemptions</h4><div id="loyalty-redemptions-list"><p class="muted">No checkout redemptions yet.</p></div></div></div>`;
    updateCheckoutPreview(); loadRedemptions();
  }
  function updateCheckoutPreview(){
    const box=document.getElementById('loyalty-checkout-preview'); if(!box) return; const available=1250; const max=Number(document.getElementById('loyalty-checkout-max-points')?.value||5000); const minor=Number(document.getElementById('loyalty-checkout-point-value')?.value||1); const redeem=Math.min(500, available, max); box.innerHTML=`<span class="muted-small">Available: ${available.toLocaleString()} ${esc(pointsName())} · about ${money(available*minor/100)}</span><h4>${esc(document.getElementById('loyalty-checkout-label')?.value||'Use your points at checkout')}</h4><div class="loyalty-checkout-input-row"><label class="loyalty-field">${esc(pointsName())} to redeem<input value="${redeem}" readonly></label><button class="primary-btn" disabled>Apply</button></div><p class="muted-small">This is a Checkout UI Extension-style input, not Liquid.</p>`;
  }

  function renderSettings(){
    const panel = document.getElementById('loyalty-tab-settings'); if(!panel) return;
    panel.innerHTML = `<div class="loyalty-v24-grid"><div class="loyalty-card"><h3>Programme settings</h3><label class="loyalty-field">Points name<input id="loyalty-points-label" class="premium-input" value="${esc(state.config?.pointName||'Points')}"></label><label class="loyalty-pill"><input id="loyalty-reuse-email-provider" type="checkbox" ${state.config?.settings?.reuseCoreEmailProvider!==false?'checked':''}> Reuse Reviews email provider</label><div class="loyalty-actions"><button class="primary-btn" onclick="window.saveLoyaltyConfig()">Save settings</button></div></div><div class="loyalty-card"><h3>Opt-out logic</h3><p>Customers tagged <strong>NO_LOY</strong> in Shopify stay visible in the private userboard but are excluded from rewards, points and emails.</p><p>No customer name, email, phone or address is stored in the loyalty database.</p></div></div>`;
  }
  function renderRules(){
    const panel=document.getElementById('loyalty-tab-rules'); if(!panel) return;
    panel.innerHTML = `<div class="loyalty-v24-grid"><div class="loyalty-card"><h3>Points rules</h3><p>Create rules for reviews, purchases, birthdays and manual bonuses.</p><div class="loyalty-form-grid"><label class="loyalty-field">Rule name<input id="loyalty-points-name" class="premium-input" value="Review approved points"></label><label class="loyalty-field">Points<input id="loyalty-points-value" class="premium-input" type="number" value="100"></label><label class="loyalty-field">Trigger<select id="loyalty-points-trigger" class="filter-select"><option value="review_approved">Review approved</option><option value="review_submitted">Review written</option><option value="purchase_completed">Purchase completed</option><option value="birthday">Birthday</option><option value="manual_adjustment">Manual bonus</option></select></label><label class="loyalty-field">Delay days<input id="loyalty-points-delay" class="premium-input" type="number" value="28"></label></div><label class="loyalty-pill"><input id="loyalty-points-verified" type="checkbox" checked> Verified reviews only</label><div class="loyalty-actions"><button class="primary-btn" onclick="window.addLoyaltyPointsRule()">Add points rule</button></div></div><div class="loyalty-card"><h3>Rule list</h3><div id="loyalty-points-rule-list"></div></div></div>`; renderPointsRules();
  }
  function renderPointsRules(){ const list=document.getElementById('loyalty-points-rule-list'); if(!list)return; list.innerHTML=(state.pointsRules||[]).map((r,i)=>`<div class="loyalty-module-card"><div class="loyalty-module-card-head"><div><h4>${esc(r.name)}</h4><p class="muted-small">${esc(r.trigger)} · ${Number(r.points)} ${esc(pointsName())} · delay ${Number(r.delayDays||0)} days</p></div><button class="loyalty-icon-btn loyalty-danger" onclick="window.removeLoyaltyPointsRule(${i})">×</button></div></div>`).join('') || '<p class="muted">No point rules yet.</p>'; }

  function renderAll(){
    installStyles(); renderTabs(); renderOverview(); const tab=currentTab();
    if(tab==='email') renderEmail(); if(tab==='members') renderMembers(); if(tab==='rewards') renderRewards(); if(tab==='tiers') renderTiers(); if(tab==='checkout') renderCheckout(); if(tab==='settings') renderSettings(); if(tab==='rules') renderRules();
  }

  function hydrate(config){
    state.config = config || {};
    state.emailModuleLibrary = Array.isArray(config?.emailModuleLibrary) && config.emailModuleLibrary.length ? config.emailModuleLibrary.map(x=>({...x})) : [defaultModule('reward_box'), defaultModule('offer'), defaultModule('support')];
    state.emailTemplates = Array.isArray(config?.emailTemplates) && config.emailTemplates.length ? config.emailTemplates.map(t=>({...defaultTemplate(), ...t, modules:Array.isArray(t.modules)?t.modules:[]})) : [defaultTemplate()];
    state.rewards = Array.isArray(config?.redemptionRewards) && config.redemptionRewards.length ? config.redemptionRewards.map(x=>({...x})) : defaultRewards();
    state.tiers = Array.isArray(config?.tiers) && config.tiers.length ? config.tiers.map(x=>({...x})) : defaultTiers();
    state.pointsRules = Array.isArray(config?.pointsRules) ? config.pointsRules.map(x=>({...x})) : [];
    state.rewardTemplates = Array.isArray(config?.rewardTemplates) ? config.rewardTemplates.map(x=>({...x})) : [];
  }

  function buildPayload(){
    if (document.getElementById('loyalty-tab-email')) syncTemplateFromInputs();
    const beta = state.config?.settings?.checkoutBeta || {};
    return {
      ...(state.config || {}),
      enabled: Boolean(document.getElementById('loyalty-enabled')?.checked ?? state.config?.enabled),
      pointName: pointsName(),
      emailModuleLibrary: state.emailModuleLibrary,
      emailTemplates: state.emailTemplates,
      redemptionRewards: state.rewards,
      tiers: state.tiers,
      pointsRules: state.pointsRules,
      rewardTemplates: state.rewardTemplates,
      settings: {
        ...(state.config?.settings || {}),
        reuseCoreEmailProvider: Boolean(document.getElementById('loyalty-reuse-email-provider')?.checked ?? true),
        checkoutBeta: {
          ...beta,
          enabled: Boolean(document.getElementById('loyalty-checkout-enabled')?.checked ?? beta.enabled),
          allowNativeDiscountCodes: Boolean(document.getElementById('loyalty-checkout-native-codes')?.checked ?? beta.allowNativeDiscountCodes),
          minimumPointsToShow: Number(document.getElementById('loyalty-checkout-min-points')?.value || beta.minimumPointsToShow || 1),
          maximumPointsPerCheckout: Number(document.getElementById('loyalty-checkout-max-points')?.value || beta.maximumPointsPerCheckout || 5000),
          pointValueMinorUnits: Number(document.getElementById('loyalty-checkout-point-value')?.value || beta.pointValueMinorUnits || 1),
          betaLabel: document.getElementById('loyalty-checkout-label')?.value || beta.betaLabel || 'Use your points at checkout',
          betaNote: document.getElementById('loyalty-checkout-note')?.value || beta.betaNote || 'Customers must be logged in before checkout redemption appears.',
          requireLoggedInCustomer: true,
          allowPartialRedemption: true,
        }
      }
    };
  }

  async function loadRows(){
    try { const data = await api('/admin/loyalty/customers?limit=200'); state.customers = data.rows || []; } catch { state.customers = []; }
    try { const data = await api('/admin/loyalty/ledger?limit=30'); state.ledger = data.rows || []; } catch { state.ledger = []; }
  }
  async function loadRedemptions(){
    const box=document.getElementById('loyalty-redemptions-list'); if(!box)return; try{ const data=await api('/admin/loyalty/redemptions?limit=10'); box.innerHTML=(data.rows||[]).map(r=>`<div class="loyalty-ledger-row"><div><strong>${esc(r.rewardName||'Reward')}</strong><span>${fmtDate(r.createdAt)} ${r.shopifyDiscountCode ? '· code '+esc(r.shopifyDiscountCode) : ''}</span></div><span class="loyalty-pill">${esc(r.status)}</span><strong>${Number(r.pointsCost||0)} ${esc(pointsName())}</strong></div>`).join('') || '<p class="muted">No checkout redemptions yet.</p>'; }catch(e){ box.innerHTML='<p class="muted">Could not load redemptions.</p>'; }
  }

  window.loadLoyaltyConfig = async function(){ try { const config = await api('/admin/loyalty/config'); hydrate(config || {}); await loadRows(); renderAll(); } catch (error) { console.warn('Could not load loyalty config:', error); toast(error.message || 'Could not load loyalty config'); } };
  window.saveLoyaltyConfig = async function(){ try { const saved = await api('/admin/loyalty/config', { method:'PATCH', body: JSON.stringify(buildPayload()) }); hydrate(saved || {}); await loadRows(); renderAll(); toast('Loyalty settings saved'); } catch(error){ toast(error.message || 'Could not save loyalty settings'); } };
  window.loyaltyAddModuleToLibrary = function(){ const type=document.getElementById('loyalty-new-module-type')?.value || 'notice'; const m=defaultModule(type); m.name=document.getElementById('loyalty-new-module-name')?.value || m.name; state.emailModuleLibrary.push(m); state.editingModuleId=m.id; renderEmail(); };
  window.loyaltyEditLibraryModule = (i)=>{ state.editingModuleId = state.emailModuleLibrary[i]?.id; renderModuleLibrary(); };
  window.loyaltyRemoveLibraryModule = (i)=>{ state.emailModuleLibrary.splice(i,1); renderEmail(); };
  window.loyaltyUpdateModule = function(ref,key,value){ const [scope, idxStr]=String(ref).split(':'); const idx=Number(idxStr); const arr=scope==='template'?activeTemplate().modules:state.emailModuleLibrary; if(!arr[idx])return; arr[idx][key]=['radius','padding','borderWidth'].includes(key)?Number(value||0):value; renderEmailPreview(); };
  window.loyaltyInsertModuleIntoEmail = function(){ const id=document.getElementById('loyalty-insert-module-id')?.value; const found=state.emailModuleLibrary.find(m=>m.id===id); if(!found)return; activeTemplate().modules.push({...found,id:uid('template_module')}); renderEmailTemplateModules(); renderEmailPreview(); };
  window.loyaltyToggleTemplateModuleEdit = (i)=>{ state.editingModuleId=`template:${i}`; renderEmailTemplateModules(); };
  window.loyaltyRemoveTemplateModule = (i)=>{ activeTemplate().modules.splice(i,1); renderEmailTemplateModules(); renderEmailPreview(); };
  window.loyaltyMoveTemplateModule = (i,dir)=>{ const mods=activeTemplate().modules; const j=i+dir; if(j<0||j>=mods.length)return; [mods[i],mods[j]]=[mods[j],mods[i]]; renderEmailTemplateModules(); renderEmailPreview(); };
  window.sendLoyaltyTestEmail = async function(){ const to=document.getElementById('loyalty-test-to')?.value || ''; if(!to){toast('Enter a test recipient email.');return;} renderEmailPreview(); try{ await api('/admin/loyalty/test-email',{method:'POST',body:JSON.stringify({to,subject:document.getElementById('loyalty-email-subject')?.value||'Your reward is ready',html:document.getElementById('loyalty-email-preview')?.innerHTML||''})}); toast('Loyalty test email sent.'); }catch(e){toast(e.message||'Could not send loyalty test email');} };
  window.loyaltySyncCustomers = async function(){ try{ const res=await api('/admin/loyalty/customers/sync',{method:'POST',body:JSON.stringify({limit:250})}); toast(`Synced ${Number(res.createdOrUpdated||0)} customers. ${Number(res.optedOut||0)} opted out.`); await window.loadLoyaltyConfig(); }catch(e){toast(e.message||'Could not sync customers');} };
  window.searchLoyaltyCustomers = async function(){ const q=document.getElementById('loyalty-customer-search')?.value||''; const box=document.getElementById('loyalty-customer-results'); if(!box)return; if(q.trim().length<2){box.innerHTML='<p class="muted">Enter at least 2 characters.</p>';return;} box.innerHTML='<p class="muted">Searching Shopify…</p>'; try{ const data=await api(`/admin/loyalty/customers/search?q=${encodeURIComponent(q.trim())}`); box.innerHTML=(data.customers||[]).map(c=>`<div class="loyalty-customer-result"><div><strong>${esc(c.displayName)}</strong><span>${esc(c.maskedEmail||'')} · ${Number(c.ordersCount||0)} orders ${c.optOut?'· NO_LOY':''}</span></div><button class="secondary-btn" onclick="window.selectLoyaltyCustomer('${esc(c.id)}','Shopify customer')">Use</button></div>`).join('') || '<p class="muted">No customers found.</p>'; }catch(e){box.innerHTML=`<div class="notice-box error">${esc(e.message||'Customer search unavailable')}</div>`;} };
  window.selectLoyaltyCustomer = async function(ref,label){ state.selectedCustomerRef=ref; state.selectedCustomerLabel=`${label} selected. Only the Shopify customer ID hash will be saved in loyalty.`; try{ await api('/admin/loyalty/customers/resolve',{method:'POST',body:JSON.stringify({customerRef:ref})}); await loadRows(); renderMembers(); }catch{ renderMembers(); } };
  window.manualLoyaltyAdjustment = async function(){ const ref=document.getElementById('loyalty-adjust-ref')?.value||state.selectedCustomerRef; const points=Number(document.getElementById('loyalty-adjust-points')?.value||0); if(!ref||!points){toast('Enter a customer reference and points change.');return;} try{ await api('/admin/loyalty/ledger/manual-adjust',{method:'POST',body:JSON.stringify({customerRef:ref,points,status:document.getElementById('loyalty-adjust-status')?.value||'available',reason:document.getElementById('loyalty-adjust-reason')?.value||'Manual adjustment'})}); toast('Loyalty points adjusted.'); await window.loadLoyaltyConfig(); }catch(e){toast(e.message||'Could not adjust points');} };
  window.processLoyaltyPending = async function(){ try{ const res=await api('/admin/loyalty/ledger/process-pending',{method:'POST',body:JSON.stringify({})}); toast(`Processed ${Number(res.matured||0)} pending rows.`); await window.loadLoyaltyConfig(); }catch(e){toast(e.message||'Could not process pending points');} };
  window.addLoyaltyReward = function(){ const reward={ id:uid('reward'), name:document.getElementById('loyalty-reward-name')?.value||'Reward', pointsCost:Number(document.getElementById('loyalty-reward-cost')?.value||0), type:document.getElementById('loyalty-reward-type')?.value||'discount', discountValueType:document.getElementById('loyalty-reward-value-type')?.value||'fixed_amount', discountValue:Number(document.getElementById('loyalty-reward-value')?.value||0), redeemQuantity:Number(document.getElementById('loyalty-reward-qty')?.value||1), stockLimit:Number(document.getElementById('loyalty-reward-stock')?.value||0), discountMode:document.getElementById('loyalty-reward-discount-mode')?.value||'draft_only', enabled:true, betaCheckoutEnabled:false, ...(state.editingRewardProduct||{}) }; state.rewards.push(reward); state.editingRewardProduct=null; renderRewards(); toast('Reward added. Save loyalty settings to keep it.'); };
  window.updateLoyaltyReward = (i,k,v)=>{ if(state.rewards[i]) state.rewards[i][k]=v; renderRewardList(); };
  window.removeLoyaltyReward = (i)=>{ state.rewards.splice(i,1); renderRewardList(); };
  window.loyaltyRewardTypeChanged = ()=>{};
  window.addLoyaltyTier = function(){ const checks=document.querySelectorAll('#loyalty-tier-benefits input'); const ruleIds=[], rewardIds=[]; let birthday=false; checks.forEach(c=>{ if(!c.checked)return; if(c.dataset.tierRule)ruleIds.push(c.dataset.tierRule); if(c.dataset.tierReward)rewardIds.push(c.dataset.tierReward); if(c.dataset.tierBirthday)birthday=true; }); state.tiers.push({id:uid('tier'),name:document.getElementById('loyalty-tier-name')?.value||'Tier',threshold:Number(document.getElementById('loyalty-tier-threshold')?.value||0),multiplier:Number(document.getElementById('loyalty-tier-multiplier')?.value||1),perks:document.getElementById('loyalty-tier-perks')?.value||'',ruleIds,rewardIds,birthdayRewardEnabled:birthday}); renderTiers(); };
  window.updateLoyaltyTier=(i,k,v)=>{ if(state.tiers[i]) state.tiers[i][k]=['threshold','multiplier'].includes(k)?Number(v||0):v; };
  window.removeLoyaltyTier=(i)=>{ state.tiers.splice(i,1); renderTiers(); };
  window.addLoyaltyPointsRule=function(){ state.pointsRules.push({id:uid('points'),name:document.getElementById('loyalty-points-name')?.value||'Points rule',enabled:true,trigger:document.getElementById('loyalty-points-trigger')?.value||'review_approved',points:Number(document.getElementById('loyalty-points-value')?.value||100),delayDays:Number(document.getElementById('loyalty-points-delay')?.value||0),verifiedOnly:Boolean(document.getElementById('loyalty-points-verified')?.checked),minStars:1}); renderRules(); };
  window.removeLoyaltyPointsRule=(i)=>{ state.pointsRules.splice(i,1); renderPointsRules(); };

  window.loyaltyOpenProductPicker=function(){
    const modal=document.createElement('div'); modal.className='loyalty-modal-backdrop'; modal.innerHTML=`<div class="loyalty-modal"><div class="loyalty-modal-head"><div><h3>Select reward product</h3><p class="muted">Choose the Shopify product customers can redeem with points.</p></div><button class="secondary-btn" data-close>×</button></div><div class="loyalty-modal-body"><div class="input-action-row"><input id="loyalty-product-query" class="premium-input" placeholder="Search products"><button class="primary-btn" id="loyalty-product-run">Search</button></div><div id="loyalty-product-results"><p class="muted">Search the Shopify catalogue.</p></div></div></div>`; document.body.appendChild(modal); modal.addEventListener('click',e=>{ if(e.target===modal || e.target.matches('[data-close]')) modal.remove(); }); modal.querySelector('#loyalty-product-run').onclick=async()=>{ const q=modal.querySelector('#loyalty-product-query').value||''; const box=modal.querySelector('#loyalty-product-results'); box.innerHTML='<p class="muted">Searching…</p>'; try{ const data=await api(`/admin/products/search?q=${encodeURIComponent(q)}`); const products=data.products||[]; window.loyaltyProductSearchResults = products; box.innerHTML=products.map((p,i)=>`<div class="loyalty-product-row"><img src="${esc(p.image||'')}" alt=""><div><strong>${esc(p.title)}</strong><p class="muted-small">${esc(p.id)} · ${p.price?money(p.price):''}${p.inventoryQuantity!=null?' · stock '+Number(p.inventoryQuantity):''}</p></div><button class="secondary-btn" onclick="window.loyaltyChooseProductIndex(${i})">Select</button></div>`).join('') || '<p class="muted">No products found.</p>'; }catch(e){ box.innerHTML=`<div class="notice-box error">${esc(e.message||'Product search failed')}</div>`; } };
  };
  window.loyaltyChooseProductIndex=function(i){ const p=(window.loyaltyProductSearchResults||[])[i]; if(!p)return; window.loyaltySelectRewardProduct(p.id, p.variantId || '', p.title || '', p.image || '', p.handle || '', Number(p.price || 0), Number(p.inventoryQuantity || 0)); };
  window.loyaltySelectRewardProduct=function(id,variantId,title,image,handle,price,stock){ state.editingRewardProduct={shopifyProductId:id,shopifyVariantId:variantId,productTitle:title,productImage:image,productHandle:handle,productPrice:Number(price||0),stockLimit:Number(stock||0)}; document.querySelector('.loyalty-modal-backdrop')?.remove(); const box=document.getElementById('loyalty-selected-product-reward'); if(box) box.innerHTML=`<div class="loyalty-list-card"><img src="${esc(image)}" alt=""><div><h4>${esc(title)}</h4><p>${esc(id)} · ${money(price)} · stock ${Number(stock||0)}</p></div><button class="secondary-btn loyalty-danger" onclick="window.clearSelectedRewardProduct()">×</button></div>`; };

  window.clearSelectedRewardProduct=function(){ state.editingRewardProduct=null; const box=document.getElementById('loyalty-selected-product-reward'); if(box) box.innerHTML=''; };

  document.addEventListener('click', (e)=>{ const btn=e.target.closest('#v-loyalty [data-loyalty-tab]'); if(!btn)return; e.preventDefault(); document.querySelectorAll('#v-loyalty [data-loyalty-tab]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderAll(); });
  document.addEventListener('input', (e)=>{ if(e.target.closest('#loyalty-tab-email')) renderEmailPreview(); if(e.target.closest('#loyalty-tab-checkout')) updateCheckoutPreview(); });
  document.addEventListener('change', (e)=>{ if(e.target?.id==='loyalty-enabled') window.saveLoyaltyConfig(); if(e.target.closest('#loyalty-tab-email')) renderEmailPreview(); if(e.target.closest('#loyalty-tab-checkout')) updateCheckoutPreview(); });
  setTimeout(()=>{ installStyles(); if(document.getElementById('v-loyalty')?.classList.contains('active')) window.loadLoyaltyConfig(); }, 500);
})();
