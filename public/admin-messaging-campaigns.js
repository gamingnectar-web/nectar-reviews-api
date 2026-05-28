(function(){
  if(!window.NectarAdmin) return;
  const shopDomain = window.NectarAdmin.shopDomain || 'unknown';
  const cacheKey = 'nectar_message_modules_' + shopDomain;
  let messageModules = [];
  async function pullServerMessageModules(){ try{ const data=await window.NectarAdmin.api('/api/admin/email-module-library'); messageModules=data.messageModules||[]; localStorage.setItem(cacheKey, JSON.stringify(messageModules)); return messageModules; }catch(e){ messageModules=JSON.parse(localStorage.getItem(cacheKey)||'[]'); return messageModules; } }
  async function pushServerMessageModules(){ localStorage.setItem(cacheKey, JSON.stringify(messageModules)); try{ await window.NectarAdmin.api('/api/admin/email-module-library', { method:'PUT', body: JSON.stringify({ messageModules }) }); }catch(e){ console.warn('Module library saved locally only:', e.message); } }
  window.NectarMessaging = { getModules:()=>messageModules, setModules:(mods)=>{ messageModules=mods||[]; return pushServerMessageModules(); }, addModule: async (mod)=>{ messageModules.unshift({ id:'custom:'+Date.now(), createdAt:new Date().toISOString(), ...mod }); await pushServerMessageModules(); render(); } };
  function render(){ const mount=document.getElementById('messageModulesPanel'); if(!mount) return; mount.innerHTML='<div class="card"><h2>Reusable email modules</h2><p class="muted">Saved to MongoDB per shop, with local cache fallback.</p><div id="moduleList">'+(messageModules.map(m=>`<div class="module-card"><strong>${m.name||m.title}</strong><p>${m.text||''}</p><span class="muted">${m.position||'before'} · radius ${m.radius||0}</span></div>`).join('')||'<p>No modules yet. Use the AI builder below.</p>')+'</div></div>'; }
  pullServerMessageModules().then(render);
})();
