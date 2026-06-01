(function NectarContextAssistant(){
  const quickActions = [
    { label:'Explain this page', prompt:'Explain this page, what each section does, and what I should do next.' },
    { label:'What is missing?', prompt:'Look at the current page and tell me what is likely missing or not configured yet.' },
    { label:'How do I go live?', prompt:'Explain the safest go-live path from where I am now.' },
    { label:'Migration help', prompt:'Explain the migration centre, CSV staging, product mapping, site reviews and storefront scan.' }
  ];

  function esc(value){return String(value||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function activeView(){return document.querySelector('.view.active')?.id || 'unknown';}
  function activeTitle(){return document.querySelector('.view.active .page-title, .view.active h1, .view.active h2')?.textContent?.trim() || document.title || 'Nectar admin';}
  function pageSummary(){
    const active = document.querySelector('.view.active');
    const text = (active?.innerText || '').replace(/\s+/g,' ').trim();
    return text.slice(0, 2400);
  }
  function product(){return document.body.dataset.nectarProductContext || window.NectarAdminProductContext?.activeProduct || 'reviews';}

  function fallbackAnswer(message){
    const view = activeView();
    const q = String(message||'').toLowerCase();
    if (view === 'v-migration' || view === 'v-import' || q.includes('migration') || q.includes('import')) {
      return 'Migration Centre is the safe handover area. Keep the old review app live first, upload a CSV into staging, check which rows are product reviews versus shop/site reviews, map unmatched products, then import accepted rows. The storefront scanner is only a signal checker; it detects visible review/schema traces but does not pull private Shop/Yotpo databases. After import, preview Nectar widgets and switch only one schema/widget source live.';
    }
    if (view === 'v-review-launch' || q.includes('webhook') || q.includes('live')) {
      return 'The launch checklist is a go/no-go view for Reviews. It checks internal Nectar settings such as sender, signed-link secret, native scheduler and saved Shopify OAuth. The webhook line turns green after Nectar successfully registers the webhook with Shopify and records that result for the shop. Use Refresh after changing anything. Theme/widget placement is still a manual visual check because Shopify cannot prove a merchant placed an app block exactly where they want it.';
    }
    if (view === 'v-msg' || q.includes('reminder') || q.includes('email')) {
      return 'Messaging controls the review emails, delivery provider, analytics and reusable modules. If Reminder fails, check Email Delivery has an enabled provider, the provider has a saved SMTP/app password, and EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET exists so Nectar can create signed one-use review links.';
    }
    if (view === 'v-cart-rewards' || product() === 'cart-rewards') {
      return 'Cart Rewards is a beta product area for cart milestone campaigns. Use Campaigns/Builder to create tiers and attach Shopify reward products. Use Calendar for scheduled campaigns, Design for appearance, and Analytics for claims/revenue signals. Keep it amber until a real storefront/cart test passes.';
    }
    if (view === 'v-loyalty' || product() === 'loyalty') {
      return 'Loyalty is beta. Configure points rules, rewards, tiers and checkout redemption separately. The orange dot means it is enabled but not fully live-ready. It should only go green later when its own Shopify/discount/checkout tests pass.';
    }
    return 'I can explain the current page, tell you what is missing, or guide you to the right area. Green dots mean live-ready checks passed, orange means enabled but not fully live, no dot means disabled/not enabled, and Beta/Soon labels show product maturity.';
  }

  function install(){
    if(document.getElementById('ncr-help-launcher')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <style>
        .ncr-help-launcher{position:fixed;right:22px;bottom:22px;z-index:2147483400;border:0;border-radius:999px;background:#111827;color:#fff;box-shadow:0 18px 55px rgba(15,23,42,.28);padding:13px 18px;font-weight:950;cursor:pointer;display:flex;align-items:center;gap:8px}.ncr-help-launcher:before{content:'✦';display:inline-grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#7c3aed}.ncr-help-drawer{position:fixed;right:22px;bottom:82px;z-index:2147483400;width:min(440px,calc(100vw - 28px));max-height:min(720px,calc(100vh - 110px));display:none;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:22px;box-shadow:0 26px 90px rgba(15,23,42,.28);overflow:hidden}.ncr-help-drawer.active{display:flex}.ncr-help-head{display:flex;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#111827,#312e81);color:#fff}.ncr-help-head h3{margin:0 0 4px;font-size:18px}.ncr-help-head p{margin:0;color:rgba(255,255,255,.72);font-size:13px;line-height:1.4}.ncr-help-close{border:0;background:rgba(255,255,255,.14);color:#fff;width:34px;height:34px;border-radius:999px;font-weight:950;cursor:pointer}.ncr-help-body{padding:16px;display:grid;gap:12px;overflow:auto}.ncr-help-context{border:1px solid #e0e7ff;background:#eef2ff;color:#3730a3;border-radius:14px;padding:10px 12px;font-size:12px;line-height:1.45}.ncr-help-quick{display:flex;gap:8px;flex-wrap:wrap}.ncr-help-quick button{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:8px 10px;font-weight:850;cursor:pointer;font-size:12px}.ncr-help-log{display:grid;gap:10px;max-height:330px;overflow:auto;padding-right:4px}.ncr-help-msg{border-radius:16px;padding:11px 13px;font-size:13px;line-height:1.5}.ncr-help-msg.user{margin-left:34px;background:#111827;color:#fff}.ncr-help-msg.assistant{margin-right:20px;background:#f8fafc;border:1px solid #e5e7eb;color:#111827}.ncr-help-form{display:grid;grid-template-columns:1fr auto;gap:8px}.ncr-help-form textarea{width:100%;min-height:48px;max-height:120px;resize:vertical;border:1px solid #cbd5e1;border-radius:14px;padding:11px 12px;font:inherit}.ncr-help-form button{border:0;border-radius:14px;background:#111827;color:#fff;font-weight:950;padding:0 14px;cursor:pointer}.ncr-help-note{font-size:11px;color:#64748b;line-height:1.4}
      </style>
      <button id="ncr-help-launcher" class="ncr-help-launcher" type="button">Nectar AI</button>
      <aside id="ncr-help-drawer" class="ncr-help-drawer" aria-label="Nectar AI help">
        <div class="ncr-help-head"><div><h3>Nectar AI helper</h3><p>Ask what this page does, what is missing, or where to go next.</p></div><button class="ncr-help-close" type="button" aria-label="Close help">×</button></div>
        <div class="ncr-help-body">
          <div id="ncr-help-context" class="ncr-help-context"></div>
          <div class="ncr-help-quick">${quickActions.map((a,i)=>`<button type="button" data-help-quick="${i}">${esc(a.label)}</button>`).join('')}</div>
          <div id="ncr-help-log" class="ncr-help-log"></div>
          <form id="ncr-help-form" class="ncr-help-form"><textarea id="ncr-help-input" placeholder="Ask about this page…"></textarea><button type="submit">Ask</button></form>
          <div class="ncr-help-note">Uses the current page context. If OPENAI_API_KEY is not set, it falls back to built-in product guidance.</div>
        </div>
      </aside>
    `);
    document.getElementById('ncr-help-launcher')?.addEventListener('click',()=>open());
    document.querySelector('.ncr-help-close')?.addEventListener('click',close);
    document.querySelectorAll('[data-help-quick]').forEach(btn=>btn.addEventListener('click',()=>ask(quickActions[Number(btn.dataset.helpQuick)]?.prompt || 'Explain this page.')));
    document.getElementById('ncr-help-form')?.addEventListener('submit',(event)=>{event.preventDefault(); const input=document.getElementById('ncr-help-input'); const msg=input.value.trim(); input.value=''; ask(msg);});
    updateContext();
  }

  function updateContext(){
    const box=document.getElementById('ncr-help-context');
    if(!box)return;
    box.innerHTML = `<strong>${esc(activeTitle())}</strong><br>Product: ${esc(product())} · Page: ${esc(activeView())}`;
  }
  function open(seed){document.getElementById('ncr-help-drawer')?.classList.add('active');updateContext();setTimeout(()=>document.getElementById('ncr-help-input')?.focus(),50); if(seed) ask(seed);}
  function close(){document.getElementById('ncr-help-drawer')?.classList.remove('active');}
  function addMsg(role,text){const log=document.getElementById('ncr-help-log'); if(!log)return; log.insertAdjacentHTML('beforeend',`<div class="ncr-help-msg ${role}">${esc(text)}</div>`); log.scrollTop=log.scrollHeight;}
  async function ask(message){
    const msg=String(message||'').trim(); if(!msg)return;
    open(); addMsg('user',msg); addMsg('assistant','Checking this page…');
    const pending=document.querySelector('#ncr-help-log .ncr-help-msg.assistant:last-child');
    try{
      let answer='';
      if(typeof window.adminFetch==='function'){
        const data=await window.adminFetch('/admin/context-assistant',{method:'POST',body:JSON.stringify({message:msg,activeView:activeView(),activeProduct:product(),pageTitle:activeTitle(),pageSummary:pageSummary()})});
        answer=data.answer||fallbackAnswer(msg);
      } else answer=fallbackAnswer(msg);
      if(pending) pending.textContent=answer; else addMsg('assistant',answer);
    }catch(error){
      const answer=fallbackAnswer(msg) + (error?.message ? `\n\nNote: AI endpoint was unavailable: ${error.message}` : '');
      if(pending) pending.textContent=answer; else addMsg('assistant',answer);
    }
  }

  const oldTab=window.tab;
  if(typeof oldTab==='function' && !oldTab.__nectarHelpContextPatched){
    const patched=function(id){const result=oldTab.apply(this,arguments); setTimeout(updateContext,80); return result;};
    patched.__nectarHelpContextPatched=true;
    window.tab=patched;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  window.NectarHelpAssistant={open,ask,close};
})();
