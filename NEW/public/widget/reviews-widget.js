(() => {
  const scriptEl = document.currentScript;

  function getApiBase(el) {
    const explicit = el.dataset.apiBase || scriptEl?.dataset?.apiBase || window.NECTAR_REVIEWS_API_BASE;
    if (explicit) return String(explicit).replace(/\/$/, '');
    try {
      if (scriptEl?.src) return new URL(scriptEl.src).origin;
    } catch (error) {
      // Ignore and fall back below.
    }
    return window.location.origin;
  }

  async function loadReviews(el) {
    const apiBase = getApiBase(el);
    const shopDomain = el.dataset.shopDomain || el.dataset.shop;
    const itemId = el.dataset.itemId || el.dataset.id;
    const limit = el.dataset.limit || 5;

    if (!shopDomain || !itemId) {
      el.innerHTML = '<p>Missing review widget configuration.</p>';
      return;
    }

    try {
      const summaryUrl = `${apiBase}/api/reviews/summary?shopDomain=${encodeURIComponent(shopDomain)}&itemId=${encodeURIComponent(itemId)}`;
      const reviewsUrl = `${apiBase}/api/reviews?shopDomain=${encodeURIComponent(shopDomain)}&itemId=${encodeURIComponent(itemId)}&limit=${encodeURIComponent(limit)}`;
      const [summaryResponse, reviewsResponse] = await Promise.all([
        fetch(summaryUrl, { mode: 'cors', credentials: 'omit' }),
        fetch(reviewsUrl, { mode: 'cors', credentials: 'omit' })
      ]);

      if (!summaryResponse.ok || !reviewsResponse.ok) {
        throw new Error('Review API request failed.');
      }

      const summary = await summaryResponse.json();
      const data = await reviewsResponse.json();
      const reviews = data.reviews || [];

      el.innerHTML = `
        <div class="nectar-reviews-widget">
          <h3>${Number(summary.averageRating || 0).toFixed(1)} ★ <small>(${Number(summary.count || 0)} reviews)</small></h3>
          ${reviews.length ? reviews.map((review) => `<article><strong>${'★'.repeat(Number(review.rating || 0))}</strong><h4>${escapeHtml(review.headline)}</h4><p>${escapeHtml(review.comment)}</p><small>${escapeHtml(review.customerName || 'Verified customer')}</small></article>`).join('') : '<p>No reviews yet.</p>'}
        </div>
      `;
    } catch (error) {
      console.error('[Nectar Reviews] Widget failed to load:', error);
      el.innerHTML = '<p>Reviews are unavailable right now.</p>';
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function init() {
    document.querySelectorAll('[data-nectar-reviews-widget], .rev-widget').forEach(loadReviews);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
