(function(){
  const PRODUCTS = {
    reviews: { label:'Reviews', switchLabel:'review-widget', defaultView:'v-dash', manage:[
      ['Dashboard','v-dash','Review performance and status.'],['Reviews','v-mgr','Moderation, approval and trash.'],['Messaging & Campaigns','v-msg','Review requests and analytics.'],['Reviews Visual Customiser','v-style','Review widget/card/carousel styles.'],['Import CSV','v-import','Bring reviews from another platform.']
    ], products:['loyalty','discounts','cart-rewards','referrals'] },
    loyalty: { label:'Loyalty', switchLabel:'Loyalty', defaultView:'v-loyalty', manage:[
      ['Loyalty','v-loyalty','Overview and programme status.','overview'],['Messaging & Campaigns','v-loyalty','Reward email builder.','email'],['Userboard','v-loyalty','Find customers and adjust points.','members'],['Points Rules','v-loyalty','Purchases, reviews and bonuses.','rules'],['Tiers','v-loyalty','Bronze/Silver/Gold style logic.','tiers'],['Rewards','v-loyalty','Discount and product rewards.','rewards'],['Checkout Beta','v-loyalty','Logged-in checkout redemption.','checkout'],['Loyalty Settings','v-loyalty','Currency name, icon and privacy.','settings']
    ], products:['reviews','discounts','cart-rewards','referrals'] },
    discounts: { label:'Discounts', switchLabel:'Discounts', defaultView:'v-discounts', manage:[
      ['Discount Templates','v-discounts','Reusable reward code types.','templates'],['How Codes Work','v-discounts','Generation, Shopify codes and tracking.','help'],['Issued Codes','v-discounts','Draft/native codes and recipients.','issues'],['Discount Settings','v-discounts','Shared discount engine status.','settings']
    ], products:['reviews','loyalty','cart-rewards','referrals'] },
    'cart-rewards': { label:'Cart Rewards', switchLabel:'Cart Rewards', defaultView:'v-cart-rewards', manage:[
      ['Cart Rewards','v-cart-rewards','Campaigns, tiers and cart widget.'],['Campaign Calendar','v-cart-rewards','Plan reward windows.'],['Analytics','v-cart-rewards','Reward claims and conversions.']
    ], products:['reviews','loyalty','discounts','referrals'] },
    referrals: { label:'Referrals', switchLabel:'Referrals', defaultView:'v-referrals', manage:[['Referrals','v-referrals','Reserved referral product area.']], products:['reviews','loyalty','discounts','cart-rewards'] }
  };
  let activeProduct = 'reviews';
  let activeManage = 'v-dash';
  function esc(s){return String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function groups(){return Array.from(document.querySelectorAll('.sidebar .nav-group'));}
  function productForView(view){ if(view==='v-loyalty') return 'loyalty'; if(view==='v-discounts') return 'discounts'; if(view==='v-referrals') return 'referrals'; if(view==='v-cart-rewards') return 'cart-rewards'; return activeProduct==='reviews'? 'reviews': activeProduct; }
  function go(view, sub, scrollKey){
    activeManage = view;
    if(view) window.tab?.(view);
    if(sub && view==='v-loyalty') setTimeout(()=>document.querySelector(`#v-loyalty [data-loyalty-tab="${sub}"]`)?.click(),60);
    if(scrollKey){ setTimeout(()=>scrollDiscount(scrollKey),80); }
    renderNav();
  }
  function scrollDiscount(key){
    const map={templates:'#discount-template-list',help:'#discount-code-explainer',issues:'#discount-issue-list',settings:'#discount-enabled'};
    const el=document.querySelector(map[key]||key); if(el) el.closest('.panel,section,div')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function setProduct(product, opts={}){
    if(!PRODUCTS[product]) product='reviews';
    activeProduct = product;
    document.body.dataset.nectarProductContext = product;
    renderNav();
    const modId = product === 'reviews' ? 'reviews' : product;
    if(window.NectarModuleShell && window.NectarModuleShell.activeModule !== modId && !opts.fromShell){
      window.NectarModuleShell.setActiveModule(modId).catch(()=>{});
    }
    if(!opts.noTab){
      const def = PRODUCTS[product].defaultView;
      if(product==='cart-rewards' && !document.getElementById('v-cart-rewards')) return;
      go(def, product==='loyalty' ? 'overview' : null);
    }
  }
  function btnHtml(item){
    const [label, view, help, sub] = item;
    const on = view===activeManage || (activeProduct==='loyalty' && view==='v-loyalty' && document.querySelector(`#v-loyalty [data-loyalty-tab="${sub}"]`)?.classList.contains('active'));
    const scroll = activeProduct==='discounts' ? (sub||'') : '';
    return `<button class="tab-btn ${on?'active':''}" type="button" data-ncr-manage="${esc(view)}" data-ncr-sub="${esc(sub||'')}" data-ncr-scroll="${esc(scroll)}"><span>${esc(label)}${help?`<small>${esc(help)}</small>`:''}</span></button>`;
  }
  function productBtnHtml(id){
    const p=PRODUCTS[id]; if(!p) return '';
    return `<button class="tab-btn ${activeProduct===id?'active':''}" type="button" data-ncr-product-nav="${esc(id)}"><span>${esc(p.label)}<small>${id==='reviews'?'Review platform product area.': id==='discounts'?'Shared discount engine.': id==='loyalty'?'Points, tiers and rewards.': id==='cart-rewards'?'Cart milestone rewards.':'Coming soon.'}</small></span>${id==='referrals'?'<span class="pill">Soon</span>':''}</button>`;
  }
  function renderNav(){
    const g=groups(); if(g.length<3) return;
    const product=PRODUCTS[activeProduct]||PRODUCTS.reviews;
    g[0].innerHTML = `<p class="nav-title">Manage</p>${product.manage.map(btnHtml).join('')}`;
    g[1].innerHTML = `<p class="nav-title">Configuration</p><button class="tab-btn" type="button" data-ncr-manage="v-settings"><span>App Settings & Widget Names<small>Shared config and Shopify render snippets.</small></span></button>`;
    g[2].innerHTML = `<p class="nav-title">Products</p>${product.products.map(productBtnHtml).join('')}`;
    bindNav();
    const currentLabel = document.querySelector('[data-ncr-current-product]'); if(currentLabel) currentLabel.textContent = product.switchLabel || product.label;
  }
  function bindNav(){
    document.querySelectorAll('[data-ncr-manage]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>{ const view=btn.dataset.ncrManage; const sub=btn.dataset.ncrSub; const scroll=btn.dataset.ncrScroll; if(view==='v-settings') activeManage=view; go(view,sub,scroll); }); });
    document.querySelectorAll('[data-ncr-product-nav]').forEach(btn=>{ if(btn.dataset.bound)return; btn.dataset.bound='1'; btn.addEventListener('click',()=>setProduct(btn.dataset.ncrProductNav)); });
  }
  const oldTab = window.tab;
  window.tab = function(id){
    if(typeof oldTab==='function') oldTab.apply(this, arguments);
    const p = productForView(id);
    if(p && p!==activeProduct && ['v-loyalty','v-discounts','v-referrals'].includes(id)) activeProduct=p;
    activeManage=id;
    renderNav();
  };
  window.NectarAdminProductContext = { setProduct, renderNav, get activeProduct(){return activeProduct;} };
  window.addEventListener('nectar:module-change', (e)=>{ const m=e.detail?.module; if(PRODUCTS[m]) setProduct(m,{fromShell:true}); });
  document.addEventListener('DOMContentLoaded',()=>{ setTimeout(()=>{ renderNav(); enhanceDiscounts(); },150); });

  function enhanceDiscounts(){
    const section=document.getElementById('v-discounts'); if(!section || document.getElementById('discount-code-explainer')) return;
    const status=section.querySelector('.discount-status-grid');
    status?.insertAdjacentHTML('afterend', `<div id="discount-code-explainer" class="panel discount-card"><h3>How discount codes are generated and tracked</h3><div class="discount-help-grid"><div class="discount-help-card"><strong>1. Template decides the rule</strong><p>Choose whether the code is for a review milestone, loyalty redemption, cart reward or manual issue. For a 10th-review reward, set trigger to Review milestone and milestone count to 10.</p></div><div class="discount-help-card"><strong>2. Issue method decides where it lives</strong><p><b>Draft/reserve</b> records the code in Nectar only. <b>Native Shopify discount code</b> creates the matching code in Shopify when discount scopes are present.</p></div><div class="discount-help-card"><strong>3. Tracking sits below</strong><p>Each issued test/real code records recipient, source/order/review/customer reference, method, status, created time and used time when available.</p></div></div></div>`);
    const issuesPanel=document.getElementById('discount-issue-list')?.closest('.panel');
    issuesPanel?.insertAdjacentHTML('beforebegin', `<div class="panel discount-card" id="discount-test-issue-panel"><h3>Issue and track a test code</h3><p class="muted">Use this to check what will be generated before connecting the template to review or loyalty automation.</p><div class="discount-test-grid"><label class="loyalty-field span-2">Template<select id="discount-test-template" class="filter-select"><option value="">Use builder values</option></select></label><label class="loyalty-field">Recipient email<input id="discount-test-email" class="premium-input" placeholder="customer@example.com"></label><label class="loyalty-field">Source / order / note<input id="discount-test-source" class="premium-input" placeholder="Order 1001 / 10th review"></label><label class="loyalty-field span-2">Private tracking note<input id="discount-test-note" class="premium-input" placeholder="Why this code was issued"></label><div class="loyalty-actions no-line"><button class="primary-btn" type="button" onclick="window.issueManualDiscount?.()">Issue tracked test code</button></div></div></div>`);
  }
})();
