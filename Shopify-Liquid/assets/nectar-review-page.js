(function () {
  const root = document.querySelector('.nectar-review-page');
  if (!root) return;

  const API = root.dataset.apiUrl || 'https://nectar-reviews-api.onrender.com/api';
  const SHOP_DOMAIN = root.dataset.shopDomain || window.location.hostname;

  const supportDefaults = {
    enabled: true,
    heading: root.dataset.supportHeading || 'Need help with your order?',
    text: root.dataset.supportText || 'If something didn’t go to plan, tell customer service first — we’d love the chance to sort it out.',
    buttonText: root.dataset.supportButton || 'Get help with this order',
    email: root.dataset.supportEmail || '',
    url: root.dataset.supportUrl || '/pages/contact'
  };

  const params = new URLSearchParams(window.location.search);
  const orderIdParam = params.get('orderId') || params.get('order') || '';
  const emailParam = params.get('email') || '';
  const previewMode = params.get('preview') === '1' || params.get('preview') === 'true';
  const previewPayloadEncoded = params.get('preview_data') || params.get('payload') || '';
  const focusProductId = params.get('productId') || params.get('product_id') || '';
  const preselectedRating = parseInt(params.get('rating') || '0', 10) || 0;

  const ui = {
    loading: document.getElementById('nectar-loading'),
    error: document.getElementById('nectar-error'),
    notDelivered: document.getElementById('nectar-not-delivered'),
    success: document.getElementById('nectar-success'),
    main: document.getElementById('nectar-main'),
    summary: document.getElementById('nectar-order-summary'),
    list: document.getElementById('nectar-review-list'),
    submit: document.getElementById('nectar-submit-btn'),
    previewPill: document.getElementById('nectar-preview-pill')
  };

  let appConfig = {};
  let orderData = null;
  let products = [];
  let reviewState = {};
  let deliveredGateEnabled = true;
  let supportConfig = { ...supportDefaults };

  function safeJsonParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  function decodePreviewPayload(encoded) {
    if (!encoded) return null;

    try {
      let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';

      const decoded = atob(base64);

      try {
        return JSON.parse(decodeURIComponent(escape(decoded)));
      } catch (e) {
        return safeJsonParse(decoded);
      }
    } catch (e) {
      console.error('Failed to decode preview payload', e);
      return null;
    }
  }

  function lowerArray(arr) {
    return (arr || []).map(v => String(v).trim().toLowerCase()).filter(Boolean);
  }

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function sliderKey(productId, label) {
    return `${slug(productId)}-${slug(label)}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getProductTags(product) {
    if (!product) return [];
    if (Array.isArray(product.tags)) return product.tags;
    if (typeof product.tags === 'string') {
      return product.tags.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
  }

  function getConfigProfiles() {
    return appConfig.attributeProfiles || appConfig.profiles || [];
  }

  function getMatchingSliders(product) {
    const profiles = getConfigProfiles();
    const tags = lowerArray(getProductTags(product));
    const metafields = product && product.metafields ? product.metafields : {};

    return profiles.filter(profile => {
      const type = String(profile.type || profile.ruleType || '').toLowerCase();
      const condition = String(profile.condition || profile.value || '').trim().toLowerCase();
      const label = String(profile.label || '').trim();

      if (!condition || !label) return false;

      if (type === 'tag') return tags.includes(condition);

      if (type === 'metafield') {
        if (!metafields) return false;

        if (Array.isArray(metafields)) {
          return metafields.some(m => {
            const key = String(m.key || '').toLowerCase();
            const value = String(m.value || '').toLowerCase();
            return key === condition || value === condition;
          });
        }

        return Object.entries(metafields).some(([key, value]) => {
          return `${String(key).toLowerCase()} ${String(value).toLowerCase()}`.includes(condition);
        });
      }

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

      deliveredGateEnabled = appConfig.requireDeliveredTag !== false;
    } catch (e) {
      console.error('Failed to fetch config', e);
    }
  }

  async function fetchOrderData() {
    if (previewMode) {
      const payload = decodePreviewPayload(previewPayloadEncoded);
      if (!payload) throw new Error('Invalid preview payload');

      ui.previewPill.style.display = 'inline-flex';

      const customerName = payload.customerName || payload.customer?.name || 'Preview Customer';
      const customerEmail = payload.customerEmail || payload.customer?.email || 'preview@example.com';
      const payloadOrder = payload.order || {};

      supportConfig = { ...supportConfig, ...(payload.support || {}) };

      return {
        orderId: payload.orderId || payloadOrder.number || payloadOrder.name || '1001',
        customerName,
        customerEmail,
        products: payload.products || [],
        delivered: true,
        preview: true,
        support: payload.support || {}
      };
    }

    if (!orderIdParam || !emailParam) {
      throw new Error('Missing order data');
    }

    const res = await fetch(
      `${API}/magic-link/order?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&orderId=${encodeURIComponent(orderIdParam)}&email=${encodeURIComponent(emailParam)}&t=${Date.now()}`
    );

    if (res.status === 403) {
      const error = new Error('Order not delivered yet');
      error.code = 'NOT_DELIVERED';
      throw error;
    }

    if (!res.ok) throw new Error('Invalid or expired link');

    return await res.json();
  }

  function normaliseProduct(raw, index) {
    const productId = String(raw.productId || raw.itemId || raw.id || `product-${index + 1}`);
    const image = raw.image || raw.productImage || raw.imageUrl || 'https://cdn.shopify.com/s/images/admin/no-image-large.gif';

    return {
      productId,
      name: raw.name || raw.title || `Product ${index + 1}`,
      image,
      tags: getProductTags(raw),
      note: raw.customMessage || raw.message || '',
      matchingSliders: getMatchingSliders(raw),
      raw
    };
  }

  function uniqueProducts(inputProducts) {
    const seen = new Set();
    const output = [];

    inputProducts.forEach(product => {
      const id = String(product.productId || product.id || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      output.push(product);
    });

    return output;
  }

  function buildSummary(data) {
    const total = products.length;

    ui.summary.innerHTML = `
      <div class="nectar-summary-box">
        <div class="nectar-summary-label">Customer</div>
        <div class="nectar-summary-value">${escapeHtml(data.customerName || 'Customer')}</div>
      </div>
      <div class="nectar-summary-box">
        <div class="nectar-summary-label">Order</div>
        <div class="nectar-summary-value">#${escapeHtml(String(data.orderId || orderIdParam || '—').replace(/^#/, ''))}</div>
      </div>
      <div class="nectar-summary-box">
        <div class="nectar-summary-label">Reviewing</div>
        <div class="nectar-summary-value">${total} item${total === 1 ? '' : 's'}</div>
      </div>
    `;
  }

  function renderStars(productId) {
    const rating = reviewState[productId]?.rating || 0;
    let html = '';

    for (let i = 1; i <= 5; i++) {
      html += `
        <button
          type="button"
          class="nectar-star ${i <= rating ? 'active' : ''}"
          data-product-id="${escapeHtml(productId)}"
          data-rating="${i}"
          aria-label="Rate ${i} star${i > 1 ? 's' : ''}"
        >★</button>
      `;
    }

    return html;
  }

  function renderSliderPanel(product) {
    if (!product.matchingSliders.length) return '';

    return `
      <div id="sliders-${escapeHtml(product.productId)}" class="nectar-expand-panel">
        <div class="nectar-panel-heading">
          <div>
            <strong>Optional detailed ratings</strong>
            <p>These start as X/10 and are only counted if you move the slider. Use the X beside a slider to clear it.</p>
          </div>
          <button type="button" class="nectar-panel-close" data-toggle-sliders="${escapeHtml(product.productId)}">×</button>
        </div>

        <div class="nectar-slider-wrap">
          ${product.matchingSliders.map(slider => {
            const label = slider.label || '';
            const key = sliderKey(product.productId, label);

            return `
              <div class="nectar-slider-row">
                <div class="nectar-slider-head">
                  <div class="nectar-slider-label">${escapeHtml(label)}</div>
                  <div class="nectar-slider-controls">
                    <div class="nectar-slider-value" id="slider-value-${escapeHtml(key)}">X/10</div>
                    <button
                      type="button"
                      class="nectar-slider-clear"
                      title="Clear this slider"
                      data-clear-slider="true"
                      data-product-id="${escapeHtml(product.productId)}"
                      data-slider-key="${escapeHtml(key)}"
                    >×</button>
                  </div>
                </div>

                <input
                  id="slider-input-${escapeHtml(key)}"
                  type="range"
                  min="1"
                  max="10"
                  value="5"
                  class="nectar-range is-inactive"
                  data-product-id="${escapeHtml(product.productId)}"
                  data-slider-label="${escapeHtml(label)}"
                  data-slider-key="${escapeHtml(key)}"
                  data-active="false"
                >
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderComposerPanel(product) {
    return `
      <div id="composer-${escapeHtml(product.productId)}" class="nectar-expand-panel">
        <div class="nectar-panel-heading">
          <div>
            <strong>Add a product specific review</strong>
            <p>If you write something here, it will replace the overall review for this product only.</p>
          </div>
          <button type="button" class="nectar-panel-close" data-toggle-composer="${escapeHtml(product.productId)}">×</button>
        </div>

        <div class="nectar-field-grid">
          <input id="headline-${escapeHtml(product.productId)}" class="nectar-input" placeholder="Product specific review title, optional">
          <textarea id="comment-${escapeHtml(product.productId)}" class="nectar-textarea" placeholder="Write a product specific review for ${escapeHtml(product.name)}…"></textarea>
        </div>
      </div>
    `;
  }

  function renderProductCard(product) {
    const hasSliders = product.matchingSliders.length > 0;

    return `
      <div class="nectar-review-card" id="card-${escapeHtml(product.productId)}">
        <div class="nectar-review-card-top">
          <div class="nectar-review-left">
            <img class="nectar-product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">

            <div class="nectar-product-meta">
              <h3 class="nectar-product-name">${escapeHtml(product.name)}</h3>

              ${product.note ? `<p class="nectar-product-note">${escapeHtml(product.note)}</p>` : ''}

              <div class="nectar-stars" id="stars-${escapeHtml(product.productId)}">
                ${renderStars(product.productId)}
              </div>

              <div class="nectar-actions-inline">
                <button class="nectar-icon-btn" type="button" data-toggle-composer="${escapeHtml(product.productId)}">
                  💬 Add a product specific review
                </button>

                ${hasSliders ? `
                  <button class="nectar-icon-btn" type="button" data-toggle-sliders="${escapeHtml(product.productId)}">
                    🎚️ Add detailed ratings
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="nectar-right-box">
            <div>
              <div class="nectar-right-box-title">This item</div>
              <div style="font-size:14px; color: var(--muted); line-height:1.5; margin-top:8px;">
                Add separate wording for this product, or use the overall review above.
              </div>
            </div>

            <div style="display:grid; gap:10px;">
              <button class="nectar-solid-btn" type="button" data-toggle-composer="${escapeHtml(product.productId)}">
                Add product review
              </button>

              ${hasSliders ? `
                <button class="nectar-outline-btn" type="button" data-toggle-sliders="${escapeHtml(product.productId)}">
                  Show sliders
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        ${renderComposerPanel(product)}
        ${renderSliderPanel(product)}
      </div>
    `;
  }

  function renderProducts() {
    ui.list.innerHTML = products.map(renderProductCard).join('');

    ui.list.querySelectorAll('.nectar-star').forEach(btn => {
      btn.addEventListener('click', function () {
        const productId = this.getAttribute('data-product-id');
        const rating = parseInt(this.getAttribute('data-rating'), 10);
        reviewState[productId].rating = rating;
        rerenderStars(productId);
      });
    });

    ui.list.querySelectorAll('.nectar-range').forEach(input => {
      input.addEventListener('input', function () {
        const productId = this.getAttribute('data-product-id');
        const label = this.getAttribute('data-slider-label');
        const key = this.getAttribute('data-slider-key');
        const value = parseInt(this.value, 10);

        this.dataset.active = 'true';
        this.classList.remove('is-inactive');
        reviewState[productId].attributes[label] = value;

        const target = document.getElementById(`slider-value-${key}`);
        if (target) target.textContent = `${value}/10`;
      });
    });

    ui.list.querySelectorAll('[data-clear-slider="true"]').forEach(btn => {
      btn.addEventListener('click', function () {
        clearSlider(this.getAttribute('data-product-id'), this.getAttribute('data-slider-key'));
      });
    });

    ui.list.querySelectorAll('[data-toggle-composer]').forEach(btn => {
      btn.addEventListener('click', function () {
        toggleComposer(this.getAttribute('data-toggle-composer'));
      });
    });

    ui.list.querySelectorAll('[data-toggle-sliders]').forEach(btn => {
      btn.addEventListener('click', function () {
        toggleSliders(this.getAttribute('data-toggle-sliders'));
      });
    });
  }

  function rerenderStars(productId) {
    const wrap = document.getElementById(`stars-${productId}`);
    if (!wrap) return;

    wrap.innerHTML = renderStars(productId);

    wrap.querySelectorAll('.nectar-star').forEach(btn => {
      btn.addEventListener('click', function () {
        const rating = parseInt(this.getAttribute('data-rating'), 10);
        reviewState[productId].rating = rating;
        rerenderStars(productId);
      });
    });
  }

  function initReviewState() {
    reviewState = {};

    products.forEach(product => {
      reviewState[product.productId] = {
        rating: preselectedRating || 5,
        attributes: {}
      };
    });
  }

  function updateSupportUi() {
    const strip = document.getElementById('nectar-help-strip');

    if (supportConfig.enabled === false) {
      strip.style.display = 'none';
      return;
    }

    strip.style.display = 'block';

    document.getElementById('nectar-help-heading').textContent = supportConfig.heading || supportDefaults.heading;
    document.getElementById('nectar-help-text').textContent = supportConfig.text || supportDefaults.text;
    document.getElementById('nectar-help-button').textContent = supportConfig.buttonText || supportDefaults.buttonText;
  }

  function showMain() {
    ui.loading.style.display = 'none';
    ui.error.style.display = 'none';
    ui.notDelivered.style.display = 'none';
    ui.success.style.display = 'none';
    ui.main.style.display = 'block';
  }

  function showError() {
    ui.loading.style.display = 'none';
    ui.main.style.display = 'none';
    ui.success.style.display = 'none';
    ui.notDelivered.style.display = 'none';
    ui.error.style.display = 'block';
  }

  function showNotDelivered() {
    ui.loading.style.display = 'none';
    ui.main.style.display = 'none';
    ui.success.style.display = 'none';
    ui.error.style.display = 'none';
    ui.notDelivered.style.display = 'block';
  }

  function showSuccess() {
    ui.main.style.display = 'none';
    ui.loading.style.display = 'none';
    ui.error.style.display = 'none';
    ui.notDelivered.style.display = 'none';
    ui.success.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getOverallReview() {
    return {
      headline: (document.getElementById('nectar-overall-headline')?.value || '').trim(),
      comment: (document.getElementById('nectar-overall-comment')?.value || '').trim()
    };
  }

  function getProductSpecificReview(productId) {
    return {
      headline: (document.getElementById(`headline-${productId}`)?.value || '').trim(),
      comment: (document.getElementById(`comment-${productId}`)?.value || '').trim()
    };
  }

  function clearSlider(productId, key) {
    const input = document.getElementById(`slider-input-${key}`);
    const value = document.getElementById(`slider-value-${key}`);
    if (!input || !value) return;

    const label = input.getAttribute('data-slider-label');

    input.value = 5;
    input.dataset.active = 'false';
    input.classList.add('is-inactive');
    value.textContent = 'X/10';

    if (reviewState[productId] && reviewState[productId].attributes) {
      delete reviewState[productId].attributes[label];
    }
  }

  async function submitReviews() {
    const overall = getOverallReview();

    const payloadReviews = products.reduce((acc, product) => {
      const state = reviewState[product.productId];
      const productSpecific = getProductSpecificReview(product.productId);

      const headline = productSpecific.headline || overall.headline;
      const comment = productSpecific.comment || overall.comment;

      if (!state || !state.rating) return acc;
      if (!headline && !comment) return acc;

      acc.push({
        itemId: String(product.productId),
        userId: orderData.customerName || 'Verified Customer',
        email: orderData.customerEmail || emailParam || '',
        isAnonymous: false,
        rating: state.rating,
        headline,
        comment,
        attributes: state.attributes || {},
        productTags: getProductTags(product.raw || product),
        isTestReview: previewMode === true
      });

      return acc;
    }, []);

    if (!payloadReviews.length) {
      alert('Please add an overall review, or add a product specific review for at least one item.');
      return;
    }

    ui.submit.disabled = true;
    ui.submit.textContent = 'Submitting…';

    try {
      const res = await fetch(`${API}/reviews/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: SHOP_DOMAIN,
          orderId: orderData.orderId || orderIdParam,
          email: orderData.customerEmail || emailParam,
          reviews: payloadReviews,
          isPreview: previewMode === true,
          testMode: previewMode === true
        })
      });

      if (!res.ok) throw new Error('Submit failed');

      showSuccess();
    } catch (e) {
      console.error(e);
      alert('Something went wrong while submitting the reviews.');
      ui.submit.disabled = false;
      ui.submit.textContent = 'Submit All Reviews';
    }
  }

  async function submitSupportRequest() {
    const subject = (document.getElementById('nectar-support-subject').value || '').trim();
    const message = (document.getElementById('nectar-support-message').value || '').trim();

    if (!subject || !message) {
      alert('Please add both a subject and a message.');
      return;
    }

    const btn = document.getElementById('nectar-support-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await fetch(`${API}/support-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: SHOP_DOMAIN,
          orderId: orderData.orderId || orderIdParam,
          email: orderData.customerEmail || emailParam,
          customerName: orderData.customerName || 'Customer',
          subject,
          message,
          products: products.map(product => ({
            productId: product.productId,
            name: product.name
          }))
        })
      });

      if (!res.ok) throw new Error('Support request failed');

      closeSupportModal();
      alert('Your message has been sent to customer service.');
      document.getElementById('nectar-support-subject').value = '';
      document.getElementById('nectar-support-message').value = '';
    } catch (e) {
      console.error(e);

      const fallbackEmail = supportConfig.email || supportDefaults.email;
      const fallbackUrl = supportConfig.url || supportDefaults.url || '/pages/contact';

      if (fallbackEmail) {
        window.location.href = `mailto:${encodeURIComponent(fallbackEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      } else {
        window.location.href = fallbackUrl;
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send message to customer service';
    }
  }

  function openSupportModal() {
    document.getElementById('nectar-support-modal-wrap').classList.add('open');
  }

  function closeSupportModal() {
    document.getElementById('nectar-support-modal-wrap').classList.remove('open');
  }

  function toggleComposer(productId) {
    const panel = document.getElementById(`composer-${productId}`);
    if (panel) panel.classList.toggle('open');
  }

  function toggleSliders(productId) {
    const panel = document.getElementById(`sliders-${productId}`);
    if (panel) panel.classList.toggle('open');
  }

  async function boot() {
    try {
      await fetchConfig();
      orderData = await fetchOrderData();

      supportConfig = { ...supportConfig, ...(orderData.support || {}) };

      if (deliveredGateEnabled && !previewMode) {
        const tags = lowerArray(orderData.order?.tags || orderData.tags || []);
        const delivered = orderData.delivered === true || tags.includes('delivered');

        if (!delivered) {
          const error = new Error('Order not delivered yet');
          error.code = 'NOT_DELIVERED';
          throw error;
        }
      }

      products = uniqueProducts((orderData.products || []).map(normaliseProduct)).filter(Boolean);
      if (!products.length) throw new Error('No products found');

      initReviewState();
      buildSummary(orderData);
      renderProducts();
      updateSupportUi();
      showMain();

      if (focusProductId) {
        toggleComposer(focusProductId);

        const targetProduct = products.find(p => String(p.productId) === String(focusProductId));
        if (targetProduct && targetProduct.matchingSliders.length) toggleSliders(focusProductId);

        const target = document.getElementById(`card-${focusProductId}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      console.error(e);

      if (e && e.code === 'NOT_DELIVERED') showNotDelivered();
      else showError();
    }
  }

  window.NectarReviewPage = {
    openSupportModal,
    closeSupportModal,
    toggleComposer,
    toggleSliders,
    clearSlider
  };

  if (ui.submit) ui.submit.addEventListener('click', submitReviews);

  const supportButton = document.getElementById('nectar-help-button');
  if (supportButton) supportButton.addEventListener('click', openSupportModal);

  const supportSubmit = document.getElementById('nectar-support-submit');
  if (supportSubmit) supportSubmit.addEventListener('click', submitSupportRequest);

  const closeSupportButtons = document.querySelectorAll('[data-nectar-close-support]');
  closeSupportButtons.forEach(btn => btn.addEventListener('click', closeSupportModal));

  const modalWrap = document.getElementById('nectar-support-modal-wrap');
  if (modalWrap) {
    modalWrap.addEventListener('click', function (e) {
      if (e.target === this) closeSupportModal();
    });
  }

  boot();
})();