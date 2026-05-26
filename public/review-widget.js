(function () {
  function getScript() {
    return document.currentScript || document.querySelector('script[data-nectar-review-widget]');
  }

  function stars(value) {
    return '★★★★★'.split('').map((star, index) => `<span class="${index < value ? 'filled' : ''}">${star}</span>`).join('');
  }

  async function json(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nectar request failed');
    return data;
  }

  async function mount() {
    const script = getScript();
    if (!script) return;

    const shop = script.dataset.shop || script.dataset.shopDomain;
    const itemId = script.dataset.productId || script.dataset.itemId;
    const targetSelector = script.dataset.target || '[data-nectar-reviews]';
    const target = document.querySelector(targetSelector) || script.parentElement;
    if (!shop || !itemId || !target) return;

    const api = `${script.src.split('/review-widget.js')[0]}`;
    target.innerHTML = '<div class="nectar-widget nectar-loading">Loading reviews…</div>';

    const style = document.createElement('style');
    style.textContent = `
      .nectar-widget{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px 0;color:#0f172a}
      .nectar-widget-card{border:1px solid #e5e7eb;border-radius:22px;padding:18px;background:#fff;box-shadow:0 10px 35px rgba(15,23,42,.06)}
      .nectar-widget-header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px}
      .nectar-stars span{color:#cbd5e1}.nectar-stars span.filled{color:#f5b301}
      .nectar-review{border-top:1px solid #e5e7eb;padding-top:14px;margin-top:14px}.nectar-review strong{display:block}.nectar-review p{margin:6px 0;color:#475569}.nectar-review small{color:#64748b;font-weight:700}
      .nectar-form{display:grid;gap:10px;margin-top:18px}.nectar-form input,.nectar-form textarea,.nectar-form select{width:100%;border:1px solid #e5e7eb;border-radius:14px;padding:11px;font:inherit}.nectar-form button{border:0;border-radius:14px;padding:12px 16px;background:#0f172a;color:white;font-weight:800;cursor:pointer}
    `;
    if (!document.querySelector('[data-nectar-widget-style]')) {
      style.dataset.nectarWidgetStyle = 'true';
      document.head.appendChild(style);
    }

    try {
      const [config, reviewData] = await Promise.all([
        json(`${api}/api/widget/config?shop=${encodeURIComponent(shop)}`),
        json(`${api}/api/reviews/${encodeURIComponent(itemId)}?shop=${encodeURIComponent(shop)}`)
      ]);
      const reviews = reviewData.reviews || [];
      const average = reviews.length ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1) : '0.0';

      target.innerHTML = `
        <div class="nectar-widget">
          <div class="nectar-widget-card">
            <div class="nectar-widget-header">
              <div><strong>Customer reviews</strong><div class="nectar-stars">${stars(Math.round(Number(average)))}</div></div>
              <div>${average} / 5 · ${reviews.length} reviews</div>
            </div>
            <div class="nectar-review-list">
              ${reviews.map((review) => `<article class="nectar-review"><strong>${review.title || 'Review'}</strong><p>${review.body}</p><small>${review.authorName || 'Customer'}${review.verifiedPurchase ? ' · Verified purchase' : ''}</small></article>`).join('') || '<p>No reviews yet. Be the first to write one.</p>'}
            </div>
            <form class="nectar-form" data-nectar-review-form>
              <input name="authorName" placeholder="Your name" />
              <select name="rating"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select>
              <input name="title" placeholder="Review title" />
              <textarea name="body" required placeholder="Share your thoughts"></textarea>
              <button type="submit">Submit review</button>
            </form>
          </div>
        </div>`;

      target.querySelector('[data-nectar-review-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await json(`${api}/api/reviews?shop=${encodeURIComponent(shop)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...Object.fromEntries(form.entries()), itemId })
        });
        event.currentTarget.innerHTML = '<p>Thanks — your review has been submitted for moderation.</p>';
      });
    } catch (error) {
      target.innerHTML = `<div class="nectar-widget"><div class="nectar-widget-card">${error.message}</div></div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
