(function () {
  const API_BASE = window.NECTAR_API_BASE || 'https://nectar-reviews-api.onrender.com/api';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  }

  async function loadWidget(el) {
    const itemId = el.dataset.id || el.dataset.productId;
    const shopDomain = el.dataset.shop;
    if (!itemId || !shopDomain) return;
    const res = await fetch(`${API_BASE}/reviews?shopDomain=${encodeURIComponent(shopDomain)}&itemId=${encodeURIComponent(itemId)}`);
    const json = await res.json();
    const reviews = json.reviews || [];
    el.innerHTML = `
      <section class="nectar-review-widget">
        <h3>${escapeHtml(json.settings?.widgetStyles?.widgetTitle || 'Customer Reviews')}</h3>
        <p>${json.average || 0} ★ (${json.count || 0})</p>
        ${reviews.map((review) => `<article><strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong><h4>${escapeHtml(review.headline)}</h4><p>${escapeHtml(review.comment)}</p><small>${escapeHtml(review.userId)}</small></article>`).join('')}
      </section>`;
  }

  document.querySelectorAll('.rev-widget').forEach((el) => loadWidget(el).catch(console.error));
})();
