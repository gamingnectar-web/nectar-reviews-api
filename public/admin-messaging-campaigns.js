/* Nectar Reviews — Messaging & Campaigns v5
   Tabbed campaign builder with secured admin API, per-shop OAuth product search, SMTP settings and test links. */
(function () {
  const DEFAULT_PAGE_HANDLE = 'leave-review';
  const DEFAULT_API = `${window.location.origin}/api`;
  const products = [];
  let productSearchResults = [];

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
      .msg-pane{display:none;}.msg-pane.active{display:block;}.msg-grid{display:grid;grid-template-columns:minmax(320px,420px) minmax(0,1fr);gap:20px;align-items:start;}.msg-stack{display:grid;gap:16px;}.msg-card{background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:20px;box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.08));}.msg-card h3{margin:0 0 5px;font-size:18px;}.msg-card p{margin:0 0 12px;color:#667085;line-height:1.5;}.msg-card label{display:block;margin:13px 0 6px;font-size:13px;font-weight:900;}.msg-card input,.msg-card select,.msg-card textarea{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #cfd5dd;border-radius:10px;padding:10px 12px;font:inherit;background:#fff;}.msg-card textarea{min-height:98px;resize:vertical;}.msg-card input:focus,.msg-card select:focus,.msg-card textarea:focus{outline:none;border-color:var(--blue,#005bd3);box-shadow:0 0 0 3px rgba(0,91,211,.12);}.msg-card input[type=color]{height:44px;padding:4px;}.msg-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}.msg-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}.msg-btn{border:0;border-radius:10px;background:var(--primary,#111827);color:#fff;min-height:42px;padding:10px 15px;font-weight:900;cursor:pointer;}.msg-btn.secondary{background:#fff;color:#111827;border:1px solid var(--border,#e5e7eb);}.msg-btn.full{width:100%;}.msg-help{padding:12px 14px;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#f8fafc;color:#667085;line-height:1.5;font-size:13px;}.msg-preview-card{padding:0;overflow:hidden;}.msg-preview-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--border,#e5e7eb);}.msg-toggle{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--border,#e5e7eb);border-radius:999px;background:#f8fafc;}.msg-toggle button{border:0;border-radius:999px;background:transparent;padding:8px 14px;font-weight:900;cursor:pointer;color:#667085;}.msg-toggle button.active{background:#fff;color:#111827;box-shadow:0 1px 3px rgba(17,24,39,.12);}.msg-preview-stage{display:grid;place-items:center;min-height:360px;background:#f4f6f8;padding:26px;}.msg-preview-wrap{width:100%;max-width:640px;}.msg-preview-wrap.mobile{max-width:390px;border:12px solid #111827;border-radius:30px;overflow:hidden;background:#fff;}.msg-code{width:100%;min-height:220px;border:0;border-top:1px solid var(--border,#e5e7eb);border-radius:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45;}.msg-products{display:grid;gap:10px;margin-top:14px;}.msg-product{display:grid;grid-template-columns:48px 1fr auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#fbfdff;}.msg-product img{width:48px;height:48px;object-fit:cover;border-radius:9px;background:#eef2f7;}.msg-product strong{display:block;font-size:13px;}.msg-product small{display:block;color:#667085;line-height:1.35;}.msg-product button{border:0;background:transparent;color:#d72c0d;font-weight:900;cursor:pointer;}.msg-analytics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}.msg-analytics div{border:1px solid var(--border,#e5e7eb);border-radius:12px;background:#fbfdff;padding:16px;}.msg-analytics span{display:block;font-size:11px;text-transform:uppercase;font-weight:900;color:#667085;}.msg-analytics strong{display:block;margin-top:5px;font-size:26px;letter-spacing:-.05em;}.msg-state{margin-top:12px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid var(--border,#e5e7eb);color:#667085;font-weight:800;}.msg-state.ok{background:#ecfdf3;color:#027a48;border-color:#abefc6;}.msg-state.bad{background:#fff1f3;color:#b42318;border-color:#fecdd6;}
      .flow-product-modal-backdrop{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.56);}.flow-product-modal-backdrop.active{display:flex;}.flow-product-modal{width:min(860px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 28px 90px rgba(15,23,42,.32);border:1px solid var(--border,#e5e7eb);}.flow-product-modal-head{display:flex;justify-content:space-between;gap:16px;padding:22px 24px;border-bottom:1px solid var(--border,#e5e7eb);}.flow-product-modal-head h3{margin:0 0 5px;font-size:20px;}.flow-product-modal-head p{margin:0;color:#667085;}.flow-product-modal-close{border:0;background:#f3f4f6;width:36px;height:36px;border-radius:999px;cursor:pointer;font-weight:900;}.flow-product-search{display:grid;grid-template-columns:1fr auto;gap:10px;padding:18px 24px;border-bottom:1px solid var(--border,#e5e7eb);}.flow-product-search input{min-height:44px;border:1px solid #cfd5dd;border-radius:10px;padding:10px 12px;font:inherit;}.flow-product-search button,.flow-product-modal-actions button{border:0;border-radius:10px;background:#111827;color:#fff;min-height:44px;padding:10px 16px;font-weight:900;cursor:pointer;}.flow-product-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 24px 24px;}.flow-product-modal-actions .secondary{background:#fff;color:#111827;border:1px solid var(--border,#e5e7eb);}.flow-product-results{padding:12px 24px 4px;display:grid;gap:10px;}.flow-product-row{display:grid;grid-template-columns:auto 56px 1fr auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fbfdff;}.flow-product-row img{width:56px;height:56px;object-fit:cover;border-radius:10px;background:#eef2f7;}.flow-product-row strong{display:block;font-size:14px;}.flow-product-row small{color:#667085;}.flow-product-row button{border:1px solid var(--border,#e5e7eb);background:#fff;color:#111827;border-radius:10px;min-height:38px;padding:8px 12px;font-weight:900;cursor:pointer;}.oauth-connect{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:12px;padding:14px;}.oauth-connect a{background:#111827;color:#fff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:900;white-space:nowrap;}
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
            <p>Create the customer email, test the review page, connect delivery, and monitor tracking from four simple tabs.</p>
          </div>
          <div class="msg-flow-card"><span>Recommended flow</span><strong>Order fulfilled → Wait <b id="msg-delay-preview">14</b> days → Send email</strong></div>
        </div>
        <div class="msg-tabs" role="tablist">
          <button type="button" class="msg-tab active" data-msg-tab="builder">Email Builder</button>
          <button type="button" class="msg-tab" data-msg-tab="tester">Review Page Tester</button>
          <button type="button" class="msg-tab" data-msg-tab="delivery">Email Delivery</button>
          <button type="button" class="msg-tab" data-msg-tab="analytics">Analytics</button>
        </div>

        <section id="msg-pane-builder" class="msg-pane active">
          <div class="msg-grid">
            <div class="msg-stack">
              <div class="msg-card"><h3>Brand</h3><p>Keep this simple for Shopify Flow.</p><label>Brand logo URL</label><input id="msg-logo" type="url" placeholder="https://cdn.shopify.com/.../logo.png"><div class="msg-two"><div><label>Button colour</label><input id="msg-color" type="color" value="#111827"></div><div><label>Button radius</label><input id="msg-button-radius" type="number" min="0" max="40" value="8"></div></div><div class="msg-two"><div><label>Email background</label><input id="msg-bg-color" type="color" value="#f3f4f6"></div><div><label>Email card</label><input id="msg-card-color" type="color" value="#ffffff"></div></div></div>
              <div class="msg-card"><h3>Email copy</h3><label>Heading</label><input id="msg-heading" type="text" value="How did we do?"><label>Intro line</label><input id="msg-intro" type="text" value='Hi {{ order.customer.firstName | default: "there" }}'><label>Body</label><textarea id="msg-body">We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?</textarea><label>Sign-off</label><input id="msg-signoff" type="text" value="Your feedback helps other customers make confident choices."></div>
              <div class="msg-card"><h3>Review links</h3><div class="msg-two"><div><label>Link mode</label><select id="msg-link-mode"><option value="both">Order and products</option><option value="order">Order only</option><option value="products">Product buttons only</option></select></div><div><label>Review page handle</label><input id="msg-page-handle" type="text" value="leave-review"></div></div><div class="msg-two"><div><label>Main button text</label><input id="msg-main-button-text" type="text" value="Review Your Order"></div><div><label>Product button text</label><input id="msg-product-button-text" type="text" value="Review This Item"></div></div><div class="msg-two"><div><label>Wait after fulfilment</label><select id="msg-delay-days"><option value="7">7 days</option><option value="10">10 days</option><option value="14" selected>14 days</option><option value="21">21 days</option><option value="30">30 days</option></select></div><div><label>Flow action</label><input value="Send email" readonly></div></div><div class="msg-help">In Shopify Flow, add a Send email action, enable HTML, and paste the generated code.</div></div>
            </div>
            <div class="msg-stack">
              <div class="msg-card msg-preview-card"><div class="msg-preview-head"><div><h3>Customer email preview</h3><p>This is what the test email will look like. The Shopify Flow code is below.</p></div><div class="msg-toggle"><button type="button" id="msg-preview-desktop" class="active" data-preview="desktop">Desktop</button><button type="button" id="msg-preview-mobile" data-preview="mobile">Mobile</button></div></div><div class="msg-preview-stage"><div id="msg-preview-wrap" class="msg-preview-wrap"><div id="msg-email-preview"></div></div></div></div>
              <div class="msg-card" style="padding:0;"><div class="msg-preview-head"><div><h3>Copy Shopify Flow HTML</h3><p>Paste this into Shopify Flow. Test emails use the rendered preview, not raw Liquid.</p></div><button type="button" id="msg-copy-code-btn" class="msg-btn">Copy Code</button></div><textarea id="msg-code-output" class="msg-code" spellcheck="false" readonly></textarea></div>
            </div>
          </div>
        </section>

        <section id="msg-pane-tester" class="msg-pane">
          <div class="msg-grid">
            <div class="msg-card"><h3>Review page tester</h3><p>Open your review page with safe preview data. This does not create a Shopify order.</p><label>Customer name</label><input id="msg-test-name" type="text" value="Alex"><label>Customer email</label><input id="msg-test-email" type="email" value="alex@example.com"><div class="msg-two"><div><label>Order number</label><input id="msg-test-order" type="text" value="1001"></div><div><label>Review mode</label><select id="msg-test-type"><option value="order">Review full order</option><option value="product">Review one product</option></select></div></div><label>How many sample products?</label><input id="msg-test-count" type="number" min="1" max="10" value="2"><div class="msg-actions"><button type="button" id="msg-pick-products" class="msg-btn secondary">Search Products</button><button type="button" id="msg-sample-products" class="msg-btn secondary">Use Sample Products</button></div><div id="msg-products" class="msg-products"></div><div class="msg-actions"><button type="button" id="msg-open-test" class="msg-btn">Open Test Review Page</button><button type="button" id="msg-copy-test-url" class="msg-btn secondary">Copy Test URL</button></div></div>
            <div class="msg-card"><h3>How product search works</h3><p>Product search uses the per-shop OAuth token saved when the merchant installs the app. No global Render access token is needed.</p><div id="msg-shopify-status" class="msg-help">Checking Shopify product connection...</div></div>
          </div>
        </section>

        <section id="msg-pane-delivery" class="msg-pane">
          <div class="msg-grid">
            <div class="msg-card"><h3>Email provider</h3><p>Optional SMTP setup for test sending and later automation.</p><div class="msg-two"><div><label>Provider</label><select id="msg-smtp-provider"><option value="smtp">SMTP / app password</option><option value="gmail">Gmail app password</option><option value="outlook">Outlook SMTP</option></select></div><div><label>Enabled</label><select id="msg-smtp-enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></div></div><label>SMTP host</label><input id="msg-smtp-host" type="text" placeholder="smtp.gmail.com"><div class="msg-two"><div><label>Port</label><input id="msg-smtp-port" type="number" value="587"></div><div><label>Security</label><select id="msg-smtp-secure"><option value="starttls">STARTTLS</option><option value="ssl">SSL / 465</option><option value="none">None</option></select></div></div><label>SMTP username</label><input id="msg-smtp-user" type="text" autocomplete="username"><label>SMTP password / app password <span class="muted">leave blank to keep saved</span></label><input id="msg-smtp-pass" type="password" autocomplete="new-password"><div class="msg-two"><div><label>From name</label><input id="msg-smtp-from-name" type="text" value="Nectar Reviews"></div><div><label>From email</label><input id="msg-smtp-from-email" type="email"></div></div><label>Reply-to email</label><input id="msg-smtp-reply-to" type="email"><div id="msg-smtp-state" class="msg-state">Loading email settings...</div><div class="msg-actions"><button type="button" id="msg-smtp-save" class="msg-btn">Save Email Provider</button><button type="button" id="msg-smtp-remove" class="msg-btn secondary">Remove Provider</button></div></div>
            <div class="msg-card"><h3>Send test email</h3><p>This sends the same customer-friendly test email shown in the live preview, with tracking added automatically.</p><label>Send test to</label><input id="msg-test-recipient" type="email" placeholder="you@example.com"><div class="msg-actions"><button type="button" id="msg-send-test-email" class="msg-btn">Send Test Email</button></div><div class="msg-help">You must save a working email provider before test sending.</div></div>
          </div>
        </section>

        <section id="msg-pane-analytics" class="msg-pane">
          <div class="msg-card"><h3>Campaign analytics</h3><p>Open/click tracking totals from the secured API.</p><div id="msg-analytics" class="msg-analytics"><div><span>Sent</span><strong>0</strong></div><div><span>Open rate</span><strong>0%</strong></div><div><span>Click rate</span><strong>0%</strong></div></div></div>
        </section>
      </div>`;
  }

  function opts() {
    const pageHandle = cleanHandle(val('msg-page-handle', DEFAULT_PAGE_HANDLE));
    return {
      logo: val('msg-logo', ''),
      accentColor: el('msg-color')?.value || '#111827',
      buttonRadius: Math.max(0, Math.min(40, Number(val('msg-button-radius', '8')) || 8)),
      bgColor: el('msg-bg-color')?.value || '#f3f4f6',
      cardColor: el('msg-card-color')?.value || '#ffffff',
      heading: val('msg-heading', 'How did we do?'),
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

  function buildEmailShell(o, inner, footerExtra = '') {
    const logoHtml = o.logo ? `<tr><td align="center" style="padding:0 0 18px 0;"><img src="${escapeHtml(o.logo)}" alt="" style="max-width:160px;height:auto;display:block;"></td></tr>` : '';
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${o.bgColor};margin:0;padding:0;width:100%;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:${o.cardColor};border-radius:16px;overflow:hidden;"><tr><td style="padding:34px 26px;font-family:Arial,Helvetica,sans-serif;text-align:center;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${logoHtml}<tr><td align="center" style="padding:0 0 12px 0;"><h1 style="margin:0;color:#111827;font-size:28px;line-height:1.25;font-weight:700;">${escapeHtml(o.heading)}</h1></td></tr><tr><td align="center" style="padding:0 0 10px 0;"><p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">${o.intro}</p></td></tr><tr><td align="center" style="padding:0 0 12px 0;"><p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">${escapeHtml(o.body)}</p></td></tr>${inner}<tr><td align="center" style="padding:24px 0 0 0;"><p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">${escapeHtml(o.signoff)}</p></td></tr><tr><td align="center" style="padding:20px 0 0 0;"><p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">${escapeHtml(o.footerLabel || 'Sent by {{ shop.name }}.')} </p></td></tr>${footerExtra}</table></td></tr></table></td></tr></table>`;
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
    return buildEmailShell(o, links, pixel);
  }

  function buildRenderedTestEmailHtml(o) {
    const orderId = val('msg-test-order', '1001');
    const email = val('msg-test-recipient') || val('msg-test-email', 'alex@example.com');
    const token = `test-${Date.now()}`;
    const starColor = '#f5b301';
    const safeProducts = products.length ? products : [{ id: 'sample-product-1', title: 'Sample Product 1', image: '', variantId: '', quantity: 1, tags: [] }];
    const orderUrl = trackingClickUrl(testReviewUrl(o, 'order'), { campaign: 'test_review_request', orderId, email, token });
    const orderButton = `<tr><td align="center" style="padding:18px 0 14px 0;"><a href="${orderUrl}" style="display:inline-block;background:${o.accentColor};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 24px;border-radius:${o.buttonRadius}px;">${escapeHtml(o.mainButtonText)}</a></td></tr>`;
    const productRows = `<tr><td style="padding:18px 0 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${safeProducts.map((product) => {
      const url = trackingClickUrl(testReviewUrl(o, 'product', product), { campaign: 'test_review_request', orderId, email, itemId: product.id, token });
      const img = product.image ? `<img src="${escapeHtml(product.image)}" width="58" height="58" alt="" style="display:block;width:58px;height:58px;object-fit:cover;border-radius:10px;background:#eef2f7;border:0;">` : `<div style="width:58px;height:58px;border-radius:10px;background:#eef2f7;"></div>`;
      return `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="58" style="padding-right:12px;vertical-align:middle;">${img}</td><td style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;font-weight:bold;line-height:1.35;vertical-align:middle;padding-right:12px;">${escapeHtml(product.title || 'Product')}<div style="font-size:12px;color:#667085;font-weight:normal;margin-top:3px;">Product ID: ${escapeHtml(product.id || '')}</div></td><td align="right" style="vertical-align:middle;white-space:nowrap;"><div style="margin-bottom:8px;">${productStars(starColor)}</div><a href="${url}" style="display:inline-block;background:${o.accentColor};color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:9px 13px;border-radius:${o.buttonRadius}px;white-space:nowrap;">${escapeHtml(o.productButtonText)}</a></td></tr></table></td></tr>`;
    }).join('')}</table></td></tr>`;
    const links = o.linkMode === 'order' ? orderButton : o.linkMode === 'products' ? productRows : orderButton + productRows;
    const intro = o.intro.replace(/\{\{[^}]+\}\}/g, escapeHtml(val('msg-test-name', 'Alex')));
    const testOpts = { ...o, intro, footerLabel: `Sent by ${getShopDomain()}.` };
    const pixel = `<img src="${trackingOpenPixel({ campaign: 'test_review_request', orderId, email, token })}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;">`;
    return buildEmailShell(testOpts, links, `<tr><td>${pixel}</td></tr>`);
  }

  function updatePreview() {
    const o = opts();
    const previewHtml = buildRenderedTestEmailHtml(o);
    const flowHtml = buildFlowEmailHtml(o);
    if (el('msg-email-preview')) el('msg-email-preview').innerHTML = previewHtml;
    if (el('msg-code-output')) el('msg-code-output').value = flowHtml;
    if (el('msg-delay-preview')) el('msg-delay-preview').textContent = o.delayDays;
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
      const result = await securedFetch(`/admin/products/search?q=${encodeURIComponent(q)}`);
      if (result.unavailable || result.requiresOauth) {
        productSearchResults = [];
        renderProductSearchResults([], result.message || 'Reconnect Shopify to enable product search.', result.installUrl);
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
      if (state) { state.className = `msg-state ${s.enabled && s.smtpPasswordSet ? 'ok' : ''}`; state.textContent = s.enabled && s.smtpPasswordSet ? 'Email provider saved' : 'Email provider not fully configured'; }
    } catch (error) { if (state) { state.className = 'msg-state bad'; state.textContent = error.message || 'Could not load email settings'; } }
  }

  async function saveEmailSettings() {
    const payload = {
      enabled: el('msg-smtp-enabled').value === 'true', provider: val('msg-smtp-provider', 'smtp'), smtpHost: val('msg-smtp-host'), smtpPort: Number(val('msg-smtp-port', '587')), secureMode: val('msg-smtp-secure', 'starttls'), smtpUser: val('msg-smtp-user'), smtpPass: val('msg-smtp-pass'), fromName: val('msg-smtp-from-name', 'Nectar Reviews'), fromEmail: val('msg-smtp-from-email'), replyToEmail: val('msg-smtp-reply-to'),
    };
    await securedFetch('/admin/email-settings', { method: 'PATCH', body: JSON.stringify(payload) });
    el('msg-smtp-pass').value = '';
    await loadEmailSettings();
    showToast('Email provider saved');
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
    const html = buildRenderedTestEmailHtml(o);
    const first = products[0] || {};
    await securedFetch('/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({
        to,
        subject: 'Review request test email',
        html,
        orderId: val('msg-test-order', '1001'),
        itemId: first.id || '',
        token: `test-${Date.now()}`,
      }),
    });
    showToast('Test email sent');
    await loadAnalytics();
  }

  async function loadAnalytics() {
    try {
      const a = await securedFetch('/admin/campaign-analytics');
      const box = el('msg-analytics');
      if (box) box.innerHTML = `<div><span>Sent</span><strong>${Number(a.totals?.sent || 0)}</strong></div><div><span>Open rate</span><strong>${Number(a.openRate || 0)}%</strong></div><div><span>Click rate</span><strong>${Number(a.clickRate || 0)}%</strong></div>`;
    } catch (error) { console.warn('Campaign analytics unavailable:', error); }
  }

  function switchPane(name) {
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-tab').forEach((b) => b.classList.toggle('active', b.dataset.msgTab === name));
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-pane').forEach((p) => p.classList.toggle('active', p.id === `msg-pane-${name}`));
  }

  function setPreviewMode(mode) {
    el('msg-preview-desktop')?.classList.toggle('active', mode === 'desktop');
    el('msg-preview-mobile')?.classList.toggle('active', mode === 'mobile');
    el('msg-preview-wrap')?.classList.toggle('mobile', mode === 'mobile');
  }

  function bind() {
    document.querySelectorAll('#nr-messaging-campaigns-mount input,#nr-messaging-campaigns-mount textarea,#nr-messaging-campaigns-mount select').forEach((node) => node.addEventListener('input', updatePreview));
    document.querySelectorAll('#nr-messaging-campaigns-mount .msg-tab').forEach((btn) => btn.addEventListener('click', () => switchPane(btn.dataset.msgTab)));
    el('msg-copy-code-btn')?.addEventListener('click', () => copyText(el('msg-code-output').value, 'Email HTML copied'));
    el('msg-sample-products')?.addEventListener('click', addSampleProducts);
    el('msg-pick-products')?.addEventListener('click', () => searchProducts().catch((error) => showToast(error.message || 'Product search failed')));
    el('msg-open-test')?.addEventListener('click', () => window.open(testUrl(), '_blank', 'noopener'));
    el('msg-copy-test-url')?.addEventListener('click', () => copyText(testUrl(), 'Test review URL copied'));
    el('msg-preview-desktop')?.addEventListener('click', () => setPreviewMode('desktop'));
    el('msg-preview-mobile')?.addEventListener('click', () => setPreviewMode('mobile'));
    el('msg-smtp-save')?.addEventListener('click', () => saveEmailSettings().catch((error) => showToast(error.message || 'Could not save email provider')));
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
    loadShopifyStatus();
    loadEmailSettings();
    loadAnalytics();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
