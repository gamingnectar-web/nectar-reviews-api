/* ELEV8 Admin draft workspace. NO production publishing, checkout mutation or API writes. */
(function(){
'use strict';
const Engine=window.Elev8BasketRewardsEngine;
if(!Engine)return;
const STORAGE_KEY='elev8:basket-rewards:draft:v1';
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=escapeHTML;
const values=x=>String(x||'').split(',').map(v=>v.trim()).filter(Boolean);
const csv=x=>(x||[]).join(', ');
let rules=Engine.clone(Engine.defaultRules),selection={},current=62,editing=null;
try {const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(saved?.schema===1&&Array.isArray(saved.rules)&&!Engine.validate(saved.rules).length)rules=saved.rules;}catch(_){/* invalid draft ignored */}
function save(){const errors=Engine.validate(rules);if(errors.length){status(errors.join(' · '),true);return;}try{localStorage.setItem(STORAGE_KEY,JSON.stringify({schema:1,rules,updatedAt:new Date().toISOString(),publishable:false}));status('Draft saved to this browser only. No live promotions changed.');}catch(_){status('Browser storage unavailable — export JSON to preserve this draft.',true);}}
function status(s,isError=false){const el=document.getElementById('ebr-status');if(el){el.textContent=s;el.className='ebr-status '+(isError?'ebr-error':'ebr-muted');}}
function money(n){return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n||0);}
function optionRow(o,i){return `<div class="ebr-reward" data-option="${i}"><div><label>Reward label</label><input data-field="label" value="${attr(o.label)}"></div><div><label>Type</label><select data-field="type">${['percent','fixed','shipping','gift'].map(t=>`<option value="${t}" ${o.type===t?'selected':''}>${{percent:'% off',fixed:'£ off',shipping:'Free delivery',gift:'Gift'}[t]}</option>`).join('')}</select></div><div><label>Value</label><input type="number" min="0" step="0.01" data-field="value" value="${attr(o.value)}" ${['gift','shipping'].includes(o.type)?'disabled':''}></div><button type="button" data-remove-option="${i}" aria-label="Remove reward">×</button></div>`;}
function editor(){const mount=document.getElementById('ebr-editor');if(!mount)return;
  if(!editing){mount.innerHTML='<p class="ebr-empty">Select Edit on a campaign, or add a new milestone.</p>';return;}
  const r=rules.find(x=>x.id===editing);if(!r){editing=null;return editor();}
  mount.innerHTML=`<div class="ebr-toolbar"><strong>Edit campaign</strong><button type="button" data-action="close">Close</button></div>
    <label>Campaign name</label><input data-rule="name" value="${attr(r.name)}">
    <div class="ebr-grid"><div><label>Trigger</label><select data-rule="trigger"><option value="subtotal" ${r.trigger==='subtotal'?'selected':''}>Qualifying spend (£)</option><option value="quantity" ${r.trigger==='quantity'?'selected':''}>Eligible item quantity</option></select></div><div><label>Threshold</label><input type="number" min="0.01" step="0.01" data-rule="threshold" value="${attr(r.threshold)}"></div>
    <div><label>Reward selection</label><select data-rule="selectionMode"><option value="auto" ${r.selectionMode==='auto'?'selected':''}>Automatically apply</option><option value="choose" ${r.selectionMode==='choose'?'selected':''}>Customer chooses one</option></select></div><div><label>Priority (higher wins)</label><input type="number" data-rule="priority" value="${attr(r.priority||0)}"></div>
    <div><label>Stack group</label><input data-rule="stackGroup" value="${attr(r.stackGroup||'basket')}"></div><div><label>Stack with groups (comma-separated)</label><input data-rule="stackWith" value="${attr(csv(r.stackWith))}"></div>
    <div><label>Include vendors (optional)</label><input data-rule="eligibleVendors" value="${attr(csv(r.eligibleVendors))}"></div><div><label>Exclude vendors</label><input data-rule="excludeVendors" value="${attr(csv(r.excludeVendors))}"></div>
    <div><label>Exclude product tags</label><input data-rule="excludeTags" value="${attr(csv(r.excludeTags))}"></div><div><label>Enabled in draft simulation</label><select data-rule="enabled"><option value="true" ${r.enabled?'selected':''}>Yes</option><option value="false" ${!r.enabled?'selected':''}>No</option></select></div>
    <div><label>Start (optional, ISO timestamp)</label><input data-rule="startAt" placeholder="2026-11-15T00:00:00Z" value="${attr(r.startAt||'')}"></div><div><label>End (optional, ISO timestamp)</label><input data-rule="endAt" placeholder="2026-11-30T23:59:59Z" value="${attr(r.endAt||'')}"></div></div>
    <p style="margin:16px 0 4px;font-weight:700">Reward options</p><div id="ebr-options">${(r.options||[]).map(optionRow).join('')}</div>
    <div class="ebr-toolbar" style="margin-top:12px"><button type="button" data-action="add-option">+ Add reward option</button><button class="ebr-primary" type="button" data-action="save">Save draft</button></div>`;
}
function render(){const mount=document.getElementById('elev8-basket-draft');if(!mount)return;
 mount.innerHTML=`<div class="ebr-head"><div><h2 style="margin:0 0 6px">Basket Rewards Studio <span class="ebr-pill">DRAFT ONLY</span></h2><p class="ebr-muted" style="margin:0">Experiment with spend and quantity milestones, rewards, customer choice and stacking rules.</p></div><div class="ebr-actions"><button type="button" data-action="export">Export JSON</button><button class="ebr-primary" type="button" data-action="save">Save draft</button></div></div>
 <div class="ebr-safe"><strong>No checkout connection.</strong> All rules are browser-local drafts. They cannot be published, create discounts, change Shopify prices, or appear on your storefront. Gifts and delivery shown below are illustrative until a Shopify-backed implementation is tested.</div>
 <div class="ebr-columns" style="margin-top:15px"><div class="ebr-card"><div class="ebr-toolbar"><strong>Reward campaigns (${rules.length})</strong><button type="button" data-action="new">+ New milestone</button></div><div class="ebr-list">${rules.map(r=>`<div class="ebr-rule"><div class="ebr-rule-top"><div><strong>${escapeHTML(r.name)}</strong><div class="ebr-muted">${r.trigger==='subtotal'?money(r.threshold):`${r.threshold} eligible items`} · ${r.options.length} option(s) · ${r.selectionMode==='choose'?'Choose one':'Automatic'} · ${r.enabled?'Enabled in preview':'Disabled'}</div></div><div class="ebr-actions"><button type="button" data-edit="${attr(r.id)}">Edit</button><button type="button" data-duplicate="${attr(r.id)}">Copy</button><button type="button" data-delete="${attr(r.id)}">Delete</button></div></div></div>`).join('')}</div><div id="ebr-editor" style="margin-top:18px"></div></div>
 <div class="ebr-card"><div class="ebr-preview-head"><strong>Customer basket preview</strong><span class="ebr-pill">SIMULATION</span></div><label for="ebr-subtotal">Basket subtotal: <strong id="ebr-current"></strong></label><input id="ebr-subtotal" aria-label="Simulated basket subtotal" type="range" min="0" max="150" step="1" value="${current}" style="width:100%"><p class="ebr-muted">Sample basket: one eligible product, quantity 1. This preview does not access a real customer's cart.</p><div id="ebr-preview"></div></div></div><p id="ebr-status" class="ebr-muted ebr-status" aria-live="polite"></p>`;
 editor();preview();
}
function preview(){const el=document.getElementById('ebr-preview');if(!el)return;
 const results=Engine.evaluate(rules,[{unitPrice:current,quantity:1,vendor:'GFUEL',tags:[]}],selection);
 document.getElementById('ebr-current').textContent=money(current);
 el.innerHTML=results.rows.length?results.rows.map(row=>`<div class="ebr-milestone"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${escapeHTML(row.rule.name)}</strong><span class="${row.available?'ebr-green':'ebr-muted'}">${row.available?'Unlocked':row.remaining.toFixed(2)+' to go'}</span></div><div class="ebr-progress"><span style="width:${Math.min(100,row.rule.threshold>0?row.metric/row.rule.threshold*100:100)}%"></span></div>${row.available&&row.options.length?row.options.map(o=>`<label class="ebr-option"><input type="radio" name="ebr-choice-${attr(row.id)}" value="${attr(o.id)}" data-select-reward="${attr(row.id)}" ${(selection[row.id]===o.id||row.rule.selectionMode==='auto'&&row.chosen?.id===o.id)?'checked':''} ${row.rule.selectionMode==='auto'?'disabled':''}><span>${escapeHTML(o.label)}${o.type==='percent'?` (${o.value}% off)`:o.type==='fixed'?` (${money(o.value)} off)`:''}</span></label>`).join(''):(row.available?'':'')} ${row.needsChoice?'<span class="ebr-muted">Select a reward to apply it in this preview.</span>':''}</div>`).join(''):'<div class="ebr-empty">No enabled draft milestones.</div>';
 el.innerHTML+=`<div style="padding-top:12px"><div class="ebr-preview-head"><strong>Estimated product savings</strong><strong class="ebr-green">${money(results.estimatedProductSaving)}</strong></div>${results.applied.length?`<p class="ebr-muted">Preview rewards: ${results.applied.map(r=>escapeHTML(r.chosen.label)).join(', ')}</p>`:''}${results.suppressed.length?`<p class="ebr-error">Not stacked: ${results.suppressed.map(s=>escapeHTML(s.reason)).join('; ')}</p>`:''}<p class="ebr-muted">${escapeHTML(results.note)}</p></div>`;
}
function update(event){const node=event.target; const r=rules.find(x=>x.id===editing);if(!r)return;
 if(node.dataset.rule){const key=node.dataset.rule,raw=node.value;r[key]=['threshold','priority'].includes(key)?Number(raw):['eligibleVendors','excludeVendors','excludeTags','stackWith'].includes(key)?values(raw):key==='enabled'?raw==='true':raw||(['startAt','endAt'].includes(key)?null:'');if(['enabled','trigger','threshold','priority','selectionMode','stackWith','stackGroup'].includes(key))render();else preview();}
 if(node.dataset.field){const option=r.options[Number(node.closest('[data-option]').dataset.option)];const key=node.dataset.field;option[key]=key==='value'?Number(node.value):node.value;preview();}
}
function act(event){const b=event.target.closest('button');if(!b)return;
 const action=b.dataset.action;
 if(action==='new'){const id='draft-'+Date.now();rules.push({id,name:'New basket milestone',enabled:true,trigger:'subtotal',threshold:50,eligibleVendors:[],excludeVendors:[],excludeTags:[],options:[{id:id+'-reward',type:'percent',value:5,label:'5% off'}],selectionMode:'auto',stackGroup:'basket',stackWith:[],priority:1,startAt:null,endAt:null});editing=id;render();}
 if(action==='save')save();
 if(action==='close'){editing=null;render();}
 if(action==='add-option'){const r=rules.find(x=>x.id===editing);if(r){r.options.push({id:'option-'+Date.now(),type:'percent',value:5,label:'New reward'});render();}}
 if(action==='export'){const blob=new Blob([JSON.stringify({schema:1,publishable:false,rules},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='elev8-basket-rewards-DRAFT.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(b.dataset.edit){editing=b.dataset.edit;render();}
 if(b.dataset.duplicate){const original=rules.find(x=>x.id===b.dataset.duplicate);if(original){const copy=Engine.clone(original),id='draft-'+Date.now();copy.id=id;copy.name+=' (copy)';copy.options.forEach((o,i)=>o.id=id+'-'+i);rules.push(copy);editing=id;render();}}
 if(b.dataset.delete){rules=rules.filter(x=>x.id!==b.dataset.delete);if(editing===b.dataset.delete)editing=null;render();}
 if(b.dataset.removeOption!==undefined){const r=rules.find(x=>x.id===editing);if(r?.options.length>1){r.options.splice(Number(b.dataset.removeOption),1);render();}else status('Every campaign must retain at least one option.',true);}
}
function init(){if(document.getElementById('elev8-basket-draft'))return;
 const existing=document.getElementById('v-cart-rewards');if(!existing)return;
 const mount=document.createElement('div');mount.id='elev8-basket-draft';existing.appendChild(mount);
 mount.addEventListener('click',act);
 mount.addEventListener('change',e=>{if(e.target.dataset.rule||e.target.dataset.field){update(e);return;}if(e.target.dataset.selectReward){selection[e.target.dataset.selectReward]=e.target.value;preview();}});
 mount.addEventListener('input',e=>{if(e.target.id==='ebr-subtotal'){current=Number(e.target.value);preview();}});
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
