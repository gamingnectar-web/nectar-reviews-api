'use strict';
const el=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));let data={};
async function call(path,options={}){const r=await fetch(path,{credentials:'same-origin',...options});if(r.status===401){location.assign('/elev8/account/login');throw Error('Sign in required')}const json=await r.json().catch(()=>({}));if(!r.ok)throw Error(json.error||'Request failed');return json}
function error(e){el('notice').textContent=e.message||String(e);el('notice').hidden=false}
const list=(rows)=>rows.length?rows.map(x=>`<div class="item"><span>${escape(x.name)}</span><span class="pill">${escape(x.status)}</span></div>`).join(''):'<div class="empty">Nothing here yet</div>';
async function section(name){for(const n of ['overview','stores','drafts','activity','account'])el(n).hidden=n!==name;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===name));el('title').textContent=({overview:'Your platform overview',stores:'Connected stores',drafts:'Draft Studio',activity:'Activity history',account:'Your account'})[name];let wid=el('workspace').value;if(name==='stores'){el('stores-list').innerHTML=list(data.stores.filter(x=>!wid||String(x.workspaceId)===wid).map(x=>({name:x.shopDomain,status:x.state})));return}if(name==='drafts'||name==='activity'){if(!wid){el(name+'-list').innerHTML='<div class="empty">Choose a workspace first</div>';return}const d=await call(`/api/elev8/command/workspaces/${encodeURIComponent(wid)}/${name}`);el(name+'-list').innerHTML=list((name==='drafts'?d.drafts:d.events).map(x=>({name:x.title||x.action,status:x.status||new Date(x.createdAt).toLocaleDateString()})));}}
async function refresh(){data=await call('/api/elev8/command/overview');el('workspace').innerHTML='<option value="">All workspaces</option>'+data.workspaces.map(x=>`<option value="${escape(x.id)}">${escape(x.name)}</option>`).join('');el('identity').textContent=(data.account.name||'')+' · '+data.account.email;el('n-workspaces').textContent=data.workspaces.length;el('n-stores').textContent=data.stores.filter(x=>x.state==='verified').length;el('n-pending').textContent=data.counts.submitted||0;el('n-drafts').textContent=data.counts.draft||0}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>section(b.dataset.view).catch(error)));document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>section(b.dataset.jump).catch(error)));el('workspace').addEventListener('change',()=>{const current=document.querySelector('[data-view].selected');if(current)section(current.dataset.view).catch(error)});
el('create').addEventListener('click',async()=>{const name=prompt('Workspace name');if(!name)return;try{await call('/api/elev8/v2/workspaces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});await refresh()}catch(e){error(e)}});
el('logout').addEventListener('click',async()=>{try{await call('/elev8/account/logout',{method:'POST'});location.assign('/elev8/account/login')}catch(e){error(e)}});

el('elev8-connect-store').addEventListener('click',async()=>{
 const workspaceId=el('workspace').value;
 const shopDomain=el('elev8-shop-domain').value.trim().toLowerCase();
 if(!workspaceId)return error(new Error('Choose a workspace first'));
 if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain))return error(new Error('Enter a valid .myshopify.com domain'));
 try{
  const result=await call('/elev8/store-link/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,shopDomain})});
  const target=new URL(result.authorizeUrl);if(target.protocol!=='https:'||target.hostname!==shopDomain)throw Error('Unexpected Shopify authorisation destination');
  window.location.assign(target.toString());
 }catch(e){error(e)}
});

refresh().catch(error);
