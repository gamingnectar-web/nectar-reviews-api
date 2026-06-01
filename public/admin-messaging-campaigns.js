/* Nectar Reviews — Messaging & Campaigns v5
   Tabbed campaign builder with secured admin API, per-shop OAuth product search, SMTP settings and test links. */
(function () {
  const DEFAULT_PAGE_HANDLE = 'leave-review';
  const DEFAULT_API = `${window.location.origin}/api`;
  const products = [];
  let productSearchResults = [];
  let reviewTemplates = [];
  let linkRules = [];
  let messageModules = [];
  let hiddenModuleIds = [];
  let providerProfiles = [];
  let emailTemplates = [];

  const BUILT_IN_MODULES = [
    { id: 'notice', name: 'Notice box', title: 'Before you review', text: 'A quick note before you review: your feedback helps other customers choose confidently.', bgColor: '#f8fafc', borderColor: '#e5e7eb', borderWidth: 1, radius: 12, padding: 14, buttonText: '', buttonUrl: '' },
    { id: 'promo', name: 'Promo / offer box', title: 'Thanks again', text: 'Thanks again for shopping with us — we appreciate your support.', bgColor: '#f8fafc', borderColor: '#e5e7eb', borderWidth: 1, radius: 12, padding: 14, buttonText: '', buttonUrl: '' },
    { id: 'support', name: 'Support reminder', title: 'Need help first?', text: 'Need help before leaving a review? Tell us what happened and customer service will pick it up before you submit feedback.', bgColor: '#f8fafc', borderColor: '#e5e7eb', borderWidth: 1, radius: 12, padding: 14, buttonText: 'Contact customer service', buttonUrl: '{{support_link}}' },
    { id: 'text', name: 'Plain text section', title: 'Quick note', text: 'Add your custom message here.', bgColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, radius: 0, padding: 8, buttonText: '', buttonUrl: '' },
  ];

  function getShopDomain() {
    const params = new URLSearchParams(window.location.search);
    return (window.SHOP_DOMAIN || params.get('shop') || params.get('shopDomain') || 'your-dev-store.myshopify.com').toLowerCase();
  }

  function apiPath(path) {
    const shop = encodeURIComponent(getShopDomain());
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}shopDomain=${shop}`;
  }

  async function securedFetch(path, options = {}) {
    if (typeof window.adminFetch === 'function') return window.adminFetch(path, options);
    const secret = sessionStorage.getItem('nectar_admin_secret') || '';
    const signedToken = sessionStorage.getItem('nectar_admin_token') || '';
    const headers = { 'Content-Type': 'application/json', 'X-Shop-Domain': getShopDomain(), ...(options.headers || {}) };
    if (signedToken) headers['X-Nectar-Admin-Token'] = signedToken;
    if (secret) headers['X-Nectar-Admin-Secret'] = secret;
    const res = await fetch(`${DEFAULT_API}${apiPath(path)}`, { ...options, headers });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try { const json = await res.json(); message = json.error || json.detail || message; } catch (_) {}
      const error = new Error(message);
      error.status = res.status;
      if (res.status === 401) error.installUrl = `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(getShopDomain())}`;
      throw error;
    }
    return res.json();
  }

  function showToast(message) {
    if (typeof window.showToast === 'function') return window.showToast(message);
    if (window.shopify && window.shopify.toast) return window.shopify.toast.show(message);
    alert(message);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
  }

  function cleanHandle(handle) {
    return String(handle || DEFAULT_PAGE_HANDLE)
      .trim()
      .replace(/^\/pages\//, '')
      .replace(/^\//, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || DEFAULT_PAGE_HANDLE;
  }

  function shopUrl() {
    const shop = getShopDomain();
    return shop.startsWith('http') ? shop.replace(/\/$/, '') : `https://${shop}`;
  }

  function el(id) { return document.getElementById(id); }
  function val(id, fallback = '') { const node = el(id); return node ? ((node.value || '').trim() || fallback) : fallback; }
  function uid(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function purposeLabel(value) { return ({ reviews: 'Reviews', loyalty: 'Loyalty', cartRewards: 'Cart Rewards', general: 'General' }[value] || value || 'General'); }

  function cssOrNone(value, fallback = '') {
    const raw = String(value || '').trim();
    if (!raw || /^none$/i.test(raw) || /^transparent$/i.test(raw)) return 'transparent';
    return raw || fallback || 'transparent';
  }
  function borderColorOrNone(value) {
    const raw = String(value || '').trim();
    if (!raw || /^none$/i.test(raw) || /^transparent$/i.test(raw)) return 'transparent';
    return raw;
  }
  function isTransparentColor(value) {
    return !String(value || '').trim() || /^(none|transparent)$/i.test(String(value || '').trim());
  }
  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
  }
  function colourLabel(value) {
    const raw = String(value || '').trim();
    if (isTransparentColor(raw)) return 'None / transparent';
    return isHexColor(raw) ? 'Colour selected' : raw;
  }
  function refreshColorButton(inputOrId) {
    const input = typeof inputOrId === 'string' ? el(inputOrId) : inputOrId;
    if (!input) return;
    const button = document.querySelector(`[data-color-picker-for="${input.id}"]`);
    if (!button) return;
    const value = String(input.value || '').trim();
    const swatch = button.querySelector('.msg-color-swatch');
    const label = button.querySelector('.msg-color-label');
    if (swatch) {
      swatch.style.background = isTransparentColor(value) ? 'linear-gradient(45deg,#fff 0,#fff 46%,#d92d20 48%,#d92d20 52%,#fff 54%,#fff 100%)' : value;
    }
    if (label) label.textContent = colourLabel(value);
    button.title = isTransparentColor(value) ? 'Transparent/no colour' : value;
  }
  function refreshAllColorButtons() {
    document.querySelectorAll('[data-color-picker-for]').forEach((button) => refreshColorButton(button.dataset.colorPickerFor));
  }
  function normaliseButtonUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^\{\{.*\}\}$/i.test(value) || /^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
    return value.startsWith('/') ? value : `/${value}`;
  }

  function ensureColorChoiceModal() {
    let modal = document.getElementById('msg-color-choice-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'msg-color-choice-modal';
    modal.className = 'msg-color-modal';
    modal.innerHTML = `<div class="msg-color-modal-card" role="dialog" aria-modal="true"><button type="button" class="msg-color-close">×</button><h3>Choose colour</h3><p>Select a colour, paste a hex value, or choose <strong>None / transparent</strong>.</p><div class="msg-colour-preview-row"><span class="msg-colour-preview-swatch" id="msg-color-preview-swatch"></span><strong id="msg-color-preview-label">Colour selected</strong></div><label>Colour picker</label><input id="msg-color-native" type="color" value="#f8fafc"><label>Hex / value</label><input id="msg-color-hex" type="text" placeholder="#f8fafc or none"><div class="msg-color-swatches"><button data-color-value="#f8fafc" style="background:#f8fafc" title="Soft grey"></button><button data-color-value="#fff7ed" style="background:#fff7ed" title="Warm cream"></button><button data-color-value="#ecfdf3" style="background:#ecfdf3" title="Soft green"></button><button data-color-value="#eff6ff" style="background:#eff6ff" title="Soft blue"></button><button data-color-value="#111827" style="background:#111827" title="Dark navy"></button></div><div class="msg-actions"><button type="button" class="msg-btn secondary" data-color-none>None / transparent</button><button type="button" class="msg-btn" data-color-apply>Apply</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('active'); });
    modal.querySelector('.msg-color-close')?.addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelector('#msg-color-native')?.addEventListener('input', (event) => { const hex = modal.querySelector('#msg-color-hex'); if (hex) hex.value = event.target.value; });
    modal.querySelectorAll('[data-color-value]').forEach((btn)=>btn.addEventListener('click', () => { const value = btn.dataset.colorValue; modal.querySelector('#msg-color-native').value = value; modal.querySelector('#msg-color-hex').value = value; }));
    return modal;
  }

  function openColorChoice(input) {
    const modal = ensureColorChoiceModal();
    const native = modal.querySelector('#msg-color-native');
    const hex = modal.querySelector('#msg-color-hex');
    const preview = modal.querySelector('#msg-color-preview-swatch');
    const label = modal.querySelector('#msg-color-preview-label');
    const current = String(input.value || '').trim();
    const updateModalPreview = () => {
      const value = String(hex?.value || native?.value || '').trim();
      if (preview) preview.style.background = isTransparentColor(value) ? 'linear-gradient(45deg,#fff 0,#fff 46%,#d92d20 48%,#d92d20 52%,#fff 54%,#fff 100%)' : value;
      if (label) label.textContent = colourLabel(value);
    };
    const safe = /^#[0-9a-f]{6}$/i.test(current) ? current : '#f8fafc';
    if (native) native.value = safe;
    if (hex) hex.value = /^(none|transparent)$/i.test(current) ? 'none' : current;
    updateModalPreview();
    native && (native.oninput = (event) => { if (hex) hex.value = event.target.value; updateModalPreview(); });
    hex && (hex.oninput = updateModalPreview);
    modal.classList.add('active');
    modal.querySelector('[data-color-apply]').onclick = () => { input.value = (hex?.value || native?.value || 'none').trim() || 'none'; refreshColorButton(input); input.dispatchEvent(new Event('input', { bubbles: true })); modal.classList.remove('active'); };
    modal.querySelector('[data-color-none]').onclick = () => { input.value = 'none'; refreshColorButton(input); input.dispatchEvent(new Event('input', { bubbles: true })); modal.classList.remove('active'); };
  }

  function injectStyles() {
    if (document.getElementById('nr-messaging-campaigns-styles')) return;
    const style = document.createElement('style');
    style.id = 'nr-messaging-campaigns-styles';
    style.textContent = `
      .msg-shell{display:grid;gap:18px;}
      .msg-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;}
      .msg-header h2{margin:0;font-size:28px;letter-spacing:-.04em;}.msg-header p{margin:7px 0 0;color:var(--text-light,#6b7280);max-width:820px;line-height:1.55;}
      .msg-flow-card{min-width:250px;background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.08));}.msg-flow-card span{display:block;font-size:11px;font-weight:900;text-transform:uppercase;color:#667085;}.msg-flow-card strong{display:block;margin-top:5px;font-size:13px;}
      .msg-tabs{display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border,#e5e7eb);margin-top:6px;}.msg-tab{border:0;background:transparent;color:#667085;padding:13px 15px;font-weight:900;cursor:pointer;border-bottom:3px solid transparent;}.msg-tab.active{color:var(--blue,#005bd3);border-bottom-color:var(--blue,#005bd3);}
      .msg-pane{display:none;}.msg-pane.active{display:block;}.msg-grid{display:grid;grid-template-columns:minmax(320px,420px) minmax(0,1fr);gap:20px;align-items:start;}.msg-stack{display:grid;gap:16px;}.msg-card{background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:20px;box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.08));}.msg-card h3{margin:0 0 5px;font-size:18px;}.msg-card p{margin:0 0 12px;color:#667085;line-height:1.5;}.msg-card label{display:block;margin:13px 0 6px;font-size:13px;font-weight:900;}.msg-card input,.msg-card select,.msg-card textarea{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #cfd5dd;border-radius:10px;padding:10px 12px;font:inherit;background:#fff;}.msg-card textarea{min-height:98px;resize:vertical;}.msg-card input:focus,.msg-card select:focus,.msg-card textarea:focus{outline:none;border-color:var(--blue,#005bd3);box-shadow:0 0 0 3px rgba(0,91,211,.12);}.msg-card input[type=color]{height:44px;padding:4px;}.msg-card .msg-none-input{font-family:inherit}.msg-card .msg-field-hint{display:block;color:#667085;font-size:11px;font-weight:700;margin-top:4px}.msg-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}.msg-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}.msg-btn{border:0;border-radius:10px;background:var(--primary,#111827);color:#fff;min-height:42px;padding:10px 15px;font-weight:900;cursor:pointer;}.msg-btn.secondary{background:#fff;color:#111827;border:1px solid var(--border,#e5e7eb);}.msg-btn.full{width:100%;}.msg-help{padding:12px 14px;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#f8fafc;color:#667085;line-height:1.5;font-size:13px;}.msg-preview-card{padding:0;overflow:hidden;}.msg-preview-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--border,#e5e7eb);}.msg-toggle{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--border,#e5e7eb);border-radius:999px;background:#f8fafc;}.msg-toggle button{border:0;border-radius:999px;background:transparent;padding:8px 14px;font-weight:900;cursor:pointer;color:#667085;}.msg-toggle button.active{background:#fff;color:#111827;box-shadow:0 1px 3px rgba(17,24,39,.12);}.msg-preview-stage{display:grid;place-items:center;min-height:360px;background:#f4f6f8;padding:26px;}.msg-preview-wrap{width:100%;max-width:640px;}.msg-preview-wrap.mobile{max-width:390px;border:12px solid #111827;border-radius:30px;overflow:hidden;background:#fff;}.msg-code{width:100%;min-height:220px;border:0;border-top:1px solid var(--border,#e5e7eb);border-radius:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45;}.msg-products{display:grid;gap:10px;margin-top:14px;}.msg-product{display:grid;grid-template-columns:48px 1fr auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#fbfdff;}.msg-product img{width:48px;height:48px;object-fit:cover;border-radius:9px;background:#eef2f7;}.msg-product strong{display:block;font-size:13px;}.msg-product small{display:block;color:#667085;line-height:1.35;}.msg-product button{border:0;background:transparent;color:#d72c0d;font-weight:900;cursor:pointer;}.msg-analytics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}.msg-analytics div{border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#fbfdff;padding:16px;}.msg-analytics span{display:block;font-size:11px;text-transform:uppercase;font-weight:900;color:#667085;}.msg-analytics strong{display:block;margin-top:5px;font-size:26px;letter-spacing:-.05em;}.msg-state{margin-top:12px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid var(--border,#e5e7eb);color:#667085;font-weight:800;}.msg-state.ok{background:#ecfdf3;color:#027a48;border-color:#abefc6;}.msg-state.bad{background:#fff1f3;color:#b42318;border-color:#fecdd6;}
      .msg-builder-grid{grid-template-columns:minmax(0,1fr) clamp(280px,22vw,360px)!important;gap:18px;align-items:start}.msg-builder-grid>.msg-stack:last-child{position:sticky;top:18px}.msg-builder-grid .msg-preview-card{border-radius:18px;box-shadow:0 10px 28px rgba(15,23,42,.06)}.msg-builder-grid .msg-preview-head{padding:14px 16px}.msg-builder-grid .msg-preview-head h3{font-size:16px}.msg-builder-grid .msg-preview-head p{font-size:12px;line-height:1.35}.msg-preview-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.msg-preview-tools .msg-btn{min-height:36px;padding:8px 11px;font-size:12px}.msg-builder-grid .msg-preview-stage{min-height:420px;max-height:calc(100dvh - 210px);overflow:auto;padding:14px;background:linear-gradient(180deg,#f8fafc,#eef2f7)}.msg-builder-grid .msg-preview-wrap{max-width:100%;}.msg-preview-popout{white-space:nowrap}.msg-preview-modal .msg-modal{width:min(1080px,calc(100vw - 32px));max-height:92dvh;display:flex;flex-direction:column}.msg-preview-modal .msg-modal-body{overflow:auto;background:#f4f6f8;display:grid;place-items:start center;padding:28px}.msg-preview-modal-frame{width:min(720px,100%)}.msg-btn{border-radius:12px!important;box-shadow:0 1px 2px rgba(15,23,42,.08);transition:transform .12s ease,box-shadow .12s ease,background .12s ease}.msg-btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(15,23,42,.10)}.msg-btn.secondary{background:#fff!important;color:#111827!important;border:1px solid #d0d5dd!important}.msg-btn.danger,.msg-template-remove{background:#fff1f3!important;color:#b42318!important;border:1px solid #fecdd6!important}.msg-template-card{border-radius:18px!important;background:#fff!important;border-color:#e5e7eb!important;padding:16px!important}.msg-template-top{align-items:center!important}.msg-template-actions{justify-content:flex-start!important;gap:10px!important}.msg-template-card .msg-btn{min-height:38px!important;padding:8px 12px!important}.msg-template-meta{gap:7px!important}.msg-template-meta span{display:inline-flex;align-items:center;border:1px solid #e5e7eb;background:#f8fafc;border-radius:999px;padding:3px 8px}.msg-color-modal{backdrop-filter:blur(3px)}.msg-color-modal-card{border-radius:24px!important;padding:24px!important;box-shadow:0 30px 110px rgba(15,23,42,.35)!important}.msg-color-modal-card h3{font-size:22px;margin:0 0 8px}.msg-color-modal-card p{line-height:1.5;color:#475467}.msg-colour-preview-row{border-radius:16px!important;padding:13px 14px!important;background:#f8fafc!important}.msg-color-swatches button{width:42px!important;height:42px!important;box-shadow:inset 0 0 0 2px rgba(255,255,255,.8),0 1px 2px rgba(15,23,42,.10)}@media(max-width:1280px){.msg-builder-grid{grid-template-columns:minmax(0,1fr) 300px!important}}@media(max-width:980px){.msg-builder-grid{grid-template-columns:1fr!important}.msg-builder-grid>.msg-stack:last-child{position:static}.msg-builder-grid .msg-preview-stage{max-height:none}}
      .msg-provider-status{display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;border:1px solid #fecdd6;background:#fff1f3;color:#b42318;margin-bottom:16px}.msg-provider-status.ok{border-color:#abefc6;background:#ecfdf3;color:#027a48}.msg-provider-status .icon{width:38px;height:38px;border-radius:999px;display:grid;place-items:center;background:#fff;font-weight:950;font-size:20px;box-shadow:0 1px 3px rgba(15,23,42,.08)}.msg-provider-status strong{display:block;font-size:16px}.msg-provider-status span:last-child{display:block;color:inherit;opacity:.78;font-size:13px;margin-top:2px}.msg-template-list{display:grid;gap:10px}.msg-template-card{position:relative;border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fbfdff;padding:14px 42px 14px 14px;cursor:pointer}.msg-template-card strong{display:block}.msg-template-card small{display:block;color:#667085;margin-top:3px}.msg-template-card button{position:absolute;right:10px;bottom:10px;border:0;background:#fff1f3;color:#d72c0d;border-radius:999px;width:26px;height:26px;font-weight:900;cursor:pointer}.msg-template-add{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;border:1px solid var(--border,#e5e7eb);background:#fff;color:#111827;font-weight:950;cursor:pointer}.msg-link-rule-row{display:grid;grid-template-columns:160px 1fr 1fr auto;gap:10px;align-items:end}.msg-link-rule-list{display:grid;gap:10px;margin-top:12px}.msg-link-rule-pill{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#fbfdff;padding:12px}.msg-link-rule-pill button{border:0;background:transparent;color:#d72c0d;font-weight:900;cursor:pointer}.msg-code-card textarea{min-height:260px}

      .msg-input-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.msg-input-action .msg-btn{white-space:nowrap}.msg-section-row{border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fbfdff;padding:12px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:start}.msg-section-row.dragging{opacity:.55}.msg-drag-handle{cursor:grab;width:34px;height:34px;border:1px solid #d9e0ea;border-radius:10px;background:#fff;display:grid;place-items:center;font-weight:950;color:#667085}.msg-section-editor{display:grid;gap:10px}.msg-section-editor input,.msg-section-editor textarea,.msg-section-editor select{width:100%;min-height:38px;border:1px solid #cfd5dd;border-radius:10px;padding:8px 10px;font:inherit}.msg-section-editor textarea{min-height:68px;resize:none}.msg-section-style-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.msg-section-style-grid label{margin:0!important;font-size:11px!important;color:#667085!important}.msg-section-actions{display:flex;gap:6px}.msg-icon-btn{width:34px;height:34px;border:1px solid var(--border,#e5e7eb);border-radius:10px;background:#fff;color:#111827;font-weight:950;cursor:pointer}.msg-icon-btn.danger{color:#d72c0d;background:#fff1f3}.msg-code-card details{background:#fff;border-radius:16px;overflow:hidden}.msg-code-card summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 20px;cursor:pointer}.msg-code-card summary::-webkit-details-marker{display:none}.msg-code-card summary:before{content:'+';display:inline-grid;place-items:center;width:30px;height:30px;border-radius:10px;border:1px solid #d9e0ea;background:#fff;font-weight:950;margin-right:12px}.msg-code-card details[open] summary:before{content:'−'}.msg-code-card summary>div{flex:1}.msg-code-card summary span{color:#667085;font-size:13px}.msg-link-rule-row{grid-template-columns:minmax(150px,180px) minmax(0,1fr) minmax(0,1fr) auto!important}.msg-link-rule-row .msg-btn{align-self:end;white-space:nowrap}
      .flow-product-modal-backdrop{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.56);}.flow-product-modal-backdrop.active{display:flex;}.flow-product-modal{width:min(860px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 28px 90px rgba(15,23,42,.32);border:1px solid var(--border,#e5e7eb);}.flow-product-modal-head{display:flex;justify-content:space-between;gap:16px;padding:22px 24px;border-bottom:1px solid var(--border,#e5e7eb);}.flow-product-modal-head h3{margin:0 0 5px;font-size:20px;}.flow-product-modal-head p{margin:0;color:#667085;}.flow-product-modal-close{border:0;background:#f3f4f6;width:36px;height:36px;border-radius:999px;cursor:pointer;font-weight:900;}.flow-product-search{display:grid;grid-template-columns:1fr auto;gap:10px;padding:18px 24px;border-bottom:1px solid var(--border,#e5e7eb);}.flow-product-search input{min-height:44px;border:1px solid #cfd5dd;border-radius:10px;padding:10px 12px;font:inherit;}.flow-product-search button,.flow-product-modal-actions button{border:0;border-radius:10px;background:#111827;color:#fff;min-height:44px;padding:10px 16px;font-weight:900;cursor:pointer;}.flow-product-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 24px 24px;}.flow-product-modal-actions .secondary{background:#fff;color:#111827;border:1px solid var(--border,#e5e7eb);}.flow-product-results{padding:12px 24px 4px;display:grid;gap:10px;}.flow-product-row{display:grid;grid-template-columns:auto 56px 1fr auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fbfdff;}.flow-product-row img{width:56px;height:56px;object-fit:cover;border-radius:10px;background:#eef2f7;}.flow-product-row strong{display:block;font-size:14px;}.flow-product-row small{color:#667085;}.flow-product-row button{border:1px solid var(--border,#e5e7eb);background:#fff;color:#111827;border-radius:10px;min-height:38px;padding:8px 12px;font-weight:900;cursor:pointer;}.oauth-connect{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:12px;padding:14px;}.oauth-connect a{background:#111827;color:#fff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:900;white-space:nowrap;}

      .msg-builder-grid,.msg-delivery-grid,.msg-settings-grid,.msg-tester-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}.msg-test-actions{display:grid!important;grid-template-columns:1fr 1fr 1fr 46px;gap:10px;align-items:center}.msg-test-actions .msg-template-add{width:46px;height:46px}.msg-section-list-wide{display:grid;gap:12px}.msg-section-row{grid-template-columns:38px minmax(0,1fr) 38px!important}.msg-section-editor{gap:12px!important}.msg-section-editor .msg-section-title-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,160px);gap:10px}.msg-section-style-grid{grid-template-columns:repeat(5,minmax(80px,1fr))!important}.msg-link-rule-row{grid-template-columns:180px minmax(220px,1fr) minmax(220px,1fr) auto!important}.msg-analytics-tabs{display:flex;gap:8px;margin:16px 0 12px;border-bottom:1px solid var(--border,#e5e7eb)}.msg-analytics-tab{border:0;background:transparent;padding:10px 13px;border-bottom:3px solid transparent;color:#667085;font-weight:900;cursor:pointer}.msg-analytics-tab.active{border-bottom-color:var(--blue,#005bd3);color:var(--blue,#005bd3)}.msg-analytics-list{display:grid;gap:8px}.msg-analytics-row{display:grid;grid-template-columns:1.2fr .8fr .8fr auto;gap:10px;align-items:center;border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:10px 12px;background:#fff}.msg-analytics-row small{color:#667085}.msg-test-pill{display:inline-flex;align-items:center;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:950;text-transform:uppercase;padding:4px 7px;margin-left:6px}.msg-analytics-note{margin-top:10px;color:#667085;font-size:12px;line-height:1.45}.msg-link-rule-row label{margin-top:0}.msg-card .msg-inline-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}


      .msg-provider-list,.msg-module-library{display:grid;gap:10px}.msg-provider-card,.msg-module-card{border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fbfdff;padding:14px;display:grid;gap:8px}.msg-provider-card-head,.msg-module-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.msg-provider-badges{display:flex;gap:6px;flex-wrap:wrap}.msg-badge{display:inline-flex;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:950;padding:4px 8px}.msg-badge.green{background:#ecfdf3;color:#027a48}.msg-badge.gray{background:#f3f4f6;color:#475467}.msg-module-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.msg-module-style-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.msg-module-style-grid label,.msg-module-form-grid label{margin-top:0!important}.msg-template-card{padding:14px!important;cursor:default}.msg-template-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.msg-template-remove{border:0;background:#fff1f3;color:#d72c0d;border-radius:999px;width:30px!important;height:30px!important;display:grid!important;place-items:center!important;font-size:16px;line-height:1;padding:0!important;position:static!important}.msg-template-meta{display:flex;gap:8px;flex-wrap:wrap;color:#667085;font-size:12px;margin-top:4px}.msg-template-card details{margin-top:10px;border-top:1px solid #e5e7eb;padding-top:10px}.msg-template-card summary{cursor:pointer;font-weight:900;color:#111827}.msg-template-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.msg-modal-backdrop{position:fixed;inset:0;z-index:2147483500;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.56)}.msg-modal-backdrop.active{display:flex}.msg-modal{width:min(520px,100%);background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:18px;box-shadow:0 28px 90px rgba(15,23,42,.32);overflow:hidden}.msg-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:22px 24px;border-bottom:1px solid var(--border,#e5e7eb)}.msg-modal-head h3{margin:0 0 4px;font-size:20px}.msg-modal-head p{margin:0;color:#667085}.msg-modal-close{border:0;background:#f3f4f6;width:36px;height:36px;border-radius:999px;display:grid;place-items:center;cursor:pointer;font-weight:950}.msg-modal-body{padding:20px 24px;display:grid;gap:12px}.msg-modal-body label{font-size:13px;font-weight:900}.msg-modal-body input{width:100%;min-height:44px;border:1px solid #cfd5dd;border-radius:10px;padding:10px 12px;font:inherit;box-sizing:border-box}.msg-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:0 24px 24px}.msg-product-search-explainer{display:grid;gap:10px}.msg-check-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.msg-check-list li{display:flex;gap:8px;align-items:flex-start;color:#475467;font-size:13px;line-height:1.45}.msg-check-list li:before{content:'✓';font-weight:950;color:#027a48}.msg-analytics-row.recipient{grid-template-columns:1.1fr .7fr .7fr .7fr auto}.msg-reminder-btn{border:1px solid var(--border,#e5e7eb);border-radius:10px;background:#fff;color:#111827;min-height:36px;padding:8px 11px;font-weight:900;cursor:pointer}.msg-reminder-btn:disabled{opacity:.5;cursor:not-allowed}.msg-settings-subnav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.msg-settings-mini{border:1px solid var(--border,#e5e7eb);background:#fff;border-radius:999px;padding:8px 12px;font-weight:900;cursor:pointer}.msg-settings-mini.active{background:#111827;color:#fff}.msg-code-card{min-width:0}.msg-code-card summary{min-width:0}.msg-code-card summary .msg-btn{flex-shrink:0}
      .msg-modules-stack{display:grid!important;grid-template-columns:1fr!important;gap:16px!important}.msg-module-card .msg-template-actions{justify-content:flex-start;align-items:center}.msg-btn.danger{background:#fff1f3!important;color:#d72c0d!important;border-color:#fecdd6!important}.msg-provider-card .msg-icon-btn,.msg-template-remove{display:grid!important;place-items:center!important;line-height:1!important;padding:0!important}.msg-template-card{overflow:visible}.msg-template-actions{position:static!important;display:flex!important;justify-content:flex-start!important;align-items:center!important;margin-top:12px!important}.msg-template-actions .msg-btn{position:static!important;width:auto!important;height:auto!important;white-space:normal!important}.msg-analytics-row{grid-template-columns:1.1fr .7fr .7fr .9fr auto!important}.msg-analytics-row.recipient{grid-template-columns:1.1fr .7fr .7fr 1fr auto!important}.msg-analytics-sent-details{margin-top:5px;color:#667085;font-size:12px;line-height:1.35}.msg-analytics-row .msg-muted-line{color:#667085;font-size:12px;line-height:1.35}.msg-provider-primary-actions{display:flex;gap:6px;flex-wrap:wrap}.msg-provider-primary-actions .msg-btn{min-height:36px;padding:8px 10px;font-size:12px}.msg-module-link-grid{display:grid;grid-template-columns:180px minmax(0,1fr);gap:12px}.msg-color-picker{width:100%;min-height:44px;border:1px solid #cfd5dd;border-radius:10px;background:#fff;display:flex;align-items:center;gap:10px;padding:8px 12px;font-weight:900;cursor:pointer;text-align:left}.msg-color-swatch,.msg-colour-preview-swatch{width:26px;height:26px;border-radius:999px;border:1px solid #d0d5dd;box-shadow:inset 0 0 0 1px rgba(255,255,255,.65);flex:0 0 auto}.msg-color-label{color:#111827}.msg-hidden-color-input{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important}.msg-typography-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.msg-send-result{margin-top:16px;border:1px solid #d9e0ea;border-radius:16px;background:#fff;padding:16px;display:none}.msg-send-result.active{display:block}.msg-send-result.ok{border-color:#abefc6;background:#f6fef9}.msg-send-result.bad{border-color:#fecdd6;background:#fffafb}.msg-send-result.warning{border-color:#fedf89;background:#fffcf5}.msg-send-result h3{margin:0 0 6px}.msg-send-result small{color:#667085}.msg-send-preview-frame{margin-top:12px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px;max-height:520px;overflow:auto}.msg-hidden-presets details{border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fbfdff;padding:0}.msg-hidden-presets summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-weight:950}.msg-hidden-presets summary:after{content:'+';width:28px;height:28px;border-radius:8px;background:#fff;border:1px solid #d0d5dd;display:grid;place-items:center}.msg-hidden-presets details[open] summary:after{content:'−'}.msg-hidden-preset-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid #e5e7eb;padding:10px 14px}.msg-analytics-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:12px 0;flex-wrap:wrap}.msg-analytics-toolbar label{display:flex;align-items:center;gap:8px;margin:0!important;font-weight:900}.msg-color-modal{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;z-index:999999}.msg-color-modal.active{display:flex}.msg-color-modal-card{width:min(460px,calc(100vw - 28px));background:#fff;border-radius:18px;padding:20px;border:1px solid #e5e7eb;box-shadow:0 24px 80px rgba(15,23,42,.22);position:relative}.msg-color-close{position:absolute;right:12px;top:10px;width:34px;height:34px;border-radius:999px;border:0;background:#f2f4f7;font-size:22px;cursor:pointer}.msg-color-modal-card input{width:100%;margin:8px 0}.msg-colour-preview-row{display:flex;gap:10px;align-items:center;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;background:#fbfdff;margin:12px 0}.msg-color-swatches{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.msg-color-swatches button{width:38px;height:38px;border-radius:999px;border:1px solid #d0d5dd;cursor:pointer} .msg-page-handle-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.msg-page-status-chip{min-height:44px;border:1px solid #d0d5dd;background:#fff;border-radius:10px;padding:8px 10px;display:inline-flex;align-items:center;gap:7px;font-weight:950;cursor:pointer;white-space:nowrap}.msg-page-status-chip[data-status=ready]{border-color:#abefc6;background:#ecfdf3;color:#027a48}.msg-page-status-chip[data-status=missing]{border-color:#fecdd6;background:#fff1f3;color:#b42318}.msg-page-status-chip[data-status=warning]{border-color:#fedf89;background:#fffbeb;color:#92400e}.msg-page-status-card.compact{margin-top:8px;grid-template-columns:1fr!important}.msg-page-status-card[data-status=ready]{border-color:#abefc6;background:#f6fef9}.msg-page-status-card[data-status=missing]{border-color:#fecdd6;background:#fff7f7}@media(max-width:720px){.msg-page-handle-control{grid-template-columns:1fr}.msg-page-status-chip{justify-content:center}} @media(max-width:720px){.msg-module-link-grid{grid-template-columns:1fr}.msg-analytics-row,.msg-analytics-row.recipient{grid-template-columns:1fr!important}}


      @media(max-width:1100px){.msg-header{flex-direction:column}.msg-flow-card{min-width:0}.msg-grid{grid-template-columns:1fr}.msg-preview-head{flex-direction:column;align-items:stretch}}@media(max-width:650px){.msg-two,.msg-analytics{grid-template-columns:1fr}.flow-product-search{grid-template-columns:1fr}.flow-product-row{grid-template-columns:auto 44px 1fr}.flow-product-row button{grid-column:1/-1}.msg-tabs{overflow:auto;flex-wrap:nowrap}.msg-tab{white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function markup() {
    return `
      <div class="msg-shell">
        <div class="msg-header">
          <div>
            <h2>Review request setup</h2>
            <p>Create the customer email, test the review page, connect delivery, and monitor tracking from five simple tabs.</p>
          </div>
          <div class="msg-flow-card"><span>Recommended flow</span><strong>Order fulfilled → Wait <b id="msg-delay-preview">14</b> days → Send email</strong></div>
        </div>
        <div class="msg-tabs" role="tablist">
          <button type="button" class="msg-tab active" data-msg-tab="builder">Email Builder</button>
          <button type="button" class="msg-tab" data-msg-tab="tester">Review Page Tester</button>
          <button type="button" class="msg-tab" data-msg-tab="delivery">Email Delivery</button>
          <button type="button" class="msg-tab" data-msg-tab="analytics">Analytics</button>
          <button type="button" class="msg-tab" data-msg-tab="modules">Modules</button>
          <button type="button" class="msg-tab" data-msg-tab="settings">Settings</button>
        </div>

        <section id="msg-pane-builder" class="msg-pane active">
          <div class="msg-grid msg-builder-grid">
            <div class="msg-stack">
              <div class="msg-card"><h3>Brand</h3><p>Keep this simple for Shopify Flow.</p><label>Brand logo URL</label><input id="msg-logo" type="url" placeholder="https://cdn.shopify.com/.../logo.png"><div class="msg-two"><div><label>Button colour</label><input id="msg-color" class="msg-hidden-color-input" type="text" value="#111827"><button type="button" class="msg-color-picker" data-color-picker-for="msg-color"><span class="msg-color-swatch"></span><span class="msg-color-label">Colour selected</span></button></div><div><label>Button radius</label><input id="msg-button-radius" type="number" min="0" max="40" value="8"></div></div><div class="msg-two"><div><label>Email background</label><input id="msg-bg-color" class="msg-hidden-color-input" type="text" value="#f3f4f6"><button type="button" class="msg-color-picker" data-color-picker-for="msg-bg-color"><span class="msg-color-swatch"></span><span class="msg-color-label">Colour selected</span></button></div><div><label>Email card</label><input id="msg-card-color" class="msg-hidden-color-input" type="text" value="#ffffff"><button type="button" class="msg-color-picker" data-color-picker-for="msg-card-color"><span class="msg-color-swatch"></span><span class="msg-color-label">Colour selected</span></button></div></div></div>
              <div class="msg-card"><h3>Email copy</h3><label>Subject line</label><input id="msg-subject" type="text" value="How was your recent order?"><label>Heading</label><input id="msg-heading" type="text" value="How did we do?"><div class="msg-typography-grid"><div><label>Title alignment</label><select id="msg-heading-align"><option value="left">Left</option><option value="center" selected>Centre</option><option value="right">Right</option></select></div><div><label>Title weight</label><select id="msg-heading-weight"><option value="300">Slim</option><option value="400">Regular</option><option value="600">Semi bold</option><option value="700" selected>Bold</option><option value="800">Extra bold</option></select></div><div><label>Font family</label><select id="msg-heading-font"><option value="Arial,Helvetica,sans-serif">Arial</option><option value="Verdana,Geneva,sans-serif">Verdana</option><option value="Georgia,serif">Georgia</option><option value="Trebuchet MS,Arial,sans-serif">Trebuchet</option><option value="Inter,Arial,sans-serif">Inter-style</option></select></div></div><label>Intro line</label><input id="msg-intro" type="text" value='Hi {{ order.customer.firstName | default: "there" }}'><label>Body</label><textarea id="msg-body">We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?</textarea><label>Sign-off</label><input id="msg-signoff" type="text" value="Your feedback helps other customers make confident choices."></div><div class="msg-card"><h3>Review email templates</h3><p>Save this email design as a reusable template. Mark one template as Primary Reviews so live native review emails use it.</p><label>Template name</label><input id="msg-email-template-name" type="text" value="Reviews primary request"><div class="msg-actions"><button type="button" id="msg-save-email-template" class="msg-btn secondary">Save template</button><button type="button" id="msg-save-primary-template" class="msg-btn">Save & make primary</button></div><div id="msg-email-template-list" class="msg-template-list" style="margin-top:12px;"><div class="msg-help">Loading saved email templates...</div></div></div><div class="msg-card"><h3>Email sections</h3><p>Add simple extra blocks before or after the products without editing code.</p><div class="msg-builder-section-controls"><div class="msg-input-action"><select id="msg-section-template"></select><button type="button" id="msg-add-section" class="msg-btn secondary">Add section</button></div><div id="msg-section-list" class="msg-section-list-wide"></div></div></div>
              <div class="msg-card msg-link-compact"><h3>Review link defaults</h3><div class="msg-two"><div><label>Link mode</label><select id="msg-link-mode"><option value="both">Order and products</option><option value="order">Order only</option><option value="products">Product buttons only</option></select></div><div><label>Review page handle</label><div class="msg-page-handle-control"><input id="msg-page-handle" type="text" value="leave-review"><button type="button" id="msg-refresh-page-status" class="msg-page-status-chip" title="Check page"><span class="msg-page-status-dot">?</span><span class="msg-page-status-copy">Not checked</span></button></div></div></div><div id="msg-review-page-status" class="msg-page-status-card compact"><div><strong>Review page not checked yet</strong><p>We will verify /pages/leave-review exists before live emails use it.</p></div></div><div class="msg-two"><div><label>Main button text</label><input id="msg-main-button-text" type="text" value="Review Your Order"></div><div><label>Product button text</label><input id="msg-product-button-text" type="text" value="Review This Item"></div></div><div class="msg-two"><div><label>Wait after fulfilment</label><select id="msg-delay-days"><option value="7">7 days</option><option value="10">10 days</option><option value="14" selected>14 days</option><option value="21">21 days</option><option value="30">30 days</option></select></div><div><label>Flow action</label><input value="Send email" readonly></div></div><div class="msg-help">Advanced conditional wording now lives in the Settings tab.</div></div>
            <div class="msg-stack">
              <div class="msg-card msg-preview-card"><div class="msg-preview-head"><div><h3>Customer email preview</h3><p>Compact live preview. Open it large when checking the final layout.</p></div><div class="msg-preview-tools"><button type="button" id="msg-preview-popout" class="msg-btn secondary msg-preview-popout">Full preview</button><div class="msg-toggle"><button type="button" id="msg-preview-desktop" class="active" data-preview="desktop">Desktop</button><button type="button" id="msg-preview-mobile" data-preview="mobile">Mobile</button></div></div></div><div class="msg-preview-stage"><div id="msg-preview-wrap" class="msg-preview-wrap"><div id="msg-email-preview"></div></div></div></div>

            </div>
          </div>
        </section>

        <section id="msg-pane-tester" class="msg-pane">
          <div class="msg-grid msg-tester-grid">
            <div class="msg-card"><h3>Review page tester</h3><p>Open your review page with safe preview data. This does not create a Shopify order.</p><label>Customer name</label><input id="msg-test-name" type="text" value="Alex"><label>Customer email</label><input id="msg-test-email" type="email" value="alex@example.com"><div class="msg-two"><div><label>Order number</label><input id="msg-test-order" type="text" value="1001"></div><div><label>Review mode</label><select id="msg-test-type"><option value="order">Review full order</option><option value="product">Review one product</option></select></div></div><label>How many sample products?</label><input id="msg-test-count" type="number" min="1" max="10" value="2"><div class="msg-actions"><button type="button" id="msg-pick-products" class="msg-btn secondary">Search Products</button><button type="button" id="msg-sample-products" class="msg-btn secondary">Use Sample Products</button></div><div id="msg-products" class="msg-products"></div><div class="msg-actions msg-test-actions"><button type="button" id="msg-open-test" class="msg-btn">Open Test Review Page</button><button type="button" id="msg-copy-test-url" class="msg-btn secondary">Copy Test URL</button><button type="button" id="msg-save-template" class="msg-template-add" title="Save this as a template">+</button></div></div>
            <div class="msg-stack">
              <div class="msg-card"><h3>Saved test templates</h3><p>Save repeatable review-page scenarios so you do not rebuild them each time.</p><div id="msg-template-list" class="msg-template-list"></div></div>
              <div class="msg-card msg-product-search-explainer"><h3>Product search connection</h3><p>Search pulls real Shopify products using this shop's OAuth install. Use it to test exactly what customers receive.</p><ul class="msg-check-list"><li>Search by title, handle, SKU, or product ID.</li><li>Selected products are added into the preview email and review-page URL.</li><li>No global Render token is used; each merchant uses their own install.</li></ul><div id="msg-shopify-status" class="msg-help">Checking Shopify product connection...</div></div>
            </div>
          </div>
        </section>

        <section id="msg-pane-delivery" class="msg-pane">
          <div class="msg-grid msg-delivery-grid">
            <div class="msg-card"><h3>Add email provider</h3><p>Save more than one sender and assign a primary provider for reviews, loyalty, cart rewards, or general messages.</p><div id="msg-provider-status-card" class="msg-provider-status"><span class="icon">!</span><div><strong>Email provider not checked yet</strong><span>Loading current connection status...</span></div></div><div class="msg-two"><div><label>Provider name</label><input id="msg-provider-profile-name" type="text" placeholder="e.g. Reviews Gmail"></div><div><label>Primary for</label><select id="msg-provider-primary-for"><option value="reviews">Reviews</option><option value="loyalty">Loyalty</option><option value="cartRewards">Cart Rewards</option><option value="general">General</option></select></div></div><div class="msg-two"><div><label>Provider</label><select id="msg-smtp-provider"><option value="smtp">SMTP / app password</option><option value="gmail">Gmail app password</option><option value="outlook">Outlook SMTP</option></select></div><div><label>Enabled</label><select id="msg-smtp-enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></div></div><label>SMTP host</label><input id="msg-smtp-host" type="text" placeholder="smtp.gmail.com"><div class="msg-two"><div><label>Port</label><input id="msg-smtp-port" type="number" value="587"></div><div><label>Security</label><select id="msg-smtp-secure"><option value="starttls">STARTTLS</option><option value="ssl">SSL / 465</option><option value="none">None</option></select></div></div><label>SMTP username</label><input id="msg-smtp-user" type="text" autocomplete="username"><label>SMTP password / app password <span class="muted">leave blank to keep saved on existing provider</span></label><input id="msg-smtp-pass" type="password" autocomplete="new-password"><div class="msg-two"><div><label>From name</label><input id="msg-smtp-from-name" type="text" value="Nectar Reviews"></div><div><label>From email</label><input id="msg-smtp-from-email" type="email"></div></div><label>Reply-to email</label><input id="msg-smtp-reply-to" type="email"><div id="msg-smtp-state" class="msg-state">Loading email settings...</div><div class="msg-actions"><button type="button" id="msg-smtp-save" class="msg-btn">Save Active Provider</button><button type="button" id="msg-provider-profile-save" class="msg-btn secondary">Add / Update Provider</button><button type="button" id="msg-smtp-remove" class="msg-btn secondary">Remove Active</button></div></div>
            <div class="msg-stack"><div class="msg-card"><h3>Saved providers</h3><p>Choose which sender is primary for each product area. The active provider is used for test sends.</p><div id="msg-provider-profile-list" class="msg-provider-list"><div class="msg-help">Loading providers...</div></div></div><div class="msg-card"><h3>Send test email</h3><p>This sends the same customer-friendly test email shown in the live preview, with tracking added automatically.</p><label>Send test to</label><div class="msg-input-action"><input id="msg-test-recipient" type="email" placeholder="you@example.com"><button type="button" id="msg-send-test-email" class="msg-btn">Send Test Email</button></div><div class="msg-actions" style="margin-top:10px;"><button type="button" id="msg-send-fake-order-email" class="msg-btn secondary">Send full fake-order email</button></div><div id="msg-test-email-help" class="msg-help">When the provider status is green, this will send the exact customer preview with tracking added.</div></div></div>
          </div>
          <div id="msg-last-send-result" class="msg-send-result" aria-live="polite"></div>
        </section>

        <section id="msg-pane-analytics" class="msg-pane">
          <div class="msg-card"><h3>Campaign analytics</h3><p>Unique open/click tracking by campaign, including test emails.</p><div id="msg-analytics" class="msg-analytics"><div><span>Sent</span><strong>0</strong></div><div><span>Open rate</span><strong>0%</strong></div><div><span>Click rate</span><strong>0%</strong></div></div><div class="msg-analytics-toolbar"><label><input id="msg-analytics-include-tests" type="checkbox"> Include test/fake emails</label><button type="button" id="msg-analytics-refresh" class="msg-btn secondary">Refresh analytics</button></div><div id="msg-analytics-breakdown" class="msg-link-rule-list" style="margin-top:16px;"></div><div class="msg-analytics-tabs"><button class="msg-analytics-tab active" data-analytics-list="recipients" type="button">Recipients</button><button class="msg-analytics-tab" data-analytics-list="sent" type="button">Sent</button><button class="msg-analytics-tab" data-analytics-list="opened" type="button">Opened</button><button class="msg-analytics-tab" data-analytics-list="clicked" type="button">Clicked</button><button class="msg-analytics-tab" data-analytics-list="reviewed" type="button">Reviewed</button></div><div id="msg-analytics-list" class="msg-analytics-list"></div><p class="msg-analytics-note">Open rates are based on unique recipient tokens. Re-opening the same email does not increase the rate.</p></div>
        </section>
        <section id="msg-pane-modules" class="msg-pane">
          <div class="msg-modules-stack">
            <div class="msg-card"><h3>Create email module</h3><p>Build reusable content blocks that appear as options in the Email Builder. Use your own names, copy, border, radius, button and layout settings.</p><div class="msg-module-form-grid"><div><label>Module name</label><input id="msg-module-name" type="text" placeholder="e.g. Delivery notice"></div><div><label>Internal type</label><select id="msg-module-position"><option value="before">Before products</option><option value="after">After products</option></select></div></div><label>Title</label><input id="msg-module-title" type="text" placeholder="A quick note"><label>Description</label><textarea id="msg-module-text" placeholder="Write the message customers should see."></textarea><div class="msg-module-form-grid"><div><label>Button text</label><input id="msg-module-button-text" type="text" placeholder="Optional"></div><div><label>Button URL or page</label><div class="msg-module-link-grid"><select id="msg-module-link-type"><option value="external">External URL</option><option value="internal">Internal Shopify page/path</option><option value="support_modal">Review page support modal</option></select><input id="msg-module-button-url" type="text" placeholder="/pages/contact or https://..."></div><span class="msg-field-hint">Internal links can be /pages/rewards, /collections/all, /account, etc.</span></div></div><div class="msg-module-style-grid"><label>Background<input id="msg-module-bg" class="msg-hidden-color-input" type="text" value="none"><button type="button" class="msg-color-picker" data-color-picker-for="msg-module-bg"><span class="msg-color-swatch"></span><span class="msg-color-label">None / transparent</span></button></label><label>Border<input id="msg-module-border" class="msg-hidden-color-input" type="text" value="#e5e7eb"><button type="button" class="msg-color-picker" data-color-picker-for="msg-module-border"><span class="msg-color-swatch"></span><span class="msg-color-label">Colour selected</span></button></label><label>Thickness<input id="msg-module-border-width" type="number" min="0" max="8" value="1"></label><label>Radius<input id="msg-module-radius" type="number" min="0" max="32" value="14"></label><label>Padding<input id="msg-module-padding" type="number" min="8" max="36" value="16"></label></div><div class="msg-actions"><button type="button" id="msg-save-module" class="msg-btn">Save Module</button><button type="button" id="msg-clear-module" class="msg-btn secondary">Clear</button></div></div>
            <div class="msg-card"><h3>Module library</h3><p>Saved modules appear in the Email Builder dropdown and can be inserted without squeezing more controls into the widget area.</p><div id="msg-module-library" class="msg-module-library"></div></div>
          </div>
        </section>
        <section id="msg-pane-settings" class="msg-pane">
          <div class="msg-grid msg-settings-grid">
            <div class="msg-stack">
              <div class="msg-card"><h3>Review button wording rules</h3><p>These only change button text. Delivery timing is controlled by the native scheduler so customers are not asked to review before delivery.</p><div class="msg-help"><strong>Recommended live rule:</strong> Settings → Reviews Launch Checklist should show <b>Delivery tag gate: delivered</b>. Nectar then waits until Shopify order tag <code>delivered</code> exists before starting the 14-day timer.</div><div class="msg-link-rule-row"><div><label>Check</label><select id="msg-link-rule-type"><option value="tag">Product tag</option><option value="metafield">Product metafield</option><option value="order">Order number / name</option><option value="order_value">Order value</option><option value="order_tag">Order tag</option></select></div><div><label>Value</label><input id="msg-link-rule-condition" type="text" placeholder="e.g. Snowboard, #1001, VIP"></div><div><label>Use button text</label><input id="msg-link-rule-text" type="text" placeholder="Review this board"></div><button type="button" id="msg-add-link-rule" class="msg-btn secondary">Add wording rule</button></div><div id="msg-link-rule-list" class="msg-link-rule-list"></div></div>
              <div class="msg-card"><h3>Shopify Flow guidance</h3><p>Paste the HTML on the right into a Shopify Flow “Send email” action with HTML enabled.</p><div class="msg-help">Recommended flow: Order fulfilled → Wait <span id="msg-delay-preview-settings">14</span> days → Send email.</div></div>
            </div>
            <div class="msg-card msg-code-card" style="padding:0;"><details class="msg-collapsible-code"><summary><div>Copy Shopify Flow HTML<br><span>Open only when you need to paste code into Shopify Flow.</span></div><button type="button" id="msg-copy-code-btn" class="msg-btn">Copy Code</button></summary><textarea id="msg-code-output" class="msg-code" spellcheck="false" readonly></textarea></details></div>
          </div>
        </section>
      </div>
      <div id="msg-preview-modal" class="msg-modal-backdrop msg-preview-modal" role="dialog" aria-modal="true" aria-hidden="true"><div class="msg-modal"><div class="msg-modal-head"><div><h3>Full email preview</h3><p>Use this larger view to check the saved template before sending.</p></div><button type="button" id="msg-preview-modal-close" class="msg-modal-close" aria-label="Close">×</button></div><div class="msg-modal-body"><div id="msg-preview-modal-frame" class="msg-preview-modal-frame"></div></div></div></div>
      <div id="msg-template-modal" class="msg-modal-backdrop" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="msg-modal">
          <div class="msg-modal-head"><div><h3>Save test template</h3><p>Name this reusable review-page scenario.</p></div><button type="button" id="msg-template-modal-close" class="msg-modal-close" aria-label="Close">×</button></div>
          <div class="msg-modal-body"><label>Template name</label><input id="msg-template-name-input" type="text"></div>
          <div class="msg-modal-actions"><button type="button" id="msg-template-cancel" class="msg-btn secondary">Cancel</button><button type="button" id="msg-template-confirm" class="msg-btn">Save template</button></div>
        </div>
      </div>`;
  }




  const emailSections = [];
  function allSectionModules() {
    const presets = [
      ...BUILT_IN_MODULES,
      { id: 'review_reassurance', name: 'Review reassurance', title: 'A note on moderation', text: 'Your review will be checked by our team before it appears publicly, so you can share honest feedback with confidence.', bgColor:'#f8fafc', borderColor:'#e5e7eb', borderWidth:1, radius:14, padding:15, position:'before' },
      { id: 'loyalty_points', name: 'Loyalty points reminder', title: 'Earn loyalty points', text: 'Leave a verified review and you may earn loyalty points once your review has been approved.', bgColor:'#f8fafc', borderColor:'#e5e7eb', borderWidth:1, radius:14, padding:15, position:'before' },
      { id: 'cart_rewards', name: 'Cart rewards nudge', title: 'Unlock cart rewards', text: 'Remember to check your cart before checkout — you may unlock milestone rewards as you shop.', bgColor:'#fff7ed', borderColor:'#fed7aa', borderWidth:1, radius:14, padding:15, position:'before' },
      { id: 'support_first', name: 'Support before review', title: 'Need help first?', text: 'Something not right? Tell us what happened before reviewing and our team will help put it right.', bgColor:'#f8fafc', borderColor:'#e5e7eb', borderWidth:1, radius:14, padding:15, position:'after', buttonText:'Contact customer service', buttonUrl:'{{support_link}}' },
    ].filter((module) => !hiddenModuleIds.includes(module.id));
    return presets.concat(messageModules.map((m) => ({ ...m, id: `custom:${m.id}` })));
  }
  function findSectionModule(type){ return allSectionModules().find((m)=>m.id === type || m.id === String(type).replace(/^custom:/,'custom:')); }
  function sectionLabel(type){ return findSectionModule(type)?.name || findSectionModule(type)?.title || 'Custom section'; }
  function sectionDefaults(type){ return findSectionModule(type)?.text || 'Add your custom message here.'; }
  function sectionColorControl(index, field, value) {
    const safe = String(value || '').trim() || 'none';
    const swatch = isTransparentColor(safe) ? 'linear-gradient(45deg,#fff 0,#fff 46%,#d92d20 48%,#d92d20 52%,#fff 54%,#fff 100%)' : safe;
    return `<input class="msg-hidden-color-input" data-section-index="${index}" data-section-field="${field}" value="${escapeHtml(safe)}"><button type="button" class="msg-color-picker" data-section-color-button="${index}:${field}"><span class="msg-color-swatch" style="background:${escapeHtml(swatch)}"></span><span class="msg-color-label">${escapeHtml(colourLabel(safe))}</span></button>`;
  }
  function updateSectionColorButton(input) {
    const key = `${input.dataset.sectionIndex}:${input.dataset.sectionField}`;
    const button = document.querySelector(`[data-section-color-button="${key}"]`);
    if (!button) return;
    const value = String(input.value || '').trim();
    const swatch = button.querySelector('.msg-color-swatch');
    const label = button.querySelector('.msg-color-label');
    if (swatch) swatch.style.background = isTransparentColor(value) ? 'linear-gradient(45deg,#fff 0,#fff 46%,#d92d20 48%,#d92d20 52%,#fff 54%,#fff 100%)' : value;
    if (label) label.textContent = colourLabel(value);
  }
  function renderEmailSections(){
    const box = el('msg-section-list'); if(!box) return;
    if(!emailSections.length){ box.innerHTML = '<div class="msg-help">No extra sections yet. The email remains simple by default.</div>'; return; }
    box.innerHTML = emailSections.map((item,i)=>`
      <div class="msg-section-row" draggable="true" data-section-index="${i}">
        <button type="button" class="msg-drag-handle" title="Drag to reorder">☰</button>
        <div class="msg-section-editor">
          <div class="msg-two">
            <input data-section-index="${i}" data-section-field="title" value="${escapeHtml(item.title || sectionLabel(item.type))}" placeholder="Section title">
            <select data-section-index="${i}" data-section-field="position"><option value="before" ${(item.position || 'before') === 'before' ? 'selected' : ''}>Before products</option><option value="after" ${item.position === 'after' ? 'selected' : ''}>After products</option></select>
          </div>
          <textarea data-section-index="${i}" data-section-field="text" placeholder="Section text">${escapeHtml(item.text || '')}</textarea>
          <div class="msg-section-style-grid">
            <label>Background${sectionColorControl(i, 'bgColor', item.bgColor || 'none')}</label>
            <label>Border${sectionColorControl(i, 'borderColor', item.borderColor || '#e5e7eb')}</label>
            <label>Radius<input data-section-index="${i}" data-section-field="radius" type="number" min="0" max="28" value="${Number(item.radius ?? 12)}"></label>
            <label>Padding<input data-section-index="${i}" data-section-field="padding" type="number" min="8" max="32" value="${Number(item.padding ?? 14)}"></label>
            <label>Border px<input data-section-index="${i}" data-section-field="borderWidth" type="number" min="0" max="8" value="${Number(item.borderWidth ?? 1)}"></label>
          </div>
          <div class="msg-section-title-row"><input data-section-index="${i}" data-section-field="buttonText" placeholder="Optional button text" value="${escapeHtml(item.buttonText || '')}"><input data-section-index="${i}" data-section-field="buttonUrl" placeholder="Optional button URL" value="${escapeHtml(item.buttonUrl || '')}"></div>
        </div>
        <div class="msg-section-actions"><button type="button" class="msg-icon-btn danger" data-remove-section="${i}" title="Remove">×</button></div>
      </div>`).join('');
    box.querySelectorAll('[data-section-color-button]').forEach((button)=>button.addEventListener('click',()=>{
      const [i, field] = String(button.dataset.sectionColorButton || '').split(':');
      const input = box.querySelector(`[data-section-index="${i}"][data-section-field="${field}"]`);
      if (input) openColorChoice(input);
    }));
    box.querySelectorAll('[data-section-field]').forEach((input)=>input.addEventListener('input',()=>{
      const i=Number(input.dataset.sectionIndex); if(!emailSections[i]) return;
      const field=input.dataset.sectionField; emailSections[i][field] = input.type === 'number' ? Number(input.value || 0) : input.value;
      if (field === 'bgColor' || field === 'borderColor') updateSectionColorButton(input);
      updatePreview();
    }));
    box.querySelectorAll('[data-remove-section]').forEach((btn)=>btn.addEventListener('click',()=>{ emailSections.splice(Number(btn.dataset.removeSection),1); renderEmailSections(); updatePreview(); }));
    box.querySelectorAll('.msg-section-row').forEach((row)=>{
      row.addEventListener('dragstart',(event)=>{ row.classList.add('dragging'); event.dataTransfer.setData('text/plain', row.dataset.sectionIndex); });
      row.addEventListener('dragend',()=>row.classList.remove('dragging'));
      row.addEventListener('dragover',(event)=>event.preventDefault());
      row.addEventListener('drop',(event)=>{ event.preventDefault(); const from=Number(event.dataTransfer.getData('text/plain')); const to=Number(row.dataset.sectionIndex); if(Number.isNaN(from)||Number.isNaN(to)||from===to) return; const item=emailSections.splice(from,1)[0]; emailSections.splice(to,0,item); renderEmailSections(); updatePreview(); });
    });
  }
  function sectionFromModule(type) {
    const module = findSectionModule(type) || BUILT_IN_MODULES[0];
    return {
      type,
      title: module.title || module.name || sectionLabel(type),
      text: module.text || sectionDefaults(type),
      position: module.position || (type === 'support_first' ? 'after' : 'before'),
      bgColor: cssOrNone(module.bgColor, 'transparent'),
      borderColor: borderColorOrNone(module.borderColor || '#e5e7eb'),
      borderWidth: Number(module.borderWidth ?? 1),
      radius: Number(module.radius ?? 12),
      padding: Number(module.padding ?? 14),
      buttonText: module.buttonText || '',
      buttonUrl: module.buttonUrl || '',
    };
  }
  function addEmailSection(){ const type = val('msg-section-template','notice'); emailSections.push(sectionFromModule(type)); renderEmailSections(); updatePreview(); }
  function addModuleSection(type){ emailSections.push(sectionFromModule(type)); renderEmailSections(); updatePreview(); switchPane('builder'); showToast('Message module added'); }
  function resolveModuleButtonUrl(url, context = {}) {
    const normalised = normaliseButtonUrl(url);
    if (normalised === '{{support_link}}') return context.supportLink || normalised;
    if (normalised === '{{review_link}}') return context.reviewLink || normalised;
    return normalised;
  }

  function withSupportParam(url) {
    if (!url) return url;
    return `${url}${String(url).includes('?') ? '&' : '?'}support=1`;
  }

  function renderEmailSectionRows(position, context = {}){
    const rows = emailSections.filter((section)=> (section.position || 'before') === position);
    if(!rows.length) return '';
    return rows.map((section)=>{
      const bg = cssOrNone(section.bgColor, 'transparent'); const border = borderColorOrNone(section.borderColor || '#e5e7eb'); const radius = Number(section.radius ?? 12); const padding = Number(section.padding ?? 14); const borderWidth = border === 'transparent' ? 0 : Math.max(0, Number(section.borderWidth ?? 1));
      const href = section.buttonText && section.buttonUrl ? resolveModuleButtonUrl(section.buttonUrl, context) : '';
      const button = section.buttonText && href ? `<p style="margin:12px 0 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;padding:9px 12px;font-weight:bold;font-size:13px;">${escapeHtml(section.buttonText)}</a></p>` : '';
      return `<tr><td style="padding:10px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${escapeHtml(bg)};border:${borderWidth}px solid ${escapeHtml(border)};border-radius:${radius}px;"><tr><td style="padding:${padding}px;font-family:Arial,Helvetica,sans-serif;text-align:left;"><strong style="display:block;color:#111827;font-size:15px;margin-bottom:5px;">${escapeHtml(section.title || sectionLabel(section.type))}</strong><p style="margin:0;color:#4b5563;font-size:14px;line-height:1.55;">${escapeHtml(section.text || '')}</p>${button}</td></tr></table></td></tr>`;
    }).join('');
  }

  function storageKey(name) { return `nectar_${name}_${getShopDomain()}`; }

  function cacheMessageModules() {
    try { localStorage.setItem(storageKey('message_modules'), JSON.stringify(messageModules.slice(0, 80))); } catch (_) {}
    try { localStorage.setItem(storageKey('hidden_message_modules'), JSON.stringify(hiddenModuleIds.slice(0, 80))); } catch (_) {}
  }
  function loadCachedMessageModules() {
    try { messageModules = JSON.parse(localStorage.getItem(storageKey('message_modules')) || '[]'); } catch (_) { messageModules = []; }
    try { hiddenModuleIds = JSON.parse(localStorage.getItem(storageKey('hidden_message_modules')) || '[]'); } catch (_) { hiddenModuleIds = []; }
  }
  async function persistMessageModulesRemote(source = 'admin-messaging-campaigns') {
    const saved = await securedFetch('/admin/email-module-library', {
      method: 'PUT',
      body: JSON.stringify({ messageModules: messageModules.slice(0, 80), hiddenModuleIds: hiddenModuleIds.slice(0, 80), source }),
    });
    if (Array.isArray(saved.messageModules)) messageModules = saved.messageModules;
    if (Array.isArray(saved.hiddenModuleIds)) hiddenModuleIds = saved.hiddenModuleIds;
    cacheMessageModules();
    renderModuleLibrary();
    populateSectionTemplates();
    return saved;
  }
  async function loadMessageModules() {
    loadCachedMessageModules();
    renderModuleLibrary();
    populateSectionTemplates();
    try {
      const data = await securedFetch('/admin/email-module-library');
      if (Array.isArray(data.messageModules)) messageModules = data.messageModules;
      if (Array.isArray(data.hiddenModuleIds)) hiddenModuleIds = data.hiddenModuleIds;
      cacheMessageModules();
      renderModuleLibrary();
      populateSectionTemplates();
    } catch (error) {
      console.warn('Persistent email module library unavailable; using browser cache:', error);
    }
  }
  function saveMessageModules() {
    messageModules = messageModules.slice(0, 80);
    hiddenModuleIds = hiddenModuleIds.slice(0, 80);
    cacheMessageModules();
    renderModuleLibrary();
    populateSectionTemplates();
    persistMessageModulesRemote().catch((error) => {
      console.warn('Could not sync email module library:', error);
      showToast('Saved locally, but server sync failed. Reopen after connection is restored to retry.');
    });
  }
  function populateSectionTemplates() {
    const select = el('msg-section-template'); if (!select) return;
    const current = select.value;
    select.innerHTML = allSectionModules().map((module)=>`<option value="${escapeHtml(module.id)}">${escapeHtml(module.name || module.title || module.id)}</option>`).join('');
    if (current && Array.from(select.options).some((o)=>o.value === current)) select.value = current;
  }
  function moduleFormPayload() {
    const name = val('msg-module-name');
    const title = val('msg-module-title', name || 'Custom module');
    const text = val('msg-module-text');
    if (!name || !text) throw new Error('Add a module name and description first.');
    return {
      id: uid('module'),
      name,
      title,
      text,
      position: val('msg-module-position','before'),
      bgColor: cssOrNone(el('msg-module-bg')?.value, 'transparent'),
      borderColor: borderColorOrNone(el('msg-module-border')?.value || '#e5e7eb'),
      borderWidth: Math.max(0, Math.min(8, Number(val('msg-module-border-width','1')) || 0)),
      radius: Math.max(0, Math.min(32, Number(val('msg-module-radius','14')) || 0)),
      padding: Math.max(8, Math.min(36, Number(val('msg-module-padding','16')) || 16)),
      buttonText: val('msg-module-button-text'),
      buttonUrl: val('msg-module-link-type', 'external') === 'support_modal' ? '{{support_link}}' : normaliseButtonUrl(val('msg-module-button-url')),
      linkType: val('msg-module-link-type', 'external'),
      createdAt: new Date().toISOString(),
    };
  }
  function clearModuleForm() { ['msg-module-name','msg-module-title','msg-module-text','msg-module-button-text','msg-module-button-url'].forEach((id)=>{ if(el(id)) el(id).value=''; }); if(el('msg-module-bg')) el('msg-module-bg').value='none'; if(el('msg-module-border')) el('msg-module-border').value='#e5e7eb'; if(el('msg-module-link-type')) el('msg-module-link-type').value='external'; if(el('msg-module-border-width')) el('msg-module-border-width').value='1'; if(el('msg-module-radius')) el('msg-module-radius').value='14'; if(el('msg-module-padding')) el('msg-module-padding').value='16'; refreshAllColorButtons(); }
  function saveMessageModule() { try { const payload = moduleFormPayload(); messageModules.unshift(payload); saveMessageModules(); clearModuleForm(); showToast('Email module saved'); } catch (error) { showToast(error.message || 'Could not save module'); } }
  function renderModuleLibrary() {
    const box = el('msg-module-library'); if (!box) return;
    const all = allSectionModules();
    const hiddenPresets = BUILT_IN_MODULES.concat([
      { id: 'review_reassurance', name: 'Review reassurance', title: 'A note on moderation' },
      { id: 'loyalty_points', name: 'Loyalty points reminder', title: 'Earn loyalty points' },
      { id: 'cart_rewards', name: 'Cart rewards nudge', title: 'Unlock cart rewards' },
      { id: 'support_first', name: 'Support before review', title: 'Need help first?' },
    ]).filter((module) => hiddenModuleIds.includes(module.id));
    const hiddenNote = hiddenPresets.length ? `<div class="msg-hidden-presets"><details><summary>${hiddenPresets.length} hidden preset module(s)</summary>${hiddenPresets.map((module)=>`<div class="msg-hidden-preset-row"><span><strong>${escapeHtml(module.name || module.title || module.id)}</strong><br><small>${escapeHtml(module.title || '')}</small></span><button type="button" class="msg-btn secondary" data-restore-one-module="${escapeHtml(module.id)}">Add back</button></div>`).join('')}<div class="msg-hidden-preset-row"><span>Restore every hidden preset</span><button type="button" class="msg-btn" data-restore-modules>Restore all</button></div></details></div>` : '';
    box.innerHTML = hiddenNote + all.map((module)=>`<div class="msg-module-card"><div class="msg-module-card-head"><div><strong>${escapeHtml(module.name || module.title)}</strong><div class="msg-template-meta"><span>${escapeHtml(module.position || 'before')} products</span><span>${Number(module.borderWidth ?? 1)}px border</span><span>${Number(module.radius ?? 0)}px radius</span></div></div><div class="msg-provider-badges">${String(module.id).startsWith('custom:') ? '<span class="msg-badge green">Custom</span>' : '<span class="msg-badge gray">Preset</span>'}</div></div><div class="msg-help" style="margin-top:8px;"><strong>${escapeHtml(module.title || module.name)}</strong><br>${escapeHtml(module.text || '')}${module.buttonText ? `<br><br>Button: ${escapeHtml(module.buttonText)}` : ''}</div><div class="msg-template-actions"><button type="button" class="msg-btn secondary" data-insert-module="${escapeHtml(module.id)}">Add to email</button>${String(module.id).startsWith('custom:') ? `<button type="button" class="msg-btn secondary danger" data-delete-module="${escapeHtml(module.id.replace(/^custom:/,''))}">Remove</button>` : `<button type="button" class="msg-btn secondary danger" data-hide-module="${escapeHtml(module.id)}">Hide preset</button>`}</div></div>`).join('');
    box.querySelectorAll('[data-insert-module]').forEach((btn)=>btn.addEventListener('click',()=>addModuleSection(btn.dataset.insertModule)));
    box.querySelectorAll('[data-delete-module]').forEach((btn)=>btn.addEventListener('click',()=>{ messageModules = messageModules.filter((m)=>m.id !== btn.dataset.deleteModule); saveMessageModules(); }));
    box.querySelectorAll('[data-hide-module]').forEach((btn)=>btn.addEventListener('click',()=>{ if (!hiddenModuleIds.includes(btn.dataset.hideModule)) hiddenModuleIds.push(btn.dataset.hideModule); saveMessageModules(); }));
    box.querySelectorAll('[data-restore-one-module]').forEach((btn)=>btn.addEventListener('click',()=>{ hiddenModuleIds = hiddenModuleIds.filter((id)=>id !== btn.dataset.restoreOneModule); saveMessageModules(); }));
    box.querySelector('[data-restore-modules]')?.addEventListener('click',()=>{ hiddenModuleIds = []; saveMessageModules(); });
  }

  function loadTemplates() { try { reviewTemplates = JSON.parse(localStorage.getItem(storageKey('review_templates')) || '[]'); } catch (_) { reviewTemplates = []; } renderTemplates(); }
  function saveTemplates() { localStorage.setItem(storageKey('review_templates'), JSON.stringify(reviewTemplates.slice(0, 20))); renderTemplates(); }

  function currentEmailTemplatePayload({ primary = false } = {}) {
    const o = opts();
    return {
      name: val('msg-email-template-name', o.heading || 'Reviews email template'),
      area: 'reviews',
      kind: 'review_request',
      enabled: true,
      isPrimary: Boolean(primary),
      subject: o.subject || 'How was your recent order?',
      design: o,
      sections: emailSections.slice(),
      html: buildFlowEmailHtml(o),
      notes: 'Saved from Messaging & Campaigns email builder.',
    };
  }

  function renderEmailTemplates() {
    const box = el('msg-email-template-list');
    if (!box) return;
    if (!emailTemplates.length) {
      box.innerHTML = '<div class="msg-help">No saved email templates yet. Save this design, then mark one as Primary Reviews.</div>';
      return;
    }
    box.innerHTML = emailTemplates.map((t) => `<div class="msg-template-card"><div class="msg-template-top"><div><strong>${escapeHtml(t.name || 'Template')}</strong><div class="msg-template-meta"><span>${t.isPrimary ? '✅ Primary Reviews' : 'Saved'}</span><span>${escapeHtml(t.subject || '')}</span><span>${escapeHtml(t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '')}</span></div></div><button type="button" class="msg-template-remove" data-delete-email-template="${escapeHtml(t._id)}" title="Delete template">×</button></div><div class="msg-template-actions"><button type="button" class="msg-btn secondary" data-load-email-template="${escapeHtml(t._id)}">Load</button>${t.isPrimary ? '' : `<button type="button" class="msg-btn" data-primary-email-template="${escapeHtml(t._id)}">Make primary</button>`}</div></div>`).join('');
    box.querySelectorAll('[data-load-email-template]').forEach((btn)=>btn.addEventListener('click',()=>loadEmailTemplate(btn.dataset.loadEmailTemplate)));
    box.querySelectorAll('[data-primary-email-template]').forEach((btn)=>btn.addEventListener('click',()=>setPrimaryEmailTemplate(btn.dataset.primaryEmailTemplate)));
    box.querySelectorAll('[data-delete-email-template]').forEach((btn)=>btn.addEventListener('click',()=>deleteEmailTemplate(btn.dataset.deleteEmailTemplate)));
  }

  async function loadEmailTemplates() {
    try {
      const result = await securedFetch('/admin/email-templates?area=reviews&kind=review_request');
      emailTemplates = result.templates || [];
      renderEmailTemplates();
    } catch (error) {
      const box = el('msg-email-template-list');
      if (box) box.innerHTML = `<div class="msg-help">Could not load saved templates: ${escapeHtml(error.message || '')}</div>`;
    }
  }

  async function saveCurrentEmailTemplate(primary = false) {
    const payload = currentEmailTemplatePayload({ primary });
    const result = await securedFetch('/admin/email-templates', { method: 'POST', body: JSON.stringify(payload) });
    if (result.template?._id) {
      showToast(primary ? 'Template saved and set as Primary Reviews' : 'Template saved');
      await loadEmailTemplates();
    }
    return result.template;
  }

  async function setPrimaryEmailTemplate(id) {
    await securedFetch(`/admin/email-templates/${encodeURIComponent(id)}/primary`, { method: 'POST', body: JSON.stringify({}) });
    showToast('Primary Reviews template updated');
    await loadEmailTemplates();
  }

  async function deleteEmailTemplate(id) {
    if (!confirm('Delete this saved email template?')) return;
    await securedFetch(`/admin/email-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Template deleted');
    await loadEmailTemplates();
  }

  function loadEmailTemplate(id) {
    const t = emailTemplates.find((item)=>String(item._id) === String(id));
    if (!t) return;
    const d = t.design || {};
    if (el('msg-email-template-name')) el('msg-email-template-name').value = t.name || 'Reviews email template';
    if (el('msg-subject')) el('msg-subject').value = t.subject || d.subject || 'How was your recent order?';
    if (el('msg-logo')) el('msg-logo').value = d.logo || '';
    if (el('msg-color')) el('msg-color').value = d.accentColor || '#111827';
    if (el('msg-button-radius')) el('msg-button-radius').value = d.buttonRadius ?? 8;
    if (el('msg-bg-color')) el('msg-bg-color').value = d.bgColor || '#f3f4f6';
    if (el('msg-card-color')) el('msg-card-color').value = d.cardColor || '#ffffff';
    if (el('msg-heading')) el('msg-heading').value = d.heading || 'How did we do?';
    if (el('msg-heading-align')) el('msg-heading-align').value = d.headingAlign || 'center';
    if (el('msg-heading-weight')) el('msg-heading-weight').value = d.headingWeight || '700';
    if (el('msg-heading-font')) el('msg-heading-font').value = d.headingFont || 'Arial,Helvetica,sans-serif';
    if (el('msg-intro')) el('msg-intro').value = d.intro || 'Hi {{ order.customer.firstName | default: "there" }}';
    if (el('msg-body')) el('msg-body').value = d.body || '';
    if (el('msg-signoff')) el('msg-signoff').value = d.signoff || '';
    if (el('msg-link-mode')) el('msg-link-mode').value = d.linkMode || 'both';
    if (el('msg-page-handle')) el('msg-page-handle').value = d.pageHandle || DEFAULT_PAGE_HANDLE;
    if (el('msg-main-button-text')) el('msg-main-button-text').value = d.mainButtonText || 'Review Your Order';
    if (el('msg-product-button-text')) el('msg-product-button-text').value = d.productButtonText || 'Review This Item';
    if (el('msg-delay-days')) el('msg-delay-days').value = String(d.delayDays || 14);
    emailSections.splice(0, emailSections.length, ...((t.sections || []).map((section)=>({ ...section, id: section.id || uid('section') }))));
    renderEmailSections();
    updatePreview();
    showToast('Template loaded');
  }

  function renderLastSendResult({ ok = false, warning = false, title = '', detail = '', meta = [], html = '' } = {}) {
    const box = el('msg-last-send-result');
    if (!box) return;
    const tone = ok ? 'ok' : warning ? 'warning' : 'bad';
    box.className = `msg-send-result active ${tone}`;
    const rows = Array.isArray(meta) && meta.length ? `<p><small>${meta.map(escapeHtml).join(' · ')}</small></p>` : '';
    box.innerHTML = `<h3>${escapeHtml(title || (ok ? 'Email send succeeded' : 'Email send failed'))}</h3><p>${escapeHtml(detail || '')}</p>${rows}${html ? `<details open><summary><strong>Layout that was sent / attempted</strong></summary><div class="msg-send-preview-frame">${html}</div></details>` : ''}`;
  }

  async function sendFullFakeOrderEmail() {
    const email = val('msg-test-email') || val('msg-test-recipient');
    if (!email) return showToast('Enter a test customer email first.');
    updatePreview();
    const o = opts();
    const attemptedHtml = buildRenderedTestEmailHtml(o, `test-${Date.now()}`);
    try {
      await saveCurrentEmailTemplate(true);
      const result = await securedFetch('/admin/review-automation/fake-order', {
        method: 'POST',
        body: JSON.stringify({
          email,
          recipientEmail: email,
          customerName: val('msg-test-name', 'Alex'),
          orderId: val('msg-test-order', `NECTAR-TEST-${Date.now().toString().slice(-6)}`),
          products: products.length ? products : undefined,
          sendNow: true,
          delayDays: 0,
        }),
      });
      const status = result.job?.status || 'created';
      const sent = status === 'sent';
      const sendError = result.sendResult?.results?.find((item)=>item.error)?.error || result.job?.errorMessage || result.error || '';
      renderLastSendResult({
        ok: sent,
        warning: !sent && !sendError,
        title: sent ? 'Full fake-order review email sent' : `Fake-order job ${status}`,
        detail: sent ? `Sent to ${email} using the Primary Reviews template.` : (sendError || 'The fake-order job was created but has not sent yet. Check the provider and due-job result below.'),
        meta: [`Recipient: ${email}`, `Order: ${val('msg-test-order','1001')}`, `Template: ${val('msg-email-template-name','Primary Reviews')}`],
        html: result.emailPreviewHtml || attemptedHtml,
      });
      showToast(sent ? 'Full fake-order review email sent.' : `Fake-order job ${status}`);
      await loadAnalytics();
    } catch (error) {
      renderLastSendResult({ ok: false, title: 'Full fake-order email failed', detail: error.message || 'Unknown send error', meta: [`Recipient: ${email}`, `Template: ${val('msg-email-template-name','Primary Reviews')}`], html: attemptedHtml });
      throw error;
    }
  }


  function pageStatusIcon(status) { return status === 'ready' ? '✓' : status === 'missing' ? '!' : '⚠'; }
  function pageStatusLabel(status) { return status === 'ready' ? 'Verified page' : status === 'missing' ? 'Page missing' : 'Needs verification'; }
  function setReviewPageChip(status, label) {
    const chip = el('msg-refresh-page-status');
    if (!chip) return;
    chip.dataset.status = status || 'warning';
    const dot = chip.querySelector('.msg-page-status-dot');
    const copy = chip.querySelector('.msg-page-status-copy');
    if (dot) dot.textContent = pageStatusIcon(status);
    if (copy) copy.textContent = label || pageStatusLabel(status);
  }
  let pageStatusTimer = null;
  function scheduleReviewPageStatusCheck() {
    clearTimeout(pageStatusTimer);
    pageStatusTimer = setTimeout(() => loadReviewPageStatus(), 450);
  }

  async function loadReviewPageStatus() {
    const box = el('msg-review-page-status');
    const handle = cleanHandle(val('msg-page-handle', DEFAULT_PAGE_HANDLE));
    setReviewPageChip('warning', 'Checking…');
    if (box) {
      box.dataset.status = 'warning';
      box.innerHTML = `<div><strong>Checking /pages/${escapeHtml(handle)}…</strong><p>Verifying the customer review page before emails are sent.</p></div>`;
    }
    try {
      const data = await securedFetch(`/admin/storefront-page-checks?reviewPageHandle=${encodeURIComponent(handle)}&allReviewsPageHandle=reviews`);
      const page = (data.pages || []).find((item) => item.handle === handle) || data.pages?.[0];
      const status = page?.status || 'warning';
      setReviewPageChip(status, status === 'ready' ? 'Verified' : status === 'missing' ? 'Missing' : 'Check');
      if (box) {
        box.dataset.status = status;
        box.innerHTML = `<div><strong>${pageStatusLabel(status)}: /pages/${escapeHtml(handle)}</strong><p>${escapeHtml(page?.detail || 'Could not verify this page.')}</p>${page?.url ? `<small><a href="${escapeHtml(page.url)}" target="_blank" rel="noopener">Open storefront page</a></small>` : ''}</div>`;
      }
    } catch (error) {
      setReviewPageChip('warning', 'Could not verify');
      if (box) {
        box.dataset.status = 'warning';
        box.innerHTML = `<div><strong>Could not verify review page</strong><p>${escapeHtml(error.message || 'Check Render logs and Shopify connection.')}</p></div>`;
      }
    }
    el('msg-refresh-page-status')?.addEventListener('click', () => loadReviewPageStatus(), { once: true });
  }

  function currentTemplatePayload() { return { name: `${val('msg-test-name','Customer')} · #${val('msg-test-order','1001')}`, customerName: val('msg-test-name','Alex'), customerEmail: val('msg-test-email','alex@example.com'), order: val('msg-test-order','1001'), mode: val('msg-test-type','order'), products: products.slice(), createdAt: new Date().toISOString() }; }
  function renderTemplates() {
    const box = el('msg-template-list');
    if (!box) return;
    if (!reviewTemplates.length) { box.innerHTML = '<div class="msg-help">No templates yet. Build a test setup, then press + next to Copy Test URL.</div>'; return; }
    box.innerHTML = reviewTemplates.map((t,i)=>{
      const productCount = (t.products || []).length;
      const productList = productCount ? (t.products || []).map((p)=>`<li>${escapeHtml(p.title || p.id || 'Product')} <small>${escapeHtml(p.id || '')}</small></li>`).join('') : '<li>No products saved.</li>';
      return `<div class="msg-template-card" data-template-index="${i}"><div class="msg-template-top"><div><strong>${escapeHtml(t.name || 'Template')}</strong><div class="msg-template-meta"><span>${escapeHtml(t.customerName || 'Customer')}</span><span>${escapeHtml(t.customerEmail || 'No email')}</span><span>Order ${escapeHtml(t.order || '—')}</span><span>${productCount} products</span><span>${escapeHtml(t.mode || 'order')}</span></div></div><button type="button" class="msg-template-remove" data-remove-template="${i}" title="Remove template">×</button></div><details><summary>View saved details</summary><div class="msg-help" style="margin-top:10px;"><strong>Customer:</strong> ${escapeHtml(t.customerName || 'Customer')}<br><strong>Email:</strong> ${escapeHtml(t.customerEmail || '—')}<br><strong>Order:</strong> ${escapeHtml(t.order || '—')}<br><strong>Mode:</strong> ${escapeHtml(t.mode || 'order')}<br><strong>Products:</strong><ul style="margin:8px 0 0 18px;">${productList}</ul></div></details><div class="msg-template-actions"><button type="button" class="msg-btn secondary" data-load-template="${i}">Load template</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-load-template]').forEach((btn)=>btn.addEventListener('click',()=>applyTemplate(Number(btn.dataset.loadTemplate))));
    box.querySelectorAll('[data-remove-template]').forEach((btn)=>btn.addEventListener('click',(event)=>{ event.stopPropagation(); reviewTemplates.splice(Number(btn.dataset.removeTemplate),1); saveTemplates(); }));
  }
  function openTemplateModal() { const payload = currentTemplatePayload(); if (el('msg-template-name-input')) el('msg-template-name-input').value = payload.name; const modal = el('msg-template-modal'); modal?.classList.add('active'); modal?.setAttribute('aria-hidden', 'false'); setTimeout(()=>el('msg-template-name-input')?.focus(), 20); }
  function closeTemplateModal() { const modal = el('msg-template-modal'); modal?.classList.remove('active'); modal?.setAttribute('aria-hidden', 'true'); }
  function confirmTemplateSave() { const payload = currentTemplatePayload(); payload.name = val('msg-template-name-input', payload.name); reviewTemplates.unshift(payload); saveTemplates(); closeTemplateModal(); showToast('Template saved'); }
  function saveTemplate() { openTemplateModal(); }
  function applyTemplate(index) { const t = reviewTemplates[index]; if (!t) return; if (el('msg-test-name')) el('msg-test-name').value = t.customerName || 'Alex'; if (el('msg-test-email')) el('msg-test-email').value = t.customerEmail || 'alex@example.com'; if (el('msg-test-order')) el('msg-test-order').value = t.order || '1001'; if (el('msg-test-type')) el('msg-test-type').value = t.mode || 'order'; products.splice(0, products.length, ...(t.products || [])); renderProductList(); updatePreview(); showToast('Template loaded'); }
  function loadLinkRules() { try { linkRules = JSON.parse(localStorage.getItem(storageKey('link_rules')) || '[]'); } catch (_) { linkRules = []; } renderLinkRules(); }
  function saveLinkRules() { localStorage.setItem(storageKey('link_rules'), JSON.stringify(linkRules.slice(0, 30))); renderLinkRules(); updatePreview(); }
  function renderLinkRules() { const box = el('msg-link-rule-list'); if (!box) return; if (!linkRules.length) { box.innerHTML = '<div class="msg-help">No link rules yet. Add one to change product or order button text based on product data or order data.</div>'; return; } box.innerHTML = linkRules.map((r,i)=>`<div class="msg-link-rule-pill"><span><strong>${escapeHtml(r.type)}</strong> ${escapeHtml(r.condition)} → ${escapeHtml(r.text)}</span><button type="button" data-remove-link-rule="${i}">× Remove</button></div>`).join(''); box.querySelectorAll('[data-remove-link-rule]').forEach((btn)=>btn.addEventListener('click',()=>{ linkRules.splice(Number(btn.dataset.removeLinkRule),1); saveLinkRules(); })); }
  function addLinkRule() { const type = val('msg-link-rule-type','tag'); const condition = val('msg-link-rule-condition'); const text = val('msg-link-rule-text'); if (!condition || !text) return showToast('Add a condition and button text first.'); linkRules.push({ type, condition, text }); if (el('msg-link-rule-condition')) el('msg-link-rule-condition').value=''; if (el('msg-link-rule-text')) el('msg-link-rule-text').value=''; saveLinkRules(); }
  function buttonTextForProduct(product, o) { const tags = Array.isArray(product.tags) ? product.tags.map((t)=>String(t).toLowerCase()) : []; const title = String(product.title || '').toLowerCase(); const rule = linkRules.find((r)=>{ const c=String(r.condition||'').toLowerCase(); if(!c) return false; if(r.type === 'tag') return tags.includes(c) || title.includes(c); if(r.type === 'metafield') return title.includes(c); return false; }); return rule?.text || o.productButtonText; }
  function buttonTextForOrder(o) { const order = String(val('msg-test-order','1001')).toLowerCase(); const rule = linkRules.find((r)=>{ const c=String(r.condition||'').toLowerCase(); if(!c) return false; if(r.type === 'order') return order.includes(c.replace(/^#/,'')) || (`#${order}`).includes(c); if(r.type === 'order_value' || r.type === 'order_tag') return order.includes(c); return false; }); return rule?.text || o.mainButtonText; }

  function opts() {
    const pageHandle = cleanHandle(val('msg-page-handle', DEFAULT_PAGE_HANDLE));
    return {
      logo: val('msg-logo', ''),
      accentColor: el('msg-color')?.value || '#111827',
      buttonRadius: Math.max(0, Math.min(40, Number(val('msg-button-radius', '8')) || 8)),
      bgColor: el('msg-bg-color')?.value || '#f3f4f6',
      cardColor: el('msg-card-color')?.value || '#ffffff',
      subject: val('msg-subject', 'How was your recent order?'),
      heading: val('msg-heading', 'How did we do?'),
      headingAlign: ['left','center','right'].includes(val('msg-heading-align','center')) ? val('msg-heading-align','center') : 'center',
      headingWeight: ['300','400','600','700','800'].includes(val('msg-heading-weight','700')) ? val('msg-heading-weight','700') : '700',
      headingFont: val('msg-heading-font', 'Arial,Helvetica,sans-serif'),
      intro: val('msg-intro', 'Hi {{ order.customer.firstName | default: "there" }}'),
      body: val('msg-body', "We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?"),
      signoff: val('msg-signoff', 'Your feedback helps other customers make confident choices.'),
      linkMode: val('msg-link-mode', 'both'),
      mainButtonText: val('msg-main-button-text', 'Review Your Order'),
      productButtonText: val('msg-product-button-text', 'Review This Item'),
      pageHandle,
      delayDays: val('msg-delay-days', '14'),
    };
  }

  function campaignParams(extra = {}) {
    const params = new URLSearchParams();
    params.set('shopDomain', getShopDomain());
    params.set('campaign', extra.campaign || 'review_request');
    if (extra.orderId) params.set('orderId', extra.orderId);
    if (extra.email) params.set('email', extra.email);
    if (extra.itemId) params.set('itemId', extra.itemId);
    if (extra.token) params.set('token', extra.token);
    return params;
  }

  function trackingOpenPixel(extra = {}) {
    return `${DEFAULT_API}/campaign/open?${campaignParams(extra).toString()}&t=${Date.now()}`;
  }

  function trackingClickUrl(url, extra = {}) {
    const params = campaignParams(extra);
    params.set('url', url);
    return `${DEFAULT_API}/campaign/click?${params.toString()}`;
  }

  function flowReviewUrl(o, mode, productFragment = '') {
    const base = shopUrl();
    const orderBits = `review_type=${mode}&shop=${encodeURIComponent(getShopDomain())}&order={{ order.name | remove: '#' | url_encode }}&customer={{ order.customer.firstName | url_encode }}&email={{ order.customer.email | url_encode }}`;
    return `${base}/pages/${o.pageHandle}?${orderBits}${productFragment}`;
  }

  function testReviewUrl(o, mode, product) {
    const params = new URLSearchParams();
    params.set('test', '1');
    params.set('review_type', mode);
    params.set('customer', val('msg-test-name', 'Alex'));
    params.set('email', val('msg-test-email', 'alex@example.com'));
    params.set('order', val('msg-test-order', '1001'));
    params.set('shop', getShopDomain());
    const productList = product ? [product] : products;
    if (productList.length) {
      params.set('products', JSON.stringify(productList.map((p) => ({
        id: p.id,
        productId: p.id,
        variantId: p.variantId || '',
        title: p.title || 'Product',
        name: p.title || 'Product',
        image: p.image || '',
        quantity: p.quantity || 1,
        tags: Array.isArray(p.tags) ? p.tags : [],
        handle: p.handle || '',
      }))));
      params.set('product_id', productList[0].id || '');
      params.set('variant_id', productList[0].variantId || '');
      params.set('product_title', productList[0].title || '');
    }
    return `${shopUrl()}/pages/${o.pageHandle}?${params.toString()}`;
  }

  function buildEmailShell(o, inner, footerExtra = '', context = {}) {
    const logoHtml = o.logo ? `<tr><td align="center" style="padding:0 0 18px 0;"><img src="${escapeHtml(o.logo)}" alt="" style="max-width:160px;height:auto;display:block;"></td></tr>` : '';
    const beforeSections = renderEmailSectionRows('before', context);
    const afterSections = renderEmailSectionRows('after', context);
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${o.bgColor};margin:0;padding:0;width:100%;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:${o.cardColor};border-radius:16px;overflow:hidden;"><tr><td style="padding:34px 26px;font-family:Arial,Helvetica,sans-serif;text-align:center;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${logoHtml}<tr><td align="${escapeHtml(o.headingAlign || 'center')}" style="padding:0 0 12px 0;"><h1 style="margin:0;color:#111827;font-size:28px;line-height:1.25;font-weight:${escapeHtml(o.headingWeight || '700')};font-family:${escapeHtml(o.headingFont || 'Arial,Helvetica,sans-serif')};text-align:${escapeHtml(o.headingAlign || 'center')};">${escapeHtml(o.heading)}</h1></td></tr><tr><td align="center" style="padding:0 0 10px 0;"><p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">${o.intro}</p></td></tr><tr><td align="center" style="padding:0 0 12px 0;"><p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">${escapeHtml(o.body)}</p></td></tr>${beforeSections}${inner}${afterSections}<tr><td align="center" style="padding:24px 0 0 0;"><p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">${escapeHtml(o.signoff)}</p></td></tr><tr><td align="center" style="padding:20px 0 0 0;"><p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">${escapeHtml(o.footerLabel || 'Sent by {{ shop.name }}.')} </p></td></tr>${footerExtra}</table></td></tr></table></td></tr></table>`;
  }

  function productStars(starColor) {
    return `<span style="display:inline-block;color:${starColor || '#f5b301'};font-size:18px;letter-spacing:2px;line-height:1;white-space:nowrap;">★★★★★</span>`;
  }

  function buildFlowEmailHtml(o) {
    const starColor = '#f5b301';
    const orderUrl = flowReviewUrl(o, 'order');
    const orderButton = `<tr><td align="center" style="padding:18px 0 14px 0;"><a href="${orderUrl}" style="display:inline-block;background:${o.accentColor};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 24px;border-radius:${o.buttonRadius}px;">${escapeHtml(o.mainButtonText)}</a></td></tr>`;
    const productButtons = `<tr><td style="padding:18px 0 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">{% for line_item in order.lineItems %}<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="58" style="padding-right:12px;vertical-align:middle;"><div style="width:58px;height:58px;border-radius:10px;background:#eef2f7;overflow:hidden;"><img src="{{ line_item.image | image_url: width: 116 }}" width="58" height="58" alt="" style="display:block;width:58px;height:58px;object-fit:cover;border:0;"></div></td><td style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;font-weight:bold;line-height:1.35;vertical-align:middle;padding-right:12px;">{{ line_item.title }}</td><td align="right" style="vertical-align:middle;white-space:nowrap;"><div style="margin-bottom:8px;">${productStars(starColor)}</div><a href="${flowReviewUrl(o, 'product', '&product_id={{ line_item.product.id }}&variant_id={{ line_item.variant.id }}&product_title={{ line_item.title | url_encode }}')}" style="display:inline-block;background:${o.accentColor};color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:9px 13px;border-radius:${o.buttonRadius}px;white-space:nowrap;">${escapeHtml(o.productButtonText)}</a></td></tr></table></td></tr>{% endfor %}</table></td></tr>`;
    const links = o.linkMode === 'order' ? orderButton : o.linkMode === 'products' ? productButtons : orderButton + productButtons;
    const pixel = `<tr><td><img src="${DEFAULT_API}/campaign/open?shopDomain=${encodeURIComponent(getShopDomain())}&campaign=flow_review_request&orderId={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;"></td></tr>`;
    return buildEmailShell(o, links, pixel, { reviewLink: orderUrl, supportLink: withSupportParam(orderUrl) });
  }

  function buildRenderedTestEmailHtml(o, tokenOverride = '') {
    const orderId = val('msg-test-order', '1001');
    const email = val('msg-test-recipient') || val('msg-test-email', 'alex@example.com');
    const token = tokenOverride || `preview-${Date.now()}`;
    const starColor = '#f5b301';
    const safeProducts = products.length ? products : [{ id: 'sample-product-1', title: 'Sample Product 1', image: '', variantId: '', quantity: 1, tags: [] }];
    const orderUrl = trackingClickUrl(testReviewUrl(o, 'order'), { campaign: 'test_review_request', orderId, email, token });
    const orderButton = `<tr><td align="center" style="padding:18px 0 14px 0;"><a href="${orderUrl}" style="display:inline-block;background:${o.accentColor};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 24px;border-radius:${o.buttonRadius}px;">${escapeHtml(buttonTextForOrder(o))}</a></td></tr>`;
    const productRows = `<tr><td style="padding:18px 0 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${safeProducts.map((product) => {
      const url = trackingClickUrl(testReviewUrl(o, 'product', product), { campaign: 'test_review_request', orderId, email, itemId: product.id, token });
      const img = product.image ? `<img src="${escapeHtml(product.image)}" width="58" height="58" alt="" style="display:block;width:58px;height:58px;object-fit:cover;border-radius:10px;background:#eef2f7;border:0;">` : `<div style="width:58px;height:58px;border-radius:10px;background:#eef2f7;"></div>`;
      return `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="58" style="padding-right:12px;vertical-align:middle;">${img}</td><td style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;font-weight:bold;line-height:1.35;vertical-align:middle;padding-right:12px;">${escapeHtml(product.title || 'Product')}<div style="font-size:12px;color:#667085;font-weight:normal;margin-top:3px;">Product ID: ${escapeHtml(product.id || '')}</div></td><td align="right" style="vertical-align:middle;white-space:nowrap;"><div style="margin-bottom:8px;">${productStars(starColor)}</div><a href="${url}" style="display:inline-block;background:${o.accentColor};color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:9px 13px;border-radius:${o.buttonRadius}px;white-space:nowrap;">${escapeHtml(buttonTextForProduct(product, o))}</a></td></tr></table></td></tr>`;
    }).join('')}</table></td></tr>`;
    const links = o.linkMode === 'order' ? orderButton : o.linkMode === 'products' ? productRows : orderButton + productRows;
    const intro = o.intro.replace(/\{\{[^}]+\}\}/g, escapeHtml(val('msg-test-name', 'Alex')));
    const testOpts = { ...o, intro, footerLabel: `Sent by ${getShopDomain()}.` };
    const pixel = `<img src="${trackingOpenPixel({ campaign: 'test_review_request', orderId, email, token })}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;">`;
    return buildEmailShell(testOpts, links, `<tr><td>${pixel}</td></tr>`, { reviewLink: orderUrl, supportLink: withSupportParam(orderUrl) });
  }

  function updatePreview() {
    const o = opts();
    const previewHtml = buildRenderedTestEmailHtml(o);
    const flowHtml = buildFlowEmailHtml(o);
    if (el('msg-email-preview')) el('msg-email-preview').innerHTML = previewHtml;
    if (el('msg-code-output')) el('msg-code-output').value = flowHtml;
    if (el('msg-delay-preview')) el('msg-delay-preview').textContent = o.delayDays;
    if (el('msg-delay-preview-settings')) el('msg-delay-preview-settings').textContent = o.delayDays;
  }

  function renderProductList() {
    const box = el('msg-products');
    if (!box) return;
    box.innerHTML = products.length ? products.map((p, i) => `<div class="msg-product"><img src="${escapeHtml(p.image || '')}" alt=""><div><strong>${escapeHtml(p.title || 'Product')}</strong><small>Product ID: ${escapeHtml(p.id || '')}${p.variantId ? ` · Variant: ${escapeHtml(p.variantId)}` : ''}</small></div><button type="button" data-remove-product="${i}">×</button></div>`).join('') : '<div class="msg-help">No products selected yet.</div>';
    box.querySelectorAll('[data-remove-product]').forEach((btn) => btn.addEventListener('click', () => { products.splice(Number(btn.dataset.removeProduct), 1); renderProductList(); updatePreview(); }));
  }

  function addSampleProducts() {
    products.splice(0, products.length);
    const count = Math.max(1, Math.min(10, parseInt(val('msg-test-count', '2'), 10) || 2));
    for (let i = 1; i <= count; i += 1) products.push({ id: `sample-product-${i}`, variantId: `sample-variant-${i}`, title: `Sample Product ${i}`, image: '', quantity: 1, tags: ['Drink', 'Sample'] });
    renderProductList();
    updatePreview();
  }

  function ensureProductModal() {
    let modal = el('flow-product-modal-backdrop');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'flow-product-modal-backdrop';
    modal.className = 'flow-product-modal-backdrop';
    modal.innerHTML = `<div class="flow-product-modal" role="dialog" aria-modal="true"><div class="flow-product-modal-head"><div><h3>Select review products</h3><p>Search Shopify products and choose every item to include in the test review page.</p></div><button type="button" class="flow-product-modal-close" aria-label="Close">×</button></div><div class="flow-product-search"><input id="flow-product-search-input" type="search" placeholder="Search by product title, handle or ID"><button type="button" id="flow-product-search-run">Search</button></div><div id="flow-product-results" class="flow-product-results"><div class="msg-help">Search for products to add them here.</div></div><div class="flow-product-modal-actions"><button type="button" class="secondary" id="flow-product-modal-cancel">Cancel</button><button type="button" id="flow-product-add-selected">Add Selected Products</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.flow-product-modal-close')?.addEventListener('click', closeProductModal);
    modal.querySelector('#flow-product-modal-cancel')?.addEventListener('click', closeProductModal);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeProductModal(); });
    modal.querySelector('#flow-product-search-run')?.addEventListener('click', () => runProductSearch().catch((e) => renderProductSearchResults([], e.message || 'Product search failed', e.installUrl || (e.status === 401 ? `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(getShopDomain())}` : ''))));
    modal.querySelector('#flow-product-search-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runProductSearch().catch((e) => renderProductSearchResults([], e.message || 'Product search failed', e.installUrl || (e.status === 401 ? `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(getShopDomain())}` : ''))); } });
    modal.querySelector('#flow-product-add-selected')?.addEventListener('click', addSelectedProductsFromModal);
    return modal;
  }

  function closeProductModal() { el('flow-product-modal-backdrop')?.classList.remove('active'); }

  function renderProductSearchResults(items, message, installUrl) {
    const box = el('flow-product-results');
    if (!box) return;
    if (installUrl) {
      box.innerHTML = `<div class="oauth-connect"><div><strong>Product search is not connected yet.</strong><br><span>${escapeHtml(message || 'Install/reinstall through Shopify OAuth to save this shop\'s Admin API token.')}</span></div><a href="${escapeHtml(installUrl)}" target="_top">Connect Shopify</a></div>`;
      return;
    }
    if (message) {
      const needsAuth = /Admin authentication required/i.test(message);
      if (needsAuth) {
        const url = `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(getShopDomain())}`;
        box.innerHTML = `<div class="oauth-connect"><div><strong>Secure admin session needed.</strong><br><span>Reconnect/open the app through Shopify, then try product search again.</span></div><a href="${escapeHtml(url)}" target="_top">Open secure session</a></div>`;
        return;
      }
      box.innerHTML = `<div class="msg-help">${escapeHtml(message)}</div>`; return;
    }
    if (!items.length) { box.innerHTML = '<div class="msg-help">No products found. Try a product title, handle, or ID.</div>'; return; }
    box.innerHTML = items.map((product, index) => `<label class="flow-product-row"><input type="checkbox" data-product-result="${index}"><img src="${escapeHtml(product.image || '')}" alt=""><span><strong>${escapeHtml(product.title || 'Product')}</strong><small>Product ID: ${escapeHtml(product.id || '')}${product.variantId ? ` · Variant: ${escapeHtml(product.variantId)}` : ''}</small></span><button type="button" data-add-one-product="${index}">Add</button></label>`).join('');
    box.querySelectorAll('[data-add-one-product]').forEach((btn) => btn.addEventListener('click', (event) => { event.preventDefault(); const p = productSearchResults[Number(btn.dataset.addOneProduct)]; if (p) addProductToSelection(p); }));
  }

  function addProductToSelection(product) {
    if (!product?.id) return;
    if (!products.some((item) => String(item.id) === String(product.id))) products.push(product);
    renderProductList();
    updatePreview();
    showToast(`Added ${product.title || 'product'}`);
  }

  function addSelectedProductsFromModal() {
    const checked = Array.from(document.querySelectorAll('#flow-product-results [data-product-result]:checked'));
    if (!checked.length) return showToast('Select at least one product first.');
    checked.forEach((input) => { const product = productSearchResults[Number(input.dataset.productResult)]; if (product) addProductToSelection(product); });
    closeProductModal();
  }

  async function runProductSearch() {
    const q = (el('flow-product-search-input')?.value || '').trim();
    if (!q) return showToast('Enter a product title or ID first.');
    renderProductSearchResults([], 'Searching Shopify products...');
    try {
      let result;
      try {
        result = await securedFetch(`/admin/products/search?q=${encodeURIComponent(q)}`);
      } catch (adminError) {
        if (adminError.status !== 401 && adminError.status !== 403) throw adminError;
        const publicRes = await fetch(`${DEFAULT_API}/products/search?shopDomain=${encodeURIComponent(getShopDomain())}&q=${encodeURIComponent(q)}`);
        result = publicRes.ok ? await publicRes.json() : { products: [], unavailable: true, message: 'Open a secure admin session to search products.' };
      }
      if (result.unavailable || result.requiresOauth) {
        productSearchResults = [];
        renderProductSearchResults([], result.message || 'Reconnect Shopify to enable product search.', result.installUrl || `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(getShopDomain())}`);
        return;
      }
      productSearchResults = result.products || [];
      renderProductSearchResults(productSearchResults);
    } catch (error) {
      productSearchResults = [];
      const installUrl = error.installUrl || `${window.location.origin}/auth/shopify?shop=${encodeURIComponent(getShopDomain())}`;
      renderProductSearchResults([], error.status === 401 ? 'Open a secure admin session to search products.' : (error.message || 'Product search failed.'), installUrl);
    }
  }

  async function searchProducts() {
    const modal = ensureProductModal();
    modal.classList.add('active');
    setTimeout(() => el('flow-product-search-input')?.focus(), 50);
  }

  function testUrl() {
    return testReviewUrl(opts(), val('msg-test-type', 'order'));
  }

  async function copyText(text, success) {
    try { await navigator.clipboard.writeText(text); showToast(success || 'Copied'); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast(success || 'Copied'); }
  }

  async function loadShopifyStatus() {
    const box = el('msg-shopify-status');
    if (!box) return;
    try {
      const s = await securedFetch('/admin/shopify-status');
      box.innerHTML = s.connected ? '✅ Shopify product search is connected for this shop.' : `<div class="oauth-connect"><div>${escapeHtml(s.message || 'Connect Shopify OAuth to enable product search.')}</div><a href="${escapeHtml(s.installUrl || `/auth/shopify?shop=${encodeURIComponent(getShopDomain())}`)}" target="_top">Connect Shopify</a></div>`;
    } catch (error) { box.textContent = error.message || 'Could not check Shopify status.'; }
  }


  function renderProviderProfiles() {
    const box = el('msg-provider-profile-list'); if (!box) return;
    if (!providerProfiles.length) { box.innerHTML = '<div class="msg-help">No saved providers yet. Complete the provider form and choose Add / Update Provider.</div>'; return; }
    box.innerHTML = providerProfiles.map((p)=>{
      const id = p._id || p.id;
      const primaryFor = Array.isArray(p.primaryFor) ? p.primaryFor : [];
      const purposeButtons = ['reviews','loyalty','cartRewards','general'].map((purpose)=> {
        const active = primaryFor.includes(purpose);
        return `<button type="button" class="msg-btn secondary ${active ? 'danger' : ''}" ${active ? `data-unprimary-provider="${escapeHtml(id)}"` : `data-primary-provider="${escapeHtml(id)}"`} data-purpose="${purpose}">${active ? 'Remove' : 'Primary'}: ${escapeHtml(purposeLabel(purpose))}</button>`;
      }).join('');
      return `<div class="msg-provider-card"><div class="msg-provider-card-head"><div><strong>${escapeHtml(p.name || p.fromName || p.provider || 'Email provider')}</strong><div class="msg-template-meta"><span>${escapeHtml(p.fromEmail || p.smtpUser || '')}</span><span>${escapeHtml(p.smtpHost || '')}</span></div></div><div class="msg-provider-badges">${primaryFor.length ? primaryFor.map((purpose)=>`<span class="msg-badge green">${escapeHtml(purposeLabel(purpose))}</span>`).join('') : '<span class="msg-badge gray">Not primary</span>'}</div></div><div class="msg-actions"><button type="button" class="msg-btn secondary" data-use-provider="${escapeHtml(id)}">Use as active</button><div class="msg-provider-primary-actions">${purposeButtons}</div><button type="button" class="msg-icon-btn danger" data-delete-provider="${escapeHtml(id)}" title="Delete provider">×</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-use-provider]').forEach((btn)=>btn.addEventListener('click',()=>useProviderProfile(btn.dataset.useProvider, val('msg-provider-primary-for','reviews')).catch((error)=>showToast(error.message || 'Could not activate provider'))));
    box.querySelectorAll('[data-primary-provider]').forEach((btn)=>btn.addEventListener('click',()=>useProviderProfile(btn.dataset.primaryProvider, btn.dataset.purpose).catch((error)=>showToast(error.message || 'Could not assign provider'))));
    box.querySelectorAll('[data-unprimary-provider]').forEach((btn)=>btn.addEventListener('click',()=>unassignProviderProfile(btn.dataset.unprimaryProvider, btn.dataset.purpose).catch((error)=>showToast(error.message || 'Could not remove primary provider'))));
    box.querySelectorAll('[data-delete-provider]').forEach((btn)=>btn.addEventListener('click',()=>deleteProviderProfile(btn.dataset.deleteProvider).catch((error)=>showToast(error.message || 'Could not delete provider'))));
  }
  async function loadProviderProfiles() {
    try { const data = await securedFetch('/admin/email-provider-profiles'); providerProfiles = data.providers || []; }
    catch (error) { console.warn('Provider profiles unavailable:', error); try { providerProfiles = JSON.parse(localStorage.getItem(storageKey('provider_profiles')) || '[]'); } catch (_) { providerProfiles = []; } }
    renderProviderProfiles();
  }
  function providerPayload() {
    return {
      name: val('msg-provider-profile-name', `${val('msg-smtp-provider','smtp')} provider`),
      primaryFor: [val('msg-provider-primary-for','reviews')],
      enabled: val('msg-smtp-enabled', 'true') === 'true',
      provider: val('msg-smtp-provider','smtp'),
      smtpHost: val('msg-smtp-host'),
      smtpPort: Number(val('msg-smtp-port','587')),
      secureMode: val('msg-smtp-secure','starttls'),
      smtpUser: val('msg-smtp-user'),
      smtpPass: val('msg-smtp-pass'),
      fromName: val('msg-smtp-from-name','Nectar Reviews'),
      fromEmail: val('msg-smtp-from-email'),
      replyToEmail: val('msg-smtp-reply-to'),
    };
  }
  function upsertLocalProvider(payload, id) {
    const localId = id || payload.id || `local-${(payload.name || payload.fromEmail || 'provider').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
    const fallback = { ...payload, _id: localId, id: localId, smtpPass: undefined, smtpPasswordSet: Boolean(payload.smtpPass), passwordSet: Boolean(payload.smtpPass) };
    providerProfiles = providerProfiles.filter((p) => String(p._id || p.id || p.name) !== String(localId) && String(p.name || '').toLowerCase() !== String(payload.name || '').toLowerCase());
    providerProfiles.unshift(fallback);
    localStorage.setItem(storageKey('provider_profiles'), JSON.stringify(providerProfiles.slice(0, 20)));
    renderProviderProfiles();
  }

  async function saveProviderProfile() {
    const payload = providerPayload();
    if (!payload.smtpHost || !payload.smtpUser || !payload.fromEmail) throw new Error('SMTP host, username and from email are required.');
    try { await securedFetch('/admin/email-provider-profiles', { method: 'POST', body: JSON.stringify(payload) }); await loadProviderProfiles(); showToast('Provider profile saved'); }
    catch (error) {
      upsertLocalProvider(payload);
      showToast(`Provider saved locally because the server could not save it: ${error.message || 'unknown error'}`);
    }
  }
  async function useProviderProfile(id, purpose) {
    if (String(id || '').startsWith('local-')) { const p = providerProfiles.find((item)=>String(item._id || item.id) === String(id)); if (p) { p.primaryFor = Array.from(new Set([...(p.primaryFor || []).filter((x)=>x !== purpose), purpose])); localStorage.setItem(storageKey('provider_profiles'), JSON.stringify(providerProfiles)); renderProviderProfiles(); showToast(`Provider assigned locally to ${purposeLabel(purpose)}`); return; } }
    await securedFetch(`/admin/email-provider-profiles/${encodeURIComponent(id)}/use`, { method: 'POST', body: JSON.stringify({ purpose }) }); await loadProviderProfiles(); await loadEmailSettings(); showToast(`Provider assigned to ${purposeLabel(purpose)}`);
  }
  async function unassignProviderProfile(id, purpose) {
    if (String(id || '').startsWith('local-')) { const p = providerProfiles.find((item)=>String(item._id || item.id) === String(id)); if (p) { p.primaryFor = (p.primaryFor || []).filter((x)=>x !== purpose); localStorage.setItem(storageKey('provider_profiles'), JSON.stringify(providerProfiles)); renderProviderProfiles(); showToast(`Provider removed locally from ${purposeLabel(purpose)}`); return; } }
    await securedFetch(`/admin/email-provider-profiles/${encodeURIComponent(id)}/unassign`, { method: 'POST', body: JSON.stringify({ purpose }) }); await loadProviderProfiles(); showToast(`Provider removed from ${purposeLabel(purpose)}`);
  }
  async function deleteProviderProfile(id) {
    if (String(id || '').startsWith('local-')) { providerProfiles = providerProfiles.filter((item)=>String(item._id || item.id) !== String(id)); localStorage.setItem(storageKey('provider_profiles'), JSON.stringify(providerProfiles)); renderProviderProfiles(); showToast('Provider removed locally'); return; }
    await securedFetch(`/admin/email-provider-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadProviderProfiles(); showToast('Provider removed');
  }

  async function loadEmailSettings() {
    const state = el('msg-smtp-state');
    try {
      const s = await securedFetch('/admin/email-settings');
      el('msg-smtp-provider').value = s.provider && s.provider !== 'none' ? s.provider : 'smtp';
      el('msg-smtp-enabled').value = String(s.enabled !== false);
      el('msg-smtp-host').value = s.smtpHost || '';
      el('msg-smtp-port').value = s.smtpPort || 587;
      el('msg-smtp-secure').value = s.secureMode || 'starttls';
      el('msg-smtp-user').value = s.smtpUser || '';
      el('msg-smtp-from-name').value = s.fromName || 'Nectar Reviews';
      el('msg-smtp-from-email').value = s.fromEmail || '';
      el('msg-smtp-reply-to').value = s.replyToEmail || '';
      if (state) { state.className = `msg-state ${s.enabled && s.smtpPasswordSet ? 'ok' : 'bad'}`; state.textContent = s.enabled && s.smtpPasswordSet ? 'Email provider saved' : 'Email provider not fully configured'; }
      const help = el('msg-test-email-help'); if (help) { const ready = s.enabled && s.smtpPasswordSet; help.textContent = ready ? 'Ready to send. Test emails are tracked as test_review_request.' : 'Save a working email provider before test sending.'; help.className = `msg-help ${ready ? '' : 'warning'}`; }
      const statusCard = el('msg-provider-status-card');
      if (statusCard) { const ok = s.enabled && s.smtpPasswordSet; statusCard.className = `msg-provider-status ${ok ? 'ok' : ''}`; statusCard.innerHTML = ok ? `<span class="icon">✓</span><div><strong>${escapeHtml((s.provider || 'SMTP').toUpperCase())} connected</strong><span>Sending from ${escapeHtml(s.fromEmail || s.smtpUser || 'saved provider')}.</span></div>` : `<span class="icon">!</span><div><strong>There’s an issue with email delivery</strong><span>${escapeHtml(s.lastTestError || 'Save a provider and send a test email to confirm it is working.')}</span></div>`; }
    } catch (error) { if (state) { state.className = 'msg-state bad'; state.textContent = error.message || 'Could not load email settings'; } }
  }

  async function saveEmailSettings() {
    const payload = {
      enabled: el('msg-smtp-enabled').value === 'true', provider: val('msg-smtp-provider', 'smtp'), smtpHost: val('msg-smtp-host'), smtpPort: Number(val('msg-smtp-port', '587')), secureMode: val('msg-smtp-secure', 'starttls'), smtpUser: val('msg-smtp-user'), smtpPass: val('msg-smtp-pass'), fromName: val('msg-smtp-from-name', 'Nectar Reviews'), fromEmail: val('msg-smtp-from-email'), replyToEmail: val('msg-smtp-reply-to'),
    };
    await securedFetch('/admin/email-settings', { method: 'PATCH', body: JSON.stringify(payload) });
    try {
      await securedFetch('/admin/email-provider-profiles', { method: 'POST', body: JSON.stringify({ ...payload, name: val('msg-provider-profile-name', payload.fromName || payload.fromEmail || 'Email provider'), primaryFor: [val('msg-provider-primary-for','reviews')] }) });
      await loadProviderProfiles();
    } catch (error) {
      upsertLocalProvider({ ...payload, name: val('msg-provider-profile-name', payload.fromName || payload.fromEmail || 'Email provider'), primaryFor: [val('msg-provider-primary-for','reviews')] });
    }
    el('msg-smtp-pass').value = '';
    await loadEmailSettings();
    showToast('Email provider saved and added to Saved providers');
  }

  async function removeEmailSettings() {
    if (!confirm('Remove saved email provider settings for this shop?')) return;
    await securedFetch('/admin/email-settings', { method: 'DELETE' });
    ['msg-smtp-host', 'msg-smtp-user', 'msg-smtp-pass', 'msg-smtp-from-email', 'msg-smtp-reply-to'].forEach((id) => { if (el(id)) el(id).value = ''; });
    await loadEmailSettings();
    showToast('Email provider removed');
  }

  async function sendTestEmail() {
    const to = val('msg-test-recipient');
    if (!to) return showToast('Enter a test recipient email');
    updatePreview();
    const o = opts();
    const token = `test-${Date.now()}`;
    const html = buildRenderedTestEmailHtml(o, token);
    const first = products[0] || {};
    try {
      await securedFetch('/admin/test-email', {
        method: 'POST',
        body: JSON.stringify({
          to,
          subject: o.subject || 'Review request test email',
          html,
          orderId: val('msg-test-order', '1001'),
          itemId: first.id || '',
          token,
          templateName: val('msg-email-template-name', val('msg-heading', 'Review request')),
          layoutName: val('msg-link-mode', 'both'),
          moduleNames: emailSections.map((section)=>section.title || sectionLabel(section.type)).filter(Boolean),
        }),
      });
      renderLastSendResult({ ok: true, title: 'Test email sent', detail: `Sent to ${to}.`, meta: [`Subject: ${o.subject || 'Review request test email'}`, `Template: ${val('msg-email-template-name','Review request')}`], html });
      showToast('Test email sent');
      await loadAnalytics();
    } catch (error) {
      renderLastSendResult({ ok: false, title: 'Test email failed', detail: error.message || 'Unknown send error', meta: [`Recipient: ${to}`, `Subject: ${o.subject || 'Review request test email'}`], html });
      throw error;
    }
  }

  let currentAnalytics = null;
  let currentAnalyticsList = 'recipients';

  function sentDetailsHtml(row = {}) {
    const bits = [];
    if (row.subject) bits.push(`Subject: ${escapeHtml(row.subject)}`);
    if (row.templateName) bits.push(`Template: ${escapeHtml(row.templateName)}`);
    if (row.layoutName) bits.push(`Layout: ${escapeHtml(row.layoutName)}`);
    if (Array.isArray(row.moduleNames) && row.moduleNames.length) bits.push(`Modules: ${escapeHtml(row.moduleNames.join(', '))}`);
    return bits.length ? `<div class="msg-analytics-sent-details">${bits.join('<br>')}</div>` : '<div class="msg-analytics-sent-details">What was sent: not recorded for older events.</div>';
  }
  function eventDateForList(row = {}, list = 'sent') {
    if (list === 'opened') return row.openedAt;
    if (list === 'clicked') return row.clickedAt;
    if (list === 'reviewed') return row.reviewedAt;
    return row.sentAt;
  }
  function renderAnalyticsList() {
    const box = el('msg-analytics-list');
    if (!box || !currentAnalytics) return;
    if (currentAnalyticsList === 'recipients') {
      const rows = currentAnalytics.recipients || [];
      if (!rows.length) { box.innerHTML = '<div class="msg-help">No unique recipient records yet. Send a test email to start tracking.</div>'; return; }
      box.innerHTML = rows.map((row) => `<div class="msg-analytics-row recipient"><div><strong>${escapeHtml(row.email || 'No email')}</strong>${row.isTest ? '<span class="msg-test-pill">Test</span>' : ''}<br><small>${escapeHtml(row.campaign || 'review_request')} · Order ${escapeHtml(row.orderId || '—')}</small>${sentDetailsHtml(row)}</div><div><small>Sent</small><br>${row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}</div><div><small>Opened</small><br>${row.openedAt ? new Date(row.openedAt).toLocaleString() : 'Not opened'}</div><div><small>Clicked / Reviewed</small><br>${row.clickedAt ? new Date(row.clickedAt).toLocaleDateString() : '—'}${row.reviewedAt ? ` / ${new Date(row.reviewedAt).toLocaleDateString()}` : ''}</div><div><button type="button" class="msg-reminder-btn" data-remind-email="${escapeHtml(row.email || '')}" data-remind-order="${escapeHtml(row.orderId || '')}" data-remind-item="${escapeHtml(row.itemId || '')}" data-remind-product-title="${escapeHtml(row.productTitle || row.itemTitle || 'Recent purchase')}" ${row.openedAt || !row.email ? 'disabled' : ''}>Reminder</button></div></div>`).join('');
      box.querySelectorAll('[data-remind-email]').forEach((btn)=>btn.addEventListener('click',()=>sendReminder(btn.dataset.remindEmail, btn.dataset.remindOrder, btn.dataset.remindItem, btn.dataset.remindProductTitle).catch((error)=>showToast(error.message || 'Could not send reminder'))));
      return;
    }
    const rows = (currentAnalytics.recipients || []).filter((row) => Boolean(eventDateForList(row, currentAnalyticsList)));
    if (!rows.length) {
      box.innerHTML = `<div class="msg-help">No ${escapeHtml(currentAnalyticsList)} records in the current 30-day window.</div>`;
      return;
    }
    box.innerHTML = rows.map((row) => `<div class="msg-analytics-row"><div><strong>${escapeHtml(row.email || 'No email')}</strong>${row.isTest ? '<span class="msg-test-pill">Test</span>' : ''}<br><small>${escapeHtml(row.campaign || 'review_request')} · Order ${escapeHtml(row.orderId || '—')}</small>${sentDetailsHtml(row)}</div><div><small>Sent</small><br>${row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}</div><div><small>${escapeHtml(currentAnalyticsList)}</small><br>${eventDateForList(row, currentAnalyticsList) ? new Date(eventDateForList(row, currentAnalyticsList)).toLocaleString() : '—'}</div><div><small>Item</small><br>${escapeHtml(row.itemId || '—')}</div><div></div></div>`).join('');
  }
  async function sendReminder(email, orderId, itemId, productTitle) {
    if (!email) return showToast('This recipient has no email address to remind.');
    const cleanedOrderId = String(orderId || '').replace(/^—$/, '');
    try {
      const result = await securedFetch('/admin/campaign-reminder', { method: 'POST', body: JSON.stringify({ email, orderId: cleanedOrderId, itemId, productTitle, campaign: 'manual_review_reminder' }) });
      showToast(result.message || 'Reminder sent');
      await loadAnalytics();
    } catch (error) {
      const detail = error.message || 'Reminder could not be sent. Check Email Delivery has a saved provider and EMAIL_CREDENTIAL_SECRET is set.';
      showToast(detail);
      const box = el('msg-analytics-list');
      if (box && !box.querySelector('.msg-reminder-error')) {
        box.insertAdjacentHTML('afterbegin', `<div class="msg-help msg-reminder-error"><strong>Reminder failed:</strong> ${escapeHtml(detail)}</div>`);
      }
      throw error;
    }
  }

  async function loadAnalytics() {
    try {
      const includeTests = Boolean(el('msg-analytics-include-tests')?.checked);
      const a = await securedFetch(`/admin/campaign-analytics?includeTest=${includeTests ? '1' : '0'}`);
      currentAnalytics = a;
      const box = el('msg-analytics');
      if (box) box.innerHTML = `<div><span>Sent</span><strong>${Number(a.totals?.sent || 0)}</strong></div><div><span>Open rate</span><strong>${Number(a.openRate || 0)}%</strong></div><div><span>Click rate</span><strong>${Number(a.clickRate || 0)}%</strong></div>`;
      const breakdown = el('msg-analytics-breakdown');
      if (breakdown) {
        const rows = Object.entries(a.byCampaign || {});
        breakdown.innerHTML = rows.length ? rows.map(([name,item]) => `<div class="msg-link-rule-pill"><span><strong>${escapeHtml(name)}</strong>${item.isTest ? '<span class="msg-test-pill">Test</span>' : ''} · Sent ${Number(item.sent||0)} · Unique opens ${Number(item.open||0)} · Clicks ${Number(item.click||0)} · Reviews ${Number(item.reviewed||0)}</span><span>${Number(item.openRate||0)}% open / ${Number(item.clickRate||0)}% click</span></div>`).join('') : '<div class="msg-help">No campaign events yet. Send a test email and open/click it to confirm tracking.</div>';
      }
      renderAnalyticsList();
    } catch (error) { console.warn('Campaign analytics unavailable:', error); }
  }

  function switchPane(name) {
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-tab').forEach((b) => b.classList.toggle('active', b.dataset.msgTab === name));
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-pane').forEach((p) => p.classList.toggle('active', p.id === `msg-pane-${name}`));
  }
  window.msgTab = switchPane;

  function setPreviewMode(mode) {
    el('msg-preview-desktop')?.classList.toggle('active', mode === 'desktop');
    el('msg-preview-mobile')?.classList.toggle('active', mode === 'mobile');
    el('msg-preview-wrap')?.classList.toggle('mobile', mode === 'mobile');
  }

  function openPreviewModal() {
    const modal = el('msg-preview-modal');
    const frame = el('msg-preview-modal-frame');
    const preview = el('msg-email-preview');
    if (!modal || !frame || !preview) return;
    frame.innerHTML = preview.innerHTML;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closePreviewModal() {
    const modal = el('msg-preview-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function bind() {
    document.querySelectorAll('#nr-messaging-campaigns-mount input,#nr-messaging-campaigns-mount textarea,#nr-messaging-campaigns-mount select').forEach((node) => node.addEventListener('input', updatePreview));
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-tab').forEach((btn) => btn.addEventListener('click', () => switchPane(btn.dataset.msgTab)));
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-analytics-tab').forEach((btn) => btn.addEventListener('click', () => { currentAnalyticsList = btn.dataset.analyticsList || 'sent'; document.querySelectorAll('#nr-messaging-campaigns-mount .msg-analytics-tab').forEach((b)=>b.classList.toggle('active', b===btn)); renderAnalyticsList(); }));
    el('msg-analytics-include-tests')?.addEventListener('change', () => loadAnalytics());
    el('msg-analytics-refresh')?.addEventListener('click', () => loadAnalytics());
    el('msg-copy-code-btn')?.addEventListener('click', () => copyText(el('msg-code-output').value, 'Email HTML copied'));
    el('msg-sample-products')?.addEventListener('click', addSampleProducts);
    el('msg-pick-products')?.addEventListener('click', () => searchProducts().catch((error) => showToast(error.message || 'Product search failed')));
    el('msg-open-test')?.addEventListener('click', () => window.open(testUrl(), '_blank', 'noopener'));
    el('msg-copy-test-url')?.addEventListener('click', () => copyText(testUrl(), 'Test review URL copied'));
    el('msg-save-template')?.addEventListener('click', saveTemplate);
    el('msg-save-email-template')?.addEventListener('click', () => saveCurrentEmailTemplate(false).catch((error)=>showToast(error.message || 'Could not save template')));
    el('msg-save-primary-template')?.addEventListener('click', () => saveCurrentEmailTemplate(true).catch((error)=>showToast(error.message || 'Could not save primary template')));
    el('msg-send-fake-order-email')?.addEventListener('click', () => sendFullFakeOrderEmail().catch((error)=>showToast(error.message || 'Could not send full fake-order email')));
    el('msg-refresh-page-status')?.addEventListener('click', () => loadReviewPageStatus());
    el('msg-page-handle')?.addEventListener('input', () => scheduleReviewPageStatusCheck());
    el('msg-template-modal-close')?.addEventListener('click', closeTemplateModal);
    el('msg-template-cancel')?.addEventListener('click', closeTemplateModal);
    el('msg-template-confirm')?.addEventListener('click', confirmTemplateSave);
    el('msg-add-section')?.addEventListener('click', addEmailSection);
    el('msg-save-module')?.addEventListener('click', saveMessageModule);
    el('msg-clear-module')?.addEventListener('click', clearModuleForm);
    el('msg-module-link-type')?.addEventListener('change', (event)=>{ const input = el('msg-module-button-url'); if (!input) return; if (event.target.value === 'support_modal') { input.value='{{support_link}}'; input.disabled=true; } else { input.disabled=false; if (input.value === '{{support_link}}') input.value=''; } });
    ['msg-module-bg','msg-module-border'].forEach((id)=>{ const input = el(id); if (input) input.addEventListener('click', ()=>openColorChoice(input)); });
    document.querySelectorAll('#nr-messaging-campaigns-mount [data-color-picker-for]').forEach((btn)=>{ const input = el(btn.dataset.colorPickerFor); if (input) btn.addEventListener('click', ()=>openColorChoice(input)); });
    ['msg-color','msg-bg-color','msg-card-color','msg-module-bg','msg-module-border'].forEach((id)=>{ const input = el(id); if (input) input.addEventListener('input', ()=>refreshColorButton(input)); });
    refreshAllColorButtons();
    document.querySelectorAll('#nr-messaging-campaigns-mount [data-add-module-section]').forEach((btn) => btn.addEventListener('click', () => addModuleSection(btn.dataset.addModuleSection)));
    el('msg-add-link-rule')?.addEventListener('click', addLinkRule);
    el('msg-preview-desktop')?.addEventListener('click', () => setPreviewMode('desktop'));
    el('msg-preview-mobile')?.addEventListener('click', () => setPreviewMode('mobile'));
    el('msg-preview-popout')?.addEventListener('click', openPreviewModal);
    el('msg-preview-modal-close')?.addEventListener('click', closePreviewModal);
    el('msg-preview-modal')?.addEventListener('click', (event) => { if (event.target === el('msg-preview-modal')) closePreviewModal(); });
    el('msg-smtp-save')?.addEventListener('click', () => saveEmailSettings().catch((error) => showToast(error.message || 'Could not save email provider')));
    el('msg-provider-profile-save')?.addEventListener('click', () => saveProviderProfile().catch((error) => showToast(error.message || 'Could not save provider profile')));
    el('msg-smtp-remove')?.addEventListener('click', () => removeEmailSettings().catch((error) => showToast(error.message || 'Could not remove email provider')));
    el('msg-send-test-email')?.addEventListener('click', () => sendTestEmail().catch((error) => showToast(error.message || 'Could not send test email')));
  }

  function mount() {
    const mountEl = el('nr-messaging-campaigns-mount');
    if (!mountEl) return;
    injectStyles();
    mountEl.classList.remove('panel');
    mountEl.innerHTML = markup();
    bind();
    addSampleProducts();
    updatePreview();
    refreshAllColorButtons();
    loadTemplates();
    loadEmailTemplates();
    loadMessageModules();
    renderEmailSections();
    loadLinkRules();
    loadShopifyStatus();
    loadEmailSettings();
    loadProviderProfiles();
    loadAnalytics();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
