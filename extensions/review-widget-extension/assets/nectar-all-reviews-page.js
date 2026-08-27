(function(){
  const roots = document.querySelectorAll('.nectar-seo-reviews-page');
  if (!roots.length) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));

  const cleanText = (value) => String(value ?? '').trim();
  const productUrl = (shopDomain, item = {}) => {
    if (item.productUrl) return item.productUrl;
    if (item.productHandle) return `https://${String(shopDomain).replace(/^https?:\/\//,'')}/products/${encodeURIComponent(item.productHandle)}`;
    return '';
  };
  const stars = (value) => {
    const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    return '★★★★★'.split('').map((_, i) => `<span class="${i < rating ? 'on' : ''}">★</span>`).join('');
  };
  const mediaUrl = (review = {}) => {
    const media = Array.isArray(review.media) ? review.media : [];
    const first = media.find((item) => {
      const url = typeof item === 'string' ? item : (item?.url || item?.src || item?.image || '');
      return /^https:\/\//i.test(String(url || ''));
    });
    return first ? (typeof first === 'string' ? first : (first.url || first.src || first.image || '')) : '';
  };
  const initials = (review = {}) => cleanText(review.productTitle || review.headline || 'R').charAt(0).toUpperCase() || 'R';
  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { day:'numeric', month:'short', year:'numeric' }).format(date);
  };
  const attributeTags = (review = {}) => {
    const attrs = review.attributes && typeof review.attributes === 'object' ? review.attributes : {};
    return Object.entries(attrs).slice(0,4).map(([key, value]) => `<em>${esc(key)}: ${esc(value)}/10</em>`).join('');
  };

  function recommendationCard(shopDomain, item){
    const url = productUrl(shopDomain, item);
    const chips = [
      ...(item.matchedTags || []).slice(0,2).map((tag) => `<span>${esc(tag.label)}</span>`),
      ...(item.flavourProfile || []).slice(0,2).map((tag) => `<span>${esc(tag.label)} ${esc(tag.average)}/10</span>`)
    ].join('');
    return `<article class="nectar-seo-rec-card">
      <div class="nectar-seo-rec-card__top"><strong>${esc(item.productTitle || 'Recommended product')}</strong><b>★ ${esc(item.average || 0)}</b></div>
      ${item.bestQuote ? `<p>“${esc(item.bestQuote)}”</p>` : '<p>Popular with customers based on approved review data.</p>'}
      <div class="nectar-seo-rec-card__chips">${chips}</div>
      ${url ? `<a href="${esc(url)}">View product →</a>` : ''}
    </article>`;
  }

  function reviewCard(shopDomain, review){
    const url = productUrl(shopDomain, review);
    const image = mediaUrl(review);
    const tagHtml = [
      ...attributeTags(review),
      ...(review.productTags || []).slice(0,3).map((tag) => `<em>${esc(tag)}</em>`)
    ].join('');
    const reviewer = review.isAnonymous ? 'Verified customer' : (review.userId || 'Customer');
    return `<article class="nectar-seo-review">
      <div class="nectar-seo-review__media">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : esc(initials(review))}</div>
      <div class="nectar-seo-review__content">
        <div class="nectar-seo-review__product">${url ? `<a href="${esc(url)}">${esc(review.productTitle || 'Customer review')}</a>` : esc(review.productTitle || 'Customer review')}</div>
        <div class="nectar-seo-review__rating">
          <span class="nectar-seo-stars">${stars(review.rating)}</span><b>${esc(review.rating || '')}</b>
          ${review.verifiedPurchase ? '<span class="nectar-seo-verified">✓ Verified Purchase</span>' : ''}
        </div>
        ${review.headline ? `<h3>${esc(review.headline)}</h3>` : ''}
        <p class="nectar-seo-review__body">${esc(review.comment || '')}</p>
        ${tagHtml ? `<div class="nectar-seo-review__tags">${tagHtml}</div>` : ''}
      </div>
      <div class="nectar-seo-review__meta">
        <strong>${esc(reviewer)}</strong>
        ${review.createdAt ? `<time datetime="${esc(review.createdAt)}">${esc(formatDate(review.createdAt))}</time>` : ''}
        ${review.sourceLabel ? `<span>${esc(review.sourceLabel)}</span>` : ''}
      </div>
    </article>`;
  }

  function populateAmbient(root, reviews = []){
    const cards = root.querySelectorAll('.nectar-seo-float');
    const usable = reviews.filter((review) => review.comment || review.productTitle);
    cards.forEach((card, index) => {
      const review = usable[index % Math.max(usable.length, 1)];
      if (!review) return;
      const image = mediaUrl(review);
      const media = card.querySelector('.nectar-seo-float__media');
      if (media && image) media.style.backgroundImage = `url("${String(image).replace(/"/g, '%22')}")`;
      const safeTitle = esc(review.productTitle || 'Customer review');
      const safeComment = esc(cleanText(review.comment).slice(0, 78));
      const safeStars = '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(review.rating || 5)))));
      card.innerHTML = `${media ? media.outerHTML : '<span class="nectar-seo-float__media"></span>'}<span><strong>${safeTitle}</strong><small>${safeStars}</small><p>${safeComment}</p></span>`;
    });
  }

  roots.forEach((root) => {
    const configured = cleanText(root.dataset.apiUrl);
    const api = (configured && !configured.startsWith('/api') ? configured : 'https://nectar-reviews-api.onrender.com/api')
      .replace(/\/api\/api$/,'/api').replace(/\/$/,'');
    const shopDomain = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
    const limit = root.dataset.limit || '120';
    const summary = root.querySelector('[data-nectar-seo-summary]');
    const list = root.querySelector('[data-nectar-seo-list]');
    const tags = root.querySelector('[data-nectar-seo-tags]');
    const recommendations = root.querySelector('[data-nectar-seo-recommendations]');
    const form = root.querySelector('[data-nectar-seo-filters]');
    const input = form?.querySelector('input[name=q]');
    const ratingInput = form?.querySelector('input[name=rating]');
    const resultLabel = root.querySelector('[data-nectar-result-label]');
    const resultTitle = root.querySelector('[data-nectar-result-title]');
    const popular = root.querySelector('[data-nectar-popular]');
    const popularLinks = root.querySelector('[data-nectar-popular-links]');
    let pendingController = null;
    let lastData = null;
    let debounce = null;

    function setLoading(){
      if (summary) summary.innerHTML = '<span class="nectar-seo-loading-dot"></span> Searching approved reviews…';
      if (list) list.innerHTML = '<div class="nectar-seo-skeleton"></div><div class="nectar-seo-skeleton"></div><div class="nectar-seo-skeleton"></div>';
    }

    function syncRatingButtons(){
      const current = ratingInput?.value || '';
      root.querySelectorAll('[data-rating-filter]').forEach((button) => button.classList.toggle('active', button.dataset.ratingFilter === current));
      root.querySelectorAll('[data-review-preset="rating"]').forEach((button) => button.classList.toggle('active', button.dataset.rating === current));
    }

    function updateResultHeading(params, data){
      const query = cleanText(params.get('q'));
      const rating = cleanText(params.get('rating'));
      if (resultLabel) resultLabel.textContent = query || rating ? 'Showing filtered reviews' : 'Customer review results';
      if (!resultTitle) return;
      if (query && rating) resultTitle.innerHTML = `Results for “${esc(query)}” · ${esc(rating)} star`;
      else if (query) resultTitle.innerHTML = `Results for “${esc(query)}”`;
      else if (rating) resultTitle.textContent = `${rating} star customer reviews`;
      else resultTitle.textContent = 'Explore what customers are saying';
    }

    function renderPopular(data){
      const labels = [...(data.topTags || []).map((t) => t.label), ...(data.recommendations || []).map((r) => r.productTitle)]
        .filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index).slice(0,5);
      if (!labels.length || !popular || !popularLinks) return;
      popular.hidden = false;
      popularLinks.innerHTML = labels.map((label) => `<button type="button" data-popular-search="${esc(label)}">${esc(label)}</button>`).join('');
    }

    async function load(){
      if (!form) return;
      if (pendingController) pendingController.abort();
      pendingController = new AbortController();

      const params = new URLSearchParams(new FormData(form));
      params.set('shopDomain', shopDomain);
      params.set('limit', limit);
      params.set('t', String(Date.now()));
      if (!params.get('rating')) params.delete('rating');
      if (!params.get('q')) params.delete('q');

      setLoading();
      syncRatingButtons();
      updateResultHeading(params, {});

      let res;
      try {
        res = await fetch(`${api}/reviews/seo-page?${params.toString()}`, {
          cache:'no-store',
          signal:pendingController.signal,
          headers:{ Accept:'application/json' }
        });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error('Review service could not be reached.');
      }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).error || ''; } catch (_) {}
        throw new Error(detail || `Could not load reviews (${res.status}).`);
      }

      const data = await res.json();
      lastData = data;
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];
      populateAmbient(root, reviews);
      updateResultHeading(params, data);

      if (summary) {
        summary.innerHTML = `<strong>${esc(data.count || 0)}</strong> review${Number(data.count || 0) === 1 ? '' : 's'} found${Number(data.average || 0) ? ` · <strong>${esc(data.average)}</strong> / 5 average` : ''}`;
      }

      if (tags) {
        const tagRows = [
          ...(data.topTags || []).slice(0,10),
          ...(data.attributeAverages || []).slice(0,8).map((a) => ({ label:a.label, count:a.count }))
        ];
        tags.innerHTML = tagRows.map((tag) => `<button type="button" data-filter-chip="${esc(tag.label)}">${esc(tag.label)}</button>`).join('')
          || '<span style="font-size:12px;color:#98a2b3">Filters appear as review data grows.</span>';
      }

      if (recommendations) {
        const recs = Array.isArray(data.recommendations) ? data.recommendations.slice(0,6) : [];
        recommendations.innerHTML = recs.length ? `
          <div class="nectar-seo-rec-head">
            <div><span>From approved reviews</span><h3>${params.get('q') ? 'Products connected to this search' : 'Popular products in customer reviews'}</h3></div>
            <p>Based on review ratings, tags and profile scores.</p>
          </div>
          <div class="nectar-seo-rec-grid">${recs.map((item) => recommendationCard(shopDomain, item)).join('')}</div>` : '';
      }

      if (list) {
        list.innerHTML = reviews.map((review) => reviewCard(shopDomain, review)).join('')
          || `<div class="nectar-seo-empty"><strong>No matching reviews yet</strong><span>Try a product name, flavour, keyword or a different star rating.</span></div>`;
      }

      renderPopular(data);

      let schema = root.querySelector('script[type="application/ld+json"]');
      if (!schema) { schema = document.createElement('script'); schema.type = 'application/ld+json'; root.appendChild(schema); }
      schema.textContent = JSON.stringify(data.jsonLd || {});
    }

    function loadSafe(){
      load().catch((error) => {
        if (error.name === 'AbortError') return;
        if (summary) summary.innerHTML = `<span style="color:#b42318">Reviews unavailable</span>`;
        if (list) list.innerHTML = `<div class="nectar-seo-error"><strong>We couldn’t load reviews.</strong> ${esc(error.message || '')}<button type="button" data-retry-reviews>Try again</button></div>`;
      });
    }

    form?.addEventListener('submit', (event) => { event.preventDefault(); loadSafe(); });
    input?.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (ratingInput) ratingInput.value = '';
        loadSafe();
      }, 350);
    });

    root.querySelectorAll('[data-rating-filter]').forEach((button) => button.addEventListener('click', () => {
      if (ratingInput) ratingInput.value = button.dataset.ratingFilter || '';
      syncRatingButtons();
      loadSafe();
    }));

    root.querySelectorAll('[data-review-preset]').forEach((button) => button.addEventListener('click', () => {
      const preset = button.dataset.reviewPreset;
      if (preset === 'rating') {
        if (input) input.value = '';
        if (ratingInput) ratingInput.value = button.dataset.rating || '';
        loadSafe();
        return;
      }
      if (preset === 'recent') {
        if (input) input.value = '';
        if (ratingInput) ratingInput.value = '';
        loadSafe();
        return;
      }
      if (preset === 'attribute') {
        if (input) { input.focus(); input.placeholder = 'Try: Sourness, Sweetness, Flavour…'; }
        return;
      }
      if (preset === 'product') {
        if (input) { input.focus(); input.placeholder = 'Type a product name…'; }
      }
    }));

    root.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter-chip]');
      if (chip && input) {
        input.value = chip.dataset.filterChip || '';
        if (ratingInput) ratingInput.value = '';
        loadSafe();
        return;
      }
      const popularButton = event.target.closest('[data-popular-search]');
      if (popularButton && input) {
        input.value = popularButton.dataset.popularSearch || '';
        if (ratingInput) ratingInput.value = '';
        loadSafe();
        return;
      }
      if (event.target.closest('[data-clear-filters]')) {
        if (input) input.value = '';
        if (ratingInput) ratingInput.value = '';
        loadSafe();
        return;
      }
      if (event.target.closest('[data-retry-reviews]')) loadSafe();
    });

    setLoading();
    loadSafe();
  });
})();