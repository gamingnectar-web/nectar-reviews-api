(function Elev8BrandDirectoryWorkspace(){
  if(window.__ELEV8_BRAND_WORKSPACE__)return;window.__ELEV8_BRAND_WORKSPACE__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let brands=[],metadata=null,pollTimer=null;

  async function api(path,options={}){
    if(!window.adminFetch)throw new Error('Admin session unavailable');
    return window.adminFetch(path,options);
  }
  async function brandApi(path,options={}){return api(`/admin/brand-directory-v3${path}`,options)}
  async function ruleApi(path,options={}){return api(`/admin/brand-rules${path}`,options)}
  async function importApi(path,options={}){return api(`/admin/product-creation-import${path}`,options)}

  function lineNames(brand){return (brand.coreProductLines||[]).map(x=>x.name||x.productType).filter(Boolean)}
  function brandCard(b){
    return `<button type="button" class="bdw-card" data-brand="${esc(b._id)}">
      <div><strong>${esc(b.name)}</strong><small>${esc(b.canonicalVendor||'')} · ${Math.round(Number(b.confidence||0)*100)}% confidence</small></div>
      <div class="bdw-card-copy">${b.aboutBrand?esc(b.aboutBrand):'<em>About Brand still needs enrichment.</em>'}</div>
      <div class="bdw-lines">${lineNames(b).slice(0,10).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      <b class="bdw-status">${esc(b.status||'draft')}</b>
    </button>`;
  }

  async function loadBrands(){
    const box=$('ca-brand-list');if(!box)return;
    box.innerHTML='<div class="ca-muted">Loading brand directory…</div>';
    try{
      const data=await brandApi('/brands');brands=data.brands||[];
      box.innerHTML=brands.length?brands.map(brandCard).join(''):'<div class="ca-muted">No brands found.</div>';
      box.querySelectorAll('[data-brand]').forEach(btn=>btn.onclick=()=>{
        const brand=brands.find(x=>String(x._id)===btn.dataset.brand);if(brand)openBrand(brand);
      });
    }catch(error){box.innerHTML=`<div class="bdw-error"><strong>Brand Directory failed</strong><div>${esc(error.message)}</div></div>`}
  }

  function progressOpen(title='Preparing brand scan'){
    $('bdw-progress')?.remove();
    const el=document.createElement('div');el.id='bdw-progress';el.className='bdw-backdrop';
    el.innerHTML=`<div class="bdw-progress"><div class="bdw-progress-head"><div><h3 id="bdw-progress-title">${esc(title)}</h3><p id="bdw-progress-detail">Starting…</p></div><div class="bdw-spinner"></div></div><div class="bdw-track"><i id="bdw-fill"></i></div><div class="bdw-stats"><div><small>Products</small><b id="bdw-found">—</b></div><div><small>Analysed</small><b id="bdw-analysed">—</b></div><div><small>Lines</small><b id="bdw-line-count">—</b></div></div><div id="bdw-feed" class="bdw-feed"></div><div class="bdw-progress-foot"><button id="bdw-progress-close" class="secondary-btn" type="button">Close</button></div></div>`;
    document.body.appendChild(el);$('bdw-progress-close').onclick=()=>{if(pollTimer)clearTimeout(pollTimer);el.remove()};
  }
  function progressRender(job={}){
    if(!$('bdw-progress'))progressOpen(job.headline);
    $('bdw-progress-title').textContent=job.headline||'Working…';$('bdw-progress-detail').textContent=job.detail||'';
    $('bdw-fill').style.width=`${Math.max(0,Math.min(100,Number(job.progress||0)))}%`;
    $('bdw-found').textContent=job.discoveredCount||'—';$('bdw-analysed').textContent=job.processedCount||'—';$('bdw-line-count').textContent=job.productLineCount||'—';
    $('bdw-feed').innerHTML=(job.logs||[]).slice().reverse().map(log=>`<div class="bdw-feed-row ${esc(log.status||'info')}"><span>${log.status==='success'?'✓':log.status==='error'?'!':'•'}</span><div><strong>${esc(log.message||'Update')}</strong><small>${esc(log.detail||'')}</small></div></div>`).join('');
    if(['complete','failed'].includes(job.status))document.querySelector('#bdw-progress .bdw-spinner')?.classList.add('done');
  }
  async function pollJob(id){
    try{
      const {job}=await brandApi(`/scrape-job/${id}`);progressRender(job);
      if(job.status==='complete'){await loadBrands();return}
      if(job.status==='failed')return;
      pollTimer=setTimeout(()=>pollJob(id),900);
    }catch(error){progressRender({status:'failed',headline:'Could not read brand scan',detail:error.message,logs:[{status:'error',message:'Progress check failed',detail:error.message}]})}
  }
  async function startScrape(){
    const url=$('ca-brand-source-url')?.value.trim();if(!url)return alert('Paste a brand or collection URL first.');
    const btn=$('ca-scrape-brand');btn.disabled=true;const old=btn.textContent;btn.textContent='Starting…';progressOpen();
    try{
      const {job}=await brandApi('/scrape-job',{method:'POST',body:JSON.stringify({sourceUrl:url,brandName:$('ca-brand-name')?.value.trim()||''})});
      if(!job?._id)throw new Error('No scrape job ID returned.');progressRender(job);pollJob(job._id);
    }catch(error){progressRender({status:'failed',headline:'Could not start brand scan',detail:error.message,logs:[{status:'error',message:'Brand scan could not start',detail:error.message}]})}
    finally{btn.disabled=false;btn.textContent=old}
  }
  async function backfill(){
    const btn=$('ca-generate-brands');if(!btn)return;
    const old=btn.textContent;btn.disabled=true;btn.textContent='Scanning Gaming Nectar…';
    try{
      const result=await brandApi('/backfill-storefront',{method:'POST',body:JSON.stringify({rootUrl:'https://www.gamingnectar.com',onlyMissing:true})});
      await loadBrands();
      const parts=[`${result.created||0} created`,`${result.updated||0} enriched`];
      if((result.errors||[]).length)parts.push(`${result.errors.length} skipped with errors`);
      btn.textContent=parts.join(' · ');setTimeout(()=>btn.textContent=old,3500);
    }catch(error){window.showToast?.(`Brand backfill failed: ${error.message}`);btn.textContent=old}
    finally{btn.disabled=false}
  }

  function walkDefinitions(value,out=[]){
    if(!value)return out;
    if(Array.isArray(value)){value.forEach(x=>walkDefinitions(x,out));return out}
    if(typeof value!=='object')return out;
    if(value.namespace&&value.key){
      const id=`${value.namespace}.${value.key}`;
      if(!out.some(x=>x.id===id))out.push({id,namespace:value.namespace,key:value.key,name:value.name||value.label||value.key,type:value.type?.name||value.type||'single_line_text_field'});
    }
    Object.values(value).forEach(x=>walkDefinitions(x,out));return out;
  }
  async function metafields(){
    if(metadata)return metadata;
    try{metadata=await importApi('/metadata');return metadata}catch(_){return {}}
  }
  function classifyDefs(defs){
    return {
      brand:defs.filter(d=>/(about.*brand|brand.*about|brand_description|manufacturer|vendor|brand)/i.test(`${d.name} ${d.id}`)),
      line:defs.filter(d=>/(formula|caffeine|serving|nutrition|hydration|creatine|weight|sugar|calorie|taurine)/i.test(`${d.name} ${d.id}`))
    };
  }

  function actionText(a={}){
    if(a.type==='set_metafield')return `Metafield ${a.target} = ${a.value}`;
    if(a.type==='set_field')return `${a.target} = ${a.value}`;
    if(a.type==='add_tag')return `Add tag ${a.value}`;
    if(a.type==='add_collection')return `Add collection ${a.value}`;
    return 'Action';
  }
  function rulesHtml(rules=[]){
    return rules.length?rules.map((r,i)=>`<div class="bdw-rule"><div><strong>${esc(r.name||'Rule')}</strong><small>${(r.actions||[]).map(actionText).map(esc).join(' · ')}</small></div><button type="button" data-remove-rule="${i}">Remove</button></div>`).join(''):'<p class="ca-muted">No rules yet.</p>';
  }
  function brandTabHtml(brand,defs){
    const c=classifyDefs(defs);
    const aboutCandidate=c.brand.find(d=>/about.*brand|brand.*about/i.test(`${d.name} ${d.id}`));
    return `<div class="bdw-pane active" data-pane="brand">
      <div class="bdw-grid2">
        <section class="bdw-section"><h3>Brand facts</h3><p class="ca-muted">These describe the brand itself and can be reused across every product.</p>
          <label>About Brand<textarea id="bdw-about" rows="6">${esc(brand.aboutBrand||'')}</textarea></label>
          <label>Canonical vendor<input id="bdw-vendor" value="${esc(brand.canonicalVendor||brand.name||'')}"></label>
          <label>Website<input id="bdw-website" value="${esc(brand.website||'')}"></label>
          <div class="bdw-source"><b>Evidence</b><div>${(brand.sourceUrls||[]).map(u=>`<a href="${esc(u)}" target="_blank">${esc(u)}</a>`).join('')||'No source URLs saved.'}</div></div>
        </section>
        <section class="bdw-section"><h3>Brand metafields</h3><p class="ca-muted">Shopify fields that look suitable for every product in this brand.</p>
          ${c.brand.length?c.brand.slice(0,12).map(d=>`<div class="bdw-meta"><div><b>${esc(d.name)}</b><small>${esc(d.id)} · ${esc(d.type)}</small></div><button type="button" data-brand-meta="${esc(d.id)}" data-meta-type="${esc(d.type)}">Apply to all products</button></div>`).join(''):'<p class="ca-muted">No obvious brand-level metafields were detected from Shopify.</p>'}
          ${aboutCandidate?`<div class="bdw-callout"><b>Recommended</b><span>Use your About Brand text for <code>${esc(aboutCandidate.id)}</code> on every product.</span><button type="button" data-about-meta="${esc(aboutCandidate.id)}" data-meta-type="${esc(aboutCandidate.type)}">Add About Brand rule</button></div>`:''}
        </section>
      </div>
      <section class="bdw-section"><div class="bdw-section-head"><div><h3>Always apply to ${esc(brand.name)}</h3><p class="ca-muted">Universal defaults. Merchant-edited product fields still win.</p></div><button type="button" id="bdw-add-global">+ Add rule</button></div><div id="bdw-global-rules">${rulesHtml(brand.alwaysApply||[])}</div></section>
    </div>`;
  }
  function linePaneHtml(line,index,defs){
    const c=classifyDefs(defs),matcher=line.matcher||{field:'title',operator:'contains',value:line.name||''};
    return `<div class="bdw-pane" data-pane="line-${index}">
      <section class="bdw-section">
        <div class="bdw-section-head"><div><h3>${esc(line.name||`Product line ${index+1}`)}</h3><p>${esc(line.description||'Reusable rules for this product range.')}</p></div><span class="bdw-count">${(line.examples||line.exampleProducts||[]).length} examples</span></div>
        <div class="bdw-grid3">
          <label>Recognise using<select data-line-field="${index}"><option ${matcher.field==='title'?'selected':''}>title</option><option ${matcher.field==='productType'?'selected':''}>productType</option><option ${matcher.field==='tags'?'selected':''}>tags</option><option ${matcher.field==='description'?'selected':''}>description</option></select></label>
          <label>Condition<select data-line-op="${index}"><option value="contains" ${matcher.operator==='contains'?'selected':''}>contains</option><option value="equals" ${matcher.operator==='equals'?'selected':''}>equals</option><option value="starts_with" ${matcher.operator==='starts_with'?'selected':''}>starts with</option><option value="ends_with" ${matcher.operator==='ends_with'?'selected':''}>ends with</option></select></label>
          <label>Value<input data-line-value="${index}" value="${esc(matcher.value||'')}"></label>
        </div>
        <button type="button" class="secondary-btn" data-save-matcher="${index}">Save recognition rule</button>
        <div class="bdw-examples">${(line.examples||line.exampleProducts||[]).slice(0,10).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      </section>
      <div class="bdw-grid2">
        <section class="bdw-section"><div class="bdw-section-head"><div><h3>Rules for this line</h3><p class="ca-muted">Only applied when the recognition rule matches.</p></div><button type="button" data-add-line-rule="${index}">+ Add rule</button></div><div data-line-rules="${index}">${rulesHtml(line.rules||[])}</div></section>
        <section class="bdw-section"><h3>Suggested line metafields</h3>${c.line.slice(0,12).map(d=>`<div class="bdw-meta"><div><b>${esc(d.name)}</b><small>${esc(d.id)}</small></div><button type="button" data-line-meta="${index}" data-meta-id="${esc(d.id)}" data-meta-type="${esc(d.type)}">Add rule</button></div>`).join('')||'<p class="ca-muted">No likely line-level metafields detected.</p>'}</section>
      </div>
    </div>`;
  }

  async function openBrand(brand){
    const meta=await metafields(),defs=walkDefinitions(meta,[]);
    $('bdw-modal')?.remove();
    const el=document.createElement('div');el.id='bdw-modal';el.className='bdw-backdrop';
    const lines=brand.coreProductLines||[];
    el.innerHTML=`<div class="bdw-modal"><div class="bdw-head"><div><h2>${esc(brand.name)}</h2><p>Brand defaults first, then product-line formats and conditions.</p></div><button id="bdw-close" type="button">×</button></div>
      <div class="bdw-tabs"><button class="active" data-bdw-tab="brand">Brand defaults</button>${lines.map((l,i)=>`<button data-bdw-tab="line-${i}">${esc(l.name||`Line ${i+1}`)}</button>`).join('')}</div>
      <div class="bdw-body">${brandTabHtml(brand,defs)}${lines.map((l,i)=>linePaneHtml(l,i,defs)).join('')}</div>
      <div class="bdw-foot"><span>${Math.round(Number(brand.confidence||0)*100)}% confidence · ${esc(brand.source||'unknown source')}</span><div><button class="secondary-btn" id="bdw-cancel">Close</button><button class="primary-btn" id="bdw-save-brand">Save brand defaults</button></div></div></div>`;
    document.body.appendChild(el);
    $('bdw-close').onclick=$('bdw-cancel').onclick=()=>el.remove();
    el.querySelectorAll('[data-bdw-tab]').forEach(btn=>btn.onclick=()=>{
      el.querySelectorAll('[data-bdw-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      el.querySelectorAll('.bdw-pane').forEach(p=>p.classList.toggle('active',p.dataset.pane===btn.dataset.bdwTab));
    });
    $('bdw-save-brand').onclick=async()=>{
      const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({aboutBrand:$('bdw-about').value,canonicalVendor:$('bdw-vendor').value,website:$('bdw-website').value})});
      Object.assign(brand,data.brand);window.showToast?.('Brand defaults saved');await loadBrands();
    };
    $('bdw-add-global').onclick=()=>addRule(brand,null);
    el.querySelectorAll('[data-brand-meta]').forEach(btn=>btn.onclick=()=>addMetafieldRule(brand,null,btn.dataset.brandMeta,btn.dataset.metaType));
    el.querySelectorAll('[data-about-meta]').forEach(btn=>btn.onclick=()=>addAboutBrandRule(brand,btn.dataset.aboutMeta,btn.dataset.metaType));
    el.querySelectorAll('[data-save-matcher]').forEach(btn=>btn.onclick=()=>saveMatcher(brand,Number(btn.dataset.saveMatcher)));
    el.querySelectorAll('[data-add-line-rule]').forEach(btn=>btn.onclick=()=>addRule(brand,Number(btn.dataset.addLineRule)));
    el.querySelectorAll('[data-line-meta]').forEach(btn=>btn.onclick=()=>addMetafieldRule(brand,Number(btn.dataset.lineMeta),btn.dataset.metaId,btn.dataset.metaType));
  }

  function promptAction(){
    const type=prompt('Action: set_field, set_metafield, add_tag, add_collection','set_metafield');if(!type)return null;
    let target='';
    if(type==='set_field')target=prompt('Field: productType, vendor, themeTemplate, seo.title, seo.description','productType')||'';
    if(type==='set_metafield')target=prompt('Metafield namespace.key','')||'';
    const value=prompt('Value to apply','');if(value===null)return null;
    return {type,target,value,overwrite:false};
  }
  async function addRule(brand,lineIndex){
    const name=prompt('Rule name',lineIndex==null?'Brand default':'Product-line default');if(!name)return;
    const action=promptAction();if(!action)return;
    if(lineIndex==null){
      const alwaysApply=[...(brand.alwaysApply||[]),{name,enabled:true,actions:[action]}];
      const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({alwaysApply})});Object.assign(brand,data.brand);
    }else{
      const lines=structuredClone(brand.coreProductLines||[]);lines[lineIndex].rules=[...(lines[lineIndex].rules||[]),{name,enabled:true,actions:[action]}];
      const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({coreProductLines:lines})});Object.assign(brand,data.brand);
    }
    openBrand(brand);await loadBrands();
  }
  async function addMetafieldRule(brand,lineIndex,id,type){
    const value=prompt(`Value for ${id}`,'');if(value===null)return;
    const action={type:'set_metafield',target:id,value,metafieldType:type||'single_line_text_field',overwrite:false};
    if(lineIndex==null){
      const alwaysApply=[...(brand.alwaysApply||[]),{name:`Set ${id}`,enabled:true,actions:[action]}];
      const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({alwaysApply})});Object.assign(brand,data.brand);
    }else{
      const lines=structuredClone(brand.coreProductLines||[]);lines[lineIndex].rules=[...(lines[lineIndex].rules||[]),{name:`Set ${id}`,enabled:true,actions:[action]}];
      const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({coreProductLines:lines})});Object.assign(brand,data.brand);
    }
    openBrand(brand);await loadBrands();
  }
  async function addAboutBrandRule(brand,id,type){
    if(!brand.aboutBrand)return alert('Add About Brand text first.');
    const action={type:'set_metafield',target:id,value:brand.aboutBrand,metafieldType:type||'multi_line_text_field',overwrite:false};
    const alwaysApply=[...(brand.alwaysApply||[]).filter(r=>!(r.actions||[]).some(a=>a.target===id)),{name:'Apply About Brand',enabled:true,actions:[action]}];
    const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({alwaysApply})});Object.assign(brand,data.brand);openBrand(brand);await loadBrands();
  }
  async function saveMatcher(brand,index){
    const lines=structuredClone(brand.coreProductLines||[]);
    lines[index].matcher={field:document.querySelector(`[data-line-field="${index}"]`).value,operator:document.querySelector(`[data-line-op="${index}"]`).value,value:document.querySelector(`[data-line-value="${index}"]`).value};
    const data=await ruleApi(`/${brand._id}`,{method:'PUT',body:JSON.stringify({coreProductLines:lines})});Object.assign(brand,data.brand);window.showToast?.('Product-line recognition saved');
  }

  function wire(){
    const refresh=$('ca-refresh-brands');if(refresh&&!refresh.dataset.bdw){refresh.dataset.bdw='1';refresh.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();loadBrands()},true)}
    const scrape=$('ca-scrape-brand');if(scrape&&!scrape.dataset.bdw){scrape.dataset.bdw='1';scrape.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();startScrape()},true)}
    const back=$('ca-generate-brands');if(back&&!back.dataset.bdw){back.dataset.bdw='1';back.textContent='Backfill / enrich brands from Gaming Nectar';back.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();backfill()},true)}
    const tab=$('pci-tab-brand-directory');if(tab&&!tab.dataset.bdw){tab.dataset.bdw='1';tab.addEventListener('click',()=>setTimeout(loadBrands,50))}
  }

  const style=document.createElement('style');style.textContent=`
    .bdw-card{width:100%;display:grid;grid-template-columns:240px minmax(280px,1fr) minmax(220px,.8fr) auto;gap:16px;align-items:start;text-align:left;border:0;border-top:1px solid #edf0f4;background:#fff;padding:16px 4px;cursor:pointer;color:inherit}.bdw-card:hover{background:#fafbfc}.bdw-card strong{display:block;font-size:16px}.bdw-card small{display:block;color:#667085;margin-top:3px}.bdw-card-copy{color:#596579;line-height:1.45}.bdw-lines span,.bdw-examples span{display:inline-block;background:#eef2f6;border-radius:999px;padding:4px 8px;margin:2px;font-size:11px}.bdw-status{background:#fff5d9;color:#8a6500;border-radius:999px;padding:5px 8px;font-size:11px}.bdw-error{background:#fff0ee;color:#8a241a;border-radius:10px;padding:12px}
    .bdw-backdrop{position:fixed;inset:0;background:rgba(15,29,50,.45);z-index:100010;display:flex;align-items:center;justify-content:center;padding:18px}.bdw-modal{width:min(1180px,97vw);max-height:92vh;background:#f7f9fb;border-radius:22px;overflow:hidden;display:flex;flex-direction:column}.bdw-head{background:#fff;padding:20px 22px;border-bottom:1px solid #e5e9ef;display:flex;justify-content:space-between}.bdw-head h2{margin:0}.bdw-head p{margin:4px 0 0;color:#667085}.bdw-head button{border:0;background:none;font-size:30px;cursor:pointer}.bdw-tabs{display:flex;gap:6px;overflow:auto;background:#fff;padding:10px 22px;border-bottom:1px solid #e5e9ef}.bdw-tabs button{border:1px solid #dfe4ea;background:#fff;border-radius:999px;padding:8px 11px;font-weight:800;white-space:nowrap;cursor:pointer}.bdw-tabs button.active{background:#0f1d32;color:#fff;border-color:#0f1d32}.bdw-body{padding:18px;overflow:auto}.bdw-pane{display:none}.bdw-pane.active{display:block}.bdw-section{background:#fff;border:1px solid #e0e5eb;border-radius:15px;padding:16px;margin-bottom:14px}.bdw-section h3{margin:0 0 6px}.bdw-section label{display:block;font-size:12px;font-weight:800;color:#526071;margin:10px 0}.bdw-section input,.bdw-section select,.bdw-section textarea{width:100%;box-sizing:border-box;border:1px solid #ccd4df;border-radius:9px;padding:9px;font:inherit;background:#fff}.bdw-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.bdw-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.bdw-section-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.bdw-section-head button,.bdw-meta button,.bdw-callout button{border:1px solid #d6dce5;background:#fff;border-radius:9px;padding:7px 9px;font-weight:800;cursor:pointer}.bdw-meta{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid #edf0f4}.bdw-meta small{display:block;color:#7a8493;margin-top:3px}.bdw-callout{background:#effaf4;border:1px solid #bfe8d0;border-radius:11px;padding:11px;margin-top:12px;display:grid;gap:7px}.bdw-rule{display:flex;justify-content:space-between;gap:10px;border:1px solid #e5e9ef;border-radius:10px;padding:10px;margin-top:7px}.bdw-rule small{display:block;color:#667085;margin-top:3px}.bdw-rule button{border:0;background:#fff0ee;color:#a72b20;border-radius:8px;padding:5px 7px}.bdw-source a{display:block;font-size:11px;color:#2463b5;overflow:hidden;text-overflow:ellipsis}.bdw-count{font-size:11px;background:#eef2f6;border-radius:999px;padding:5px 8px}.bdw-foot{background:#fff;border-top:1px solid #e5e9ef;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;color:#667085}.bdw-foot>div{display:flex;gap:8px}
    .bdw-progress{width:min(650px,96vw);background:#fff;border-radius:20px;overflow:hidden}.bdw-progress-head{padding:20px;display:flex;justify-content:space-between}.bdw-progress-head h3{margin:0}.bdw-progress-head p{margin:5px 0;color:#667085}.bdw-spinner{width:38px;height:38px;border:4px solid #e8edf3;border-top-color:#6d4aff;border-radius:50%;animation:bdw-spin .8s linear infinite}.bdw-spinner.done{animation:none;border-color:#dff5e8;border-top-color:#167642}.bdw-track{height:6px;background:#edf1f5;margin:0 20px}.bdw-track i{display:block;height:100%;background:#6d4aff;width:0;transition:.3s}.bdw-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 20px}.bdw-stats div{background:#f7f9fb;border-radius:9px;padding:8px}.bdw-stats small{display:block;color:#7a8493}.bdw-feed{padding:0 20px 15px;max-height:300px;overflow:auto}.bdw-feed-row{display:grid;grid-template-columns:26px 1fr;gap:8px;padding:9px 0;border-top:1px solid #eef1f4}.bdw-feed-row small{display:block;color:#7a8493}.bdw-progress-foot{padding:12px 20px;border-top:1px solid #e5e9ef;text-align:right}@keyframes bdw-spin{to{transform:rotate(360deg)}}@media(max-width:850px){.bdw-card{grid-template-columns:1fr}.bdw-grid2,.bdw-grid3{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(wire,500));window.addEventListener('load',()=>setTimeout(wire,700));setInterval(wire,1200);
  window.Elev8BrandDirectoryWorkspace={loadBrands,openBrand,startScrape,backfill};
})();