(function Elev8BrandDirectoryLiveFix(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const shop=()=>new URLSearchParams(location.search).get('shop')||new URLSearchParams(location.search).get('shopDomain')||window.Shopify?.shop||'';

  async function api(path,options={}){
    const fn=window.adminFetch||window.fetch.bind(window);
    const join=path.includes('?')?'&':'?';
    const url=`/api/admin/brand-directory-v2${path}${shop()?`${join}shopDomain=${encodeURIComponent(shop())}`:''}`;
    const res=await fn(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||data.message||`HTTP ${res.status}`);
    return data;
  }

  function card(b){
    const lines=(b.coreProductLines||[]).length
      ? b.coreProductLines.map(x=>x.name||x.productType).filter(Boolean)
      : (b.productFamilies||[]);
    return `<div class="ca-brand">
      <div><h3 style="margin:0">${esc(b.name)}</h3><div class="ca-muted">${esc(b.canonicalVendor||'')} · ${Math.round(Number(b.confidence||0)*100)}% confidence</div>${b.website?`<div class="ca-muted">${esc(b.website)}</div>`:''}</div>
      <div>${b.aboutBrand?esc(b.aboutBrand):'<span class="ca-muted">About Brand still needs enrichment.</span>'}
      ${lines.length?`<div style="margin-top:10px"><strong>Core product lines</strong><div style="margin-top:5px">${lines.slice(0,12).map(x=>`<span class="ca-badge" style="margin:3px">${esc(x)}</span>`).join('')}</div></div>`:''}</div>
      <div><span class="ca-badge possible_match">${esc(b.status||'draft')}</span></div>
    </div>`;
  }

  async function loadBrands(){
    const box=$('ca-brand-list');if(!box)return;
    box.innerHTML='<div class="ca-muted">Loading live MongoDB brands…</div>';
    try{
      const {brands=[]}=await api('/brands');
      box.innerHTML=brands.length?brands.map(card).join(''):'<div class="ca-muted">Connected successfully, but there are no brand records for this shop.</div>';
    }catch(error){
      box.innerHTML=`<div style="padding:11px 13px;border-radius:10px;background:#fff0ee;color:#8a241a"><strong>Brand Directory connection failed</strong><div style="margin-top:5px">${esc(error.message)}</div></div>`;
    }
  }

  async function backfill(){
    const button=$('ca-generate-brands');
    if(!button)return;
    button.disabled=true;
    const old=button.textContent;
    button.textContent='Scanning Gaming Nectar…';
    try{
      const result=await api('/generate-from-storefront',{method:'POST',body:JSON.stringify({rootUrl:'https://www.gamingnectar.com',onlyMissing:true})});
      button.textContent=`Created ${result.created||0} brand drafts`;
      await loadBrands();
      setTimeout(()=>button.textContent=old,2500);
    }catch(error){
      alert(`Brand backfill failed: ${error.message}`);
      button.textContent=old;
    }finally{button.disabled=false}
  }

  function wire(){
    const tab=$('pci-tab-brand-directory');
    if(tab&&!tab.dataset.liveBrandWired){
      tab.dataset.liveBrandWired='1';
      tab.addEventListener('click',()=>setTimeout(loadBrands,80));
    }
    const refresh=$('ca-refresh-brands');
    if(refresh&&!refresh.dataset.liveBrandWired){
      refresh.dataset.liveBrandWired='1';
      refresh.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();loadBrands()},true);
    }
    const generate=$('ca-generate-brands');
    if(generate&&!generate.dataset.liveBrandWired){
      generate.dataset.liveBrandWired='1';
      generate.textContent='Backfill missing brands from Gaming Nectar';
      generate.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();backfill()},true);
    }
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(wire,400));
  window.addEventListener('load',()=>setTimeout(wire,600));
  setInterval(wire,1200);
})();
