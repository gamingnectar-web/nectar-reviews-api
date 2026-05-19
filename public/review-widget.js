(function () {
  function inferApiBase() {
    if (window.NECTAR_API_BASE) return String(window.NECTAR_API_BASE).replace(/\/$/, '');
    const script = document.currentScript || Array.from(document.scripts).find((item) => String(item.src || '').includes('/review-widget.js'));
    if (script && script.src) {
      try {
        return `${new URL(script.src).origin}/api`;
      } catch (_) {}
    }
    return `${window.location.origin}/api`;
  }
  const API_BASE = inferApiBase();

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function stars(rating) {
    const full = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
    return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`;
  }

  function getProductId(el) {
    return el.dataset.id || el.dataset.productId || el.getAttribute('data-product-id') || el.getAttribute('data-id') || '';
  }

  function getShop(el) {
    return el.dataset.shop || el.dataset.shopDomain || el.getAttribute('data-shop') || el.getAttribute('data-shop-domain') || window.Shopify?.shop || window.NECTAR_SHOP_DOMAIN || '';
  }

  function injectStyles() {
    if (document.getElementById('nectar-review-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'nectar-review-widget-styles';
    style.textContent = `
      .nectar-review-widget { --nr-primary:#111827; --nr-muted:#667085; --nr-border:#dfe7f1; --nr-soft:#f8fafc; --nr-star:#f5a400; box-sizing:border-box; width:100%; max-width:1160px; margin:48px auto; padding:0 18px; color:var(--nr-primary); font-family:inherit; }
      .nectar-review-widget *, .nectar-review-widget *::before, .nectar-review-widget *::after { box-sizing:border-box; }
      .nr-widget-header { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:28px; }
      .nr-widget-title { margin:0; font-size:28px; line-height:1.15; letter-spacing:-.03em; font-weight:900; }
      .nr-write-btn, .nr-submit-btn { border:0; background:#111; color:#fff; min-height:46px; padding:12px 22px; font-weight:900; cursor:pointer; }
      .nr-cancel-btn { border:1px solid var(--nr-border); background:#fff; color:#111827; min-height:44px; padding:10px 18px; font-weight:800; cursor:pointer; }
      .nr-summary { display:grid; grid-template-columns:140px minmax(260px, 1fr) minmax(260px, 1fr); gap:46px; padding:40px; border:1px solid var(--nr-border); background:#fbfdff; margin-bottom:34px; }
      .nr-average { font-size:64px; line-height:.9; font-weight:950; letter-spacing:-.07em; margin:0 0 18px; }
      .nr-stars { color:var(--nr-star); letter-spacing:2px; font-size:19px; white-space:nowrap; }
      .nr-count { color:var(--nr-muted); margin:14px 0 0; font-size:15px; }
      .nr-section-kicker { margin:0 0 22px; color:#344054; text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:950; }
      .nr-rating-row, .nr-consensus-row { display:grid; grid-template-columns:22px 1fr 38px; gap:14px; align-items:center; margin-bottom:16px; font-weight:900; }
      .nr-consensus-row { grid-template-columns:170px 1fr 56px; }
      .nr-rating-bar, .nr-consensus-bar { height:7px; border-radius:999px; background:#e4eaf2; overflow:hidden; }
      .nr-rating-fill, .nr-consensus-fill { display:block; height:100%; border-radius:999px; background:#111; min-width:0; }
      .nr-review-card { position:relative; padding:32px; border:1px solid var(--nr-border); background:#fff; margin-bottom:20px; }
      .nr-review-top { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin-bottom:18px; }
      .nr-author { margin:0; font-size:17px; font-weight:950; }
      .nr-verified { color:#008060; font-size:14px; font-weight:900; margin-left:8px; }
      .nr-date { color:var(--nr-muted); font-size:14px; white-space:nowrap; }
      .nr-headline { margin:18px 0 10px; font-size:20px; line-height:1.3; font-weight:950; }
      .nr-comment { margin:0; color:#475467; line-height:1.65; font-size:16px; }
      .nr-attrs { display:grid; grid-template-columns:repeat(2,minmax(180px,1fr)); gap:18px 40px; margin-top:24px; padding-top:24px; border-top:1px dashed #e8edf4; }
      .nr-attr-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:9px; color:#667085; text-transform:uppercase; letter-spacing:.04em; font-size:12px; font-weight:950; }
      .nr-attr-bar { height:7px; border-radius:999px; background:#e4eaf2; overflow:hidden; }
      .nr-attr-fill { display:block; height:100%; border-radius:999px; background:#111; }
      .nr-empty { padding:32px; border:1px solid var(--nr-border); background:#fff; color:var(--nr-muted); text-align:center; }
      .nr-modal-backdrop { position:fixed; inset:0; z-index:2147483000; display:none; align-items:center; justify-content:center; padding:20px; background:rgba(15,23,42,.48); }
      .nr-modal-backdrop.active { display:flex; }
      .nr-modal { width:min(620px, 100%); max-height:90vh; overflow:auto; background:#fff; border-radius:14px; padding:26px; box-shadow:0 24px 80px rgba(0,0,0,.22); }
      .nr-modal h3 { margin:0 0 8px; font-size:24px; }
      .nr-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .nr-field { display:block; margin-top:14px; font-weight:800; font-size:13px; }
      .nr-field input, .nr-field textarea, .nr-field select { width:100%; min-height:44px; margin-top:7px; border:1px solid #d0d5dd; border-radius:8px; padding:10px 12px; font:inherit; }
      .nr-field textarea { min-height:120px; resize:vertical; }
      .nr-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
      .nr-note { color:var(--nr-muted); font-size:13px; margin:0; line-height:1.5; }
      @media (max-width: 900px) { .nr-summary { grid-template-columns:1fr; gap:28px; padding:28px; } .nr-consensus-row { grid-template-columns:130px 1fr 50px; } }
      @media (max-width: 640px) { .nr-widget-header { align-items:flex-start; flex-direction:column; } .nr-attrs, .nr-form-grid { grid-template-columns:1fr; } .nr-review-top { flex-direction:column; gap:8px; } .nr-average { font-size:54px; } }
    `;
    document.head.appendChild(style);
  }

  function attributeEntries(json, reviews) {
    const avgEntries = Object.entries(json.attributeAverages || {});
    if (avgEntries.length) return avgEntries;
    const totals = {};
    reviews.forEach((review) => {
      Object.entries(review.attributes || {}).forEach(([key, value]) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        if (!totals[key]) totals[key] = { sum: 0, count: 0 };
        totals[key].sum += numeric;
        totals[key].count += 1;
      });
    });
    return Object.entries(totals).map(([key, item]) => [key, item.count ? Number((item.sum / item.count).toFixed(1)) : 0]);
  }

  function buildSummary(json, reviews) {
    const count = Number(json.count || reviews.length || 0);
    const average = Number(json.average || 0);
    const distribution = json.distribution || {};
    const attrs = attributeEntries(json, reviews);
    const maxCount = Math.max(1, ...[1, 2, 3, 4, 5].map((star) => Number(distribution[star] || 0)));
    return `
      <div class="nr-summary">
        <div>
          <p class="nr-average">${average.toFixed(1)}</p>
          <div class="nr-stars">${stars(average)}</div>
          <p class="nr-count">Based on ${count} review${count === 1 ? '' : 's'}</p>
        </div>
        <div>
          <p class="nr-section-kicker">Rating Snapshot</p>
          ${[5, 4, 3, 2, 1].map((star) => {
            const total = Number(distribution[star] || 0);
            const pct = (total / maxCount) * 100;
            return `<div class="nr-rating-row"><span>${star}</span><div class="nr-rating-bar"><span class="nr-rating-fill" style="width:${pct}%"></span></div><span>(${total})</span></div>`;
          }).join('')}
        </div>
        <div>
          <p class="nr-section-kicker">Customer Consensus</p>
          ${attrs.length ? attrs.map(([key, value]) => {
            const val = Math.max(0, Math.min(10, Number(value || 0)));
            return `<div class="nr-consensus-row"><span>${escapeHtml(key)}</span><div class="nr-consensus-bar"><span class="nr-consensus-fill" style="width:${val * 10}%"></span></div><span>${val.toFixed(val % 1 ? 1 : 0)}/10</span></div>`;
          }).join('') : '<p class="nr-note">Consensus sliders will appear here when reviews include attributes.</p>'}
        </div>
      </div>`;
  }

  function buildReview(review) {
    const attrs = Object.entries(review.attributes || {});
    return `
      <article class="nr-review-card">
        <div class="nr-review-top">
          <p class="nr-author">${escapeHtml(review.userId || 'Guest')}${review.verifiedPurchase ? '<span class="nr-verified">✓ Verified buyer</span>' : ''}</p>
          <span class="nr-date">${new Date(review.createdAt || Date.now()).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
        <div class="nr-stars">${stars(review.rating)}</div>
        <h4 class="nr-headline">${escapeHtml(review.headline || 'Review')}</h4>
        <p class="nr-comment">${escapeHtml(review.comment || '')}</p>
        ${attrs.length ? `<div class="nr-attrs">${attrs.map(([key, raw]) => {
          const val = Math.max(0, Math.min(10, Number(raw || 0)));
          return `<div><div class="nr-attr-head"><span>${escapeHtml(key)}</span><strong>${val}/10</strong></div><div class="nr-attr-bar"><span class="nr-attr-fill" style="width:${val * 10}%"></span></div></div>`;
        }).join('')}</div>` : ''}
      </article>`;
  }

  function buildModal(el, itemId, shopDomain, settings) {
    const profileLabels = (settings?.attributeProfiles || []).map((profile) => profile.label).filter(Boolean).slice(0, 8);
    const defaultLabels = profileLabels.length ? profileLabels : [];
    const modalId = `nr-modal-${Math.random().toString(36).slice(2)}`;
    const modal = document.createElement('div');
    modal.className = 'nr-modal-backdrop';
    modal.id = modalId;
    modal.innerHTML = `
      <div class="nr-modal" role="dialog" aria-modal="true" aria-label="Write a review">
        <h3>Write a Review</h3>
        <p class="nr-note">Your review will be submitted for moderation.</p>
        <form class="nr-form">
          <div class="nr-form-grid">
            <label class="nr-field">Name<input name="userId" required placeholder="Your name"></label>
            <label class="nr-field">Email<input name="email" type="email" placeholder="you@example.com"></label>
          </div>
          <label class="nr-field">Rating<select name="rating" required><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label>
          <label class="nr-field">Headline<input name="headline" required placeholder="Summarise your review"></label>
          <label class="nr-field">Review<textarea name="comment" required placeholder="What did you think?"></textarea></label>
          ${defaultLabels.length ? `<div class="nr-form-grid">${defaultLabels.map((label) => `<label class="nr-field">${escapeHtml(label)}<select name="attr:${escapeHtml(label)}">${Array.from({ length: 10 }, (_, index) => `<option value="${index + 1}" ${index === 9 ? 'selected' : ''}>${index + 1}/10</option>`).join('')}</select></label>`).join('')}</div>` : ''}
          <div class="nr-modal-actions"><button type="button" class="nr-cancel-btn">Cancel</button><button type="submit" class="nr-submit-btn">Submit Review</button></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.nr-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('active'); });
    modal.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const attributes = {};
      for (const [key, value] of form.entries()) {
        if (key.startsWith('attr:')) attributes[key.slice(5)] = Number(value);
      }
      const button = modal.querySelector('.nr-submit-btn');
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Submitting...';
      try {
        const res = await fetch(`${API_BASE}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain,
            itemId,
            userId: form.get('userId'),
            email: form.get('email'),
            rating: Number(form.get('rating')),
            headline: form.get('headline'),
            comment: form.get('comment'),
            attributes,
            source: 'website',
          }),
        });
        if (!res.ok) throw new Error('Could not submit review');
        event.currentTarget.reset();
        modal.querySelector('.nr-modal').innerHTML = '<h3>Thank you</h3><p class="nr-note">Your review has been submitted and will appear once approved.</p><div class="nr-modal-actions"><button type="button" class="nr-cancel-btn">Close</button></div>';
        modal.querySelector('.nr-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));
      } catch (error) {
        button.disabled = false;
        button.textContent = original;
        alert(error.message || 'Could not submit review');
      }
    });
    return modal;
  }

  async function loadWidget(el) {
    injectStyles();
    const itemId = getProductId(el);
    const shopDomain = getShop(el);
    if (!itemId || !shopDomain) {
      el.innerHTML = '<div class="nr-empty">Reviews are almost ready. Product or shop context is missing.</div>';
      return;
    }
    el.innerHTML = '<div class="nr-empty">Loading reviews...</div>';
    const res = await fetch(`${API_BASE}/reviews?shopDomain=${encodeURIComponent(shopDomain)}&itemId=${encodeURIComponent(itemId)}&limit=20`);
    if (!res.ok) throw new Error('Could not load reviews');
    const json = await res.json();
    const reviews = json.reviews || [];
    const settings = json.settings || {};
    const title = settings.widgetStyles?.widgetTitle || 'Reviews';
    const modal = buildModal(el, itemId, shopDomain, settings);
    el.innerHTML = `
      <section class="nectar-review-widget">
        <div class="nr-widget-header"><h3 class="nr-widget-title">${escapeHtml(title)}</h3><button type="button" class="nr-write-btn">Write a Review</button></div>
        ${reviews.length || Number(json.count || 0) ? buildSummary(json, reviews) : '<div class="nr-empty">No reviews yet. Be the first to write one.</div>'}
        <div class="nr-review-list">${reviews.map(buildReview).join('')}</div>
      </section>`;
    el.querySelector('.nr-write-btn')?.addEventListener('click', () => modal.classList.add('active'));
  }

  function start() {
    document.querySelectorAll('.rev-widget, [data-nectar-reviews], .nectar-reviews-widget').forEach((el) => loadWidget(el).catch((error) => {
      console.error(error);
      el.innerHTML = '<div class="nr-empty">Reviews could not be loaded right now.</div>';
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
