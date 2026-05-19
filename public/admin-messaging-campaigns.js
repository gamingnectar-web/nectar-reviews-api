/* Nectar Reviews — Messaging & Campaigns
   Restores the Flow email builder/test tools while using the secured admin API. */
(function () {
  const DEFAULT_PAGE_HANDLE = 'leave-review';
  const DEFAULT_API = `${window.location.origin}/api`;

  function getShopDomain() {
    const params = new URLSearchParams(window.location.search);
    return window.SHOP_DOMAIN || params.get('shop') || params.get('shopDomain') || 'your-dev-store.myshopify.com';
  }

  function apiPath(path) {
    const shop = encodeURIComponent(getShopDomain());
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}shopDomain=${shop}`;
  }

  async function securedFetch(path, options = {}) {
    if (typeof window.adminFetch === 'function') return window.adminFetch(path, options);
    const secret = sessionStorage.getItem('nectar_admin_secret') || '';
    const headers = { 'Content-Type': 'application/json', 'X-Shop-Domain': getShopDomain(), ...(options.headers || {}) };
    if (secret) headers['X-Nectar-Admin-Secret'] = secret;
    const res = await fetch(`${DEFAULT_API}${apiPath(path)}`, { ...options, headers });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try { const json = await res.json(); message = json.error || json.detail || message; } catch (_) {}
      throw new Error(message);
    }
    return res.json();
  }

  function showToast(message) {
    if (typeof window.showToast === 'function') return window.showToast(message);
    if (window.shopify && window.shopify.toast) return window.shopify.toast.show(message);
    alert(message);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function injectStyles() {
    if (document.getElementById('nr-messaging-campaigns-styles')) return;
    const style = document.createElement('style');
    style.id = 'nr-messaging-campaigns-styles';
    style.innerHTML = `
      .flow-builder-shell { width:100%; }
      .flow-builder-header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:24px; }
      .flow-kicker { margin:0 0 6px; color:var(--blue,#005bd3); font-size:12px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
      .flow-builder-header h2 { margin:0; font-size:30px; letter-spacing:-.04em; color:var(--primary,#111827); }
      .flow-subtext { margin:8px 0 0; max-width:760px; color:var(--text-light,#6b7280); font-size:15px; line-height:1.6; }
      .flow-status-card { min-width:260px; padding:14px 16px; border:1px solid var(--border,#e5e7eb); border-radius:14px; background:#fff; box-shadow:0 1px 3px rgba(17,24,39,.06); }
      .flow-status-card span { display:block; margin-bottom:4px; color:var(--text-light,#6b7280); font-size:12px; font-weight:800; text-transform:uppercase; }
      .flow-status-card strong { display:block; color:var(--primary,#111827); font-size:13px; line-height:1.5; }
      .flow-builder-grid { display:grid; grid-template-columns:minmax(320px,430px) minmax(0,1fr); gap:24px; align-items:start; }
      .flow-controls,.flow-preview-column { display:grid; gap:18px; }
      .flow-panel,.flow-preview-card,.flow-code-card { background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:16px; box-shadow:0 1px 3px rgba(17,24,39,.06); }
      .flow-panel { padding:22px; }
      .flow-panel-title { display:flex; align-items:flex-start; gap:12px; margin-bottom:18px; }
      .flow-panel-title span { width:30px; height:30px; flex:0 0 30px; display:grid; place-items:center; border-radius:999px; background:var(--primary,#111827); color:#fff; font-size:13px; font-weight:900; }
      .flow-panel-title h3,.flow-preview-toolbar h3,.flow-code-header h3 { margin:0; font-size:18px; color:var(--primary,#111827); }
      .flow-panel-title p,.flow-preview-toolbar p,.flow-code-header p { margin:4px 0 0; color:var(--text-light,#6b7280); font-size:13px; line-height:1.5; }
      .flow-panel label { display:block; margin:14px 0 6px; color:var(--primary,#111827); font-size:13px; font-weight:800; }
      .flow-panel label em { color:var(--text-light,#6b7280); font-style:normal; font-weight:600; }
      .flow-panel input,.flow-panel select,.flow-panel textarea { width:100%; box-sizing:border-box; border:1px solid #cfd5dd; border-radius:10px; background:#fff; color:var(--primary,#111827); padding:11px 12px; font-size:14px; font-family:inherit; outline:none; }
      .flow-panel input:focus,.flow-panel select:focus,.flow-panel textarea:focus,#flow-code-output:focus { border-color:var(--blue,#005bd3); box-shadow:0 0 0 3px rgba(0,91,211,.12); }
      .flow-panel input[type="color"] { height:44px; padding:4px; cursor:pointer; }
      .flow-panel textarea { min-height:94px; resize:vertical; line-height:1.5; }
      .flow-two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .flow-help-box { margin-top:16px; padding:12px; border:1px solid var(--border,#e5e7eb); border-radius:12px; background:#f9fafb; color:var(--text-light,#6b7280); font-size:13px; line-height:1.5; }
      .flow-steps { display:grid; gap:8px; margin-top:16px; }
      .flow-steps div { display:flex; justify-content:space-between; gap:16px; padding:10px 12px; border:1px solid var(--border,#e5e7eb); border-radius:10px; background:#fbfdff; }
      .flow-steps strong { font-size:12px; text-transform:uppercase; color:var(--text-light,#6b7280); }
      .flow-steps span { font-size:13px; font-weight:800; color:var(--primary,#111827); }
      .review-test-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
      .review-test-actions button,.review-test-main-btn,.review-test-copy-btn,.flow-code-header button,.flow-provider-actions button { border:0; border-radius:10px; background:var(--primary,#111827); color:#fff; min-height:42px; padding:10px 14px; font-weight:900; cursor:pointer; }
      .review-test-actions button,.review-test-copy-btn,.flow-provider-actions .secondary { background:#fff; color:var(--primary,#111827); border:1px solid var(--border,#e5e7eb); }
      .review-test-main-btn,.review-test-copy-btn { width:100%; margin-top:12px; }
      .review-test-products { display:grid; gap:10px; margin-top:14px; }
      .review-test-product { display:grid; grid-template-columns:46px 1fr auto; gap:10px; align-items:center; padding:10px; border:1px solid var(--border,#e5e7eb); border-radius:12px; background:#fbfdff; }
      .review-test-product img { width:46px; height:46px; object-fit:cover; border-radius:8px; background:#eef2f7; }
      .review-test-product strong { display:block; font-size:13px; }
      .review-test-product small { color:var(--text-light,#6b7280); }
      .review-test-product button { border:0; background:transparent; color:#d72c0d; cursor:pointer; font-weight:900; }
      .flow-preview-card { overflow:hidden; }
      .flow-preview-toolbar,.flow-code-header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 20px; border-bottom:1px solid var(--border,#e5e7eb); }
      .flow-preview-toggle { display:inline-flex; padding:4px; border:1px solid var(--border,#e5e7eb); border-radius:999px; background:#f9fafb; }
      .flow-preview-toggle button { border:0; border-radius:999px; padding:8px 12px; background:transparent; font-weight:900; cursor:pointer; color:var(--text-light,#6b7280); }
      .flow-preview-toggle button.active { background:#fff; color:var(--primary,#111827); box-shadow:0 1px 3px rgba(17,24,39,.08); }
      .flow-preview-stage { padding:24px; background:#f4f6f8; overflow:auto; }
      .flow-preview-wrap { max-width:720px; margin:0 auto; transition:max-width .2s ease; }
      .flow-preview-wrap.mobile { max-width:390px; border:10px solid #111; border-radius:30px; overflow:hidden; }
      #flow-email-preview { background:#fff; min-height:260px; }
      #flow-code-output { width:100%; min-height:240px; border:0; padding:18px 20px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; line-height:1.5; resize:vertical; color:#111827; background:#fff; }
      .flow-provider-state { display:inline-flex; align-items:center; gap:8px; margin-top:10px; padding:8px 10px; border-radius:999px; background:#f3f4f6; color:#374151; font-size:12px; font-weight:900; }
      .flow-provider-state.ok { background:#dcfce7; color:#047857; }
      .flow-provider-state.bad { background:#fff1f2; color:#be123c; }
      .flow-provider-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
      .flow-analytics-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:14px; }
      .flow-analytics-grid div { padding:12px; border:1px solid var(--border,#e5e7eb); border-radius:12px; background:#fbfdff; }
      .flow-analytics-grid span { display:block; color:var(--text-light,#6b7280); font-size:11px; font-weight:900; text-transform:uppercase; }
      .flow-analytics-grid strong { display:block; margin-top:5px; font-size:24px; letter-spacing:-.04em; }
      @media (max-width:1100px){ .flow-builder-header,.flow-preview-toolbar,.flow-code-header{flex-direction:column;align-items:stretch;} .flow-status-card{min-width:0;} .flow-builder-grid{grid-template-columns:1fr;} }
      @media (max-width:640px){ .flow-two-col,.review-test-actions,.flow-analytics-grid{grid-template-columns:1fr;} .flow-preview-stage{padding:14px;} .flow-preview-toggle,.flow-code-header button{width:100%;} .flow-preview-toggle button{flex:1;} }
    `;
    document.head.appendChild(style);
  }

  function markup() {
    return `
      <div class="flow-builder-shell">
        <div class="flow-builder-header">
          <div>
            <p class="flow-kicker">Email campaigns</p>
            <h2>Shopify Flow Review Request</h2>
            <p class="flow-subtext">Build a mobile-friendly review request email. Customers can review the whole order, each purchased item, or both. This keeps the existing campaign workflow but runs through the secured API.</p>
          </div>
          <div class="flow-status-card"><span>Recommended Flow</span><strong>Order fulfilled → Wait <b id="flow-delay-preview">14</b> days → Send email</strong></div>
        </div>
        <div class="flow-builder-grid">
          <div class="flow-controls">
            <section class="flow-panel">
              <div class="flow-panel-title"><span>1</span><div><h3>Brand</h3><p>Control the key visual details without overcomplicating setup.</p></div></div>
              <label for="flow-logo">Brand logo URL <em>optional</em></label><input id="flow-logo" type="url" placeholder="https://cdn.shopify.com/.../logo.png">
              <div class="flow-two-col"><div><label for="flow-color">Button colour</label><input id="flow-color" type="color" value="#111827"></div><div><label for="flow-button-radius">Button radius</label><input id="flow-button-radius" type="number" min="0" max="40" value="8"></div></div>
              <div class="flow-two-col"><div><label for="flow-bg-color">Email background</label><input id="flow-bg-color" type="color" value="#f3f4f6"></div><div><label for="flow-card-color">Email card</label><input id="flow-card-color" type="color" value="#ffffff"></div></div>
            </section>
            <section class="flow-panel">
              <div class="flow-panel-title"><span>2</span><div><h3>Email copy</h3><p>Simple editable copy for merchants.</p></div></div>
              <label for="flow-heading">Heading</label><input id="flow-heading" type="text" value="How did we do?">
              <label for="flow-intro">Intro line</label><input id="flow-intro" type="text" value='Hi {{ order.customer.firstName | default: "there" }}'>
              <label for="flow-body">Body</label><textarea id="flow-body">We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?</textarea>
              <label for="flow-signoff">Sign-off</label><input id="flow-signoff" type="text" value="Your feedback helps other customers make confident choices.">
            </section>
            <section class="flow-panel">
              <div class="flow-panel-title"><span>3</span><div><h3>Review links</h3><p>Choose whether the email links to order-level review, product-level review, or both.</p></div></div>
              <label for="flow-link-mode">Link mode</label><select id="flow-link-mode"><option value="both">Order and products</option><option value="order">Order only</option><option value="products">Product buttons only</option></select>
              <div class="flow-two-col"><div><label for="flow-main-button-text">Main button text</label><input id="flow-main-button-text" type="text" value="Review Your Order"></div><div><label for="flow-product-button-text">Product button text</label><input id="flow-product-button-text" type="text" value="Review This Item"></div></div>
              <label for="flow-page-handle">Review page handle</label><input id="flow-page-handle" type="text" value="leave-review">
              <div class="flow-help-box">Install your review page at <code>/pages/<span id="flow-page-preview">leave-review</span></code>. The links pass customer, order, product, variant, image and quantity context.</div>
            </section>
            <section class="flow-panel">
              <div class="flow-panel-title"><span>4</span><div><h3>Flow timing</h3><p>Use this as your Shopify Flow checklist.</p></div></div>
              <label for="flow-delay-days">Recommended wait after fulfilment</label><select id="flow-delay-days"><option value="7">7 days</option><option value="10">10 days</option><option value="14" selected>14 days</option><option value="21">21 days</option><option value="30">30 days</option></select>
              <div class="flow-steps"><div><strong>Trigger</strong><span>Order fulfilled</span></div><div><strong>Wait</strong><span><b id="flow-delay-copy-preview">14</b> days</span></div><div><strong>Action</strong><span>Send email</span></div></div>
            </section>
            <section class="flow-panel">
              <div class="flow-panel-title"><span>5</span><div><h3>Review page tester</h3><p>Open your review page with safe preview data. This does not create a Shopify order.</p></div></div>
              <label for="review-test-name">Customer name</label><input id="review-test-name" type="text" value="Alex">
              <label for="review-test-email">Customer email</label><input id="review-test-email" type="email" value="alex@example.com">
              <div class="flow-two-col"><div><label for="review-test-order">Order number</label><input id="review-test-order" type="text" value="1001"></div><div><label for="review-test-type">Review mode</label><select id="review-test-type"><option value="order">Review full order</option><option value="product">Review one product</option></select></div></div>
              <label for="review-test-count">How many sample products?</label><input id="review-test-count" type="number" min="1" max="10" value="2">
              <div class="flow-help-box">Select real products with the Shopify search, or generate sample products to test the page quickly.</div>
              <div class="review-test-actions"><button type="button" id="review-test-pick-products">Search Products</button><button type="button" id="review-test-sample-products">Use Sample Products</button></div>
              <div id="review-test-products" class="review-test-products"></div>
              <button type="button" id="review-test-open" class="review-test-main-btn">Open Test Review Page</button>
              <button type="button" id="review-test-copy-url" class="review-test-copy-btn">Copy Test URL</button>
            </section>
            <section class="flow-panel">
              <div class="flow-panel-title"><span>6</span><div><h3>Email delivery</h3><p>Optional SMTP setup for test sending and later campaign automation.</p></div></div>
              <div class="flow-two-col"><div><label for="smtp-provider">Provider</label><select id="smtp-provider"><option value="smtp">SMTP / app password</option><option value="gmail">Gmail app password</option><option value="outlook">Outlook SMTP</option></select></div><div><label for="smtp-enabled">Enabled</label><select id="smtp-enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></div></div>
              <label for="smtp-host">SMTP host</label><input id="smtp-host" type="text" placeholder="smtp.gmail.com">
              <div class="flow-two-col"><div><label for="smtp-port">Port</label><input id="smtp-port" type="number" value="587"></div><div><label for="smtp-secure">Security</label><select id="smtp-secure"><option value="starttls">STARTTLS</option><option value="ssl">SSL / 465</option><option value="none">None</option></select></div></div>
              <label for="smtp-user">SMTP username</label><input id="smtp-user" type="text" autocomplete="username">
              <label for="smtp-pass">SMTP password / app password <em>leave blank to keep saved password</em></label><input id="smtp-pass" type="password" autocomplete="new-password">
              <div class="flow-two-col"><div><label for="smtp-from-name">From name</label><input id="smtp-from-name" type="text" value="Nectar Reviews"></div><div><label for="smtp-from-email">From email</label><input id="smtp-from-email" type="email"></div></div>
              <label for="smtp-reply-to">Reply-to email</label><input id="smtp-reply-to" type="email">
              <div id="smtp-state" class="flow-provider-state">Loading email settings...</div>
              <div class="flow-provider-actions"><button type="button" id="smtp-save">Save Email Provider</button><button type="button" id="smtp-remove" class="secondary">Remove Provider</button></div>
              <label for="flow-test-recipient">Send test to</label><input id="flow-test-recipient" type="email" placeholder="you@example.com">
              <div class="flow-provider-actions"><button type="button" id="flow-send-test-email">Send Test Email</button></div>
            </section>
          </div>
          <div class="flow-preview-column">
            <section class="flow-preview-card">
              <div class="flow-preview-toolbar"><div><h3>Live email preview</h3><p>Preview how the email looks before copying it into Shopify Flow.</p></div><div class="flow-preview-toggle"><button type="button" id="flow-preview-desktop" class="active" data-flow-preview-mode="desktop">Desktop</button><button type="button" id="flow-preview-mobile" data-flow-preview-mode="mobile">Mobile</button></div></div>
              <div class="flow-preview-stage"><div id="flow-preview-wrap" class="flow-preview-wrap"><div id="flow-email-preview"></div></div></div>
            </section>
            <section class="flow-code-card"><div class="flow-code-header"><div><h3>Copy email HTML</h3><p>In Shopify Flow, add a Send email action, enable HTML, and paste this code into the body.</p></div><button type="button" id="flow-copy-code-btn">Copy Code</button></div><textarea id="flow-code-output" spellcheck="false" readonly></textarea></section>
            <section class="flow-panel"><div class="flow-panel-title"><span>7</span><div><h3>Campaign analytics</h3><p>Open/click tracking totals from the secured API.</p></div></div><div id="flow-analytics" class="flow-analytics-grid"><div><span>Sent</span><strong>0</strong></div><div><span>Open rate</span><strong>0%</strong></div><div><span>Click rate</span><strong>0%</strong></div></div></section>
          </div>
        </div>
      </div>`;
  }

  function val(id, fallback) {
    const el = document.getElementById(id);
    return el ? ((el.value || '').trim() || fallback) : fallback;
  }

  function opts() {
    return {
      logo: val('flow-logo', ''),
      accentColor: val('flow-color', '#111827'),
      bgColor: val('flow-bg-color', '#f3f4f6'),
      cardColor: val('flow-card-color', '#ffffff'),
      buttonRadius: Math.max(0, Math.min(40, parseInt(val('flow-button-radius', '8'), 10) || 8)),
      heading: val('flow-heading', 'How did we do?'),
      intro: val('flow-intro', 'Hi {{ order.customer.firstName | default: "there" }}'),
      body: val('flow-body', "We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?"),
      signoff: val('flow-signoff', 'Your feedback helps other customers make confident choices.'),
      linkMode: val('flow-link-mode', 'both'),
      mainButtonText: val('flow-main-button-text', 'Review Your Order'),
      productButtonText: val('flow-product-button-text', 'Review This Item'),
      pageHandle: cleanHandle(val('flow-page-handle', DEFAULT_PAGE_HANDLE)),
      delayDays: val('flow-delay-days', '14'),
    };
  }

  function buildEmailHtml(options) {
    const base = shopUrl();
    const logoHtml = options.logo ? `<tr><td align="center" style="padding:0 0 20px 0;"><img src="${escapeHtml(options.logo)}" alt="{{ shop.name }}" style="max-width:160px; height:auto; display:block;"></td></tr>` : '';
    const orderUrl = `${base}/pages/${options.pageHandle}?review_type=order&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}&customer={{ order.customer.firstName | url_encode }}`;
    const orderButton = `<tr><td align="center" style="padding:22px 0 10px 0;"><a href="${orderUrl}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:16px; font-weight:bold; padding:14px 22px; border-radius:${options.buttonRadius}px; line-height:1.2;">${escapeHtml(options.mainButtonText)}</a></td></tr>`;
    const productButtons = `<tr><td style="padding:18px 0 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">{% for line_item in order.lineItems %}<tr><td style="padding:12px; border:1px solid #e5e7eb; border-radius:12px; background:#ffffff;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:14px; font-weight:bold; padding-right:12px;">{{ line_item.title }}</td><td align="right"><a href="${base}/pages/${options.pageHandle}?review_type=product&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}&product_id={{ line_item.product.id }}&variant_id={{ line_item.variant.id }}&product_title={{ line_item.title | url_encode }}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; padding:10px 16px; border-radius:${options.buttonRadius}px; line-height:1.2; white-space:nowrap;">${escapeHtml(options.productButtonText)}</a></td></tr></table></td></tr>{% endfor %}</table></td></tr>`;
    const links = options.linkMode === 'order' ? orderButton : options.linkMode === 'products' ? productButtons : orderButton + productButtons;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${options.bgColor}; margin:0; padding:0; width:100%;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background:${options.cardColor}; border-radius:12px; overflow:hidden;"><tr><td style="padding:32px 24px; font-family:Arial, Helvetica, sans-serif; text-align:center;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${logoHtml}<tr><td align="center" style="padding:0 0 12px 0;"><h1 style="margin:0; color:#111827; font-size:26px; line-height:1.25; font-weight:700;">${escapeHtml(options.heading)}</h1></td></tr><tr><td align="center" style="padding:0 0 10px 0;"><p style="margin:0; color:#4b5563; font-size:16px; line-height:1.6;">${options.intro}</p></td></tr><tr><td align="center" style="padding:0 0 8px 0;"><p style="margin:0; color:#4b5563; font-size:16px; line-height:1.6;">${escapeHtml(options.body)}</p></td></tr>${links}<tr><td align="center" style="padding:24px 0 0 0;"><p style="margin:0; color:#6b7280; font-size:13px; line-height:1.5;">${escapeHtml(options.signoff)}</p></td></tr><tr><td align="center" style="padding:20px 0 0 0;"><p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.5;">Sent by {{ shop.name }}.</p></td></tr></table></td></tr></table></td></tr></table>`.trim();
  }

  const products = [];

  function updateProductList() {
    const box = document.getElementById('review-test-products');
    if (!box) return;
    box.innerHTML = products.length ? products.map((p, i) => `<div class="review-test-product"><img src="${escapeHtml(p.image || '')}" alt=""><div><strong>${escapeHtml(p.title)}</strong><small>Product ID: ${escapeHtml(p.id)}${p.variantId ? ` · Variant: ${escapeHtml(p.variantId)}` : ''}</small></div><button type="button" data-remove-product="${i}">×</button></div>`).join('') : '<div class="flow-help-box">No products selected yet.</div>';
    box.querySelectorAll('[data-remove-product]').forEach((btn) => btn.addEventListener('click', () => { products.splice(Number(btn.dataset.removeProduct), 1); updateProductList(); }));
  }

  function addSampleProducts() {
    products.splice(0, products.length);
    const count = Math.max(1, Math.min(10, parseInt(val('review-test-count', '2'), 10) || 2));
    for (let i = 1; i <= count; i += 1) {
      products.push({ id: `sample-product-${i}`, variantId: `sample-variant-${i}`, title: `Sample Product ${i}`, image: '', quantity: 1 });
    }
    updateProductList();
  }

  async function searchProducts() {
    const q = prompt('Search Shopify products by title or ID');
    if (!q) return;
    const result = await securedFetch(`/admin/products/search?q=${encodeURIComponent(q)}`);
    const found = result.products || [];
    if (!found.length) return showToast('No products found');
    products.push(found[0]);
    updateProductList();
    showToast(`Added ${found[0].title}`);
  }

  function testUrl() {
    const o = opts();
    const params = new URLSearchParams();
    params.set('test', '1');
    params.set('review_type', val('review-test-type', 'order'));
    params.set('customer', val('review-test-name', 'Alex'));
    params.set('email', val('review-test-email', 'alex@example.com'));
    params.set('order', val('review-test-order', '1001'));
    params.set('shop', getShopDomain());
    if (products.length) {
      params.set('products', JSON.stringify(products.map((p) => ({ id: p.id, variantId: p.variantId, title: p.title, image: p.image, quantity: p.quantity || 1 }))));
      params.set('product_id', products[0].id || '');
      params.set('variant_id', products[0].variantId || '');
      params.set('product_title', products[0].title || '');
    }
    return `${shopUrl()}/pages/${o.pageHandle}?${params.toString()}`;
  }

  function updatePreview() {
    const options = opts();
    const html = buildEmailHtml(options);
    const preview = document.getElementById('flow-email-preview');
    const output = document.getElementById('flow-code-output');
    if (preview) preview.innerHTML = html;
    if (output) output.value = html;
    const page = document.getElementById('flow-page-preview');
    if (page) page.textContent = options.pageHandle;
    const d1 = document.getElementById('flow-delay-preview');
    const d2 = document.getElementById('flow-delay-copy-preview');
    if (d1) d1.textContent = options.delayDays;
    if (d2) d2.textContent = options.delayDays;
  }

  async function copyText(text, success) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(success || 'Copied');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(success || 'Copied');
    }
  }

  async function loadEmailSettings() {
    const state = document.getElementById('smtp-state');
    try {
      const s = await securedFetch('/admin/email-settings');
      document.getElementById('smtp-provider').value = s.provider && s.provider !== 'none' ? s.provider : 'smtp';
      document.getElementById('smtp-enabled').value = String(s.enabled !== false);
      document.getElementById('smtp-host').value = s.smtpHost || '';
      document.getElementById('smtp-port').value = s.smtpPort || 587;
      document.getElementById('smtp-secure').value = s.secureMode || 'starttls';
      document.getElementById('smtp-user').value = s.smtpUser || '';
      document.getElementById('smtp-from-name').value = s.fromName || 'Nectar Reviews';
      document.getElementById('smtp-from-email').value = s.fromEmail || '';
      document.getElementById('smtp-reply-to').value = s.replyToEmail || '';
      if (state) {
        state.className = `flow-provider-state ${s.enabled && s.smtpPasswordSet ? 'ok' : ''}`;
        state.textContent = s.enabled && s.smtpPasswordSet ? 'Email provider saved' : 'Email provider not fully configured';
      }
    } catch (error) {
      if (state) { state.className = 'flow-provider-state bad'; state.textContent = error.message || 'Could not load email settings'; }
    }
  }

  async function saveEmailSettings() {
    const payload = {
      enabled: document.getElementById('smtp-enabled').value === 'true',
      provider: val('smtp-provider', 'smtp'),
      smtpHost: val('smtp-host', ''),
      smtpPort: Number(val('smtp-port', '587')),
      secureMode: val('smtp-secure', 'starttls'),
      smtpUser: val('smtp-user', ''),
      smtpPass: val('smtp-pass', ''),
      fromName: val('smtp-from-name', 'Nectar Reviews'),
      fromEmail: val('smtp-from-email', ''),
      replyToEmail: val('smtp-reply-to', ''),
    };
    await securedFetch('/admin/email-settings', { method: 'PATCH', body: JSON.stringify(payload) });
    document.getElementById('smtp-pass').value = '';
    await loadEmailSettings();
    showToast('Email provider saved');
  }

  async function removeEmailSettings() {
    if (!confirm('Remove saved email provider settings for this shop?')) return;
    await securedFetch('/admin/email-settings', { method: 'DELETE' });
    ['smtp-host', 'smtp-user', 'smtp-pass', 'smtp-from-email', 'smtp-reply-to'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    await loadEmailSettings();
    showToast('Email provider removed');
  }

  async function sendTestEmail() {
    const to = val('flow-test-recipient', '');
    if (!to) return showToast('Enter a test recipient email');
    updatePreview();
    await securedFetch('/admin/test-email', { method: 'POST', body: JSON.stringify({ to, subject: 'Review request test email', html: document.getElementById('flow-code-output').value }) });
    showToast('Test email sent');
  }

  async function loadAnalytics() {
    try {
      const a = await securedFetch('/admin/campaign-analytics');
      const el = document.getElementById('flow-analytics');
      if (el) el.innerHTML = `<div><span>Sent</span><strong>${Number(a.totals?.sent || 0)}</strong></div><div><span>Open rate</span><strong>${Number(a.openRate || 0)}%</strong></div><div><span>Click rate</span><strong>${Number(a.clickRate || 0)}%</strong></div>`;
    } catch (error) {
      console.warn('Campaign analytics unavailable:', error);
    }
  }

  function bind() {
    document.querySelectorAll('#nr-messaging-campaigns-mount input, #nr-messaging-campaigns-mount textarea, #nr-messaging-campaigns-mount select').forEach((el) => el.addEventListener('input', updatePreview));
    document.getElementById('flow-copy-code-btn')?.addEventListener('click', () => copyText(document.getElementById('flow-code-output').value, 'Email HTML copied'));
    document.getElementById('review-test-sample-products')?.addEventListener('click', addSampleProducts);
    document.getElementById('review-test-pick-products')?.addEventListener('click', () => searchProducts().catch((error) => showToast(error.message || 'Product search failed')));
    document.getElementById('review-test-open')?.addEventListener('click', () => { window.open(testUrl(), '_blank', 'noopener'); });
    document.getElementById('review-test-copy-url')?.addEventListener('click', () => copyText(testUrl(), 'Test review URL copied'));
    document.getElementById('flow-preview-desktop')?.addEventListener('click', () => setPreviewMode('desktop'));
    document.getElementById('flow-preview-mobile')?.addEventListener('click', () => setPreviewMode('mobile'));
    document.getElementById('smtp-save')?.addEventListener('click', () => saveEmailSettings().catch((error) => showToast(error.message || 'Could not save email provider')));
    document.getElementById('smtp-remove')?.addEventListener('click', () => removeEmailSettings().catch((error) => showToast(error.message || 'Could not remove email provider')));
    document.getElementById('flow-send-test-email')?.addEventListener('click', () => sendTestEmail().catch((error) => showToast(error.message || 'Could not send test email')));
  }

  function setPreviewMode(mode) {
    document.getElementById('flow-preview-desktop')?.classList.toggle('active', mode === 'desktop');
    document.getElementById('flow-preview-mobile')?.classList.toggle('active', mode === 'mobile');
    document.getElementById('flow-preview-wrap')?.classList.toggle('mobile', mode === 'mobile');
  }

  function mount() {
    const el = document.getElementById('nr-messaging-campaigns-mount');
    if (!el) return;
    injectStyles();
    el.classList.remove('panel');
    el.innerHTML = markup();
    bind();
    addSampleProducts();
    updatePreview();
    loadEmailSettings();
    loadAnalytics();
  }

  window.generateFlowCode = function () { updatePreview(); return document.getElementById('flow-code-output')?.value || ''; };
  window.copyFlowCode = function () { return copyText(window.generateFlowCode(), 'Email HTML copied'); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
