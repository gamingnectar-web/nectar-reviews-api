(function () {
  const DEFAULT_API_BASE = '__APP_URL__/api';

  function cleanDomain(value) {
    return String(value || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  }

  function inferApiBase() {
    if (window.NECTAR_API_BASE) return String(window.NECTAR_API_BASE).replace(/\/$/, '');
    const script = document.currentScript || Array.from(document.scripts).find((item) => String(item.src || '').includes('/review-widget.js'));
    const bakedBase = DEFAULT_API_BASE && !DEFAULT_API_BASE.includes('__APP_URL__') ? DEFAULT_API_BASE.replace(/\/$/, '') : '';
    if (script) {
      const dataBase = script.getAttribute('data-api-base') || script.dataset?.apiBase || '';
      if (dataBase) return String(dataBase).replace(/\/$/, '');
      if (script.src) {
        try {
          const url = new URL(script.src);
          const queryBase = url.searchParams.get('apiBase') || url.searchParams.get('api_base') || url.searchParams.get('appUrl') || url.searchParams.get('app_url') || '';
          if (queryBase) return `${String(queryBase).replace(/\/$/, '')}${String(queryBase).endsWith('/api') ? '' : '/api'}`;
          const host = url.hostname.toLowerCase();
          const isShopifyAsset = host.includes('shopify') || host.includes('myshopify.com') || host.includes('cdn');
          if (!isShopifyAsset) return `${url.origin}/api`;
        } catch (_) {}
      }
    }
    if (bakedBase) return bakedBase;
    return 'https://nectar-reviews-api.onrender.com/api';
  }
  const API_BASE = inferApiBase();

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  }

  function stars(rating) {
    const full = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
    return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`;
  }

  function getProductId(el) {
    return el.dataset.id || el.dataset.productId || el.dataset.product_id || el.getAttribute('data-product-id') || el.getAttribute('data-product_id') || el.getAttribute('data-id') || window.meta?.product?.id || window.ShopifyAnalytics?.meta?.product?.id || '';
  }

  function getShop(el) {
    const globalShop = cleanDomain(window.NECTAR_SHOP_DOMAIN || window.Shopify?.shop || window.ShopifyAnalytics?.meta?.page?.shopId || '');
    const attrShop = cleanDomain(el.dataset.shop || el.dataset.shopDomain || el.getAttribute('data-shop') || el.getAttribute('data-shop-domain') || '');
    if (globalShop && globalShop.includes('.myshopify.com')) return globalShop;
    if (attrShop && attrShop.includes('.myshopify.com')) return attrShop;
    return globalShop || attrShop;
  }

  function injectStyles() {
    if (document.getElementById('nectar-review-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'nectar-review-widget-styles';
    style.textContent = `
      .nectar-review-widget { --nr-primary:#111827; --nr-muted:#667085; --nr-border:#dfe7f1; --nr-soft:#f8fafc; --nr-star:#f5a400; box-sizing:border-box; width:100%; max-width:var(--nr-max-width,1160px); margin:48px auto; padding:0 18px; color:var(--nr-primary); font-family:inherit; }
      .nectar-review-widget *, .nectar-review-widget *::before, .nectar-review-widget *::after { box-sizing:border-box; }
      .nr-widget-header { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:28px; }
      .nr-widget-title { margin:0; font-size:28px; line-height:1.15; letter-spacing:-.03em; font-weight:900; }
      .nr-write-btn, .nr-submit-btn { border:0; background:var(--nr-primary); color:#fff; min-height:46px; padding:12px 22px; font-weight:900; cursor:pointer; border-radius:0; }
      .nr-cancel-btn { border:1px solid var(--nr-border); background:#fff; color:#111827; min-height:44px; padding:10px 18px; font-weight:800; cursor:pointer; border-radius:0; }
      .nr-summary { display:grid; grid-template-columns:140px minmax(260px, 1fr) minmax(260px, 1fr); gap:46px; padding:40px; border:1px solid var(--nr-border); background:#fbfdff; margin-bottom:34px; }
      .nr-average { font-size:64px; line-height:.9; font-weight:950; letter-spacing:-.07em; margin:0 0 18px; }
      .nr-stars { color:var(--nr-star); letter-spacing:2px; font-size:19px; white-space:nowrap; }
      .nr-count { color:var(--nr-muted); margin:14px 0 0; font-size:15px; }
      .nr-section-kicker { margin:0 0 22px; color:#344054; text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:950; }
      .nr-rating-row, .nr-consensus-row { display:grid; grid-template-columns:22px 1fr 38px; gap:14px; align-items:center; margin-bottom:16px; font-weight:900; }
      .nr-consensus-row { grid-template-columns:170px 1fr 56px; }
      .nr-rating-bar { height:7px; border-radius:999px; background:#e4eaf2; overflow:hidden; }
      .nr-rating-fill { display:block; height:100%; border-radius:999px; background:#111; min-width:0; }
      .nr-consensus-bar { position:relative; height:12px; border-radius:999px; background:#e6ebf1; overflow:hidden; box-shadow:inset 0 1px 2px rgba(15,23,42,.06); }
      .nr-consensus-notch { position:absolute; top:50%; transform:translate(-50%,-50%); width:24px; height:8px; border-radius:3px; background:#111827; box-shadow:0 1px 2px rgba(15,23,42,.22); }
      .nr-review-card { position:relative; padding:32px; border:1px solid var(--nr-border); background:#fff; margin-bottom:20px; }
      .nr-review-top { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin-bottom:18px; }
      .nr-author { margin:0; font-size:17px; font-weight:950; }
      .nr-verified { color:#008060; font-size:14px; font-weight:900; margin-left:8px; }
      .nr-date { color:var(--nr-muted); font-size:14px; white-space:nowrap; }
      .nr-headline { margin:18px 0 10px; font-size:20px; line-height:1.3; font-weight:950; }
      .nr-comment { margin:0; color:#475467; line-height:1.65; font-size:16px; }
      .nr-attrs { display:grid; grid-template-columns:repeat(2,minmax(180px,1fr)); gap:18px 40px; margin-top:24px; padding-top:24px; border-top:1px dashed #e8edf4; }
      .nr-attr-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:9px; color:#667085; text-transform:uppercase; letter-spacing:.04em; font-size:12px; font-weight:950; }
      .nr-attr-bar { position:relative; height:12px; border-radius:999px; background:#e6ebf1; overflow:hidden; box-shadow:inset 0 1px 2px rgba(15,23,42,.06); }
      .nr-attr-fill { display:none; }
      .nr-attr-notch { position:absolute; top:50%; transform:translate(-50%,-50%); display:block; width:24px; height:8px; border-radius:3px; background:#111827; box-shadow:0 1px 2px rgba(15,23,42,.22); }
      .nr-empty { padding:32px; border:1px solid var(--nr-border); background:#fff; color:var(--nr-muted); text-align:center; }
      .nr-modal-backdrop { position:fixed; inset:0; z-index:2147483000; display:none; align-items:center; justify-content:center; padding:20px; background:rgba(15,23,42,.48); }
      .nr-modal-backdrop.active { display:flex; }
      .nr-modal { width:min(680px, 100%); max-height:90vh; overflow:auto; background:#fff; border-radius:14px; padding:26px; box-shadow:0 24px 80px rgba(0,0,0,.22); }
      .nr-modal h3 { margin:0 0 8px; font-size:26px; letter-spacing:-.03em; }
      .nr-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .nr-field { display:block; margin-top:14px; font-weight:800; font-size:13px; }
      .nr-field input, .nr-field textarea { width:100%; min-height:44px; margin-top:7px; border:1px solid #d0d5dd; border-radius:8px; padding:10px 12px; font:inherit; }
      .nr-field textarea { min-height:120px; resize:vertical; }
      .nr-rating-picker { margin-top:16px; }
      .nr-rating-picker span { display:block; margin-bottom:8px; font-weight:900; }
      .nr-star-picker { display:flex; gap:clamp(8px,2vw,22px); align-items:center; justify-content:space-between; width:100%; padding:12px 2px 8px; }
      .nr-star-button { flex:1; border:0; background:transparent; color:#d0d5dd; font-size:var(--nr-review-star-size,52px); line-height:1; padding:0; cursor:pointer; transition:transform .15s ease,color .15s ease,opacity .15s ease; text-align:center; }
      .nr-star-button.active { color:var(--nr-star); }
      .nr-star-picker:hover .nr-star-button { opacity:.5; transform:scale(1.02); }
      .nr-star-picker .nr-star-button:hover, .nr-star-picker .nr-star-button:hover ~ .nr-star-button { opacity:1; }
      .nr-star-button:hover { transform:scale(1.18); }
      .nr-slider-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:12px; }
      .nr-slider-field { display:block; padding:12px; border:1px solid var(--nr-border); border-radius:12px; background:#fbfdff; }
      .nr-slider-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:8px; color:#344054; font-size:13px; font-weight:950; }
      .nr-slider-field input[type=range] { appearance:none; -webkit-appearance:none; width:100%; height:14px; padding:0; border:0; border-radius:999px; background:transparent; cursor:pointer; } .nr-slider-field input[type=range]::-webkit-slider-runnable-track{height:12px;border-radius:999px;background:var(--nr-slider-track,#e6ebf1);box-shadow:inset 0 1px 2px rgba(15,23,42,.06);} .nr-slider-field input[type=range]::-moz-range-track{height:12px;border-radius:999px;background:var(--nr-slider-track,#e6ebf1);box-shadow:inset 0 1px 2px rgba(15,23,42,.06);} .nr-slider-field input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:8px;border-radius:3px;background:var(--nr-slider-knob,#111827);border:0;margin-top:2px;box-shadow:0 1px 2px rgba(15,23,42,.22);} .nr-slider-field input[type=range]::-moz-range-thumb{width:24px;height:8px;border-radius:3px;background:var(--nr-slider-knob,#111827);border:0;box-shadow:0 1px 2px rgba(15,23,42,.22);} .nr-slider-field input[type=range].inactive{opacity:.7;}
      .nr-modal-actions { position:sticky; bottom:-26px; background:linear-gradient(180deg,rgba(255,255,255,.92),#fff 35%); display:flex; justify-content:flex-end; gap:10px; margin:22px -26px -26px; padding:18px 26px; border-top:1px solid #eef2f7; }
      .nr-note { color:var(--nr-muted); font-size:13px; margin:0; line-height:1.5; }
      @media (max-width: 900px) { .nr-summary { grid-template-columns:1fr; gap:28px; padding:28px; } .nr-consensus-row { grid-template-columns:130px 1fr 50px; } }
      @media (max-width: 640px) { .nr-widget-header { align-items:flex-start; flex-direction:column; } .nr-attrs, .nr-form-grid, .nr-slider-grid { grid-template-columns:1fr; } .nr-review-top { flex-direction:column; gap:8px; } .nr-average { font-size:54px; } }
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
            return `<div class="nr-consensus-row"><span>${escapeHtml(key)}</span><div class="nr-consensus-bar"><span class="nr-consensus-notch" style="left:${Math.max(4, Math.min(96, val * 10))}%"></span></div><span>${val.toFixed(val % 1 ? 1 : 0)}/10</span></div>`;
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
          return `<div><div class="nr-attr-head"><span>${escapeHtml(key)}</span><strong>${val}/10</strong></div><div class="nr-attr-bar"><span class="nr-attr-notch" style="left:${Math.max(4, Math.min(96, val * 10))}%"></span></div></div>`;
        }).join('')}</div>` : ''}
      </article>`;
  }

  function sliderLabelsFromSettings(settings) {
    const profiles = Array.isArray(settings?.attributeProfiles) ? settings.attributeProfiles : [];
    return profiles.map((profile) => String(profile.label || '').trim()).filter(Boolean).filter((label, index, arr) => arr.indexOf(label) === index).slice(0, 8);
  }

  function renderStarPicker(rating = 5) {
    return `<div class="nr-star-picker" data-star-picker>${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="nr-star-button ${i <= rating ? 'active' : ''}" data-rating="${i}" aria-label="${i} stars">★</button>`).join('')}</div><input type="hidden" name="rating" value="${rating}">`;
  }

  function bindStarPicker(modal) {
    const picker = modal.querySelector('[data-star-picker]');
    const input = modal.querySelector('input[name="rating"]');
    if (!picker || !input) return;
    const paint = (rating) => picker.querySelectorAll('.nr-star-button').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.rating) <= rating));
    picker.querySelectorAll('.nr-star-button').forEach((btn) => {
      btn.addEventListener('mouseenter', () => paint(Number(btn.dataset.rating || 5)));
      btn.addEventListener('focus', () => paint(Number(btn.dataset.rating || 5)));
      btn.addEventListener('click', () => {
        input.value = String(Number(btn.dataset.rating || 5));
        paint(Number(input.value || 5));
      });
    });
    picker.addEventListener('mouseleave', () => paint(Number(input.value || 5)));
  }

  function bindModalSliders(modal) {
    modal.querySelectorAll('.nr-slider-field input[type="range"]').forEach((input) => {
      input.addEventListener('input', () => {
        const output = modal.querySelector(`[data-slider-output="${input.dataset.sliderKey}"]`);
        const numeric = Number(input.value || 0);
        input.classList.toggle('inactive', numeric <= 0);
        if (output) output.textContent = numeric > 0 ? `${numeric}/10` : 'Not scored';
      });
    });
  }

  function buildModal(itemId, shopDomain, settings) {
    const labels = sliderLabelsFromSettings(settings);
    const modalId = `nr-modal-${Math.random().toString(36).slice(2)}`;
    const modal = document.createElement('div');
    modal.className = 'nr-modal-backdrop';
    const styles = settings?.widgetStyles || settings?.styles || {};
    modal.style.setProperty('--nr-star', styles.starColor || '#f5a400');
    modal.style.setProperty('--nr-review-star-size', `${Number(styles.reviewStarSize || 52)}px`);
    const track = styles.sliderTrackColor && styles.sliderTrackColor !== '#ffffff' ? styles.sliderTrackColor : '#e6ebf1';
    modal.style.setProperty('--nr-slider-track', track);
    modal.style.setProperty('--nr-slider-knob', styles.sliderKnobColor || '#111827');
    modal.id = modalId;
    modal.innerHTML = `
      <div class="nr-modal" role="dialog" aria-modal="true" aria-label="Write a review">
        <h3>Write a Review</h3>
        <p class="nr-note">Your review will be submitted for moderation.</p>
        <form class="nr-form">
          <div class="nr-form-grid">
            <label class="nr-field">Name<input name="userId" required placeholder="Your name" autocomplete="name"></label>
            <label class="nr-field">Email<input name="email" type="email" required placeholder="you@example.com" autocomplete="email"></label>
          </div>
          <div class="nr-rating-picker"><span>Rating</span>${renderStarPicker(5)}</div>
          <label class="nr-field">Headline<input name="headline" required placeholder="Summarise your review"></label>
          <label class="nr-field">Review<textarea name="comment" required placeholder="What did you think?"></textarea></label>
          ${labels.length ? `<div class="nr-slider-grid">${labels.map((label) => {
            const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            return `<label class="nr-slider-field"><div class="nr-slider-head"><span>${escapeHtml(label)}</span><strong data-slider-output="${escapeHtml(key)}">Not scored</strong></div><input class="inactive" type="range" min="0" max="10" value="0" data-slider-key="${escapeHtml(key)}" name="attr:${escapeHtml(label)}"></label>`;
          }).join('')}</div>` : ''}
          <div class="nr-modal-actions"><button type="button" class="nr-cancel-btn">Cancel</button><button type="submit" class="nr-submit-btn">Submit Review</button></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.nr-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('active'); });
    bindStarPicker(modal);
    bindModalSliders(modal);
    modal.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formEl = event.currentTarget;
      const form = new FormData(formEl);
      const attributes = {};
      for (const [key, value] of form.entries()) {
        if (key.startsWith('attr:') && Number(value) > 0) attributes[key.slice(5)] = Number(value);
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
        if (!res.ok) {
          let message = 'Could not submit review';
          try { const json = await res.json(); message = json.error || message; } catch (_) {}
          throw new Error(message);
        }
        formEl.reset();
        modal.querySelector('.nr-modal').innerHTML = '<h3>It’s on its way for review</h3><p class="nr-note">Thanks for sharing your feedback. Your review has been sent to the store team and will appear once it has been approved.</p><div class="nr-modal-actions"><button type="button" class="nr-cancel-btn">Close</button></div>';
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
    const styles = settings.widgetStyles || {};
    const modal = buildModal(itemId, shopDomain, settings);
    el.innerHTML = `
      <section class="nectar-review-widget" style="--nr-primary:${escapeHtml(styles.primaryColor || '#111827')};--nr-star:${escapeHtml(styles.starColor || '#f5a400')};--nr-review-star-size:${Number(styles.reviewStarSize || 52)}px;--nr-slider-track:${escapeHtml((styles.sliderTrackColor && styles.sliderTrackColor !== '#ffffff') ? styles.sliderTrackColor : '#e6ebf1')};--nr-slider-knob:${escapeHtml(styles.sliderKnobColor || '#111827')};--nr-max-width:${Number(styles.maxWidth || 1160)}px;">
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
