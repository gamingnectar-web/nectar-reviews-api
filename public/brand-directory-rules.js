(function Elev8BrandRulesUI(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function api(path,options={}){if(window.adminFetch)return window.adminFetch(`/admin/brand-rules${path}`,options);throw new Error('Admin session unavailable')}

  function info(label,value){
    if(value===undefined||value===null||value===''||(Array.isArray(value)&&!value.length))return '';
    const body=Array.isArray(value)?value.map(x=>`<span class="br-chip">${esc(typeof x==='string'?x:(x.name||JSON.stringify(x)))}</span>`).join(''):esc(value);
    return `<div class="br-info"><span>${esc(label)}</span><div>${body}</div></div>`;
  }
  function action(a={}){
    if(a.type==='set_metafield')return `Set metafield ${a.target} = ${a.value}`;
    if(a.type==='set_field')return `Set ${a.target} = ${a.value}`;
    if(a.type==='add_tag')return `Add tag "${a.value}"`;
    if(a.type==='add_collection')return `Add collection "${a.value}"`;
    return 'Action';
  }
  function rule(r,conditional){
    return `<div class="br-rule"><div><strong>${esc(r.name||'Rule')}</strong>
      <div class="br-when">${conditional?`IF <b>${esc(r.when?.field||'title')}</b> ${esc((r.when?.operator||'contains').replace('_',' '))} <b>${esc(r.when?.value||'')}</b>`:'ALL products in this brand'}</div>
      <div>${(r.actions||[]).map(a=>`<span class="br-action">${esc(action(a))}</span>`).join('')}</div></div>
      <span class="br-state">${r.enabled===false?'Off':'On'}</span></div>`;
  }
  function open(brand){
    $('br-modal')?.remove();
    const el=document.createElement('div');el.id='br-modal';el.className='br-backdrop';
    el.innerHTML=`<div class="br-modal"><div class="br-head"><div><h2>${esc(brand.name)}</h2><p>Review what ELEV8 knows, then define easy defaults for future imports.</p></div><button id="br-x">×</button></div>
    <div class="br-body">
      <section><h3>What ELEV8 knows</h3>
        ${info('About Brand',brand.aboutBrand)}${info('SEO title',brand.seoTitle)}${info('SEO description',brand.seoDescription)}
        ${info('Claims',brand.claims)}${info('Product families',brand.productFamilies)}${info('How to use',brand.howToUse)}
        ${info('Storage',brand.storage)}${info('Warnings',brand.warnings)}${info('Sources',brand.sourceUrls)}
        ${info('Confidence',`${Math.round(Number(brand.confidence||0)*100)}% · ${brand.source||'unknown source'}`)}
      </section>
      <section><div class="br-section-head"><div><h3>Always apply</h3><p>Applied to every ${esc(brand.name)} product.</p></div><button class="ca-btn" id="br-add-always">+ Add rule</button></div>
        <div>${(brand.alwaysApply||[]).map(r=>rule(r,false)).join('')||'<p class="ca-muted">No universal rules yet.</p>'}</div>
      </section>
      <section><div class="br-section-head"><div><h3>Conditional rules</h3><p>Simple “if this, then that” rules.</p></div><button class="ca-btn" id="br-add-condition">+ Add condition</button></div>
        <div>${(brand.conditionalRules||[]).map(r=>rule(r,true)).join('')||'<p class="ca-muted">No conditional rules yet.</p>'}</div>
      </section>
    </div><div class="br-foot"><button class="ca-btn" id="br-close">Close</button></div></div>`;
    document.body.appendChild(el);
    $('br-x').onclick=$('br-close').onclick=()=>el.remove();
    $('br-add-always').onclick=()=>createRule(brand,false);
    $('br-add-condition').onclick=()=>createRule(brand,true);
  }
  async function createRule(brand,conditional){
    const name=prompt('Rule name',conditional?'Hydration products':'Brand defaults');if(!name)return;
    let when;
    if(conditional){
      const field=prompt('IF field: title, productType, tags, description, sourceUrl, metafield:namespace.key','title')||'title';
      const operator=prompt('Condition: contains, equals, starts_with, ends_with, exists','contains')||'contains';
      const value=operator==='exists'?'':(prompt('Value to match','')||'');
      when={field,operator,value};
    }
    const type=prompt('Action: set_field, set_metafield, add_tag, add_collection','set_metafield')||'set_metafield';
    let target='';
    if(type==='set_field')target=prompt('Field: productType, vendor, themeTemplate, seo.title, seo.description','productType')||'productType';
    if(type==='set_metafield')target=prompt('Metafield namespace.key','core.formula_version')||'';
    const value=prompt('Value to apply','')||'';
    const r={name,enabled:true,...(conditional?{when}:{}),actions:[{type,target,value,overwrite:false}]};
    const patch=conditional?{conditionalRules:[...(brand.conditionalRules||[]),r]}:{alwaysApply:[...(brand.alwaysApply||[]),r]};
    const data=await api(`/${brand._id}`,{method:'PUT',body:JSON.stringify(patch)});
    open(data.brand);window.Elev8BrandDirectoryV3?.load?.();
  }
  function wire(){
    document.querySelectorAll('#ca-brand-list .ca-brand').forEach((card,index)=>{
      if(card.dataset.rulesWired)return;card.dataset.rulesWired='1';card.style.cursor='pointer';card.title='Click to review brand information and rules';
      card.addEventListener('click',async()=>{const list=await window.Elev8BrandDirectoryV3?.api?.('/brands');const brand=list?.brands?.[index];if(brand)open(brand)});
    });
  }
  const s=document.createElement('style');s.textContent=`
    .br-backdrop{position:fixed;inset:0;background:rgba(15,29,50,.42);z-index:100001;display:flex;align-items:center;justify-content:center;padding:18px}
    .br-modal{width:min(900px,96vw);max-height:90vh;background:#fff;border-radius:20px;overflow:hidden;display:flex;flex-direction:column}
    .br-head,.br-foot{padding:18px 22px;border-bottom:1px solid #edf0f4;display:flex;justify-content:space-between;gap:12px}.br-foot{border-top:1px solid #edf0f4;border-bottom:0;justify-content:flex-end}
    .br-head h2{margin:0}.br-head p{margin:5px 0 0;color:#667085}.br-head button{border:0;background:none;font-size:28px;cursor:pointer}.br-body{padding:4px 22px 22px;overflow:auto}.br-body section{padding:18px 0;border-bottom:1px solid #edf0f4}
    .br-info{display:grid;grid-template-columns:150px 1fr;gap:14px;padding:8px 0}.br-info>span{font-weight:800;color:#667085}.br-chip,.br-action{display:inline-block;background:#eef2f6;border-radius:999px;padding:4px 8px;margin:2px;font-size:12px}
    .br-section-head{display:flex;justify-content:space-between;gap:12px}.br-section-head p{margin:4px 0;color:#667085}.br-rule{display:grid;grid-template-columns:1fr auto;gap:12px;border:1px solid #e4e8ee;border-radius:12px;padding:12px;margin-top:9px}.br-when{font-size:12px;color:#667085;margin:4px 0}.br-state{font-size:11px;font-weight:800;background:#e9f8ef;color:#167642;border-radius:999px;padding:4px 7px;height:max-content}`;
  document.head.appendChild(s);setInterval(wire,1200);
})();