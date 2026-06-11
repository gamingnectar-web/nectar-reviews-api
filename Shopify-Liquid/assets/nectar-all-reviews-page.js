(function(){
  const roots = document.querySelectorAll('.nectar-seo-reviews-page');
  if (!roots.length) return;
  const esc = (v)=>String(v||'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const productUrl = (shopDomain, item = {}) => {
    if (item.productUrl) return item.productUrl;
    if (item.productHandle) return `https://${shopDomain.replace(/^https?:\/\//,'')}/products/${encodeURIComponent(item.productHandle)}`;
    return '';
  };
  function stars(n){ const rating = Math.max(0, Math.min(5, Math.round(Number(n||0)))); return '★★★★★'.split('').map((s,i)=>`<span class="${i<rating?'on':''}">★</span>`).join(''); }
  function recommendationCard(shopDomain, item){
    const url = productUrl(shopDomain, item);
    const tags = (item.matchedTags || []).slice(0,4).map(t=>`<span>${esc(t.label)}</span>`).join('');
    const flavours = (item.flavourProfile || []).slice(0,3).map(t=>`<span>${esc(t.label)} ${esc(t.average)}/10</span>`).join('');
    const body = item.bestQuote ? `<p>“${esc(item.bestQuote)}”</p>` : '<p>Recommended from customer review patterns.</p>';
    return `<article class="nectar-seo-rec-card"><div class="nectar-seo-rec-card__top"><strong>${esc(item.productTitle || 'Recommended product')}</strong><b>${esc(item.average || 0)}★</b></div>${body}<div class="nectar-seo-rec-card__chips">${tags}${flavours}</div>${url ? `<a href="${esc(url)}">View product</a>` : ''}</article>`;
  }
  function reviewCard(review){
    const title = review.productTitle ? `<span>${esc(review.productTitle)}</span>` : '';
    const tags = (review.productTags || []).slice(0,4).map(tag=>`<em>${esc(tag)}</em>`).join('');
    return `<article class="nectar-seo-review"><div class="nectar-seo-stars">${stars(review.rating)}</div><h2>${esc(review.headline||'Customer review')}</h2>${title}<p>${esc(review.comment||'')}</p><div class="nectar-seo-review__tags">${tags}</div><footer>${esc(review.isAnonymous?'Verified customer':(review.userId||'Customer'))}${review.verifiedPurchase?' · Verified purchase':''}${review.sourceLabel?` · ${esc(review.sourceLabel)}`:''}</footer></article>`;
  }
  roots.forEach((root)=>{
    const api = (root.dataset.apiUrl || 'https://nectar-reviews-api.onrender.com/api').replace(/\/api\/api$/,'/api').replace(/\/$/, '');
    const shopDomain = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
    const limit = root.dataset.limit || '120';
    const summary = root.querySelector('[data-nectar-seo-summary]');
    const list = root.querySelector('[data-nectar-seo-list]');
    const tags = root.querySelector('[data-nectar-seo-tags]');
    const recommendations = root.querySelector('[data-nectar-seo-recommendations]');
    const form = root.querySelector('[data-nectar-seo-filters]');
    let pendingController = null;
    async function load(){
      if (!form) return;
      if (pendingController) pendingController.abort();
      pendingController = new AbortController();
      const params = new URLSearchParams(new FormData(form));
      params.set('shopDomain', shopDomain); params.set('limit', limit); params.set('t', Date.now());
      if (summary) summary.textContent = 'Searching approved reviews…';
      const res = await fetch(`${api}/reviews/seo-page?${params.toString()}`, { cache: 'no-store', signal: pendingController.signal });
      if (!res.ok) throw new Error('Could not load reviews');
      const data = await res.json();
      if (summary) summary.innerHTML = `<strong>${esc(data.average || 0)} / 5</strong><span>${esc(data.count || 0)} matching approved customer reviews</span>`;
      if (tags) tags.innerHTML = [...(data.topTags||[]), ...(data.attributeAverages||[]).map(a=>({label:`${a.label}: ${a.average}/10`,count:a.count}))].slice(0,24).map(t=>`<button type="button" data-filter-chip="${esc(t.label)}">${esc(t.label)} <span>${esc(t.count)}</span></button>`).join('');
      if (recommendations) {
        recommendations.innerHTML = (data.recommendations||[]).length
          ? `<div class="nectar-seo-rec-head"><span>Review-linked recommendations</span><h2>${params.get('q') ? 'Products customers mention for this search' : 'Popular products from reviews'}</h2><p>Suggestions use approved reviews, product tags and flavour-profile scores.</p></div><div class="nectar-seo-rec-grid">${(data.recommendations||[]).map((item)=>recommendationCard(shopDomain, item)).join('')}</div>`
          : '';
      }
      if (list) list.innerHTML = (data.reviews||[]).map(reviewCard).join('') || '<p class="nectar-seo-empty">No matching reviews yet. Try a flavour, product name, rating or ingredient keyword.</p>';
      let script = root.querySelector('script[type="application/ld+json"]'); if (!script) { script = document.createElement('script'); script.type='application/ld+json'; root.appendChild(script); }
      script.textContent = JSON.stringify(data.jsonLd || {});
    }
    let debounce = null;
    form && form.addEventListener('submit',(e)=>{e.preventDefault();load().catch((error)=>{ if (error.name !== 'AbortError' && summary) summary.textContent='Could not load reviews.'; });});
    form?.querySelector('input[name=q]')?.addEventListener('input',()=>{ clearTimeout(debounce); debounce=setTimeout(()=>load().catch(()=>{}), 320); });
    form?.querySelector('select[name=minRating]')?.addEventListener('change',()=>load().catch(()=>{}));
    root.addEventListener('click',(e)=>{ const chip=e.target.closest('[data-filter-chip]'); if(!chip||!form) return; const input=form.querySelector('input[name=q]'); if(input){input.value=chip.dataset.filterChip.replace(/:\s*[0-9.]+\/10$/,''); load().catch(()=>{});} });
    load().catch(()=>{ if(summary) summary.textContent='Could not load reviews.'; });
  });
})();
