(function(){
  const params = new URLSearchParams(location.search);
  const shopDomain = params.get('shop') || params.get('shopDomain') || localStorage.getItem('nectar_shop_domain') || '';
  if (shopDomain) localStorage.setItem('nectar_shop_domain', shopDomain);
  window.NectarAdmin = {
    shopDomain,
    api(path, options={}){
      const join = path.includes('?') ? '&' : '?';
      return fetch(path + join + 'shopDomain=' + encodeURIComponent(shopDomain), { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options }).then(async r=>{ const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Request failed'); return j; });
    },
    card(html){ return '<div class="card">'+html+'</div>'; }
  };
  async function loadDashboard(){
    const mount=document.getElementById('dashboardMetrics'); if(!mount) return;
    try{ const data=await window.NectarAdmin.api('/api/admin/dashboard'); mount.innerHTML=Object.entries(data.metrics||{}).map(([k,v])=>`<div class="card"><div class="muted">${k}</div><h2>${v}</h2></div>`).join(''); }catch(e){ mount.innerHTML='<div class="card">Dashboard needs admin session / MongoDB.</div>'; }
    const status=document.getElementById('moduleStatus');
    try{ const d=await window.NectarAdmin.api('/api/admin/modules/status'); status.innerHTML=(d.modules||[]).map(m=>`<div class="card"><span class="dot ${m.live?'live':m.enabled?'amber':''}"></span> <strong>${m.moduleKey}</strong><p class="muted">${m.live?'Live':m.enabled?'Enabled / not live':'Disabled'}</p></div>`).join(''); }catch(e){}
  }
  loadDashboard();
})();
