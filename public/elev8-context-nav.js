(function Elev8ContextNavigation(){
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();

  function exactSidebarButton(labels=[]){
    const wanted=labels.map(norm);
    return [...document.querySelectorAll('.sidebar .tab-btn')].find(btn=>{
      const text=norm(btn.textContent);
      return wanted.some(label=>text===label || text.startsWith(label+' '));
    });
  }

  function goHome(){
    document.body.classList.add('elev8-home-open');
    document.body.dataset.e8Context='home';
    applyContext();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function openModule(kind){
    const map={
      reviews:'v-mgr',
      cart:'v-cart-rewards',
      imports:'v-product-creation-import',
      discounts:'v-discounts',
      loyalty:'v-loyalty',
      marketing:'v-marketing-intelligence',
      settings:'v-settings'
    };
    const id=map[kind];
    if(!id)return;
    document.body.classList.remove('elev8-home-open');
    document.body.dataset.e8Context=kind;
    if(typeof window.tab==='function')window.tab(id);
    if(id==='v-marketing-intelligence')window.Elev8MarketingIntelligence?.load?.();
    setTimeout(applyContext,20);
  }

  function applyContext(){
    const home=document.body.classList.contains('elev8-home-open');
    document.body.classList.toggle('e8-context-home',home);
    document.body.classList.toggle('e8-context-module',!home);

    const groups=[...document.querySelectorAll('.sidebar .nav-group')];
    groups.forEach(group=>{
      const title=norm(group.querySelector('.nav-title')?.textContent);
      if(home){group.style.display='none';return}
      group.style.display=(title==='products'||title==='developers')?'none':'';
    });
  }

  function injectStyles(){
    if(document.getElementById('e8-context-nav-style'))return;
    const style=document.createElement('style');
    style.id='e8-context-nav-style';
    style.textContent=`
      body.e8-context-home .app-shell{grid-template-columns:86px minmax(0,1fr)!important}
      body.e8-context-home .sidebar{padding:24px 12px!important;overflow:hidden!important}
      body.e8-context-home .sidebar .brand{margin:0!important;display:flex;justify-content:center}
      body.e8-context-home .sidebar .brand h1,
      body.e8-context-home .sidebar .brand p{display:none!important}
      body.e8-context-home .sidebar .brand img{width:48px!important;height:48px!important}
      body.e8-context-home .main{padding-left:34px!important}
      body.e8-context-module .app-shell{grid-template-columns:250px minmax(0,1fr)!important}
      body.e8-context-module .sidebar{padding:26px 16px!important}
      .sidebar .brand{cursor:pointer}
      @media(max-width:760px){
        body.e8-context-home .app-shell,body.e8-context-module .app-shell{grid-template-columns:1fr!important}
        body.e8-context-home .sidebar{position:relative;height:auto;min-height:72px;border-right:0;border-bottom:1px solid var(--border)}
        body.e8-context-module .sidebar{position:relative;height:auto;max-height:42vh;border-right:0;border-bottom:1px solid var(--border)}
      }
    `;
    document.head.appendChild(style);
  }

  function wire(){
    injectStyles();
    const brand=document.querySelector('.sidebar .brand');
    if(brand&&!brand.dataset.e8HomeWired){
      brand.dataset.e8HomeWired='1';
      brand.addEventListener('click',e=>{e.preventDefault();goHome()},true);
    }

    const launch=document.getElementById('elev8-launch');
    if(launch&&!launch.dataset.e8RoutingWired){
      launch.dataset.e8RoutingWired='1';
      launch.addEventListener('click',e=>{
        const tile=e.target.closest('[data-open]');
        if(!tile)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openModule(tile.dataset.open);
      },true);
    }

    document.querySelectorAll('.sidebar .tab-btn').forEach(btn=>{
      if(btn.dataset.e8ContextWired)return;
      btn.dataset.e8ContextWired='1';
      btn.addEventListener('click',()=>{
        const text=norm(btn.textContent);
        if(text.startsWith('product creation & import'))document.body.dataset.e8Context='imports';
        else if(text.startsWith('reviews'))document.body.dataset.e8Context='reviews';
        else if(text.startsWith('cart rewards'))document.body.dataset.e8Context='cart';
        else if(text.startsWith('discounts'))document.body.dataset.e8Context='discounts';
        else if(text.startsWith('loyalty'))document.body.dataset.e8Context='loyalty';
        else if(text.startsWith('marketing intelligence'))document.body.dataset.e8Context='marketing';
        document.body.classList.remove('elev8-home-open');
        setTimeout(applyContext,20);
      });
    });

    applyContext();
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(wire,150));
  window.addEventListener('load',()=>setTimeout(wire,300));
  setInterval(wire,1200);
})();
