/* Nectar Reviews - Messaging & Campaigns builder
   Keeps Shopify Flow email generation, review link previews, test URLs, and optional SMTP test sending in the app. */
(function () {
  if (window.__NECTAR_MESSAGING_CAMPAIGNS__) return;
  window.__NECTAR_MESSAGING_CAMPAIGNS__ = true;

  const DEFAULT_PAGE_HANDLE = 'leave-review';
  const API = window.API || 'https://nectar-reviews-api.onrender.com/api';

  function $(id) { return document.getElementById(id); }

  function getShopDomain() {
    const params = new URLSearchParams(window.location.search);
    return window.SHOP_DOMAIN || params.get('shopDomain') || params.get('shop') || 'your-dev-store.myshopify.com';
  }

  function showToast(message) {
    if (window.shopify && window.shopify.toast) window.shopify.toast.show(message);
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  function escapeHtml(value) {
    return String(value || '')
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

  function getFieldValue(id, fallback) {
    const el = $(id);
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

  function injectStyles() {
    if ($('nr-messaging-campaigns-styles')) return;
    const style = document.createElement('style');
    style.id = 'nr-messaging-campaigns-styles';
    style.textContent = `
      .flow-builder-shell { width: 100%; }
      .flow-builder-header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:24px; }
      .flow-kicker { margin:0 0 6px; color:#005bd3; font-size:12px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
      .flow-builder-header h2 { margin:0; font-size:30px; letter-spacing:-.04em; }
      .flow-subtext { margin:8px 0 0; max-width:760px; color:var(--text-light,#64748b); font-size:15px; line-height:1.6; }
      .flow-status-card { min-width:260px; padding:14px 16px; border:1px solid var(--border,#e2e8f0); border-radius:14px; background:#fff; }
      .flow-status-card span { display:block; margin-bottom:4px; color:var(--text-light,#64748b); font-size:12px; font-weight:800; text-transform:uppercase; }
      .flow-status-card strong { display:block; font-size:13px; line-height:1.5; }
      .flow-builder-grid { display:grid; grid-template-columns:minmax(320px,420px) minmax(0,1fr); gap:24px; align-items:start; }
      .flow-controls, .flow-preview-column { display:grid; gap:18px; }
      .flow-panel, .flow-preview-card, .flow-code-card { background:#fff; border:1px solid var(--border,#e2e8f0); border-radius:16px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
      .flow-panel { padding:22px; }
      .flow-panel-title { display:flex; align-items:flex-start; gap:12px; margin-bottom:18px; }
      .flow-panel-title span { width:30px; height:30px; flex:0 0 30px; display:grid; place-items:center; border-radius:999px; background:var(--text,#0f172a); color:#fff; font-size:13px; font-weight:900; }
      .flow-panel-title h3, .flow-preview-toolbar h3, .flow-code-header h3 { margin:0; font-size:18px; }
      .flow-panel-title p, .flow-preview-toolbar p, .flow-code-header p { margin:4px 0 0; color:var(--text-light,#64748b); font-size:13px; line-height:1.5; }
      .flow-panel label { display:block; margin:14px 0 6px; font-size:13px; font-weight:800; }
      .flow-panel input, .flow-panel select, .flow-panel textarea { width:100%; box-sizing:border-box; border:1px solid #c9cccf; border-radius:10px; background:#fff; padding:11px 12px; font-size:14px; font-family:inherit; outline:none; }
      .flow-panel textarea { min-height:94px; resize:vertical; line-height:1.5; }
      .flow-two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .flow-help-box { margin-top:16px; padding:12px; border:1px solid var(--border,#e2e8f0); border-radius:12px; background:#f8fafc; color:var(--text-light,#64748b); font-size:13px; line-height:1.5; }
      .flow-steps { display:grid; gap:8px; margin-top:16px; }
      .flow-steps div { display:flex; justify-content:space-between; gap:12px; padding:11px 12px; border:1px solid var(--border,#e2e8f0); border-radius:10px; background:#f8fafc; font-size:13px; }
      .flow-preview-toolbar, .flow-code-header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px; border-bottom:1px solid var(--border,#e2e8f0); }
      .flow-preview-toggle { display:inline-flex; padding:4px; border:1px solid var(--border,#e2e8f0); border-radius:999px; background:#f8fafc; }
      .flow-preview-toggle button { border:0; border-radius:999px; background:transparent; color:var(--text-light,#64748b); padding:9px 14px; font-weight:800; cursor:pointer; }
      .flow-preview-toggle button.active { background:var(--text,#0f172a); color:#fff; }
      .flow-preview-stage { padding:28px; overflow:auto; background:#f8fafc; border-radius:0 0 16px 16px; }
      .flow-preview-wrap.mobile { max-width:390px; margin:0 auto; border:12px solid #111827; border-radius:34px; overflow:hidden; background:#fff; }
      #flow-email-preview { min-height:320px; }
      .flow-code-header button, .review-test-main-btn, .review-test-copy-btn { border:0; border-radius:10px; background:var(--text,#0f172a); color:#fff; padding:12px 16px; font-weight:900; cursor:pointer; }
      #flow-code-output { display:block; width:100%; min-height:390px; box-sizing:border-box; border:0; background:#18181b; color:#fff; padding:18px; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:12px; line-height:1.55; resize:vertical; outline:none; }
      .review-test-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
      .review-test-actions button { border:1px solid var(--border,#e2e8f0); border-radius:10px; background:#fff; padding:12px 14px; font-weight:900; cursor:pointer; }
      .review-test-main-btn, .review-test-copy-btn { width:100%; margin-top:10px; }
      .review-test-copy-btn { background:#fff; color:var(--text,#0f172a); border:1px solid var(--border,#e2e8f0); }
      .review-test-products { margin-top:14px; display:grid; gap:8px; }
      .review-test-product { display:grid; grid-template-columns:52px 1fr auto; gap:12px; align-items:center; padding:10px; border:1px solid var(--border,#e2e8f0); border-radius:10px; background:#fff; }
      .review-test-product img { width:52px; height:52px; object-fit:cover; border-radius:8px; background:#f3f4f6; border:1px solid var(--border,#e2e8f0); }
      .review-test-product strong { display:block; font-size:13px; line-height:1.3; }
      .review-test-product span { display:block; color:var(--text-light,#64748b); font-size:12px; margin-top:2px; }
      .review-test-product button { width:30px; height:30px; border-radius:8px; border:1px solid var(--border,#e2e8f0); background:#fff; color:#b42318; cursor:pointer; font-weight:900; }
      .review-test-url { margin-top:12px; width:100%; min-height:72px!important; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace!important; font-size:12px!important; background:#f8fafc!important; }
      .smtp-status { color:var(--text-light,#64748b); font-size:13px; line-height:1.5; margin-top:10px; }
      @media (max-width:1100px) { .flow-builder-header,.flow-preview-toolbar,.flow-code-header { flex-direction:column; align-items:stretch; } .flow-builder-grid { grid-template-columns:1fr; } }
      @media (max-width:640px) { .flow-two-col,.review-test-actions { grid-template-columns:1fr; } .flow-preview-stage { padding:14px; } }
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
            <p class="flow-subtext">Build a mobile-friendly review request email. Customers can review the whole order, each purchased item, or both. Copy the HTML into Shopify Flow, or use the SMTP test tools for direct sends.</p>
          </div>
          <div class="flow-status-card"><span>Recommended Flow</span><strong>Order fulfilled → Wait <span id="flow-delay-preview">14</span> days → Send email</strong></div>
        </div>
        <div class="flow-builder-grid">
          <div class="flow-controls">
            <div class="flow-panel">
              <div class="flow-panel-title"><span>1</span><div><h3>Brand</h3><p>Control the key visual details.</p></div></div>
              <label>Brand logo URL optional</label><input id="flow-logo" placeholder="https://cdn.shopify.com/.../logo.png" />
              <div class="flow-two-col"><div><label>Button colour</label><input id="flow-color" type="color" value="#111827" /></div><div><label>Button radius</label><input id="flow-button-radius" type="number" min="0" max="40" value="8" /></div></div>
              <div class="flow-two-col"><div><label>Email background</label><input id="flow-bg-color" type="color" value="#f3f4f6" /></div><div><label>Email card</label><input id="flow-card-color" type="color" value="#ffffff" /></div></div>
            </div>
            <div class="flow-panel">
              <div class="flow-panel-title"><span>2</span><div><h3>Email copy</h3><p>Simple editable copy for merchants.</p></div></div>
              <label>Heading</label><input id="flow-heading" value="How did we do?" />
              <label>Intro line</label><input id="flow-intro" value='Hi {{ order.customer.firstName | default: "there" }}' />
              <label>Main message</label><textarea id="flow-body">We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?</textarea>
              <label>Footer note</label><textarea id="flow-signoff">Your feedback helps other customers make confident choices.</textarea>
            </div>
            <div class="flow-panel">
              <div class="flow-panel-title"><span>3</span><div><h3>Review links</h3><p>Choose how customers leave reviews.</p></div></div>
              <label>Review link style</label><select id="flow-link-mode"><option value="both">Order button + individual product links</option><option value="order">Review entire order only</option><option value="products">Review each product only</option></select>
              <label>Main button text</label><input id="flow-main-button-text" value="Review Your Order" />
              <label>Product button text</label><input id="flow-product-button-text" value="Review This Item" />
              <label>Review landing page handle</label><input id="flow-page-handle" value="${DEFAULT_PAGE_HANDLE}" />
              <div class="flow-help-box">Generated links point to <code>/pages/<span id="flow-page-handle-preview">${DEFAULT_PAGE_HANDLE}</span></code> and pass order, customer, product, variant, image, and quantity context where available.</div>
            </div>
            <div class="flow-panel">
              <div class="flow-panel-title"><span>4</span><div><h3>Shopify Flow setup</h3><p>The delay is configured inside Shopify Flow, not inside the email HTML.</p></div></div>
              <label>Recommended wait after fulfilment</label><select id="flow-delay-days"><option value="7">7 days</option><option value="10">10 days</option><option value="14" selected>14 days</option><option value="21">21 days</option><option value="30">30 days</option></select>
              <div class="flow-steps"><div><strong>Trigger</strong><span>Order fulfilled</span></div><div><strong>Wait</strong><span><span id="flow-delay-copy-preview">14</span> days</span></div><div><strong>Action</strong><span>Send email</span></div></div>
            </div>
            <div class="flow-panel">
              <div class="flow-panel-title"><span>5</span><div><h3>Review page tester</h3><p>Open your review page with safe preview data.</p></div></div>
              <div class="flow-two-col"><div><label>Customer name</label><input id="review-test-name" value="Alex" /></div><div><label>Customer email</label><input id="review-test-email" value="alex@example.com" /></div></div>
              <div class="flow-two-col"><div><label>Order number</label><input id="review-test-order" value="1001" /></div><div><label>Review mode</label><select id="review-test-type"><option value="order">Review full order</option><option value="product">Review one product</option></select></div></div>
              <label>How many products?</label><input id="review-test-count" type="number" min="1" max="10" value="2" />
              <div class="review-test-actions"><button id="review-test-pick-products" type="button">Select Products</button><button id="review-test-sample-products" type="button">Use Sample Products</button></div>
              <div id="review-test-products" class="review-test-products"></div>
              <textarea id="review-test-url" class="review-test-url" readonly></textarea>
              <button id="review-test-open" class="review-test-main-btn" type="button">Open Test Review Page</button>
              <button id="review-test-copy-url" class="review-test-copy-btn" type="button">Copy Test URL</button>
            </div>
            <div class="flow-panel">
              <div class="flow-panel-title"><span>6</span><div><h3>Direct email test</h3><p>Use the server SMTP settings to send a test email.</p></div></div>
              <label>Send test to</label><input id="flow-test-to" placeholder="you@example.com" />
              <button id="flow-send-test" class="review-test-main-btn" type="button">Send Test Email</button>
              <div id="flow-test-status" class="smtp-status">Configure SMTP in Render or via the backend settings endpoint.</div>
            </div>
          </div>
          <div class="flow-preview-column">
            <div class="flow-preview-card">
              <div class="flow-preview-toolbar"><div><h3>Live preview</h3><p>Check desktop and mobile before copying.</p></div><div class="flow-preview-toggle"><button id="flow-preview-desktop" class="active" type="button" data-flow-preview-mode="desktop">Desktop</button><button id="flow-preview-mobile" type="button" data-flow-preview-mode="mobile">Mobile</button></div></div>
              <div class="flow-preview-stage"><div id="flow-preview-wrap" class="flow-preview-wrap"><div id="flow-email-preview"></div></div></div>
            </div>
            <div class="flow-code-card">
              <div class="flow-code-header"><div><h3>Copy email HTML</h3><p>In Shopify Flow, add a Send email action, enable HTML, and paste this code.</p></div><button id="flow-copy-code-btn" type="button">Copy Code</button></div>
              <textarea id="flow-code-output" readonly></textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildReviewUrl(pageHandle, productLiquid) {
    const shopUrl = `https://${getShopDomain()}`;
    const base = `${shopUrl}/pages/${pageHandle}`;
    return `${base}?review_type=${productLiquid ? 'product' : 'order'}&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}${productLiquid || ''}`;
  }

  function buildFlowEmailHtml(options) {
    const logoHtml = options.logo ? `<div style="text-align:center;margin-bottom:24px"><img src="${escapeHtml(options.logo)}" alt="{{ shop.name }}" style="max-width:170px;height:auto"></div>` : '';
    const orderReviewUrl = buildReviewUrl(options.pageHandle, '');
    const buttonStyle = `display:inline-block;background:${options.accentColor};color:#ffffff;text-decoration:none;border-radius:${options.buttonRadius}px;padding:14px 22px;font-weight:700;`;
    const orderButtonHtml = `<div style="text-align:center;margin:26px 0"><a href="${orderReviewUrl}" style="${buttonStyle}">${escapeHtml(options.mainButtonText)}</a></div>`;
    const productLinksHtml = `
      {% for line_item in order.line_items %}
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:12px 0;background:#ffffff">
        <p style="margin:0 0 10px;font-weight:700;color:#111827">{{ line_item.title | default: line_item.name }}</p>
        <a href="https://${getShopDomain()}/pages/${options.pageHandle}?review_type=product&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}&product_id={{ line_item.product.id | default: line_item.product_id | url_encode }}&variant_id={{ line_item.variant.id | default: line_item.variant_id | url_encode }}&product_title={{ line_item.title | url_encode }}&quantity={{ line_item.quantity | url_encode }}" style="${buttonStyle}">${escapeHtml(options.productButtonText)}</a>
      </div>
      {% endfor %}`;
    const reviewLinks = options.linkMode === 'order' ? orderButtonHtml : options.linkMode === 'products' ? productLinksHtml : orderButtonHtml + productLinksHtml;
    return `
      <div style="background:${options.bgColor};padding:32px 16px;font-family:Arial,sans-serif;color:#111827">
        <div style="max-width:640px;margin:0 auto;background:${options.cardColor};border-radius:18px;padding:32px;box-shadow:0 1px 4px rgba(17,24,39,.08)">
          ${logoHtml}
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#111827">${escapeHtml(options.heading)}</h1>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#374151">${options.intro}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151">${escapeHtml(options.body)}</p>
          ${reviewLinks}
          <p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#6b7280">${escapeHtml(options.signoff)}</p>
          <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">Sent by {{ shop.name }}.</p>
        </div>
      </div>`.trim();
  }

  function buildPreviewHtml(options) {
    const previewLogo = options.logo ? `<div style="text-align:center;margin-bottom:24px"><img src="${escapeHtml(options.logo)}" alt="Logo" style="max-width:170px;height:auto"></div>` : '';
    const buttonStyle = `display:inline-block;background:${options.accentColor};color:#ffffff;text-decoration:none;border-radius:${options.buttonRadius}px;padding:14px 22px;font-weight:700;`;
    const previewOrderButton = `<div style="text-align:center;margin:26px 0"><span style="${buttonStyle}">${escapeHtml(options.mainButtonText)}</span></div>`;
    const previewProducts = ['Sample Product One', 'Sample Product Two'].map(name => `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:12px 0;background:#ffffff"><p style="margin:0 0 10px;font-weight:700;color:#111827">${escapeHtml(name)}</p><span style="${buttonStyle}">${escapeHtml(options.productButtonText)}</span></div>`).join('');
    const links = options.linkMode === 'order' ? previewOrderButton : options.linkMode === 'products' ? previewProducts : previewOrderButton + previewProducts;
    return `<div style="background:${options.bgColor};padding:28px;font-family:Arial,sans-serif;color:#111827"><div style="max-width:640px;margin:0 auto;background:${options.cardColor};border-radius:18px;padding:32px">${previewLogo}<h1 style="margin:0 0 12px;font-size:28px;line-height:1.2">${escapeHtml(options.heading)}</h1><p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#374151">Hi Alex,</p><p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151">${escapeHtml(options.body)}</p>${links}<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#6b7280">${escapeHtml(options.signoff)}</p><p style="margin:18px 0 0;font-size:12px;color:#9ca3af">Links will point to /pages/${escapeHtml(options.pageHandle)}.</p></div></div>`;
  }

  function updateBuilder() {
    const options = getOptions();
    const pageHandleInput = $('flow-page-handle');
    if (pageHandleInput && pageHandleInput.value !== options.pageHandle) pageHandleInput.value = options.pageHandle;
    if ($('flow-page-handle-preview')) $('flow-page-handle-preview').innerText = options.pageHandle;
    if ($('flow-delay-preview')) $('flow-delay-preview').innerText = options.delayDays;
    if ($('flow-delay-copy-preview')) $('flow-delay-copy-preview').innerText = options.delayDays;
    if ($('flow-code-output')) $('flow-code-output').value = buildFlowEmailHtml(options);
    if ($('flow-email-preview')) $('flow-email-preview').innerHTML = buildPreviewHtml(options);
  }

  async function copyFlowCode() {
    const output = $('flow-code-output');
    if (!output) return;
    output.select();
    output.setSelectionRange(0, 999999);
    try { await navigator.clipboard.writeText(output.value); } catch (e) { document.execCommand('copy'); }
    showToast('Copied to clipboard!');
  }

  function setPreviewMode(mode) {
    const wrap = $('flow-preview-wrap');
    if (wrap) wrap.classList.toggle('mobile', mode === 'mobile');
    if ($('flow-preview-desktop')) $('flow-preview-desktop').classList.toggle('active', mode === 'desktop');
    if ($('flow-preview-mobile')) $('flow-preview-mobile').classList.toggle('active', mode === 'mobile');
  }

  let reviewTestProducts = [];
  function clampProductCount(value) { return Math.max(1, Math.min(10, parseInt(value || '2', 10) || 2)); }

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
      const selected = await window.shopify.resourcePicker({ type: 'product', multiple: true });
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
    const container = $('review-test-products');
    if (!container) return;
    if (!reviewTestProducts.length) {
      container.innerHTML = '<p class="muted">No products selected yet.</p>';
      return;
    }
    container.innerHTML = reviewTestProducts.map((product, index) => `
      <div class="review-test-product">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div></div>'}
        <div><strong>${escapeHtml(product.title)}</strong><span>Product ID: ${escapeHtml(product.id)} ${product.variantId ? ` · Variant ID: ${escapeHtml(product.variantId)}` : ''}</span></div>
        <button type="button" data-review-test-remove="${index}">×</button>
      </div>`).join('');
    container.querySelectorAll('[data-review-test-remove]').forEach(button => {
      button.addEventListener('click', () => removeReviewTestProduct(parseInt(button.dataset.reviewTestRemove, 10)));
    });
  }

  function encodeReviewPreviewData(data) {
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    const products = reviewType === 'product' ? reviewTestProducts.slice(0, 1) : reviewTestProducts;
    const previewData = {
      preview: true,
      source: 'nectar_admin_review_page_tester',
      reviewType,
      customer: { name, firstName: name.split(' ')[0] || name, email },
      order: { name: `#${rawOrderNumber}`, number: rawOrderNumber, fulfilledAt: new Date().toISOString() },
      products
    };
    return `https://${getShopDomain()}/pages/${pageHandle}?preview=true&preview_data=${encodeReviewPreviewData(previewData)}`;
  }

  function updateReviewTestUrl() {
    const output = $('review-test-url');
    if (!output) return '';
    const url = buildReviewTestUrl();
    output.value = url;
    return url;
  }

  function openReviewPageTest() {
    const url = updateReviewTestUrl();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyReviewTestUrl() {
    const url = updateReviewTestUrl();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); }
    catch (error) {
      const output = $('review-test-url');
      if (output) { output.select(); output.setSelectionRange(0, 999999); document.execCommand('copy'); }
    }
    showToast('Test URL copied.');
  }

  async function sendTestEmail() {
    const status = $('flow-test-status');
    const to = getFieldValue('flow-test-to', '');
    if (!to || !to.includes('@')) {
      alert('Enter a valid email first.');
      return;
    }
    const options = getOptions();
    if (status) status.textContent = 'Sending test email...';
    try {
      const res = await fetch(`${API}/api/admin/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: getShopDomain(), to, subject: options.heading, html: buildFlowEmailHtml(options) })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not send test email');
      if (status) status.textContent = 'Test email sent.';
      showToast('Test email sent.');
    } catch (error) {
      if (status) status.textContent = error.message;
      alert(error.message);
    }
  }

  function wireEvents() {
    const ids = [
      'flow-logo','flow-color','flow-button-radius','flow-bg-color','flow-card-color','flow-heading','flow-intro','flow-body','flow-signoff','flow-link-mode','flow-main-button-text','flow-product-button-text','flow-page-handle','flow-delay-days','review-test-name','review-test-email','review-test-order','review-test-type','review-test-count'
    ];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => { updateBuilder(); updateReviewTestUrl(); });
      el.addEventListener('change', () => { updateBuilder(); updateReviewTestUrl(); });
    });
    $('review-test-pick-products')?.addEventListener('click', pickReviewTestProducts);
    $('review-test-sample-products')?.addEventListener('click', generateSampleReviewProducts);
    $('review-test-open')?.addEventListener('click', openReviewPageTest);
    $('review-test-copy-url')?.addEventListener('click', copyReviewTestUrl);
    $('flow-copy-code-btn')?.addEventListener('click', copyFlowCode);
    $('flow-send-test')?.addEventListener('click', sendTestEmail);
    document.querySelectorAll('[data-flow-preview-mode]').forEach(btn => btn.addEventListener('click', () => setPreviewMode(btn.dataset.flowPreviewMode)));
  }

  function initMessagingCampaigns() {
    const messagingView = $('v-msg');
    if (!messagingView) return;
    injectStyles();
    messagingView.innerHTML = getBuilderMarkup();
    wireEvents();
    generateSampleReviewProducts();
    updateBuilder();
    updateReviewTestUrl();
  }

  window.initMessagingCampaigns = initMessagingCampaigns;
  document.addEventListener('DOMContentLoaded', initMessagingCampaigns);
  setTimeout(initMessagingCampaigns, 300);
})();
