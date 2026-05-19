(function () {
  const root = document.querySelector('.nectar-review-page');
  if (!root) return;

  const API = (root.dataset.apiUrl || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
  const SHOP_DOMAIN = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
  const params = new URLSearchParams(window.location.search);

  const ui = {
    loading: document.getElementById('nectar-loading'),
    error: document.getElementById('nectar-error'),
    notDelivered: document.getElementById('nectar-not-delivered'),
    success: document.getElementById('nectar-success'),
    main: document.getElementById('nectar-main'),
    summary: document.getElementById('nectar-order-summary'),
    list: document.getElementById('nectar-review-list'),
    submit: document.getElementById('nectar-submit-btn'),
    previewPill: document.getElementById('nectar-preview-pill'),
  };

  let appConfig = {};
  let orderData = null;
  let products = [];
  let reviewState = {};
  let supportConfig = {
    enabled: true,
    heading: root.dataset.supportHeading || 'Need help with your order?',
    text: root.dataset.supportText || 'If something didn’t go to plan, tell customer service first — we’d love the chance to sort it out.',
    buttonText: root.dataset.supportButton || 'Get help with this order',
    email: root.dataset.supportEmail || '',
    url: root.dataset.supportUrl || '/pages/contact',
  };

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function decodePreviewPayload(encoded) {
    if (!encoded) return null;
    try {
      let base64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const decoded = atob(base64);
      return safeJsonParse(decoded) || safeJsonParse(decodeURIComponent(escape(decoded)));
    } catch (_) { return null; }
  }

  function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function sliderKey(productId, label) {
    return `${slug(productId)}-${slug(label)}`;
  }

  function getProductTags(product) {
    if (!product) return [];
    if (Array.isArray(product.tags)) return product.tags;
    if (typeof product.tags === 'string') return product.tags.split(',').map((v) => v.trim()).filter(Boolean);
    return [];
  }

  function getMatchingSliders(product) {
    const profiles = appConfig.attributeProfiles || appConfig.profiles || [];
    const tags = getProductTags(product).map((v) => String(v).toLowerCase());
    return profiles.filter((profile) => {
      const type = String(profile.type || profile.ruleType || '').toLowerCase();
      const condition = String(profile.condition || profile.value || '').trim().toLowerCase();
      const label = String(profile.label || '').trim();
      if (!condition || !label) return false;
      if (type === 'tag') return tags.includes(condition);
      if (type === 'all' || type === 'global') return true;
      return false;
    });
  }

  async function fetchConfig() {
    try {
      const res = await fetch(`${API}/widget/config?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`);
      if (!res.ok) return;
      appConfig = await res.json();
      const styles = appConfig.widgetStyles || appConfig.styles || {};
      if (styles.primaryColor) root.style.setProperty('--primary', styles.primaryColor);
      if (styles.starColor) root.style.setProperty('--accent', styles.starColor);
    } catch (error) {
      console.warn('Nectar review page config unavailable:', error);
    }
  }

  function productsFromParams() {
    const fromProducts = safeJsonParse(params.get('products') || '');
    const list = Array.isArray(fromProducts) ? fromProducts : [];
    const singleId = params.get('product_id') || params.get('productId') || '';
    if (singleId && !list.some((p) => String(p.id || p.productId) === String(singleId))) {
      list.push({ id: singleId, productId: singleId, variantId: params.get('variant_id') || '', title: params.get('product_title') || 'Product', quantity: 1 });
    }
    return list;
  }

  async function fetchOrderData() {
    const previewPayload = decodePreviewPayload(params.get('preview_data') || params.get('payload') || '');
    if (previewPayload) {
      ui.previewPill.style.display = 'inline-flex';
      return {
        orderId: previewPayload.orderId || previewPayload.order?.number || params.get('order') || '1001',
        customerName: previewPayload.customerName || previewPayload.customer?.name || params.get('customer') || 'Preview Customer',
        customerEmail: previewPayload.customerEmail || previewPayload.customer?.email || params.get('email') || 'preview@example.com',
        products: previewPayload.products || [],
        delivered: true,
        preview: true,
        support: previewPayload.support || {},
      };
    }

    const queryProducts = productsFromParams();
    if (params.get('test') === '1' || queryProducts.length) {
      ui.previewPill.style.display = params.get('test') === '1' ? 'inline-flex' : 'none';
      return {
        orderId: params.get('orderId') || params.get('order') || '1001',
        customerName: params.get('customer') || params.get('name') || 'Customer',
        customerEmail: params.get('email') || '',
        products: queryProducts,
        delivered: true,
        preview: params.get('test') === '1',
        support: {},
      };
    }

    const res = await fetch(`${API}/magic-link/order?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&${params.toString()}&t=${Date.now()}`);
    if (res.status === 403) {
      const err = new Error('Order not delivered yet');
      err.code = 'NOT_DELIVERED';
      throw err;
    }
    if (!res.ok) throw new Error('Order not found');
    return res.json();
  }

  function normaliseProduct(raw, index) {
    const id = String(raw.productId || raw.itemId || raw.id || `product-${index + 1}`);
    return {
      productId: id,
      id,
      variantId: raw.variantId || raw.variant_id || '',
      name: raw.name || raw.title || `Product ${index + 1}`,
      title: raw.name || raw.title || `Product ${index + 1}`,
      image: raw.image || raw.productImage || raw.imageUrl || '',
      quantity: raw.quantity || 1,
      tags: getProductTags(raw),
      matchingSliders: getMatchingSliders(raw),
      raw,
    };
  }

  function uniqueProducts(input) {
    const seen = new Set();
    return input.filter((product) => {
      const id = String(product.productId || product.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function buildSummary(data) {
    ui.summary.innerHTML = `
      <div><span>Customer</span><strong>${escapeHtml(data.customerName || 'Customer')}</strong></div>
      <div><span>Order</span><strong>#${escapeHtml(String(data.orderId || '—').replace(/^#/, ''))}</strong></div>
      <div><span>Reviewing</span><strong>${products.length} item${products.length === 1 ? '' : 's'}</strong></div>`;
  }

  function renderStars(productId) {
    const rating = reviewState[productId]?.rating || 5;
    let html = `<div id="stars-${escapeHtml(productId)}" class="nectar-stars">`;
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" class="nectar-star ${i <= rating ? 'active' : ''}" data-product-id="${escapeHtml(productId)}" data-rating="${i}" aria-label="${i} stars">★</button>`;
    }
    return html + '</div>';
  }

  function renderSliderPanel(product) {
    if (!product.matchingSliders.length) return '';
    return `<div id="sliders-${escapeHtml(product.productId)}" class="nectar-detail-panel nectar-slider-panel open">
      <h4>Confirm the product scores</h4>
      <p class="nectar-panel-help">These start at 5/10. Move each slider to confirm the customer score for this item.</p>
      ${product.matchingSliders.map((slider) => {
        const label = slider.label || '';
        const key = sliderKey(product.productId, label);
        return `<label class="nectar-range-row"><span>${escapeHtml(label)}</span><input id="slider-input-${key}" class="nectar-range" type="range" min="1" max="10" value="5" data-active="true" data-product-id="${escapeHtml(product.productId)}" data-slider-label="${escapeHtml(label)}" data-slider-key="${key}"><output id="slider-value-${key}">5/10</output><button type="button" data-clear-slider="true" data-product-id="${escapeHtml(product.productId)}" data-slider-key="${key}">Reset</button></label>`;
      }).join('')}
    </div>`;
  }

  function renderProductCard(product) {
    return `<article id="card-${escapeHtml(product.productId)}" class="nectar-product-card">
      <div class="nectar-product-head">${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div class="nectar-product-img-placeholder"></div>'}<div><h3>${escapeHtml(product.name)}</h3><small>Product ID: ${escapeHtml(product.productId)}</small></div></div>
      ${renderStars(product.productId)}
      <button type="button" class="nectar-link-btn" data-toggle-composer="${escapeHtml(product.productId)}">Add a product specific review</button>

      <div id="composer-${escapeHtml(product.productId)}" class="nectar-detail-panel"><label>Product headline<input id="headline-${escapeHtml(product.productId)}" type="text"></label><label>Product review<textarea id="comment-${escapeHtml(product.productId)}"></textarea></label></div>
      ${renderSliderPanel(product)}
    </article>`;
  }

  function renderProducts() {
    ui.list.innerHTML = products.map(renderProductCard).join('');
    ui.list.querySelectorAll('.nectar-star').forEach((btn) => {
      btn.addEventListener('click', function () {
        const productId = this.dataset.productId;
        reviewState[productId].rating = Number(this.dataset.rating || 5);
        rerenderStars(productId);
      });
      btn.addEventListener('mouseenter', function () { previewStars(this.dataset.productId, Number(this.dataset.rating || 5)); });
      btn.addEventListener('focus', function () { previewStars(this.dataset.productId, Number(this.dataset.rating || 5)); });
    });
    ui.list.querySelectorAll('.nectar-stars').forEach((wrap) => wrap.addEventListener('mouseleave', function () { rerenderStars(this.id.replace('stars-', '')); }));
    ui.list.querySelectorAll('.nectar-range').forEach((input) => input.addEventListener('input', function () {
      const productId = this.dataset.productId;
      const label = this.dataset.sliderLabel;
      this.dataset.active = 'true';
      this.classList.remove('is-inactive');
      reviewState[productId].attributes[label] = Number(this.value);
      const target = document.getElementById(`slider-value-${this.dataset.sliderKey}`);
      if (target) target.textContent = `${this.value}/10`;
    }));
    ui.list.querySelectorAll('[data-clear-slider]').forEach((btn) => btn.addEventListener('click', () => clearSlider(btn.dataset.productId, btn.dataset.sliderKey)));
    ui.list.querySelectorAll('[data-toggle-composer]').forEach((btn) => btn.addEventListener('click', () => toggleComposer(btn.dataset.toggleComposer)));
    ui.list.querySelectorAll('[data-toggle-sliders]').forEach((btn) => btn.addEventListener('click', () => toggleSliders(btn.dataset.toggleSliders)));
  }


  function previewStars(productId, rating) {
    const wrap = document.getElementById(`stars-${productId}`);
    if (!wrap) return;
    wrap.querySelectorAll('.nectar-star').forEach((star) => {
      star.classList.toggle('active', Number(star.dataset.rating || 0) <= rating);
    });
  }

  function rerenderStars(productId) {
    const wrap = document.getElementById(`stars-${productId}`);
    if (!wrap) return;
    wrap.outerHTML = renderStars(productId);
    const fresh = document.getElementById(`stars-${productId}`);
    fresh.querySelectorAll('.nectar-star').forEach((btn) => {
      btn.addEventListener('click', function () {
        reviewState[productId].rating = Number(this.dataset.rating || 5);
        rerenderStars(productId);
      });
      btn.addEventListener('mouseenter', function () { previewStars(productId, Number(this.dataset.rating || 5)); });
      btn.addEventListener('focus', function () { previewStars(productId, Number(this.dataset.rating || 5)); });
    });
    fresh.addEventListener('mouseleave', function () { rerenderStars(productId); });
  }

  function clearSlider(productId, key) {
    const input = document.getElementById(`slider-input-${key}`);
    const value = document.getElementById(`slider-value-${key}`);
    if (!input || !value) return;
    const label = input.dataset.sliderLabel;
    input.value = 5;
    input.dataset.active = 'true';
    input.classList.remove('is-inactive');
    value.textContent = '5/10';
    reviewState[productId].attributes[label] = 5;
  }

  function toggleComposer(productId) { document.getElementById(`composer-${productId}`)?.classList.toggle('open'); }
  function toggleSliders(productId) { document.getElementById(`sliders-${productId}`)?.classList.toggle('open'); }

  function initReviewState() {
    reviewState = {};
    products.forEach((product) => {
      const attributes = {};
      (product.matchingSliders || []).forEach((slider) => { if (slider.label) attributes[slider.label] = 5; });
      reviewState[product.productId] = { rating: Number(params.get('rating') || 5), attributes };
    });
  }

  function show(which) {
    ['loading', 'error', 'notDelivered', 'success', 'main'].forEach((key) => { if (ui[key]) ui[key].style.display = key === which ? 'block' : 'none'; });
  }


  function ensureSubmitModal() {
    let modal = document.getElementById('nectar-submit-confirmation-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'nectar-submit-confirmation-modal';
    modal.className = 'nectar-modal-wrap nectar-submit-modal';
    modal.innerHTML = `<div class="nectar-modal" role="dialog" aria-modal="true"><button type="button" class="nectar-modal-close" data-close-submit-modal>×</button><span class="nectar-pill">Submitted</span><h2>It’s on its way for review</h2><p>Thanks for sharing your feedback. Your review has been sent to the store team and will appear once it has been approved.</p><a class="nectar-button" href="/">Return to store</a></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-submit-modal]')?.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('open'); });
    return modal;
  }

  function showSubmitConfirmation() {
    ensureSubmitModal().classList.add('open');
  }

  function getOverallReview() {
    return {
      headline: (document.getElementById('nectar-overall-headline')?.value || '').trim(),
      comment: (document.getElementById('nectar-overall-comment')?.value || '').trim(),
    };
  }

  function getProductSpecificReview(productId) {
    return {
      headline: (document.getElementById(`headline-${productId}`)?.value || '').trim(),
      comment: (document.getElementById(`comment-${productId}`)?.value || '').trim(),
    };
  }

  async function submitReviews() {
    const overall = getOverallReview();
    const payloadReviews = products.map((product) => {
      const specific = getProductSpecificReview(product.productId);
      const state = reviewState[product.productId] || { rating: 5, attributes: {} };
      return {
        itemId: String(product.productId),
        userId: orderData.customerName || 'Verified Customer',
        email: orderData.customerEmail || params.get('email') || '',
        rating: state.rating || 5,
        headline: specific.headline || overall.headline,
        comment: specific.comment || overall.comment,
        attributes: state.attributes || {},
        productTags: getProductTags(product.raw || product),
      };
    }).filter((review) => review.headline || review.comment);

    if (!payloadReviews.length) return alert('Please add an overall review, or add product-specific wording for at least one item.');
    ui.submit.disabled = true;
    ui.submit.textContent = 'Submitting…';
    try {
      const res = await fetch(`${API}/reviews/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: SHOP_DOMAIN, orderId: orderData.orderId, email: orderData.customerEmail || params.get('email') || '', customerName: orderData.customerName, reviews: payloadReviews, isPreview: orderData.preview || params.get('test') === '1' }),
      });
      if (!res.ok) throw new Error('Submit failed');
      show('success');
      showSubmitConfirmation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error(error);
      alert('Something went wrong while submitting the reviews.');
      ui.submit.disabled = false;
      ui.submit.textContent = 'Submit All Reviews';
    }
  }

  function openSupportModal() { document.getElementById('nectar-support-modal-wrap')?.classList.add('open'); }
  function closeSupportModal() { document.getElementById('nectar-support-modal-wrap')?.classList.remove('open'); }

  async function submitSupportRequest() {
    const subject = (document.getElementById('nectar-support-subject')?.value || '').trim();
    const message = (document.getElementById('nectar-support-message')?.value || '').trim();
    if (!subject || !message) return alert('Please add both a subject and a message.');
    const btn = document.getElementById('nectar-support-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch(`${API}/support-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopDomain: SHOP_DOMAIN, orderId: orderData?.orderId || params.get('order') || '', email: orderData?.customerEmail || params.get('email') || '', customerName: orderData?.customerName || 'Customer', subject, message }) });
      if (!res.ok) throw new Error('Support request failed');
      closeSupportModal();
      alert('Your message has been sent to customer service.');
    } catch (error) {
      const email = supportConfig.email;
      if (email) window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      else window.location.href = supportConfig.url || '/pages/contact';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send message to customer service';
    }
  }

  async function boot() {
    try {
      await fetchConfig();
      orderData = await fetchOrderData();
      supportConfig = { ...supportConfig, ...(orderData.support || {}) };
      products = uniqueProducts((orderData.products || []).map(normaliseProduct));
      if (!products.length) throw new Error('No products found');
      initReviewState();
      buildSummary(orderData);
      renderProducts();
      show('main');
    } catch (error) {
      console.error(error);
      if (error.code === 'NOT_DELIVERED') show('notDelivered');
      else show('error');
    }
  }

  window.NectarReviewPage = { openSupportModal, closeSupportModal, toggleComposer, toggleSliders, clearSlider };
  ui.submit?.addEventListener('click', submitReviews);
  document.getElementById('nectar-help-button')?.addEventListener('click', openSupportModal);
  document.getElementById('nectar-support-submit')?.addEventListener('click', submitSupportRequest);
  document.querySelectorAll('[data-nectar-close-support]').forEach((btn) => btn.addEventListener('click', closeSupportModal));
  document.getElementById('nectar-support-modal-wrap')?.addEventListener('click', function (event) { if (event.target === this) closeSupportModal(); });
  boot();
})();
