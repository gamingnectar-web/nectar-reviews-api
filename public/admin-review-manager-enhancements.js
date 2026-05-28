(function(){
  async function loadReviews(){ const mount=document.getElementById('reviewsList'); if(!mount||!window.NectarAdmin) return; try{ const data=await window.NectarAdmin.api('/api/admin/reviews'); mount.innerHTML=(data.reviews||[]).map(r=>`<div class="card"><strong>${'★'.repeat(r.rating||0)} ${r.headline||'Review'}</strong><p>${r.comment||''}</p><p class="muted">${r.status} · ${r.reviewScope||'product'} · ${r.sourceLabel||r.source||''}</p></div>`).join('')||'<div class="card">No reviews yet.</div>'; }catch(e){ mount.innerHTML='<div class="card">Could not load reviews: '+e.message+'</div>'; } }
  document.addEventListener('click', e=>{ if(e.target && e.target.id==='refreshReviews') loadReviews(); });
  setTimeout(loadReviews, 500);
})();
