(function () {
  const root = document.querySelector('.nectar-review-page');
  if (!root) return;

  const API = (root.dataset.apiUrl || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
  const SHOP_DOMAIN = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
  const CUSTOMER_LOGGED_IN = root.dataset.customerLoggedIn === 'true';
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
    const tags = getProductTags(product).map((v) => String(v).toLowerCase().trim());
    const haystack = [
      ...tags,
      String(product?.title || product?.name || '').toLowerCase(),
      String(product?.handle || '').toLowerCase(),
      String(product?.productId || product?.id || '').toLowerCase(),
    ].filter(Boolean);
    return profiles.filter((profile) => {
      const type = String(profile.type || profile.ruleType || '').toLowerCase().replace(/[^a-z]/g, '');
      const condition = String(profile.condition || profile.value || '').trim().toLowerCase();
      const label = String(profile.label || '').trim();
      if (!label) return false;
      if (type === 'all' || type === 'global') return true;
      if (!condition) return false;
      if (type === 'tag' || type === 'producttag') return tags.includes(condition);
      if (type === 'product' || type === 'productid') return String(product?.productId || product?.id || '').toLowerCase() === condition;
      if (type === 'vendor') return String(product?.vendor || '').toLowerCase() === condition;
      if (type === 'type' || type === 'producttype') return String(product?.type || product?.productType || '').toLowerCase() === condition;
      if (type === 'metafield' || type === 'metafieldkey') return haystack.some((part) => part.includes(condition));
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
      root.style.setProperty('--nectar-review-star-size', `${Number(styles.reviewStarSize || 52)}px`);
      root.style.setProperty('--nectar-slider-track', (styles.sliderTrackColor && styles.sliderTrackColor !== '#ffffff') ? styles.sliderTrackColor : '#e6ebf1');
      root.style.setProperty('--nectar-slider-knob', styles.sliderKnobColor || '#111111');
      root.dataset.starAlign = styles.reviewStarAlignment || 'center';
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
      handle: raw.handle || '',
      metafields: raw.metafields || {},
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


  async function markAlreadyReviewedProducts() {
    const email = orderData?.customerEmail || params.get('email') || '';
    if (!email || !products.length) return [];
    const query = new URLSearchParams({
      shopDomain: SHOP_DOMAIN,
      email,
      orderId: orderData?.orderId || params.get('orderId') || params.get('order') || '',
      products: JSON.stringify(products.map((product) => ({ productId: product.productId, id: product.id }))),
    });
    try {
      const res = await fetch(`${API}/reviews/already-reviewed?${query.toString()}&t=${Date.now()}`);
      if (!res.ok) return [];
      const json = await res.json();
      const reviewed = new Set((json.reviewedProductIds || orderData?.alreadyReviewedProductIds || []).map(String));
      products = products.map((product) => ({ ...product, alreadyReviewed: reviewed.has(String(product.productId)) || reviewed.has(String(product.id)) }));
      return Array.from(reviewed);
    } catch (error) {
      console.warn('Could not check already-reviewed products:', error);
      return [];
    }
  }

  function showAlreadyReviewedNotice(allReviewed) {
    let notice = document.getElementById('nectar-already-reviewed-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'nectar-already-reviewed-notice';
      notice.className = 'nectar-already-reviewed-notice';
      ui.main?.insertBefore(notice, ui.list);
    }
    notice.innerHTML = allReviewed
      ? '<strong>You’ve already reviewed these products.</strong><span>Thanks again — this review link cannot be used a second time for the same products.</span>'
      : '<strong>Some products have already been reviewed.</strong><span>You can still review the remaining products below.</span>';
    notice.style.display = 'block';
    if (ui.submit && allReviewed) {
      ui.submit.disabled = true;
      ui.submit.textContent = 'Already reviewed';
    }
  }

  function maskName(name) {
    const clean = String(name || 'Customer').trim();
    return clean ? `${clean.charAt(0).toUpperCase()}***` : 'Customer';
  }

  function buildSummary(data) {
    const publicName = CUSTOMER_LOGGED_IN ? (data.customerName || 'Customer') : maskName(data.customerName || 'Customer');
    const preview = document.getElementById('nectar-name-preview');
    if (preview) preview.textContent = maskName(data.customerName || 'Customer');
    ui.summary.innerHTML = `
      <div><span>Customer</span><strong>${escapeHtml(publicName)}</strong></div>
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
      <h4>Optional product scores</h4>
      <p class="nectar-panel-help">Scores start at 0 and are only submitted when a customer moves the slider.</p>
      ${product.matchingSliders.map((slider) => {
        const label = slider.label || '';
        const key = sliderKey(product.productId, label);
        return `<label class="nectar-range-row"><span>${escapeHtml(label)}</span><div class="nectar-range-wrap"><input id="slider-input-${key}" class="nectar-range is-inactive" type="range" min="0" max="10" value="0" data-active="false" data-product-id="${escapeHtml(product.productId)}" data-slider-label="${escapeHtml(label)}" data-slider-key="${key}"><button class="nectar-clear-slider" type="button" data-clear-slider="true" data-product-id="${escapeHtml(product.productId)}" data-slider-key="${key}" aria-label="Clear ${escapeHtml(label)}">×</button></div><output id="slider-value-${key}">Not scored</output></label>`;
      }).join('')}
    </div>`;
  }

  function renderProductCard(product) {
    if (product.alreadyReviewed) {
      return `<article id="card-${escapeHtml(product.productId)}" class="nectar-product-card nectar-product-reviewed">
        <div class="nectar-product-main-row">
          <div class="nectar-product-head">${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div class="nectar-product-img-placeholder"></div>'}<div><h3>${escapeHtml(product.name)}</h3><small>Product ID: ${escapeHtml(product.productId)}</small></div></div>
          <span class="nectar-reviewed-pill">Already reviewed</span>
        </div>
        <p class="nectar-panel-help">You have already submitted a review for this product. It cannot be submitted again from this link.</p>
      </article>`;
    }
    return `<article id="card-${escapeHtml(product.productId)}" class="nectar-product-card">
      <div class="nectar-product-main-row">
        <div class="nectar-product-head">${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div class="nectar-product-img-placeholder"></div>'}<div><h3>${escapeHtml(product.name)}</h3><small>Product ID: ${escapeHtml(product.productId)}</small></div></div>
        ${renderStars(product.productId)}
      </div>
      ${renderSliderPanel(product)}
      <button type="button" class="nectar-link-btn" data-toggle-composer="${escapeHtml(product.productId)}">Add a product specific review</button>
      <div id="composer-${escapeHtml(product.productId)}" class="nectar-detail-panel"><label>Product headline<input id="headline-${escapeHtml(product.productId)}" type="text"></label><label>Product review<textarea id="comment-${escapeHtml(product.productId)}"></textarea></label></div>
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
      const numeric = Number(this.value || 0);
      const target = document.getElementById(`slider-value-${this.dataset.sliderKey}`);
      if (numeric > 0) {
        this.dataset.active = 'true';
        this.classList.remove('is-inactive');
        reviewState[productId].attributes[label] = numeric;
        if (target) target.textContent = `${numeric}/10`;
      } else {
        this.dataset.active = 'false';
        this.classList.add('is-inactive');
        delete reviewState[productId].attributes[label];
        if (target) target.textContent = 'Not scored';
      }
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
    input.value = 0;
    input.dataset.active = 'false';
    input.classList.add('is-inactive');
    value.textContent = 'Not scored';
    delete reviewState[productId].attributes[label];
  }

  function toggleComposer(productId) { document.getElementById(`composer-${productId}`)?.classList.toggle('open'); }
  function toggleSliders(productId) { document.getElementById(`sliders-${productId}`)?.classList.toggle('open'); }

  function initReviewState() {
    reviewState = {};
    products.forEach((product) => {
      reviewState[product.productId] = { rating: Number(params.get('rating') || 5), attributes: {} };
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
    const submitEmail = orderData.customerEmail || params.get('email') || (document.getElementById('nectar-customer-email')?.value || '').trim();
    if (!submitEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitEmail)) return alert('A valid email is required before submitting reviews.');
    const reviewableProducts = products.filter((product) => !product.alreadyReviewed);
    if (!reviewableProducts.length) {
      showAlreadyReviewedNotice(true);
      return;
    }
    const payloadReviews = reviewableProducts.map((product) => {
      const specific = getProductSpecificReview(product.productId);
      const state = reviewState[product.productId] || { rating: 5, attributes: {} };
      return {
        itemId: String(product.productId),
        userId: orderData.customerName || 'Verified Customer',
        email: submitEmail,
        rating: state.rating || 5,
        headline: specific.headline || overall.headline,
        comment: specific.comment || overall.comment,
        attributes: Object.fromEntries(Object.entries(state.attributes || {}).filter(([, value]) => Number(value) > 0)),
        productTags: getProductTags(product.raw || product),
        isAnonymous: Boolean(document.getElementById('nectar-hide-name')?.checked),
      };
    }).filter((review) => review.headline || review.comment);

    if (!payloadReviews.length) return alert('Please add an overall review, or add product-specific wording for at least one item.');
    ui.submit.disabled = true;
    ui.submit.textContent = 'Submitting…';
    try {
      const res = await fetch(`${API}/reviews/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: SHOP_DOMAIN, orderId: orderData.orderId, email: submitEmail, customerName: orderData.customerName, reviews: payloadReviews, reviewToken: params.get('token') || params.get('reviewToken') || '', isPreview: orderData.preview || params.get('test') === '1' }),
      });
      if (!res.ok) {
        let message = 'Submit failed';
        let json = null;
        try { json = await res.json(); message = json.error || message; } catch (_) {}
        if (json?.alreadyReviewed || res.status === 409) {
          const reviewed = new Set((json.reviewedItemIds || json.reviewedProductIds || []).map(String));
          products = products.map((product) => ({ ...product, alreadyReviewed: reviewed.has(String(product.productId)) || reviewed.has(String(product.id)) || !reviewed.size }));
          renderProducts();
          showAlreadyReviewedNotice(true);
          ui.submit.disabled = true;
          ui.submit.textContent = 'Already reviewed';
          return;
        }
        throw new Error(message);
      }
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
      const res = await fetch(`${API}/support-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopDomain: SHOP_DOMAIN, orderId: orderData?.orderId || params.get('order') || '', email: orderData?.customerEmail || params.get('email') || '', customerName: orderData?.customerName || 'Customer', subject, message, reviewToken: params.get('token') || params.get('reviewToken') || '', products: products.map((product) => ({ id: product.id, productId: product.productId, title: product.title })).slice(0, 20) }) });
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
      await markAlreadyReviewedProducts();
      const alreadyReviewedIds = new Set([...(orderData.alreadyReviewedProductIds || [])].map(String));
      if (alreadyReviewedIds.size) {
        products = products.map((product) => ({ ...product, alreadyReviewed: product.alreadyReviewed || alreadyReviewedIds.has(String(product.productId)) || alreadyReviewedIds.has(String(product.id)) }));
      }
      const allReviewed = products.length && products.every((product) => product.alreadyReviewed);
      if (products.some((product) => product.alreadyReviewed)) showAlreadyReviewedNotice(allReviewed);
      initReviewState();
      buildSummary(orderData);
      if (!orderData.customerEmail && !params.get('email')) {
        const emailWrap = document.getElementById('nectar-email-wrap');
        if (emailWrap) emailWrap.style.display = 'block';
      }
      renderProducts();
      show('main');
      if (params.get('support') === '1' || params.get('openSupport') === '1') {
        const subjectInput = document.getElementById('nectar-support-subject');
        if (subjectInput && !subjectInput.value) subjectInput.value = `Help with order ${orderData.orderId || params.get('order') || ''}`.trim();
        setTimeout(openSupportModal, 120);
      }
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
