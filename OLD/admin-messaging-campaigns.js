/*
  Nectar Reviews — Messaging & Campaigns
  New file name: admin-messaging-campaigns.js

  Add this AFTER your existing admin.js script in admin.html:
  <script src="/admin.js?v=2"></script>
  <script src="/admin-messaging-campaigns.js?v=1"></script>

  This file replaces the existing #v-msg content and overrides the old
  generateFlowCode/copyFlowCode functions with the enhanced email builder.
*/

(function () {
  const DEFAULT_PAGE_HANDLE = 'leave-review';

  function getShopDomain() {
    const params = new URLSearchParams(window.location.search);
    return window.SHOP_DOMAIN || params.get('shop') || 'your-dev-store.myshopify.com';
  }

  function showToast(message) {
    if (window.shopify && window.shopify.toast) {
      window.shopify.toast.show(message);
    }

    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }

    const toast = document.getElementById('custom-toast');
    if (!toast) return;
    toast.innerText = message;
    toast.style.top = '30px';
    setTimeout(() => { toast.style.top = '-100px'; }, 3000);
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

  function injectStyles() {
    if (document.getElementById('nr-messaging-campaigns-styles')) return;

    const style = document.createElement('style');
    style.id = 'nr-messaging-campaigns-styles';
    style.innerHTML = `
      .flow-builder-shell { width: 100%; }
      .flow-builder-header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:24px; }
      .flow-kicker { margin:0 0 6px; color:var(--blue, #005bd3); font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
      .flow-builder-header h2 { margin:0; font-size:30px; letter-spacing:-.04em; color:var(--primary, #1a1a1a); }
      .flow-subtext { margin:8px 0 0; max-width:680px; color:var(--text-light, #6d7175); font-size:15px; line-height:1.6; }
      .flow-status-card { min-width:260px; padding:14px 16px; border:1px solid var(--border, #ebebeb); border-radius:14px; background:#fff; box-shadow:0 1px 3px rgba(17,24,39,.06); }
      .flow-status-card span { display:block; margin-bottom:4px; color:var(--text-light, #6d7175); font-size:12px; font-weight:700; text-transform:uppercase; }
      .flow-status-card strong { display:block; color:var(--primary, #1a1a1a); font-size:13px; line-height:1.5; }
      .flow-builder-grid { display:grid; grid-template-columns:minmax(320px, 420px) minmax(0, 1fr); gap:24px; align-items:start; }
      .flow-controls, .flow-preview-column { display:grid; gap:18px; }
      .flow-panel, .flow-preview-card, .flow-code-card { background:#fff; border:1px solid var(--border, #ebebeb); border-radius:16px; box-shadow:0 1px 3px rgba(17,24,39,.06); }
      .flow-panel { padding:22px; }
      .flow-panel-title { display:flex; align-items:flex-start; gap:12px; margin-bottom:18px; }
      .flow-panel-title span { width:30px; height:30px; flex:0 0 30px; display:grid; place-items:center; border-radius:999px; background:var(--primary, #1a1a1a); color:#fff; font-size:13px; font-weight:800; }
      .flow-panel-title h3, .flow-preview-toolbar h3, .flow-code-header h3 { margin:0; font-size:18px; color:var(--primary, #1a1a1a); }
      .flow-panel-title p, .flow-preview-toolbar p, .flow-code-header p { margin:4px 0 0; color:var(--text-light, #6d7175); font-size:13px; line-height:1.5; }
      .flow-panel label { display:block; margin:14px 0 6px; color:var(--primary, #1a1a1a); font-size:13px; font-weight:750; }
      .flow-panel label em { color:var(--text-light, #6d7175); font-style:normal; font-weight:600; }
      .flow-panel input, .flow-panel select, .flow-panel textarea { width:100%; box-sizing:border-box; border:1px solid #c9cccf; border-radius:10px; background:#fff; color:var(--primary, #1a1a1a); padding:11px 12px; font-size:14px; font-family:inherit; outline:none; }
      .flow-panel input:focus, .flow-panel select:focus, .flow-panel textarea:focus, #flow-code-output:focus { border-color:var(--blue, #005bd3); box-shadow:0 0 0 3px rgba(0,91,211,.12); }
      .flow-panel input[type="color"] { height:44px; padding:4px; cursor:pointer; }
      .flow-panel textarea { min-height:94px; resize:vertical; line-height:1.5; }
      .flow-two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .flow-help-box { margin-top:16px; padding:12px; border:1px solid var(--border, #ebebeb); border-radius:12px; background:#f9fafb; color:var(--text-light, #6d7175); font-size:13px; line-height:1.5; }
      .flow-help-box code { color:var(--primary, #1a1a1a); font-weight:700; }
      .flow-steps { display:grid; gap:8px; margin-top:16px; }
      .flow-steps div { display:flex; justify-content:space-between; gap:12px; padding:11px 12px; border:1px solid var(--border, #ebebeb); border-radius:10px; background:#f9fafb; font-size:13px; }
      .flow-steps span { color:var(--text-light, #6d7175); }
      .flow-preview-toolbar, .flow-code-header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px; border-bottom:1px solid var(--border, #ebebeb); }
      .flow-preview-toggle { display:inline-flex; padding:4px; border:1px solid var(--border, #ebebeb); border-radius:999px; background:#f9fafb; }
      .flow-preview-toggle button { border:0; border-radius:999px; background:transparent; color:var(--text-light, #6d7175); padding:9px 14px; font-weight:750; cursor:pointer; }
      .flow-preview-toggle button.active { background:var(--primary, #1a1a1a); color:#fff; }
      .flow-preview-stage { padding:28px; overflow:auto; background:#f9fafb; border-radius:0 0 16px 16px; }
      .flow-preview-wrap { transition:max-width .25s ease, border .25s ease, border-radius .25s ease; }
      .flow-preview-wrap.mobile { max-width:390px; margin:0 auto; border:12px solid #111827; border-radius:34px; overflow:hidden; background:#fff; }
      #flow-email-preview { min-height:320px; }
      .flow-code-header button { flex:0 0 auto; border:0; border-radius:10px; background:var(--primary, #1a1a1a); color:#fff; padding:12px 16px; font-weight:800; cursor:pointer; }
      #flow-code-output { display:block; width:100%; min-height:390px; box-sizing:border-box; border:0; background:#18181b; color:#fff; padding:18px; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; line-height:1.55; resize:vertical; outline:none; }

      .review-test-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
      .review-test-actions button, .review-test-main-btn, .review-test-copy-btn { border:0; border-radius:10px; background:var(--primary, #1a1a1a); color:#fff; padding:12px 14px; font-weight:800; cursor:pointer; font-family:inherit; }
      .review-test-actions button { background:#f9fafb; color:var(--primary, #1a1a1a); border:1px solid var(--border, #ebebeb); }
      .review-test-main-btn { width:100%; margin-top:16px; }
      .review-test-copy-btn { width:100%; margin-top:10px; background:#f9fafb; color:var(--primary, #1a1a1a); border:1px solid var(--border, #ebebeb); }
      .review-test-products { margin-top:14px; display:grid; gap:8px; }
      .review-test-product { display:grid; grid-template-columns:52px 1fr auto; gap:12px; align-items:center; padding:10px; border:1px solid var(--border, #ebebeb); border-radius:10px; background:#fff; }
      .review-test-product img { width:52px; height:52px; object-fit:cover; border-radius:8px; background:#f3f4f6; border:1px solid var(--border, #ebebeb); }
      .review-test-product strong { display:block; color:var(--primary, #1a1a1a); font-size:13px; line-height:1.3; }
      .review-test-product span { display:block; color:var(--text-light, #6d7175); font-size:12px; margin-top:2px; }
      .review-test-product button { width:30px; height:30px; border-radius:8px; border:1px solid var(--border, #ebebeb); background:#fff; color:#bf0711; cursor:pointer; font-weight:900; }
      .review-test-url { margin-top:12px; width:100%; min-height:72px !important; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; font-size:12px !important; background:#f9fafb !important; }

      @media (max-width:1100px) { .flow-builder-header, .flow-preview-toolbar, .flow-code-header { flex-direction:column; align-items:stretch; } .flow-status-card { min-width:0; } .flow-builder-grid { grid-template-columns:1fr; } }
      @media (max-width:640px) { .flow-two-col, .review-test-actions { grid-template-columns:1fr; } .flow-preview-stage { padding:14px; } .flow-preview-toggle, .flow-code-header button { width:100%; } .flow-preview-toggle button { flex:1; } }
    `;

    document.head.appendChild(style);
  }

  function getBuilderMarkup() {
    return `
      <div class="flow-builder-shell">
        <div class="flow-builder-header">
          <div>
            <p class="flow-kicker">Email campaigns</p>
            <h2>Shopify Flow Review Request</h2>
            <p class="flow-subtext">Build a mobile-friendly review request email. Customers can review the whole order, each purchased item, or both.</p>
          </div>

          <div class="flow-status-card">
            <span>Recommended Flow</span>
            <strong>Order fulfilled → Wait <b id="flow-delay-preview">14</b> days → Send email</strong>
          </div>
        </div>

        <div class="flow-builder-grid">
          <div class="flow-controls">
            <section class="flow-panel">
              <div class="flow-panel-title"><span>1</span><div><h3>Brand</h3><p>Control the key visual details without overcomplicating the setup.</p></div></div>
              <label for="flow-logo">Brand logo URL <em>optional</em></label>
              <input id="flow-logo" type="url" placeholder="https://cdn.shopify.com/.../logo.png">
              <div class="flow-two-col">
                <div><label for="flow-color">Button colour</label><input id="flow-color" type="color" value="#111827"></div>
                <div><label for="flow-button-radius">Button radius</label><input id="flow-button-radius" type="number" min="0" max="40" value="8"></div>
              </div>
              <div class="flow-two-col">
                <div><label for="flow-bg-color">Email background</label><input id="flow-bg-color" type="color" value="#f3f4f6"></div>
                <div><label for="flow-card-color">Email card</label><input id="flow-card-color" type="color" value="#ffffff"></div>
              </div>
            </section>

            <section class="flow-panel">
              <div class="flow-panel-title"><span>2</span><div><h3>Email copy</h3><p>Simple editable copy for merchants.</p></div></div>
              <label for="flow-heading">Heading</label>
              <input id="flow-heading" type="text" value="How did we do?">
              <label for="flow-intro">Intro line</label>
              <input id="flow-intro" type="text" value='Hi {{ order.customer.firstName | default: "there" }}'>
              <label for="flow-body">Main message</label>
              <textarea id="flow-body" rows="4">We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?</textarea>
              <label for="flow-signoff">Footer note</label>
              <input id="flow-signoff" type="text" value="Your feedback helps other customers make confident choices.">
            </section>

            <section class="flow-panel">
              <div class="flow-panel-title"><span>3</span><div><h3>Review links</h3><p>Choose how customers leave reviews.</p></div></div>
              <label for="flow-link-mode">Review link style</label>
              <select id="flow-link-mode">
                <option value="both">Order button + individual product links</option>
                <option value="order">Review entire order only</option>
                <option value="products">Review each product only</option>
              </select>
              <label for="flow-main-button-text">Main button text</label>
              <input id="flow-main-button-text" type="text" value="Review Your Order">
              <label for="flow-product-button-text">Product button text</label>
              <input id="flow-product-button-text" type="text" value="Review This Item">
              <label for="flow-page-handle">Review landing page handle</label>
              <input id="flow-page-handle" type="text" value="${DEFAULT_PAGE_HANDLE}">
              <div class="flow-help-box">Generated links point to <strong>/pages/<span id="flow-page-handle-preview">${DEFAULT_PAGE_HANDLE}</span></strong> and pass <code>review_type</code>, <code>order</code>, <code>email</code>, <code>product_id</code>, and <code>variant_id</code> where available.</div>
            </section>

            <section class="flow-panel">
              <div class="flow-panel-title"><span>4</span><div><h3>Shopify Flow setup</h3><p>The delay is configured inside Shopify Flow, not inside the email HTML.</p></div></div>
              <label for="flow-delay-days">Recommended wait after fulfilment</label>
              <select id="flow-delay-days">
                <option value="7">7 days</option>
                <option value="10">10 days</option>
                <option value="14" selected>14 days</option>
                <option value="21">21 days</option>
                <option value="30">30 days</option>
              </select>
              <div class="flow-steps">
                <div><strong>Trigger</strong><span>Order fulfilled</span></div>
                <div><strong>Wait</strong><span><b id="flow-delay-copy-preview">14</b> days</span></div>
                <div><strong>Action</strong><span>Send email</span></div>
              </div>
            </section>

            <section class="flow-panel">
              <div class="flow-panel-title"><span>5</span><div><h3>Review page tester</h3><p>Open your review page with safe preview data. This does not create a Shopify order.</p></div></div>

              <label for="review-test-name">Customer name</label>
              <input id="review-test-name" type="text" value="Alex">

              <label for="review-test-email">Customer email</label>
              <input id="review-test-email" type="email" value="alex@example.com">

              <div class="flow-two-col">
                <div>
                  <label for="review-test-order">Order number</label>
                  <input id="review-test-order" type="text" value="1001">
                </div>
                <div>
                  <label for="review-test-type">Review mode</label>
                  <select id="review-test-type">
                    <option value="order">Review full order</option>
                    <option value="product">Review one product</option>
                  </select>
                </div>
              </div>

              <label for="review-test-count">How many products?</label>
              <input id="review-test-count" type="number" min="1" max="10" value="2">

              <div class="flow-help-box">
                Select real products with the Shopify picker, or generate sample products to test the page quickly.
                The test URL passes customer, order, product, variant, image, and quantity context.
              </div>

              <div class="review-test-actions">
                <button type="button" id="review-test-pick-products">Select Products</button>
                <button type="button" id="review-test-sample-products">Use Sample Products</button>
              </div>

              <div id="review-test-products" class="review-test-products"></div>

              <button type="button" id="review-test-open" class="review-test-main-btn">Open Test Review Page</button>
              <button type="button" id="review-test-copy-url" class="review-test-copy-btn">Copy Test URL</button>
              <textarea id="review-test-url" class="review-test-url" readonly spellcheck="false" placeholder="Your generated test URL will appear here."></textarea>
            </section>
          </div>

          <div class="flow-preview-column">
            <section class="flow-preview-card">
              <div class="flow-preview-toolbar">
                <div><h3>Live preview</h3><p>Check the email on desktop and mobile before copying the code.</p></div>
                <div class="flow-preview-toggle">
                  <button type="button" id="flow-preview-desktop" class="active" data-flow-preview-mode="desktop">Desktop</button>
                  <button type="button" id="flow-preview-mobile" data-flow-preview-mode="mobile">Mobile</button>
                </div>
              </div>
              <div class="flow-preview-stage"><div id="flow-preview-wrap" class="flow-preview-wrap"><div id="flow-email-preview"></div></div></div>
            </section>

            <section class="flow-code-card">
              <div class="flow-code-header">
                <div><h3>Copy email HTML</h3><p>In Shopify Flow, add a Send email action, enable HTML, and paste this code into the body.</p></div>
                <button type="button" id="flow-copy-code-btn">Copy Code</button>
              </div>
              <textarea id="flow-code-output" spellcheck="false" readonly></textarea>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function getFieldValue(id, fallback) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() || fallback : fallback;
  }

  function getOptions() {
    return {
      logo: getFieldValue('flow-logo', ''),
      accentColor: getFieldValue('flow-color', '#111827'),
      bgColor: getFieldValue('flow-bg-color', '#f3f4f6'),
      cardColor: getFieldValue('flow-card-color', '#ffffff'),
      buttonRadius: Math.max(0, Math.min(40, parseInt(getFieldValue('flow-button-radius', '8'), 10) || 8)),
      heading: getFieldValue('flow-heading', 'How did we do?'),
      intro: getFieldValue('flow-intro', 'Hi {{ order.customer.firstName | default: "there" }}'),
      body: getFieldValue('flow-body', "We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?"),
      signoff: getFieldValue('flow-signoff', 'Your feedback helps other customers make confident choices.'),
      linkMode: getFieldValue('flow-link-mode', 'both'),
      mainButtonText: getFieldValue('flow-main-button-text', 'Review Your Order'),
      productButtonText: getFieldValue('flow-product-button-text', 'Review This Item'),
      pageHandle: cleanHandle(getFieldValue('flow-page-handle', DEFAULT_PAGE_HANDLE)),
      delayDays: getFieldValue('flow-delay-days', '14')
    };
  }

  function buildFlowEmailHtml(options) {
    const shopUrl = `https://${getShopDomain()}`;
    const logoHtml = options.logo ? `
                            <tr>
                                <td align="center" style="padding:0 0 24px 0;">
                                    <img src="${escapeHtml(options.logo)}" alt="{{ shop.name }}" style="display:block; max-width:160px; height:auto; border:0; outline:none; text-decoration:none;">
                                </td>
                            </tr>` : '';

    const orderReviewUrl = `${shopUrl}/pages/${options.pageHandle}?review_type=order&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}`;

    const orderButtonHtml = `
                            <tr>
                                <td align="center" style="padding:22px 0 8px 0;">
                                    <a href="${orderReviewUrl}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:16px; font-weight:bold; padding:14px 24px; border-radius:${options.buttonRadius}px; line-height:1.2;">
                                        ${escapeHtml(options.mainButtonText)}
                                    </a>
                                </td>
                            </tr>`;

    const productLinksHtml = `
                            <tr>
                                <td style="padding:24px 0 0 0;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                        {% for line_item in order.line_items %}
                                            <tr>
                                                <td style="padding:14px 0; border-top:1px solid #e5e7eb;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                                        <tr>
                                                            <td style="font-size:15px; font-weight:bold; color:#111827; line-height:1.4; padding:0 0 8px 0;">
                                                                {{ line_item.title | default: line_item.name }}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td>
                                                                <a href="${shopUrl}/pages/${options.pageHandle}?review_type=product&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}&product_id={{ line_item.product.id }}&variant_id={{ line_item.variant.id }}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; padding:10px 16px; border-radius:${options.buttonRadius}px; line-height:1.2;">
                                                                    ${escapeHtml(options.productButtonText)}
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        {% endfor %}
                                    </table>
                                </td>
                            </tr>`;

    const reviewLinks = options.linkMode === 'order'
      ? orderButtonHtml
      : options.linkMode === 'products'
        ? productLinksHtml
        : orderButtonHtml + productLinksHtml;

    return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${options.bgColor}; margin:0; padding:0; width:100%;">
    <tr>
        <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background:${options.cardColor}; border-radius:12px; overflow:hidden;">
                <tr>
                    <td style="padding:32px 24px; font-family:Arial, Helvetica, sans-serif; text-align:center;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            ${logoHtml}
                            <tr>
                                <td align="center" style="padding:0 0 12px 0;">
                                    <h1 style="margin:0; color:#111827; font-size:26px; line-height:1.25; font-weight:700;">${escapeHtml(options.heading)}</h1>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding:0 0 10px 0;">
                                    <p style="margin:0; color:#4b5563; font-size:16px; line-height:1.6;">${options.intro}</p>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding:0 0 8px 0;">
                                    <p style="margin:0; color:#4b5563; font-size:16px; line-height:1.6;">${escapeHtml(options.body)}</p>
                                </td>
                            </tr>
                            ${reviewLinks}
                            <tr>
                                <td align="center" style="padding:24px 0 0 0;">
                                    <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.5;">${escapeHtml(options.signoff)}</p>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding:20px 0 0 0;">
                                    <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.5;">Sent by {{ shop.name }}.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>`.trim();
  }

  function buildPreviewHtml(options) {
    const previewLogo = options.logo
      ? `<img src="${escapeHtml(options.logo)}" alt="Logo" style="display:block; max-width:150px; margin:0 auto 22px; height:auto;">`
      : `<div style="width:54px; height:54px; border-radius:16px; background:${options.accentColor}; margin:0 auto 22px;"></div>`;

    const previewOrderButton = `
      <div style="padding:20px 0 8px; text-align:center;">
        <a href="#" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:16px; font-weight:bold; padding:14px 24px; border-radius:${options.buttonRadius}px; line-height:1.2;">${escapeHtml(options.mainButtonText)}</a>
      </div>`;

    const sampleItems = ['Sample Product One', 'Sample Product Two'];
    const previewProductLinks = `
      <div style="padding-top:22px; text-align:left;">
        ${sampleItems.map(name => `
          <div style="padding:14px 0; border-top:1px solid #e5e7eb;">
            <div style="font-size:15px; font-weight:bold; color:#111827; line-height:1.4; padding-bottom:8px;">${escapeHtml(name)}</div>
            <a href="#" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; padding:10px 16px; border-radius:${options.buttonRadius}px; line-height:1.2;">${escapeHtml(options.productButtonText)}</a>
          </div>`).join('')}
      </div>`;

    const previewLinks = options.linkMode === 'order'
      ? previewOrderButton
      : options.linkMode === 'products'
        ? previewProductLinks
        : previewOrderButton + previewProductLinks;

    return `
      <div style="background:${options.bgColor}; padding:24px 12px;">
        <div style="max-width:600px; margin:0 auto; background:${options.cardColor}; border-radius:12px; overflow:hidden;">
          <div style="padding:32px 24px; font-family:Arial, Helvetica, sans-serif; text-align:center;">
            ${previewLogo}
            <h1 style="margin:0 0 12px; color:#111827; font-size:26px; line-height:1.25; font-weight:700;">${escapeHtml(options.heading)}</h1>
            <p style="margin:0 0 10px; color:#4b5563; font-size:16px; line-height:1.6;">Hi Alex,</p>
            <p style="margin:0 0 8px; color:#4b5563; font-size:16px; line-height:1.6;">${escapeHtml(options.body)}</p>
            ${previewLinks}
            <p style="margin:24px 0 0; color:#6b7280; font-size:13px; line-height:1.5;">${escapeHtml(options.signoff)}</p>
            <p style="margin:20px 0 0; color:#9ca3af; font-size:12px; line-height:1.5;">Sent by your store.</p>
          </div>
        </div>
        <div style="max-width:600px; margin:10px auto 0; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#6b7280; text-align:center;">
          Links will point to /pages/${escapeHtml(options.pageHandle)} and include order/customer/product details.
        </div>
      </div>`;
  }

  function updateBuilder() {
    const options = getOptions();

    const pageHandleInput = document.getElementById('flow-page-handle');
    if (pageHandleInput && pageHandleInput.value !== options.pageHandle) pageHandleInput.value = options.pageHandle;

    const pageHandlePreview = document.getElementById('flow-page-handle-preview');
    if (pageHandlePreview) pageHandlePreview.innerText = options.pageHandle;

    const delayPreview = document.getElementById('flow-delay-preview');
    if (delayPreview) delayPreview.innerText = options.delayDays;

    const delayCopyPreview = document.getElementById('flow-delay-copy-preview');
    if (delayCopyPreview) delayCopyPreview.innerText = options.delayDays;

    const output = document.getElementById('flow-code-output');
    if (output) output.value = buildFlowEmailHtml(options);

    const preview = document.getElementById('flow-email-preview');
    if (preview) preview.innerHTML = buildPreviewHtml(options);
  }

  async function copyFlowCode() {
    const output = document.getElementById('flow-code-output');
    if (!output) return;

    output.select();
    output.setSelectionRange(0, 999999);

    try {
      await navigator.clipboard.writeText(output.value);
    } catch (e) {
      document.execCommand('copy');
    }

    showToast('Copied to clipboard!');
  }

  function setPreviewMode(mode) {
    const wrap = document.getElementById('flow-preview-wrap');
    const desktopBtn = document.getElementById('flow-preview-desktop');
    const mobileBtn = document.getElementById('flow-preview-mobile');

    if (wrap) wrap.classList.toggle('mobile', mode === 'mobile');
    if (desktopBtn) desktopBtn.classList.toggle('active', mode === 'desktop');
    if (mobileBtn) mobileBtn.classList.toggle('active', mode === 'mobile');
  }


  let reviewTestProducts = [];

  function clampProductCount(value) {
    return Math.max(1, Math.min(10, parseInt(value || '2', 10) || 2));
  }

  function getProductImage(product) {
    if (!product) return '';

    if (product.image && typeof product.image === 'string') return product.image;
    if (product.featuredImage && product.featuredImage.url) return product.featuredImage.url;
    if (product.featuredImage && product.featuredImage.originalSrc) return product.featuredImage.originalSrc;

    const firstImage = Array.isArray(product.images) ? product.images[0] : null;
    if (firstImage && firstImage.url) return firstImage.url;
    if (firstImage && firstImage.originalSrc) return firstImage.originalSrc;
    if (firstImage && firstImage.src) return firstImage.src;

    return '';
  }

  function normalisePickedProduct(product, index) {
    const firstVariant = product && Array.isArray(product.variants) ? product.variants[0] : null;

    return {
      id: String(product && product.id ? product.id : `sample-product-${index + 1}`).split('/').pop(),
      variantId: String(firstVariant && firstVariant.id ? firstVariant.id : `sample-variant-${index + 1}`).split('/').pop(),
      title: product && product.title ? product.title : `Sample Product ${index + 1}`,
      handle: product && product.handle ? product.handle : `sample-product-${index + 1}`,
      image: getProductImage(product),
      quantity: 1
    };
  }

  function generateSampleReviewProducts() {
    const count = clampProductCount(getFieldValue('review-test-count', '2'));

    reviewTestProducts = Array.from({ length: count }).map((_, index) => ({
      id: `sample-product-${index + 1}`,
      variantId: `sample-variant-${index + 1}`,
      title: `Sample Product ${index + 1}`,
      handle: `sample-product-${index + 1}`,
      image: '',
      quantity: 1
    }));

    renderReviewTestProducts();
    updateReviewTestUrl();
    showToast('Sample products added.');
  }

  async function pickReviewTestProducts() {
    const count = clampProductCount(getFieldValue('review-test-count', '2'));

    if (!window.shopify || !window.shopify.resourcePicker) {
      generateSampleReviewProducts();
      showToast('Shopify product picker unavailable. Sample products added.');
      return;
    }

    try {
      const selected = await window.shopify.resourcePicker({
        type: 'product',
        multiple: true
      });

      if (!selected || selected.length === 0) {
        showToast('Product picker closed.');
        return;
      }

      reviewTestProducts = selected.slice(0, count).map(normalisePickedProduct);
      renderReviewTestProducts();
      updateReviewTestUrl();
      showToast('Products selected.');
    } catch (error) {
      console.error(error);
      showToast('Product picker closed.');
    }
  }

  function removeReviewTestProduct(index) {
    reviewTestProducts.splice(index, 1);
    renderReviewTestProducts();
    updateReviewTestUrl();
  }

  function renderReviewTestProducts() {
    const container = document.getElementById('review-test-products');
    if (!container) return;

    if (!reviewTestProducts.length) {
      container.innerHTML = '<div class="flow-help-box">No products selected yet.</div>';
      return;
    }

    container.innerHTML = reviewTestProducts.map((product, index) => `
      <div class="review-test-product">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<img alt="">'}
        <div>
          <strong>${escapeHtml(product.title)}</strong>
          <span>Product ID: ${escapeHtml(product.id)}</span>
          ${product.variantId ? `<span>Variant ID: ${escapeHtml(product.variantId)}</span>` : ''}
        </div>
        <button type="button" data-review-test-remove="${index}" aria-label="Remove ${escapeHtml(product.title)}">×</button>
      </div>
    `).join('');

    container.querySelectorAll('[data-review-test-remove]').forEach(button => {
      button.addEventListener('click', () => removeReviewTestProduct(parseInt(button.dataset.reviewTestRemove, 10)));
    });
  }

  function encodeReviewPreviewData(data) {
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)));

    return encoded
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function buildReviewTestUrl() {
    const pageHandle = cleanHandle(getFieldValue('flow-page-handle', DEFAULT_PAGE_HANDLE));
    const name = getFieldValue('review-test-name', 'Alex');
    const email = getFieldValue('review-test-email', 'alex@example.com');
    const rawOrderNumber = getFieldValue('review-test-order', '1001').replace(/^#/, '');
    const reviewType = getFieldValue('review-test-type', 'order');

    if (!reviewTestProducts.length) {
      const count = clampProductCount(getFieldValue('review-test-count', '2'));
      reviewTestProducts = Array.from({ length: count }).map((_, index) => ({
        id: `sample-product-${index + 1}`,
        variantId: `sample-variant-${index + 1}`,
        title: `Sample Product ${index + 1}`,
        handle: `sample-product-${index + 1}`,
        image: '',
        quantity: 1
      }));
      renderReviewTestProducts();
    }

    const products = reviewType === 'product'
      ? reviewTestProducts.slice(0, 1)
      : reviewTestProducts;

    const previewData = {
      preview: true,
      source: 'nectar_admin_review_page_tester',
      reviewType,
      customer: {
        name,
        firstName: name.split(' ')[0] || name,
        email
      },
      order: {
        name: `#${rawOrderNumber}`,
        number: rawOrderNumber,
        fulfilledAt: new Date().toISOString()
      },
      products
    };

    return `https://${getShopDomain()}/pages/${pageHandle}?preview=true&preview_data=${encodeReviewPreviewData(previewData)}`;
  }

  function updateReviewTestUrl() {
    const output = document.getElementById('review-test-url');
    if (!output) return '';
    const url = buildReviewTestUrl();
    output.value = url;
    return url;
  }

  function openReviewPageTest() {
    const url = updateReviewTestUrl();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyReviewTestUrl() {
    const url = updateReviewTestUrl();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      const output = document.getElementById('review-test-url');
      if (output) {
        output.select();
        output.setSelectionRange(0, 999999);
        document.execCommand('copy');
      }
    }

    showToast('Test URL copied.');
  }


  function wireEvents() {
    const ids = [
      'flow-logo', 'flow-color', 'flow-button-radius', 'flow-bg-color', 'flow-card-color',
      'flow-heading', 'flow-intro', 'flow-body', 'flow-signoff', 'flow-link-mode',
      'flow-main-button-text', 'flow-product-button-text', 'flow-page-handle', 'flow-delay-days',
      'review-test-name', 'review-test-email', 'review-test-order', 'review-test-type', 'review-test-count'
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        updateBuilder();
        updateReviewTestUrl();
      });
      el.addEventListener('change', () => {
        updateBuilder();
        updateReviewTestUrl();
      });
    });

    const pickProductsBtn = document.getElementById('review-test-pick-products');
    if (pickProductsBtn) pickProductsBtn.addEventListener('click', pickReviewTestProducts);

    const sampleProductsBtn = document.getElementById('review-test-sample-products');
    if (sampleProductsBtn) sampleProductsBtn.addEventListener('click', generateSampleReviewProducts);

    const openTestBtn = document.getElementById('review-test-open');
    if (openTestBtn) openTestBtn.addEventListener('click', openReviewPageTest);

    const copyTestUrlBtn = document.getElementById('review-test-copy-url');
    if (copyTestUrlBtn) copyTestUrlBtn.addEventListener('click', copyReviewTestUrl);

    const copyBtn = document.getElementById('flow-copy-code-btn');
    if (copyBtn) copyBtn.addEventListener('click', copyFlowCode);

    document.querySelectorAll('[data-flow-preview-mode]').forEach(btn => {
      btn.addEventListener('click', () => setPreviewMode(btn.dataset.flowPreviewMode));
    });
  }

  function initMessagingCampaigns() {
    const messagingView = document.getElementById('v-msg');
    if (!messagingView) return;

    injectStyles();
    messagingView.innerHTML = getBuilderMarkup();
    wireEvents();
    renderReviewTestProducts();
    updateBuilder();
    updateReviewTestUrl();
  }

  // Override the old functions in admin.js while keeping the same public names.
  window.generateFlowCode = updateBuilder;
  window.copyFlowCode = copyFlowCode;
  window.setFlowPreviewMode = setPreviewMode;
  window.pickReviewTestProducts = pickReviewTestProducts;
  window.generateSampleReviewProducts = generateSampleReviewProducts;
  window.openReviewPageTest = openReviewPageTest;
  window.copyReviewTestUrl = copyReviewTestUrl;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessagingCampaigns);
  } else {
    initMessagingCampaigns();
  }
})();
