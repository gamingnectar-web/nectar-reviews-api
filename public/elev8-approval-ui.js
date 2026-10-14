'use strict';
(()=>{
 const root=document.getElementById('elev8-approval-root');if(!root)return;
 const $=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const info=(s)=>{$('elev8-approval-message').textContent=s};
 async function token(){
   const app=window.shopify;
   if(app&&typeof app.idToken==='function')return await app.idToken();
   throw new Error('Open ELEV8 inside Shopify Admin to access drafts');
 }
 async function call(path){const t=await token();const res=await fetch(path,{headers:{Authorization:'Bearer '+t},credentials:'same-origin'});const body=await res.json().catch(()=>({}));if(!res.ok)throw Error(body.error||'Request failed');return body}
 async function load(){
   try{
     info('Loading store connections…');
     const d=await call('/api/admin/elev8-approvals/connections');
     const select=$('elev8-approval-connection');select.replaceChildren();
     for(const c of d.connections){const option=document.createElement('option');option.value=c._id;option.textContent=c.shopDomain+' · '+c.workspaceId;select.append(option)}
     if(!d.connections.length){info('No verified, explicitly authorised ELEV8 workspace connection yet. Store linking is the next activation step.');return}
     info('Ready');await loadProposals();
   }catch(e){info(e.message)}
 }
 async function loadProposals(){
  const c=$('elev8-approval-connection').value;const status=$('elev8-approval-filter').value;
  if(!c)return;try{
   const d=await call('/api/admin/elev8-approvals/connections/'+encodeURIComponent(c)+'/proposals'+(status?'?status='+encodeURIComponent(status):''));
   $('elev8-approval-list').innerHTML=d.proposals.length?d.proposals.map(p=>`<article class="e8-approval-item"><div><strong>${escape(p.title)}</strong><span>${escape(p.kind)} · ${escape(p.status)} · revision ${Number(p.revision)||1}</span></div><details><summary>Review proposed fields</summary><pre>${escape(JSON.stringify({original:p.original,proposed:p.proposed},null,2))}</pre></details><small>Approvals and Shopify application are separately gated. No live change is made here.</small></article>`).join(''):'<p>No proposals in this category.</p>';
   info(`${d.proposals.length} proposal(s) found`)
  }catch(e){info(e.message)}
 }
 $('elev8-approval-refresh').addEventListener('click',load);$('elev8-approval-filter').addEventListener('change',loadProposals);$('elev8-approval-connection').addEventListener('change',loadProposals);
 window.elev8LoadApprovals=load;
})();
