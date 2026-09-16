(function Elev8BrandDirectoryDiagnostics(){
  const $=(id)=>document.getElementById(id);
  const getShop=()=>new URLSearchParams(location.search).get('shop')||new URLSearchParams(location.search).get('shopDomain')||'';
  async function req(base,path){
    const fn=window.adminFetch||window.fetch.bind(window);
    const shop=getShop();
    const join=path.includes('?')?'&':'?';
    const url=`${base}${path}${shop?`${join}shopDomain=${encodeURIComponent(shop)}`:''}`;
    const res=await fn(url,{headers:{'Content-Type':'application/json'}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const e=new Error(data.error||data.message||`HTTP ${res.status}`);e.status=res.status;throw e}
    return data;
  }
  async function load(){
    const box=$('ca-brand-list');if(!box)return;
    const bases=['/api/admin/product-creation-import/catalogue','/api/admin/product-creation-import','/api/admin/brand-directory'];
    let last;box.innerHTML='<div class="ca-muted">Connecting to Brand Directory…</div>';
    for(const base of bases){
      try{
        const data=await req(base,'/brands');const brands=data.brands||[];
        if(!brands.length){box.innerHTML='<div class="ca-muted">Brand Directory connected, but no profiles were returned for this shop.</div>';return}
        const render=window.__elev8RenderBrandCard;
        box.innerHTML=typeof render==='function'
          ? brands.map(render).join('')
          : brands.map(b=>`<div style="padding:12px 0;border-top:1px solid #edf0f4"><strong>${String(b.name||'Brand')}</strong><div style="color:#667085">${String(b.website||'')}</div><div style="margin-top:5px">${String(b.aboutBrand||'')}</div></div>`).join('');
        return;
      }catch(e){last=e;if(e.status!==404)break}
    }
    box.innerHTML=`<div style="padding:10px 12px;border-radius:10px;background:#fff0ee;color:#8a241a"><strong>Brand Directory API is not reachable.</strong><div style="margin-top:4px">${String(last?.message||'Unknown error')}</div><div style="margin-top:4px;font-size:12px">This is an API routing issue, not missing MongoDB data.</div></div>`;
  }
  function wire(){
    const refresh=$('ca-refresh-brands');
    if(refresh&&!refresh.dataset.diagWired){refresh.dataset.diagWired='1';refresh.addEventListener('click',(e)=>{e.preventDefault();e.stopImmediatePropagation();load()},true)}
    const tab=$('pci-tab-brand-directory');
    if(tab&&!tab.dataset.diagWired){tab.dataset.diagWired='1';tab.addEventListener('click',()=>setTimeout(load,50))}
  }
  setInterval(wire,1000);
  window.addEventListener('load',()=>setTimeout(()=>{wire();if($('pci-pane-brand-directory')?.classList.contains('active'))load()},700));
})();