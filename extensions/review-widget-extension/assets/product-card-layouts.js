(() => {
  'use strict';
  const root=document.querySelector('[data-elev8-product-card-layouts-root]');
  if(!root) return;

  const api=String(root.dataset.apiBase||'https://nectar-reviews-api.onrender.com/api').replace(/\/$/,'');
  const shop=root.dataset.shopDomain||window.Shopify?.shop||window.location.hostname;
  const CARD='.card-wrapper.product-card-wrapper,.custom-card-wrapper,.product-card-wrapper';
  const LAYOUTS=new Set(['standard','editorial','brand_first','compact','commerce']);
  const productCache=new Map();
  let configPromise=null,scheduled=false;

  function sectionId(card){
    const section=card.closest('[id^="shopify-section-"]');
    return section?String(section.id).replace(/^shopify-section-/,''):'';
  }
  function layoutFor(styles,card){
    const fallback=LAYOUTS.has(styles?.cardLayoutDefault)?styles.cardLayoutDefault:'standard';
    const id=sectionId(card);
    const overrides=Array.isArray(styles?.featuredCollectionLayouts)?styles.featuredCollectionLayouts:[];
    const match=overrides.find((item)=>{
      const key=String(item?.sectionId||'').replace(/^shopify-section-/,'').trim();
      return key&&(id===key||id.endsWith(key));
    });
    return match&&LAYOUTS.has(match.layout)?match.layout:fallback;
  }
  function handleFor(card){
    const link=card.querySelector('a[href*="/products/"]');
    if(!link) return '';
    const m=String(link.getAttribute('href')||'').match(/\/products\/([^/?#]+)/);
    return m?decodeURIComponent(m[1]):'';
  }
  async function productId(card){
    const direct=card.dataset.elev8ProductId||card.dataset.productId||
      card.querySelector('[data-elev8-product-id]')?.dataset.elev8ProductId||
      card.querySelector('[data-product-id]')?.dataset.productId;
    if(direct) return String(direct).replace(/\D/g,'')||String(direct);
    const handle=handleFor(card);
    if(!handle) return '';
    if(productCache.has(handle)) return await productCache.get(handle);
    const promise=fetch('/products/'+encodeURIComponent(handle)+'.js',{credentials:'same-origin'})
      .then((r)=>r.ok?r.json():null).then((x)=>x?.id?String(x.id):'').catch(()=>'');
    productCache.set(handle,promise);
    const id=await promise;
    productCache.set(handle,id);
    return id;
  }
  function title(card){return card.querySelector('.custom-modern-title,.card__heading,[class*="product"][class*="title"],h3,h4');}
  function body(card){return card.querySelector('.custom-modern-card-body,.card__information,.card-information')||title(card)?.parentElement||card;}
  function price(card){return card.querySelector('.custom-modern-price,.price,.price-item,[class*="price"]');}
  function rating(card){
    let el=card.querySelector('.elev8-card-rating');
    if(el) return el;
    el=document.createElement('span');
    el.className='elev8-card-rating';
    return el;
  }
  function unrow(card){
    const row=card.querySelector('.elev8-card-title-row');
    if(!row) return;
    const t=row.querySelector('.custom-modern-title,.card__heading,[class*="product"][class*="title"],h3,h4');
    if(t) row.parentNode.insertBefore(t,row);
    row.remove();
  }
  function placeRating(card,layout,summary,styles){
    unrow(card);
    const el=rating(card),count=Number(summary?.count||0),avg=Number(summary?.average||0);
    if(!count){el.remove();return;}
    el.innerHTML='<span class="elev8-card-rating__star">★</span><strong>'+avg.toFixed(1)+'</strong>'+
      (styles?.showCount!==false?'<span>('+count+')</span>':'');
    el.setAttribute('aria-label',avg.toFixed(1)+' out of 5 from '+count+' reviews');
    const t=title(card),b=body(card),p=price(card);
    if(['editorial','commerce','compact'].includes(layout)&&t?.parentNode){
      const row=document.createElement('div');
      row.className='elev8-card-title-row';
      t.parentNode.insertBefore(row,t); row.appendChild(t); row.appendChild(el); return;
    }
    if(layout==='brand_first'){
      if(p?.parentNode) p.parentNode.insertBefore(el,p); else b.appendChild(el);
      return;
    }
    if(t) t.insertAdjacentElement('afterend',el); else b.appendChild(el);
  }
  function apply(card,layout,summary,styles){
    ['standard','editorial','brand_first','compact','commerce'].forEach((x)=>card.classList.remove('elev8-card-layout--'+x));
    card.classList.add('elev8-card-layout--'+layout);
    card.dataset.elev8CardLayout=layout;
    card.dataset.elev8SectionId=sectionId(card);
    placeRating(card,layout,summary,styles);
  }
  function getConfig(){
    if(!configPromise) configPromise=fetch(api+'/widget/config?shopDomain='+encodeURIComponent(shop)+'&t='+Date.now(),{cache:'no-store'})
      .then((r)=>r.ok?r.json():{}).catch(()=>({}));
    return configPromise;
  }
  async function render(){
    scheduled=false;
    const cards=Array.from(new Set(document.querySelectorAll(CARD)));
    if(!cards.length) return;
    const cfg=await getConfig(),styles=cfg?.cardStyles||{};
    const ids=await Promise.all(cards.map(productId));
    const unique=Array.from(new Set(ids.filter(Boolean))).slice(0,50);
    let summaries={};
    if(unique.length){
      summaries=await fetch(api+'/reviews/card-summaries?shopDomain='+encodeURIComponent(shop)+'&productIds='+encodeURIComponent(unique.join(',')),{cache:'no-store'})
        .then((r)=>r.ok?r.json():{summaries:{}}).then((x)=>x?.summaries||{}).catch(()=>({}));
    }
    cards.forEach((card,i)=>{
      const id=String(ids[i]||'').replace(/\D/g,'')||String(ids[i]||'');
      apply(card,layoutFor(styles,card),summaries[id]||{count:0,average:0},styles);
    });
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(render);}
  schedule();
  new MutationObserver((m)=>{if(m.some((x)=>x.addedNodes?.length))schedule();}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('shopify:section:load',schedule);
  document.addEventListener('shopify:section:reorder',schedule);
})();
