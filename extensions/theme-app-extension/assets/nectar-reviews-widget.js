(() => {
  const DEFAULT_APP_URL = 'https://nectar-reviews-api.onrender.com';

  function getAppUrl(el) {
    const direct = el?.dataset?.appUrl || window.NECTAR_APP_URL;
    if (direct) return String(direct).replace(/\/$/, '');
    const script = document.currentScript;
    try {
      if (script && script.src && script.src.includes('/review-widget.js')) {
        return new URL(script.src).origin;
      }
    } catch (_) {}
    return DEFAULT_APP_URL;
  }

  function getShop(el) {
    return el.dataset.shopDomain || el.dataset.shop || window.Shopify?.shop || '';
  }

  function stars(rating) {
    const value = Number(rating || 0);
    return Array.from({ length: 5 }, (_, i) => i < Math.round(value) ? '★' : '☆').join('');
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`Nectar request failed: ${response.status}`);
    return response.json();
  }

  function renderWidget(el, reviews, config) {
    const summary = config?.summary || {};
    const count = reviews.length || Number(summary.count || 0);
    const average = reviews.length
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
      : Number(summary.average || 0);

    const header = `
      <div class="nectar-widget-header">
        <div class="nectar-widget-score" aria-label="${average.toFixed(1)} out of 5 stars">${stars(average)}</div>
        <div class="nectar-widget-meta"><strong>${average ? average.toFixed(1) : '0.0'}</strong> / 5 · ${count} review${count === 1 ? '' : 's'}</div>
      </div>`;

    const items = reviews.slice(0, Number(el.dataset.limit || 6)).map((review) => `
      <article class="nectar-review-card">
        <div class="nectar-review-card__stars">${stars(review.rating)}</div>
        ${review.title ? `<h3>${escapeHtml(review.title)}</h3>` : ''}
        <p>${escapeHtml(review.body || '')}</p>
        <footer>${escapeHtml(review.authorName || 'Customer')}${review.verifiedPurchase ? ' · Verified purchase' : ''}</footer>
      </article>
    `).join('');

    el.innerHTML = `${header}<div class="nectar-review-list">${items || '<p class="nectar-empty">No reviews yet.</p>'}</div>`;
  }

  function renderSummary(el, reviews, config) {
    const summary = config?.summary || {};
    const count = reviews.length || Number(summary.count || 0);
    const average = reviews.length
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
      : Number(summary.average || 0);
    el.innerHTML = `<span class="nectar-stars-inline">${stars(average)}</span><span class="nectar-review-count">${count} review${count === 1 ? '' : 's'}</span>`;
  }

  function renderCarousel(el, reviews) {
    const items = reviews.slice(0, Number(el.dataset.limit || 12)).map((review) => `
      <article class="nectar-carousel-card">
        <div class="nectar-review-card__stars">${stars(review.rating)}</div>
        <p>${escapeHtml(review.body || '')}</p>
        <footer>${escapeHtml(review.authorName || 'Customer')}</footer>
      </article>
    `).join('');
    el.innerHTML = `<div class="nectar-carousel-track">${items || '<p class="nectar-empty">No reviews yet.</p>'}</div>`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  async function hydrateReviewSurface(el, mode) {
    const appUrl = getAppUrl(el);
    const shop = getShop(el);
    const productId = el.dataset.productId || el.dataset.itemId || '';
    const configUrl = `${appUrl}/api/widget/config?shop=${encodeURIComponent(shop)}`;
    const reviewsUrl = productId
      ? `${appUrl}/api/reviews/${encodeURIComponent(productId)}?shop=${encodeURIComponent(shop)}`
      : `${appUrl}/api/global-reviews?shop=${encodeURIComponent(shop)}&limit=${encodeURIComponent(el.dataset.limit || 12)}`;

    try {
      const [config, reviewPayload] = await Promise.all([getJson(configUrl), getJson(reviewsUrl)]);
      const reviews = reviewPayload.reviews || [];
      if (mode === 'summary') return renderSummary(el, reviews, config);
      if (mode === 'carousel') return renderCarousel(el, reviews, config);
      return renderWidget(el, reviews, config);
    } catch (error) {
      console.warn('[Nectar] review widget failed', error);
      el.innerHTML = '<p class="nectar-error">Reviews are temporarily unavailable.</p>';
    }
  }

  function init() {
    document.querySelectorAll('[data-nectar-review-widget]').forEach((el) => hydrateReviewSurface(el, 'widget'));
    document.querySelectorAll('[data-nectar-review-summary]').forEach((el) => hydrateReviewSurface(el, 'summary'));
    document.querySelectorAll('[data-nectar-review-carousel]').forEach((el) => hydrateReviewSurface(el, 'carousel'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
