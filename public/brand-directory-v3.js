(function Elev8BrandDirectoryV3(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const shop=()=>new URLSearchParams(location.search).get('shop')||new URLSearchParams(location.search).get('shopDomain')||window.Shopify?.shop||'';
  async function api(path,options={}){
    const fn=window.adminFetch||window.fetch.bind(window);
    const join=path.includes('?')?'&':'?';
    const url=`/api/admin/brand-directory-v3${path}${shop()?`${join}shopDomain=${encodeURIComponent(shop())}`:''}`;
    const res=await fn(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||data.message||`HTTP ${res.status}`);
    return data;
  }
  function card(b){
    const lines=(b.coreProductLines||[]).length ? b.coreProductLines.map(x=>x.name||x.productType).filter(Boolean) : (b.productFamilies||[]);
    return `<div class="ca-brand"><div><h3 style="margin:0">${esc(b.name)}</h3><div class="ca-muted">${esc(b.canonicalVendor||'')} · ${Math.round(Number(b.confidence||0)*100)}% confidence</div></div><div>${b.aboutBrand?esc(b.aboutBrand):'<span class="ca-muted">About Brand still needs enrichment.</span>'}${lines.length?`<div style="margin-top:9px">${lines.slice(0,12).map(x=>`<span class="ca-badge" style="margin:3px">${esc(x)}</span>`).join('')}</div>`:''}</div><div><span class="ca-badge possible_match">${esc(b.status||'draft')}</span></div></div>`;
  }
  async function load(){
    const box=$('ca-brand-list');if(!box)return;
    box.innerHTML='<div class="ca-muted">Loading brands directly from MongoDB…</div>';
    try{
      const data=await api('/brands');
      box.innerHTML=(data.brands||[]).length?(data.brands||[]).map(card).join(''):`<div class="ca-muted">Connected. No brands found for ${esc(data.shopDomain||'this shop')}.</div>`;
    }catch(error){box.innerHTML=`<div style="padding:11px;background:#fff0ee;border-radius:10px;color:#8a241a"><strong>Brand Directory v3 failed</strong><div>${esc(error.message)}</div></div>`}
  }
  async function backfill(){
    const btn=$('ca-generate-brands');if(!btn)return;
    const old=btn.textContent;btn.disabled=true;btn.textContent='Scanning Gaming Nectar…';
    try{
      const r=await api('/backfill-storefront',{method:'POST',body:JSON.stringify({rootUrl:'https://www.gamingnectar.com',onlyMissing:true})});
      btn.textContent=`Created ${r.created||0} brands`;
      await load();
      setTimeout(()=>btn.textContent=old,2500);
    }catch(e){alert(`Brand backfill failed: ${e.message}`);btn.textContent=old}
    finally{btn.disabled=false}
  }
  function wire(){
    const tab=$('pci-tab-brand-directory');
    if(tab&&!tab.dataset.v3){tab.dataset.v3='1';tab.addEventListener('click',()=>setTimeout(load,50))}
    const refresh=$('ca-refresh-brands');
    if(refresh&&!refresh.dataset.v3){refresh.dataset.v3='1';refresh.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();load()},true)}
    const gen=$('ca-generate-brands');
    if(gen&&!gen.dataset.v3){gen.dataset.v3='1';gen.textContent='Backfill missing brands from Gaming Nectar';gen.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();backfill()},true)}
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(wire,400));
  window.addEventListener('load',()=>setTimeout(wire,650));
  setInterval(wire,1200);
})();