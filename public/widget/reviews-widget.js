(() => {
  async function loadReviews(el) {
    const shopDomain = el.dataset.shopDomain;
    const itemId = el.dataset.itemId;
    const limit = el.dataset.limit || 5;
    if (!shopDomain || !itemId) {
      el.innerHTML = '<p>Missing review widget configuration.</p>';
      return;
    }
    const [summaryResponse, reviewsResponse] = await Promise.all([
      fetch(`/api/reviews/summary?shopDomain=${encodeURIComponent(shopDomain)}&itemId=${encodeURIComponent(itemId)}`),
      fetch(`/api/reviews?shopDomain=${encodeURIComponent(shopDomain)}&itemId=${encodeURIComponent(itemId)}&limit=${encodeURIComponent(limit)}`)
    ]);
    const summary = await summaryResponse.json();
    const data = await reviewsResponse.json();
    const reviews = data.reviews || [];
    el.innerHTML = `
      <div class="nectar-reviews-widget">
        <h3>${summary.averageRating || 0} ★ <small>(${summary.count || 0} reviews)</small></h3>
        ${reviews.length ? reviews.map((review) => `<article><strong>${'★'.repeat(review.rating)}</strong><h4>${escapeHtml(review.headline)}</h4><p>${escapeHtml(review.comment)}</p><small>${escapeHtml(review.customerName)}</small></article>`).join('') : '<p>No reviews yet.</p>'}
      </div>
    `;
  }
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
  document.querySelectorAll('[data-nectar-reviews-widget]').forEach(loadReviews);
})();
