(function(){
  if(window.__ELEV8_SETTINGS_CENTER__)return;
  window.__ELEV8_SETTINGS_CENTER__=true;

  const state={status:null,legacyHtml:'',installed:false};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  async function api(path){
    if(window.adminFetch)return window.adminFetch(`/admin/settings-center${path}`);
    const r=await fetch(`/api/admin/settings-center${path}`,{credentials:'include'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Request failed');
    return j;
  }

  function statusPill(item){
    const warning=(item.limitations||[]).length>0;
    const cls=item.status==='soon'?'soon':warning?'warning':'ok';
    const text=item.status==='soon'?'Coming soon':warning?`${item.limitations.length} limitation${item.limitations.length===1?'':'s'}`:'Ready';
    return `<span class="gsc-pill ${cls}">${esc(text)}</span>`;
  }

  function renderOverview(){
    const s=state.status?.summary||{};
    const products=state.status?.products||[];
    const issues=products.flatMap(p=>(p.limitations||[]).map(x=>({product:p.label,text:x,view:p.settingsView||p.view})));

    $('gsc-overview').innerHTML=`
      <div class="gsc-summary">
        <div><span>Integrations configured</span><strong>${s.integrationsConfigured||0}/${s.integrationsTotal||0}</strong></div>
        <div><span>Product lines healthy</span><strong>${s.productsHealthy||0}/${s.productsTotal||0}</strong></div>
        <div><span>Limitations detected</span><strong class="${s.limitationCount?'warn':''}">${s.limitationCount||0}</strong></div>
      </div>
      <div class="gsc-section">
        <div class="gsc-section-head"><div><h3>Product health</h3><p>One place to see what is configured, limited or still in beta.</p></div></div>
        <div class="gsc-product-grid">
          ${products.map(p=>`<article class="gsc-product-card">
            <div class="gsc-product-top"><div><h4>${esc(p.label)}</h4><span class="gsc-status-label">${esc(p.status||'')}</span></div>${statusPill(p)}</div>
            ${(p.limitations||[]).length
              ? `<div class="gsc-limitations">${p.limitations.map(x=>`<span>! ${esc(x)}</span>`).join('')}</div>`
              : `<div class="gsc-ready">✓ No configuration limitation detected</div>`}
            <div class="gsc-product-actions">
              <button type="button" class="secondary-btn" data-gsc-open="${esc(p.view||'')}">Open product</button>
              <button type="button" class="secondary-btn" data-gsc-settings="${esc(p.settingsView||p.view||'')}" data-gsc-product="${esc(p.id)}">Settings</button>
            </div>
          </article>`).join('')}
        </div>
      </div>
      <div class="gsc-section">
        <div class="gsc-section-head"><div><h3>Needs attention</h3><p>Configuration issues ELEV8 can detect from the current environment and declared Shopify scopes.</p></div></div>
        ${issues.length?`<div class="gsc-issue-list">${issues.map(x=>`<button type="button" data-gsc-open="${esc(x.view||'')}"><strong>${esc(x.product)}</strong><span>${esc(x.text)}</span><b>→</b></button>`).join('')}</div>`:'<div class="gsc-all-good">✓ No current product limitations detected.</div>'}
      </div>`;
    bindActions($('gsc-overview'));
  }

  function renderConnections(){
    const items=state.status?.integrations||[];
    $('gsc-connections').innerHTML=`
      <div class="gsc-section">
        <div class="gsc-section-head"><div><h3>Connections & services</h3><p>Shared infrastructure used across ELEV8 product lines.</p></div><button type="button" class="secondary-btn" id="gsc-refresh-connections">Refresh</button></div>
        <div class="gsc-connection-grid">
          ${items.map(i=>`<article class="gsc-connection-card">
            <div class="gsc-connection-head"><h4>${esc(i.label)}</h4><span class="gsc-dot ${i.ok?'ok':'warning'}"></span></div>
            <div class="gsc-config-lines">${(i.configured||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
            ${(i.limitations||[]).length?`<div class="gsc-limitations">${i.limitations.map(x=>`<span>! ${esc(x)}</span>`).join('')}</div>`:'<div class="gsc-ready">✓ Connected / configured</div>'}
          </article>`).join('')}
        </div>
      </div>`;
    $('gsc-refresh-connections').onclick=refresh;
  }

  function renderProducts(){
    const products=state.status?.products||[];
    $('gsc-products').innerHTML=`
      <div class="gsc-section">
        <div class="gsc-section-head"><div><h3>Product settings</h3><p>Settings stay with the relevant product, while this page tells you where everything lives and flags anything blocking the feature.</p></div></div>
        <div class="gsc-settings-list">
          ${products.map(p=>`<div class="gsc-settings-row">
            <div><strong>${esc(p.label)}</strong><span>${esc(p.status||'')}</span></div>
            <div>${(p.limitations||[]).length?p.limitations.map(x=>`<span class="gsc-mini-warning">${esc(x)}</span>`).join(''):'<span class="gsc-mini-ready">Ready</span>'}</div>
            <button type="button" class="secondary-btn" data-gsc-settings="${esc(p.settingsView||p.view||'')}" data-gsc-product="${esc(p.id)}">Open settings</button>
          </div>`).join('')}
        </div>
      </div>`;
    bindActions($('gsc-products'));
  }

  function bindActions(root){
    root?.querySelectorAll('[data-gsc-open]').forEach(btn=>btn.onclick=()=>openView(btn.dataset.gscOpen));
    root?.querySelectorAll('[data-gsc-settings]').forEach(btn=>btn.onclick=()=>{
      const product=btn.dataset.gscProduct;
      const view=btn.dataset.gscSettings;
      if(product==='reviews'){switchPane('reviews');return}
      openView(view);
      if(product==='loyalty')setTimeout(()=>document.querySelector('[data-loyalty-tab="settings"]')?.click(),80);
    });
  }

  function openView(id){
    if(!id)return;
    if(typeof window.tab==='function')window.tab(id);
  }

  function switchPane(name){
    document.querySelectorAll('#v-settings [data-gsc-tab]').forEach(x=>x.classList.toggle('active',x.dataset.gscTab===name));
    document.querySelectorAll('#v-settings [data-gsc-pane]').forEach(x=>x.classList.toggle('active',x.dataset.gscPane===name));
    if(name==='reviews'){
      setTimeout(()=>{
        window.loadSettings?.();
        window.loadRenderNames?.();
        window.loadAttributes?.();
      },20);
    }
  }

  function renderShell(){
    const view=$('v-settings');
    if(!view)return;
    if(!state.legacyHtml)state.legacyHtml=view.innerHTML;

    view.innerHTML=`<div class="gsc-page">
      <div class="gsc-head">
        <div><p class="gsc-eyebrow">ELEV8 platform</p><h2>Settings & Health</h2><p>Shared connections, product settings, limitations and platform configuration in one place.</p></div>
        <button type="button" class="secondary-btn" id="gsc-refresh">Refresh health</button>
      </div>
      <div class="gsc-tabs">
        <button type="button" class="active" data-gsc-tab="overview">Overview</button>
        <button type="button" data-gsc-tab="connections">Connections</button>
        <button type="button" data-gsc-tab="products">Product settings</button>
        <button type="button" data-gsc-tab="reviews">Reviews settings</button>
      </div>
      <section class="gsc-pane active" data-gsc-pane="overview" id="gsc-overview"><div class="gsc-loading">Checking ELEV8 configuration…</div></section>
      <section class="gsc-pane" data-gsc-pane="connections" id="gsc-connections"></section>
      <section class="gsc-pane" data-gsc-pane="products" id="gsc-products"></section>
      <section class="gsc-pane gsc-legacy" data-gsc-pane="reviews">${state.legacyHtml}</section>
    </div>`;

    view.querySelectorAll('[data-gsc-tab]').forEach(btn=>btn.onclick=()=>switchPane(btn.dataset.gscTab));
    $('gsc-refresh').onclick=refresh;
  }

  async function refresh(){
    const refreshBtn=$('gsc-refresh');
    if(refreshBtn){refreshBtn.disabled=true;refreshBtn.textContent='Refreshing…'}
    try{
      state.status=await api('/status');
      renderOverview();renderConnections();renderProducts();
    }catch(e){
      $('gsc-overview').innerHTML=`<div class="gsc-error"><strong>Could not load Settings & Health</strong><span>${esc(e.message||'Request failed')}</span></div>`;
    }finally{
      if(refreshBtn){refreshBtn.disabled=false;refreshBtn.textContent='Refresh health'}
    }
  }

  async function load(){
    const view=$('v-settings');if(!view)return;
    if(!state.installed){renderShell();state.installed=true}
    if(!state.status)await refresh();
  }

  window.Elev8SettingsCenter={load,refresh,switchPane};

  function install(){
    const view=$('v-settings');if(!view)return;
    renderShell();state.installed=true;
    const previous=window.tab;
    if(typeof previous==='function'&&!previous.__gscWrapped){
      const wrapped=function(id){
        const result=previous.apply(this,arguments);
        if(id==='v-settings')setTimeout(load,0);
        return result;
      };
      wrapped.__gscWrapped=true;
      window.tab=wrapped;
    }
    if(view.classList.contains('active'))load();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,120));
  else setTimeout(install,120);
})();