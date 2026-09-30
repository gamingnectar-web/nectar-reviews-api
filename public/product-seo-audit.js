(function ProductSeoAudit(){
  const api=(path,options={})=>window.adminFetch(`/admin/product-creation-import${path}`,options);
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let loaded=false,data=null;

  function render(){
    if(!data)return;
    const s=data.summary||{};
    $('pci-seo-summary').innerHTML=`<div class="pci-seo-score-card"><strong>${s.averageScore||0}</strong><span>Average health</span></div><div class="pci-seo-stat"><strong>${s.needsWork||0}</strong><span>Products need work</span></div><div class="pci-seo-stat"><strong>${s.weakMeta||0}</strong><span>Weak / missing meta</span></div><div class="pci-seo-stat"><strong>${s.titleIssues||0}</strong><span>Title issues</span></div><div class="pci-seo-stat"><strong>${s.urlIssues||0}</strong><span>URL issues</span></div>`;
    const q=($('pci-seo-search')?.value||'').toLowerCase().trim();
    const filter=$('pci-seo-filter')?.value||'all';
    const rows=(data.products||[]).filter(row=>{ if(q&&!`${row.title} ${row.vendor} ${row.handle}`.toLowerCase().includes(q))return false; if(filter==='poor'&&row.score>=60)return false; if(filter==='work'&&row.score>=80)return false; if(filter==='good'&&row.score<80)return false; return true; });
    $('pci-seo-results').innerHTML=rows.map(row=>`<article class="pci-seo-row"><div class="pci-seo-row-main"><div class="pci-seo-row-title">${row.image?`<img src="${esc(row.image)}" alt="">`:''}<div><strong>${esc(row.title)}</strong><small>${esc(row.vendor)} · /products/${esc(row.handle)}</small></div></div><div class="pci-seo-score ${row.score>=80?'good':row.score>=60?'warn':'bad'}">${row.score}</div></div><div class="pci-seo-copy"><div><span>SEO TITLE</span><p>${esc(row.seoTitle||'Missing')}</p></div><div><span>META DESCRIPTION</span><p>${esc(row.seoDescription||'Missing')}</p></div></div><div class="pci-seo-issues">${(row.issues||[]).slice(0,5).map(issue=>`<span>⚠ ${esc(issue)}</span>`).join('')||'<span class="ok">✓ No major issues in this audit</span>'}</div><div class="pci-seo-actions"><button class="secondary-btn" type="button" data-ai-id="${esc(row.id)}">Improve with AI</button><div class="pci-seo-ai-result" id="seo-ai-${String(row.id).replace(/[^a-z0-9]/gi,'_')}"></div></div></article>`).join('')||'<div class="pci-empty">No products match this filter.</div>';
    document.querySelectorAll('[data-ai-id]').forEach(btn=>{btn.onclick=()=>suggest(btn.dataset.aiId,btn);});
  }

  async function suggest(id,btn){
    const row=(data.products||[]).find(item=>item.id===id); if(!row)return;
    const target=$(`seo-ai-${String(id).replace(/[^a-z0-9]/gi,'_')}`);
    try{ btn.disabled=true; target.textContent='Generating one AI suggestion…'; const result=await api('/seo/suggest',{method:'POST',body:JSON.stringify({product:row})}); const s=result.suggestion||{}; target.innerHTML=`<div class="pci-seo-suggestion"><strong>AI suggestion</strong><p><b>Title:</b> ${esc(s.seoTitle)}</p><p><b>Meta:</b> ${esc(s.seoDescription)}</p><p><b>URL:</b> /products/${esc(s.handle)}</p></div>`; }
    catch(error){ target.textContent=error.message||'AI suggestion failed.'; }
    finally{ btn.disabled=false; }
  }

  async function load(force=false){
    if(loaded&&!force){render();return;}
    $('pci-seo-status').textContent='Auditing Shopify product SEO…';
    try{ data=await api('/seo/audit?limit=2500'); loaded=true; $('pci-seo-status').textContent=`Audited ${data.summary?.products||0} Shopify products.`; render(); }
    catch(error){ $('pci-seo-status').textContent=error.message||'SEO audit failed.'; }
  }

  window.openProductSeoAudit=()=>{ window.pciTab?.('seo-health'); setTimeout(()=>load(false),50); };
  window.refreshProductSeoAudit=()=>load(true);
  document.addEventListener('input',event=>{if(event.target?.id==='pci-seo-search')render();});
  document.addEventListener('change',event=>{if(event.target?.id==='pci-seo-filter')render();});
})();
