(function(){
  const APP_URL = '__APP_URL__' || '';
  function api(path){ return fetch((APP_URL || '') + path).then(r=>r.json()); }
  function stars(n){ return '★★★★★'.split('').map((s,i)=>`<span style="color:${i<n?'#f5b301':'#e5e7eb'}">★</span>`).join(''); }
  async function mount(el){
    const shopDomain=el.dataset.shopDomain||el.dataset.shop||''; const itemId=el.dataset.productId||el.dataset.itemId||'';
    if(!shopDomain||!itemId){ el.innerHTML=''; return; }
    try{ const data=await api(`/api/reviews/${encodeURIComponent(itemId)}?shopDomain=${encodeURIComponent(shopDomain)}`); el.innerHTML=`<div class="nectar-widget"><strong>${stars(Math.round(data.summary.average||0))}</strong> <span>${data.summary.average||0} (${data.summary.count||0})</span><div>${(data.reviews||[]).slice(0,3).map(r=>`<blockquote><b>${r.headline||'Review'}</b><br>${r.comment||''}</blockquote>`).join('')}</div></div>`; }catch(e){ console.warn(e); }
  }
  document.querySelectorAll('[data-nectar-review-widget]').forEach(mount);
})();
