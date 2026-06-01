(function(){
  const root = document.querySelector('.nectar-seo-reviews-page');
  if (!root) return;
  const api = (root.dataset.apiUrl || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
  const shopDomain = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
  const limit = root.dataset.limit || '120';
  const summary = root.querySelector('[data-nectar-seo-summary]');
  const list = root.querySelector('[data-nectar-seo-list]');
  const tags = root.querySelector('[data-nectar-seo-tags]');
  const form = root.querySelector('[data-nectar-seo-filters]');
  const esc = (v)=>String(v||'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  function stars(n){ const rating = Math.max(0, Math.min(5, Math.round(Number(n||0)))); return '★★★★★'.split('').map((s,i)=>`<span class="${i<rating?'on':''}">★</span>`).join(''); }
  async function load(){
    const params = new URLSearchParams(new FormData(form || document.createElement('form')));
    params.set('shopDomain', shopDomain); params.set('limit', limit); params.set('t', Date.now());
    if (summary) summary.textContent = 'Loading reviews…';
    const res = await fetch(`${api}/reviews/seo-page?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load reviews');
    const data = await res.json();
    if (summary) summary.innerHTML = `<strong>${esc(data.average || 0)} / 5</strong><span>${esc(data.count || 0)} approved customer reviews</span>`;
    if (tags) tags.innerHTML = [...(data.topTags||[]), ...(data.attributeAverages||[]).map(a=>({label:`${a.label}: ${a.average}/10`,count:a.count}))].slice(0,24).map(t=>`<button type="button" data-filter-chip="${esc(t.label)}">${esc(t.label)} <span>${esc(t.count)}</span></button>`).join('');
    if (list) list.innerHTML = (data.reviews||[]).map((r)=>`<article class="nectar-seo-review"><div class="nectar-seo-stars">${stars(r.rating)}</div><h2>${esc(r.headline||'Customer review')}</h2><p>${esc(r.comment||'')}</p><footer>${esc(r.isAnonymous?'Verified customer':(r.userId||'Customer'))}${r.verifiedPurchase?' · Verified purchase':''}${r.sourceLabel?` · ${esc(r.sourceLabel)}`:''}</footer></article>`).join('') || '<p>No matching reviews yet.</p>';
    let script = root.querySelector('script[type="application/ld+json"]'); if (!script) { script = document.createElement('script'); script.type='application/ld+json'; root.appendChild(script); }
    script.textContent = JSON.stringify(data.jsonLd || {});
  }
  form && form.addEventListener('submit',(e)=>{e.preventDefault();load().catch(()=>{ if(summary) summary.textContent='Could not load reviews.'; });});
  root.addEventListener('click',(e)=>{ const chip=e.target.closest('[data-filter-chip]'); if(!chip||!form) return; const input=form.querySelector('input[name=q]'); if(input){input.value=chip.dataset.filterChip.replace(/:\s*[0-9.]+\/10$/,''); load();} });
  load().catch(()=>{ if(summary) summary.textContent='Could not load reviews.'; });
})();
