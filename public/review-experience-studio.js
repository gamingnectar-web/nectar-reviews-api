(function(){
  if(window.__ELEV8_REVIEW_EXPERIENCE_STUDIO__)return;
  window.__ELEV8_REVIEW_EXPERIENCE_STUDIO__=true;

  const $=(id)=>document.getElementById(id);
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let mode='email';

  function getVal(id,fallback=''){
    const node=$(id);
    return node ? (node.type==='checkbox' ? node.checked : node.value) : fallback;
  }

  function scrollToControl(id){
    const input=$(id);
    if(!input)return;
    const card=input.closest('.msg-card')||input;
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('res-focus-card');
    setTimeout(()=>card.classList.remove('res-focus-card'),1300);
    setTimeout(()=>input.focus?.(),350);
  }

  function openMainTab(name){
    document.querySelector(`[data-msg-tab="${name}"]`)?.click();
  }

  function renderLanding(){
    const title=getVal('msg-heading','How did we do?');
    const button=getVal('msg-main-button-text','Review Your Order');
    const products=[...document.querySelectorAll('#msg-products .msg-product')].slice(0,3).map(x=>x.querySelector('strong')?.textContent||'Product');
    const names=products.length?products:['Sample Product 1','Sample Product 2'];
    return `
      <div class="res-storefront-shell">
        <div class="res-storefront-top"><span>ELEV8 review journey</span><b>Order #1001</b></div>
        <div class="res-landing-card">
          <span class="res-kicker">Thanks for your order</span>
          <h2>${esc(title)}</h2>
          <p>Your order has arrived. Choose the items you want to review.</p>
          <div class="res-product-list">${names.map((n)=>`<div><span class="res-product-thumb"></span><strong>${esc(n)}</strong><button type="button" data-res-open-form>Review</button></div>`).join('')}</div>
          <button type="button" class="res-primary-preview" data-res-open-form>${esc(button)}</button>
          <a href="#" data-res-support>Something wrong with your order?</a>
        </div>
      </div>`;
  }

  function renderForm(){
    return `
      <div class="res-storefront-shell">
        <div class="res-storefront-top"><span>Customer review page</span><b>Sample Product</b></div>
        <div class="res-review-form-preview">
          <span class="res-kicker">Your feedback</span>
          <h2>How would you rate it?</h2>
          <div class="res-stars">★★★★★</div>
          <label>Review headline<input value="Really enjoyed this" readonly></label>
          <label>Your review<textarea readonly>Tell us what you thought about the product...</textarea></label>
          <div class="res-score-preview"><div><span>Sourness</span><b>— optional</b></div><div><span>Sweetness</span><b>— optional</b></div><div><span>Flavour</span><b>— optional</b></div></div>
          <button type="button" class="res-primary-preview">Submit review</button>
        </div>
      </div>`;
  }

  function renderSaved(){
    const name=getVal('msg-email-template-name','Reviews primary request');
    const subject=getVal('msg-subject','How was your recent order?');
    return `
      <div class="res-save-preview">
        <span class="res-kicker">Template output</span>
        <h2>${esc(name)}</h2>
        <p>This is what will be stored as your reusable review-request template.</p>
        <dl>
          <div><dt>Subject</dt><dd>${esc(subject)}</dd></div>
          <div><dt>Desktop + mobile</dt><dd>Same responsive template</dd></div>
          <div><dt>Review page</dt><dd>/pages/${esc(getVal('msg-page-handle','leave-review'))}</dd></div>
          <div><dt>Delay</dt><dd>${esc(getVal('msg-delay-days','14'))} days after confirmed delivery</dd></div>
        </dl>
        <div class="res-save-actions">
          <button type="button" class="msg-btn secondary" data-res-save-draft>Save draft template</button>
          <button type="button" class="msg-btn" data-res-save-primary>Save & make primary</button>
        </div>
      </div>`;
  }

  function setMode(next){
    mode=next;
    document.querySelectorAll('[data-res-mode]').forEach(b=>b.classList.toggle('active',b.dataset.resMode===mode));
    const previewCard=document.querySelector('#msg-pane-builder .msg-preview-card');
    if(!previewCard)return;

    const title=previewCard.querySelector('.msg-preview-head h3');
    const desc=previewCard.querySelector('.msg-preview-head p');
    const stage=previewCard.querySelector('.msg-preview-stage');
    const tools=previewCard.querySelector('.msg-preview-tools');

    if(mode==='email'){
      if(title)title.textContent='Customer email';
      if(desc)desc.textContent='Click the preview itself to jump straight to the setting you want to edit.';
      if(tools)tools.style.display='';
      stage?.querySelector('.res-alt-preview')?.remove();
      const wrap=$('msg-preview-wrap'); if(wrap)wrap.style.display='';
      attachPreviewClickEditing();
    }else{
      if(tools)tools.style.display='none';
      const wrap=$('msg-preview-wrap'); if(wrap)wrap.style.display='none';
      let box=stage?.querySelector('.res-alt-preview');
      if(!box && stage){box=document.createElement('div');box.className='res-alt-preview';stage.appendChild(box)}
      if(mode==='landing'){
        if(title)title.textContent='Landing experience';
        if(desc)desc.textContent='Preview the step customers see after opening the email.';
        if(box)box.innerHTML=renderLanding();
      }else if(mode==='form'){
        if(title)title.textContent='Review form';
        if(desc)desc.textContent='Preview the actual review interaction and optional scores.';
        if(box)box.innerHTML=renderForm();
      }else{
        if(title)title.textContent='Save template';
        if(desc)desc.textContent='Confirm what will be stored and make it the live Reviews template when ready.';
        if(box)box.innerHTML=renderSaved();
      }
      bindAltActions();
    }
  }

  function bindAltActions(){
    document.querySelectorAll('[data-res-open-form]').forEach(b=>b.onclick=()=>setMode('form'));
    document.querySelectorAll('[data-res-save-draft]').forEach(b=>b.onclick=()=> $('msg-save-email-template')?.click());
    document.querySelectorAll('[data-res-save-primary]').forEach(b=>b.onclick=()=> $('msg-save-primary-template')?.click());
    document.querySelector('[data-res-support]')?.addEventListener('click',e=>{e.preventDefault();scrollToControl('msg-page-handle')});
  }

  function inferControl(target){
    if(!target)return null;
    const text=(target.textContent||'').trim().toLowerCase();
    if(target.closest('a')||target.closest('button')){
      if(text.includes('review this item'))return 'msg-product-button-text';
      if(text.includes('review your order'))return 'msg-main-button-text';
    }
    const heading=(getVal('msg-heading','How did we do?')||'').trim().toLowerCase();
    const intro=(getVal('msg-intro','Hi')||'').replace(/\{\{[^}]+\}\}/g,'').trim().toLowerCase();
    const body=(getVal('msg-body','')||'').slice(0,24).toLowerCase();
    const signoff=(getVal('msg-signoff','')||'').slice(0,24).toLowerCase();
    if(heading && text.includes(heading))return 'msg-heading';
    if(intro && text.includes(intro))return 'msg-intro';
    if(body && text.includes(body))return 'msg-body';
    if(signoff && text.includes(signoff))return 'msg-signoff';
    if(target.closest('img'))return 'msg-logo';
    return null;
  }

  function attachPreviewClickEditing(){
    const preview=$('msg-email-preview');
    if(!preview || preview.dataset.resClickReady==='1')return;
    preview.dataset.resClickReady='1';
    preview.classList.add('res-click-edit');
    preview.addEventListener('click',(e)=>{
      const id=inferControl(e.target);
      if(!id)return;
      e.preventDefault();
      scrollToControl(id);
    },true);
  }

  function installJourneyHeader(){
    const pane=$('msg-pane-builder');
    if(!pane || pane.querySelector('.res-journey-card'))return;
    const card=document.createElement('div');
    card.className='res-journey-card';
    card.innerHTML=`
      <div class="res-journey-copy">
        <span class="res-kicker">Customer journey studio</span>
        <h3>Build the whole review experience</h3>
        <p>Move through what the customer actually sees. The existing advanced controls remain underneath when you need them.</p>
      </div>
      <div class="res-journey-switch">
        <button type="button" class="active" data-res-mode="email"><b>1</b><span>Email</span><small>What arrives</small></button>
        <button type="button" data-res-mode="landing"><b>2</b><span>Landing</span><small>After the click</small></button>
        <button type="button" data-res-mode="form"><b>3</b><span>Review form</span><small>Customer input</small></button>
        <button type="button" data-res-mode="save"><b>4</b><span>Save</span><small>Template output</small></button>
      </div>`;
    pane.insertBefore(card,pane.firstChild);
    card.querySelectorAll('[data-res-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.resMode));
  }

  function installQuickEdit(){
    const head=document.querySelector('#msg-pane-builder .msg-preview-head');
    if(!head || document.querySelector('.res-quick-edit'))return;
    const quick=document.createElement('div');
    quick.className='res-quick-edit';
    quick.innerHTML=`
      <span>Quick edit</span>
      <button type="button" data-res-target="msg-logo">Brand</button>
      <button type="button" data-res-target="msg-heading">Heading</button>
      <button type="button" data-res-target="msg-body">Copy</button>
      <button type="button" data-res-target="msg-main-button-text">CTA</button>
      <button type="button" data-res-products>Products</button>
      <button type="button" data-res-modules>Modules</button>`;
    head.insertAdjacentElement('afterend',quick);
    quick.querySelectorAll('[data-res-target]').forEach(b=>b.onclick=()=>scrollToControl(b.dataset.resTarget));
    quick.querySelector('[data-res-products]').onclick=()=>{openMainTab('modules');setTimeout(()=>document.querySelector('[data-msg-module-tab="product-layout"]')?.click(),50)};
    quick.querySelector('[data-res-modules]').onclick=()=>{openMainTab('modules');setTimeout(()=>document.querySelector('[data-msg-module-tab="content-modules"]')?.click(),50)};
  }

  function installSaveBar(){
    const pane=$('msg-pane-builder');
    if(!pane || pane.querySelector('.res-save-bar'))return;
    const bar=document.createElement('div');
    bar.className='res-save-bar';
    bar.innerHTML=`
      <div><span>Review experience</span><strong id="res-save-state">Changes update in preview instantly</strong></div>
      <div class="res-save-bar-actions">
        <button type="button" class="msg-btn secondary" data-res-test>Send test</button>
        <button type="button" class="msg-btn secondary" data-res-draft>Save draft</button>
        <button type="button" class="msg-btn" data-res-primary>Save & make primary</button>
      </div>`;
    pane.appendChild(bar);
    bar.querySelector('[data-res-test]').onclick=()=>openMainTab('delivery');
    bar.querySelector('[data-res-draft]').onclick=()=> $('msg-save-email-template')?.click();
    bar.querySelector('[data-res-primary]').onclick=()=> $('msg-save-primary-template')?.click();

    pane.addEventListener('input',()=>{
      const s=$('res-save-state');if(s)s.textContent='Unsaved changes';
    });
    ['msg-save-email-template','msg-save-primary-template'].forEach(id=>{
      $(id)?.addEventListener('click',()=>setTimeout(()=>{const s=$('res-save-state');if(s)s.textContent='Saved template';},350));
    });
  }

  function enhanceBuilder(){
    if(!$('msg-pane-builder'))return;
    installJourneyHeader();
    installQuickEdit();
    installSaveBar();
    attachPreviewClickEditing();
    setMode(mode);
  }

  function boot(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if($('msg-pane-builder') && $('msg-email-preview')){
        clearInterval(timer);enhanceBuilder();
      }else if(tries>80)clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();