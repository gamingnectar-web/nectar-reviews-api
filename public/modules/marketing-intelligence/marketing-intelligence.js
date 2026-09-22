(function(){
  if(window.__ELEV8_MARKETING_INTELLIGENCE__)return;
  window.__ELEV8_MARKETING_INTELLIGENCE__=true;

  const state={data:null,selected:null,background:'',composite:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(n||0));
  const pct=n=>n==null?'—':`${Math.round(Number(n)*100)}%`;

  async function api(path,options={}){
    if(window.adminFetch)return window.adminFetch(`/admin/marketing-intelligence${path}`,options);
    const r=await fetch(`/api/admin/marketing-intelligence${path}`,{credentials:'include',headers:{'Content-Type':'application/json'},...options});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j;
  }

  function renderShell(){
    const view=$('v-marketing-intelligence');
    if(!view)return;
    view.innerHTML=`<div class="mi-page">
      <div class="mi-head">
        <div><p class="mi-eyebrow">ELEV8 growth module</p><h2>Marketing Intelligence</h2><p>Prioritise products using sales momentum, margin, reviews and stock — then turn the strongest opportunities into premium creative.</p></div>
        <button class="secondary-btn" id="mi-refresh">Refresh analysis</button>
      </div>
      <div class="mi-summary" id="mi-summary"></div>
      <div class="mi-tabs"><button class="active" data-mi-tab="insights">What should I market?</button><button data-mi-tab="creative">Creative Studio</button></div>
      <section class="mi-pane active" data-mi-pane="insights">
        <div class="mi-info" id="mi-scoring"></div>
        <div class="mi-products" id="mi-products"><div class="mi-loading">Analysing Shopify sales, stock, reviews and known product costs…</div></div>
      </section>
      <section class="mi-pane" data-mi-pane="creative">
        <div id="mi-creative-empty" class="mi-empty">Choose a product from Marketing Intelligence to start a creative.</div>
        <div id="mi-creative" hidden></div>
      </section>
    </div>`;
    $('mi-refresh').onclick=()=>load(true);
    view.querySelectorAll('[data-mi-tab]').forEach(btn=>btn.onclick=()=>{
      view.querySelectorAll('[data-mi-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      view.querySelectorAll('[data-mi-pane]').forEach(p=>p.classList.toggle('active',p.dataset.miPane===btn.dataset.miTab));
    });
  }

  function renderSummary(){
    const s=state.data?.summary||{};
    $('mi-summary').innerHTML=`
      <div><span>Products analysed</span><strong>${s.productsAnalysed||0}</strong></div>
      <div><span>Push now</span><strong>${s.pushNow||0}</strong></div>
      <div><span>Strong opportunities</span><strong>${s.strongOpportunities||0}</strong></div>
      <div><span>Hidden margin</span><strong>${s.hiddenMargin||0}</strong></div>`;
    const scoring=state.data?.scoring||{};
    $('mi-scoring').innerHTML=`<strong>How this is scored</strong><span>${esc(scoring.description||'')}</span>
      <button type="button" id="mi-score-details">View weights</button>
      <div id="mi-score-weights" hidden>${Object.entries(scoring.weights||{}).map(([k,v])=>`<span>${esc(k)} <b>${v}%</b></span>`).join('')}</div>`;
    $('mi-score-details').onclick=()=>{$('mi-score-weights').hidden=!$('mi-score-weights').hidden};
  }

  function productCard(p,index){
    const reasons=(p.reasons||[]).slice(0,3),cautions=(p.cautions||[]).slice(0,3);
    return `<article class="mi-card">
      <div class="mi-card-main">
        <div class="mi-product-img">${p.image?`<img src="${esc(p.image)}" alt="">`:'<div class="mi-no-image">No image</div>'}</div>
        <div class="mi-product-copy">
          <div class="mi-card-top"><div><span class="mi-segment ${esc((p.segment||'').toLowerCase().replace(/\s+/g,'-'))}">${esc(p.segment)}</span><h3>${esc(p.title)}</h3><small>${esc(p.vendor||'')} ${p.productType?`· ${esc(p.productType)}`:''}</small></div><div class="mi-score"><strong>${p.opportunityScore}</strong><span>opportunity</span></div></div>
          <div class="mi-metrics">
            <div><span>7d revenue</span><b>${money(p.revenue7d)}</b></div>
            <div><span>30d revenue</span><b>${money(p.revenue30d)}</b></div>
            <div><span>30d margin</span><b>${pct(p.margin30d)}</b></div>
            <div><span>7d units</span><b>${p.units7d||0}</b></div>
            <div><span>Stock</span><b>${p.inventory||0}</b></div>
            <div><span>Reviews</span><b>${p.rating?`${Number(p.rating).toFixed(1)}★ · ${p.reviews}`:'—'}</b></div>
          </div>
          <div class="mi-reasons">${reasons.map(r=>`<span class="good">✓ ${esc(r)}</span>`).join('')}${cautions.map(r=>`<span class="warn">! ${esc(r)}</span>`).join('')}</div>
          <div class="mi-angle"><b>Suggested angle</b><span>${esc(p.angle||'')}</span></div>
          <div class="mi-channels">${(p.channels||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="mi-card-actions"><button type="button" class="primary-btn" data-mi-creative="${index}" ${p.image?'':'disabled'}>Generate creative</button></div>
    </article>`;
  }

  function renderProducts(){
    const products=state.data?.products||[];
    $('mi-products').innerHTML=products.length?products.map(productCard).join(''):'<div class="mi-empty">No recent product sales were found.</div>';
    $('mi-products').querySelectorAll('[data-mi-creative]').forEach(btn=>btn.onclick=()=>selectProduct(Number(btn.dataset.miCreative)));
  }

  function switchTab(name){
    document.querySelectorAll('#v-marketing-intelligence [data-mi-tab]').forEach(x=>x.classList.toggle('active',x.dataset.miTab===name));
    document.querySelectorAll('#v-marketing-intelligence [data-mi-pane]').forEach(x=>x.classList.toggle('active',x.dataset.miPane===name));
  }

  function selectProduct(index){
    state.selected=state.data.products[index];state.background='';state.composite='';
    renderCreative();switchTab('creative');
    $('v-marketing-intelligence').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderCreative(){
    const p=state.selected;if(!p)return;
    $('mi-creative-empty').hidden=true;$('mi-creative').hidden=false;
    $('mi-creative').innerHTML=`<div class="mi-creative-grid">
      <aside class="mi-creative-controls">
        <div class="mi-selected-product">${p.image?`<img src="${esc(p.image)}" alt="">`:''}<div><span>Creating for</span><strong>${esc(p.title)}</strong><small>${esc(p.vendor||'')}</small></div></div>
        <label>Creative style<select id="mi-style"><option value="luxury-studio">Luxury studio</option><option value="flavour-led">Flavour-led premium</option><option value="gaming-premium">Premium gaming</option><option value="hydration-clean">Clean hydration</option><option value="seasonal">Seasonal campaign</option></select></label>
        <label>Format<select id="mi-size"><option value="1024x1024">Square · 1:1</option><option value="1024x1536">Portrait · 2:3</option><option value="1536x1024">Landscape · 3:2</option></select></label>
        <label>Additional art direction<textarea id="mi-brief" rows="5" placeholder="e.g. icy blue atmosphere, premium crystal surface, subtle raspberry cues, leave copy space at the top"></textarea></label>
        <div class="mi-safe-note"><strong>Product integrity</strong><span>ELEV8 generates the background only. Your real Shopify product image is layered over it so AI does not redraw the label.</span></div>
        <button class="primary-btn" id="mi-generate-bg">Generate premium background</button>
      </aside>
      <main class="mi-creative-stage">
        <div class="mi-stage-toolbar"><span id="mi-stage-status">Generate a background to begin.</span><button id="mi-download" class="secondary-btn" disabled>Download composite</button></div>
        <div class="mi-canvas-wrap" id="mi-canvas-wrap">
          <div class="mi-placeholder"><b>Creative preview</b><span>The generated scene will appear here with the real product image overlaid.</span></div>
        </div>
      </main>
    </div>`;
    $('mi-generate-bg').onclick=generate;
    $('mi-download').onclick=downloadComposite;
  }

  async function loadImage(src){
    return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Could not load image'));i.src=src});
  }

  async function generate(){
    const btn=$('mi-generate-bg'),status=$('mi-stage-status');btn.disabled=true;btn.textContent='Generating…';status.textContent='Creating high-end background…';
    try{
      const data=await api('/creative/background',{method:'POST',body:JSON.stringify({product:state.selected,style:$('mi-style').value,brief:$('mi-brief').value,size:$('mi-size').value})});
      state.background=data.background;
      await compose();
      status.textContent='Background generated · real product image overlaid';
      $('mi-download').disabled=false;
    }catch(e){status.textContent=e.message||'Generation failed';window.showToast?.(e.message||'Generation failed')}
    finally{btn.disabled=false;btn.textContent='Generate premium background'}
  }

  async function compose(){
    const wrap=$('mi-canvas-wrap'),bg=await loadImage(state.background);
    const proxied=`/api/admin/marketing-intelligence/image-proxy?url=${encodeURIComponent(state.selected.image)}`;
    const product=await loadImage(proxied);
    const canvas=document.createElement('canvas');canvas.width=bg.naturalWidth||bg.width;canvas.height=bg.naturalHeight||bg.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bg,0,0,canvas.width,canvas.height);
    const maxW=canvas.width*.54,maxH=canvas.height*.72,scale=Math.min(maxW/product.width,maxH/product.height);
    const w=product.width*scale,h=product.height*scale,x=(canvas.width-w)/2,y=canvas.height-h-canvas.height*.08;
    ctx.save();ctx.globalAlpha=.20;ctx.filter='blur(18px)';ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(canvas.width/2,y+h*.97,w*.32,h*.035,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.drawImage(product,x,y,w,h);
    state.composite=canvas.toDataURL('image/png');
    wrap.innerHTML='';canvas.className='mi-composite-canvas';wrap.appendChild(canvas);
  }

  function downloadComposite(){
    if(!state.composite)return;
    const a=document.createElement('a');a.href=state.composite;a.download=`elev8-${(state.selected?.handle||'creative').replace(/[^a-z0-9-]/gi,'-')}.png`;a.click();
  }

  async function load(){
    renderShell();
    try{state.data=await api('/insights');renderSummary();renderProducts()}
    catch(e){$('mi-products').innerHTML=`<div class="mi-empty"><strong>Could not load Marketing Intelligence</strong><span>${esc(e.message)}</span></div>`}
  }

  window.Elev8MarketingIntelligence={load:()=>load(),refresh:()=>load(true),selectProduct:index=>selectProduct(index)};

  function install(){
    const view=$('v-marketing-intelligence');if(!view)return;
    const oldTab=window.tab;
    if(typeof oldTab==='function'&&!oldTab.__miWrapped){
      const wrapped=function(id){const r=oldTab.apply(this,arguments);if(id==='v-marketing-intelligence'&&!state.data)load();return r};
      wrapped.__miWrapped=true;window.tab=wrapped;
    }
    if(view.classList.contains('active'))load();else renderShell();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100));else setTimeout(install,100);
})();