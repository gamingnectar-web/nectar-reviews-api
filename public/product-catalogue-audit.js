(function Elev8CatalogueAudit(){
  const API='/api/admin/product-creation-import/catalogue';
  const $=(id)=>document.getElementById(id);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function rawApi(base,path,options={}){
    const fn=window.adminFetch||window.fetch.bind(window);
    const res=await fn(`${base}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const error=new Error(data.error||data.message||`Request failed (${res.status})`);error.status=res.status;throw error}
    return data;
  }
  async function catalogueApi(path,options={}){
    try{return await rawApi(API,path,options)}
    catch(error){
      if(error.status!==404)throw error;
      if(path==='/brands')return rawApi('/api/admin/product-creation-import','/brands',options);
      if(path==='/brands/scrape-url')return rawApi('/api/admin/product-creation-import','/brands/scrape-url',options);
      throw error;
    }
  }
  async function api(path,options={}){
    return catalogueApi(path,options);
  }
  function findTabRow(){
    return document.querySelector('#v-product-creation-import .pci-tabs, #v-product-creation-import [role="tablist"], #v-product-creation-import .pci-nav, #v-product-creation-import .pci-tab-row');
  }
  function paneHost(){
    return document.querySelector('#v-product-creation-import .pci-pane-host, #v-product-creation-import .pci-content, #v-product-creation-import') || document.body;
  }
  function addStyles(){
    if($('catalogue-audit-style'))return;
    const s=document.createElement('style');s.id='catalogue-audit-style';
    s.textContent=`
      .ca-pane{display:none;padding:18px 0}.ca-pane.active{display:block}
      .ca-hero,.ca-card{background:#fff;border:1px solid #dfe4ea;border-radius:16px;padding:18px;margin-bottom:16px}
      .ca-hero{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end}
      .ca-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
      .ca-stat{background:#f7f9fb;border:1px solid #e5e9ef;border-radius:12px;padding:14px}.ca-stat small{display:block;color:#687386;text-transform:uppercase;font-weight:700;font-size:11px}.ca-stat strong{display:block;font-size:26px;margin-top:4px}
      .ca-row{display:grid;grid-template-columns:minmax(220px,2fr) minmax(180px,1.4fr) 120px 1fr;gap:12px;padding:12px 0;border-top:1px solid #edf0f4;align-items:center}
      .ca-badge{display:inline-flex;border-radius:999px;padding:5px 9px;font-weight:700;font-size:12px;background:#edf1f5}.ca-badge.missing{background:#fff0ee;color:#9f2418}.ca-badge.matched{background:#eaf8ef;color:#167642}.ca-badge.needs_update,.ca-badge.possible_match{background:#fff7df;color:#865d00}
      .ca-actions{display:flex;gap:8px;flex-wrap:wrap}.ca-btn{border:1px solid #cfd6df;background:#fff;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}.ca-btn.primary{background:#101d32;color:#fff;border-color:#101d32}
      .ca-input{width:100%;border:1px solid #ccd4de;border-radius:10px;padding:11px 12px}.ca-label{display:block;font-weight:700;margin-bottom:6px}.ca-muted{color:#667085}
      .ca-brand{display:grid;grid-template-columns:1.2fr 2fr auto;gap:14px;align-items:start;padding:14px 0;border-top:1px solid #edf0f4}
      @media(max-width:900px){.ca-grid{grid-template-columns:1fr 1fr}.ca-row,.ca-brand,.ca-hero{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }
  function inject(){
    if($('pci-tab-site-audit'))return;
    addStyles();
    const row=findTabRow();
    if(!row)return;
    const make=(id,label)=>{const b=document.createElement('button');b.id=id;b.type='button';b.className='pci-tab';b.textContent=label;return b};
    const auditTab=make('pci-tab-site-audit','Site Audit');
    const brandTab=make('pci-tab-brand-directory','Brand Directory');
    row.append(auditTab,brandTab);

    const host=paneHost();
    const audit=document.createElement('section');audit.id='pci-pane-site-audit';audit.className='ca-pane';
    audit.innerHTML=`
      <div class="ca-hero">
        <div><div class="ca-label">Check a supplier site or collection</div><input class="ca-input" id="ca-source-url" placeholder="https://x-zero.co.uk/collections/x-zero"><p class="ca-muted">ELEV8 discovers the supplier catalogue, compares it with Shopify and checks whether reusable brand information is missing.</p></div>
        <div class="ca-actions"><button class="ca-btn primary" id="ca-run-audit">Check site</button></div>
      </div>
      <div id="ca-audit-result"><div class="ca-card ca-muted">Enter a supplier site or collection URL to begin.</div></div>
      <div class="ca-card"><h3>Recent site audits</h3><div id="ca-recent-audits" class="ca-muted">Loading…</div></div>`;
    const brands=document.createElement('section');brands.id='pci-pane-brand-directory';brands.className='ca-pane';
    brands.innerHTML=`
      <div class="ca-hero"><div><h2 style="margin:0">Brand Directory</h2><p class="ca-muted">Reusable brand information and core product-line rules. MongoDB remains usable even when Shopify is unavailable.</p></div>
      <div class="ca-actions"><button class="ca-btn" id="ca-generate-brands">Generate missing brands from Shopify</button></div></div>
      <div class="ca-card">
        <h3>Scrape a brand website</h3>
        <p class="ca-muted">Paste a brand homepage or collection. ELEV8 discovers the catalogue, identifies core ranges/formulas and creates a reusable draft profile.</p>
        <div style="display:grid;grid-template-columns:minmax(220px,2fr) minmax(160px,1fr) auto;gap:10px;align-items:end">
          <label><span class="ca-label">Brand / collection URL</span><input class="ca-input" id="ca-brand-source-url" placeholder="https://x-zero.co.uk/collections/x-zero"></label>
          <label><span class="ca-label">Brand name (optional)</span><input class="ca-input" id="ca-brand-name" placeholder="X-Zero"></label>
          <button class="ca-btn primary" id="ca-scrape-brand">Scrape & create draft</button>
        </div>
        <div id="ca-brand-scrape-status" class="ca-muted" style="margin-top:10px"></div>
      </div>
      <div class="ca-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3 style="margin:0">Brands in MongoDB</h3><button class="ca-btn" id="ca-refresh-brands">Refresh</button></div><div id="ca-brand-list" class="ca-muted" style="margin-top:12px">Loading…</div></div>`;
    host.append(audit,brands);

    function activate(which){
      document.querySelectorAll('#v-product-creation-import .pci-pane').forEach(p=>p.style.display='none');
      document.querySelectorAll('#v-product-creation-import .ca-pane').forEach(p=>p.classList.remove('active'));
      row.querySelectorAll('.pci-tab').forEach(t=>t.classList.remove('active'));
      if(which==='audit'){audit.classList.add('active');auditTab.classList.add('active');loadAudits();}
      if(which==='brands'){brands.classList.add('active');brandTab.classList.add('active');loadBrands();}
    }
    auditTab.addEventListener('click',()=>activate('audit'));
    brandTab.addEventListener('click',()=>activate('brands'));
    $('ca-run-audit')?.addEventListener('click',runAudit);
    $('ca-generate-brands')?.addEventListener('click',generateBrands);
    $('ca-scrape-brand')?.addEventListener('click',scrapeBrand);
    $('ca-refresh-brands')?.addEventListener('click',loadBrands);
  }

  function statusBadge(status){return `<span class="ca-badge ${esc(status)}">${esc(String(status||'').replace(/_/g,' '))}</span>`}
  function renderAudit(a){
    const brandAction=a.brandProfileMissing
      ? `<button class="ca-btn primary" data-create-brand="${esc(a._id)}">Create ${esc(a.brandName)} brand</button>`
      : `<button class="ca-btn" data-open-brands="1">Open brand directory</button>`;
    const rows=(a.products||[]).slice(0,250).map(p=>`
      <div class="ca-row"><div><strong>${esc(p.supplierTitle||p.supplierHandle||'Supplier product')}</strong><div class="ca-muted">${esc(p.supplierUrl||'')}</div></div>
      <div>${p.shopifyTitle?`<strong>${esc(p.shopifyTitle)}</strong>`:'—'}${p.missingFields?.length?`<div class="ca-muted">Missing: ${esc(p.missingFields.join(', '))}</div>`:''}${p.weakFields?.length?`<div class="ca-muted">Weak: ${esc(p.weakFields.join(', '))}</div>`:''}</div>
      <div>${statusBadge(p.status)}</div><div>${p.status==='missing'?'<span class="ca-muted">Ready for batch import</span>':p.status==='needs_update'?'<span class="ca-muted">Existing product can be enriched</span>':''}</div></div>`).join('');
    $('ca-audit-result').innerHTML=`
      <div class="ca-card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 style="margin:0">${esc(a.brandName||a.supplierHost)}</h2><p class="ca-muted">${esc(a.sourceUrl)}</p></div><div class="ca-actions">${brandAction}<button class="ca-btn primary" data-import-missing="${esc(a._id)}">Import missing products</button></div></div>
      <div class="ca-grid"><div class="ca-stat"><small>Supplier products</small><strong>${a.discoveredCount||0}</strong></div><div class="ca-stat"><small>Coverage</small><strong>${a.coveragePercent||0}%</strong></div><div class="ca-stat"><small>Missing</small><strong>${a.missingCount||0}</strong></div><div class="ca-stat"><small>Need updates</small><strong>${a.needsUpdateCount||0}</strong></div></div>
      ${a.brandProfileMissing?`<div style="padding:12px;border-radius:12px;background:#fff7df"><strong>Brand information is missing.</strong><div class="ca-muted">${esc((a.missingBrandFields||[]).join(' · ')||'Create the reusable brand profile before importing products.')}</div></div>`:''}
      </div><div class="ca-card"><h3>Product comparison</h3>${rows||'<p class="ca-muted">No products found.</p>'}</div>`;
    document.querySelector('[data-create-brand]')?.addEventListener('click',createBrand);
    document.querySelector('[data-open-brands]')?.addEventListener('click',()=>document.getElementById('pci-tab-brand-directory')?.click());
    document.querySelector('[data-import-missing]')?.addEventListener('click',()=>importMissing(a));
  }
  async function runAudit(){
    const url=$('ca-source-url')?.value.trim();if(!url)return;
    const btn=$('ca-run-audit');btn.disabled=true;btn.textContent='Checking site…';
    $('ca-audit-result').innerHTML='<div class="ca-card">Scouring supplier catalogue and comparing it with Shopify…</div>';
    try{const data=await api('/audit',{method:'POST',body:JSON.stringify({sourceUrl:url})});renderAudit(data.audit);loadAudits();}
    catch(e){$('ca-audit-result').innerHTML=`<div class="ca-card"><strong>Audit failed</strong><p>${esc(e.message)}</p></div>`}
    finally{btn.disabled=false;btn.textContent='Check site'}
  }
  async function createBrand(e){
    const id=e.currentTarget.dataset.createBrand;e.currentTarget.disabled=true;
    try{await api(`/audits/${id}/create-brand`,{method:'POST',body:JSON.stringify({approve:false})});const data=await api(`/audits/${id}`);renderAudit(data.audit);loadBrands();}
    catch(err){alert(err.message)}finally{e.currentTarget.disabled=false}
  }
  async function importMissing(a){
    const urls=(a.products||[]).filter(p=>p.status==='missing').map(p=>p.supplierUrl).filter(Boolean);
    if(!urls.length)return alert('No missing products were found.');
    try{
      const fn=window.adminFetch||window.fetch.bind(window);
      const res=await fn('/api/admin/product-creation-import/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        name:`${a.brandName||'Supplier'} missing products`,
        defaults:{supplierName:a.brandName||'',vendor:a.brandName||'',supplierUrl:a.sourceUrl},
        links:urls
      })});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Could not create batch');
      alert(`Created a batch with ${urls.length} missing products.`);
      document.querySelector('#v-product-creation-import [data-pci-tab="batch"], #v-product-creation-import .pci-tab[data-tab="batch"]')?.click();
    }catch(err){alert(err.message)}
  }
  async function loadAudits(){
    const box=$('ca-recent-audits');if(!box)return;
    try{const {audits=[]}=await api('/audits');box.innerHTML=audits.length?audits.slice(0,15).map(a=>`<button class="ca-btn" style="margin:4px" data-audit="${esc(a._id)}">${esc(a.brandName||a.supplierHost)} · ${a.coveragePercent||0}% coverage · ${a.missingCount||0} missing</button>`).join(''):'No audits yet.';
    box.querySelectorAll('[data-audit]').forEach(b=>b.addEventListener('click',async()=>{const {audit}=await api(`/audits/${b.dataset.audit}`);renderAudit(audit)}));
    }catch(e){box.textContent=e.message}
  }
  function brandCard(b){
    const missing=[];if(!b.aboutBrand)missing.push('About Brand');if(!b.seoTitle||!b.seoDescription)missing.push('SEO');if(!(b.productFamilies||[]).length&&!((b.coreProductLines||[]).length))missing.push('Product families');
    const lines=(b.coreProductLines||[]).length
      ? (b.coreProductLines||[]).slice(0,12).map(line=>`<span class="ca-badge" style="margin:3px">${esc(line.name||line.productType||'Range')}</span>`).join('')
      : (b.productFamilies||[]).slice(0,12).map(line=>`<span class="ca-badge" style="margin:3px">${esc(line)}</span>`).join('');
    return `<div class="ca-brand"><div><h3 style="margin:0">${esc(b.name)}</h3><div class="ca-muted">${esc(b.canonicalVendor||'')} · ${esc(b.source||'')} · ${Math.round(Number(b.confidence||0)*100)}% confidence</div>${b.website?`<div class="ca-muted">${esc(b.website)}</div>`:''}</div>
      <div>${b.aboutBrand?`<div>${esc(b.aboutBrand)}</div>`:'<span class="ca-muted">No About Brand yet.</span>'}${lines?`<div style="margin-top:10px"><strong>Core product lines</strong><div style="margin-top:5px">${lines}</div></div>`:''}${missing.length?`<div class="ca-muted" style="margin-top:8px">Missing: ${esc(missing.join(', '))}</div>`:''}</div>
      <div>${b.status==='approved'?statusBadge('matched'):statusBadge('possible_match')}</div></div>`;
  }

  async function loadBrands(){
    const box=$('ca-brand-list');if(!box)return;
    try{const {brands=[]}=await api('/brands');box.innerHTML=brands.length?brands.map(brandCard).join(''):'No brand profiles yet. Generate them from Shopify or create one from a supplier audit.'}
    catch(e){box.textContent=e.message}
  }
  async function generateBrands(){
    const btn=$('ca-generate-brands');btn.disabled=true;btn.textContent='Generating…';
    try{const data=await api('/brands/generate-from-shopify',{method:'POST',body:JSON.stringify({onlyMissing:true})});await loadBrands();alert(`Created ${data.created||0} brand profiles from your Shopify catalogue.`)}
    catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent='Generate missing brands from Shopify'}
  }

  document.addEventListener('click',(event)=>{
    const tab=event.target?.closest?.('#v-product-creation-import .pci-tab');
    if(!tab || ['pci-tab-site-audit','pci-tab-brand-directory'].includes(tab.id)) return;
    document.querySelectorAll('#v-product-creation-import .ca-pane').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#v-product-creation-import .pci-pane').forEach(p=>p.style.removeProperty('display'));
  });

  document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,300));
  window.addEventListener('load',()=>setTimeout(inject,500));
  setInterval(inject,1500);
})();