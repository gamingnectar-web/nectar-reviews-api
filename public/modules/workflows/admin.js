(() => {
  const qs = new URLSearchParams(location.search);
  const shopDomain = qs.get('shop') || qs.get('shopDomain') || sessionStorage.getItem('elev8-shop') || '';
  if (shopDomain) sessionStorage.setItem('elev8-shop', shopDomain);

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const apiBase = '/api/admin/workflows';

  async function request(path, options = {}) {
    const url = `${apiBase}${path}${path.includes('?') ? '&' : '?'}shopDomain=${encodeURIComponent(shopDomain)}`;
    const init = { ...options, headers: { 'content-type':'application/json', ...(options.headers || {}) } };
    const fn = window.adminFetch || window.elev8AdminFetch || window.fetch.bind(window);
    const response = await fn(url, init);
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function toast(message) {
    let el = $('.e8w-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'e8w-toast';
      Object.assign(el.style,{position:'fixed',right:'18px',bottom:'18px',background:'#111',color:'#fff',padding:'11px 14px',borderRadius:'10px',fontWeight:'700',fontSize:'12px',zIndex:'9999'});
      document.body.appendChild(el);
    }
    el.textContent = message; el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2600);
  }

  function parseJson(text, fallback) {
    if (!String(text || '').trim()) return fallback;
    return JSON.parse(text);
  }

  let workflows = [], runs = [], templates = [], credentials = [], tokens = [];

  function actionRow(action = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'action-row';
    wrap.innerHTML = `
      <div class="action-row-top">
        <select data-action-type>
          ${['current_datetime','random_integer','set_variable','http_request','shopify_graphql','ai_generate','email','email_styled','start_workflow','bulk_start','stop'].map((x)=>`<option value="${x}" ${action.type===x?'selected':''}>${x.replaceAll('_',' ')}</option>`).join('')}
        </select>
        <input data-action-label placeholder="Label" value="${escapeHtml(action.label || '')}">
        <button type="button" class="btn danger" data-remove-action>Remove</button>
      </div>
      <textarea data-action-config class="code" rows="5" placeholder='{"key":"value"}'>${escapeHtml(JSON.stringify(action.config || {}, null, 2))}</textarea>`;
    $('[data-remove-action]', wrap).addEventListener('click', () => wrap.remove());
    return wrap;
  }

  function readForm() {
    return {
      name: $('#workflow-name').value,
      description: $('#workflow-description').value,
      enabled: $('#workflow-enabled').checked,
      trigger: {
        kind: $('#trigger-kind').value,
        resourceType: $('#trigger-resource').value,
        event: $('#trigger-event').value,
        fieldPath: $('#trigger-field').value,
        namespace: $('#trigger-namespace').value,
        key: $('#trigger-key').value,
        specifier: $('#trigger-specifier').value,
        everyMinutes: Number($('#trigger-every').value || 0)
      },
      conditionMode: $('#condition-mode').value,
      conditions: parseJson($('#workflow-conditions').value, []),
      actions: $$('.action-row').map((row, index) => ({
        id: `action_${index+1}`,
        type: $('[data-action-type]', row).value,
        label: $('[data-action-label]', row).value,
        enabled: true,
        config: parseJson($('[data-action-config]', row).value, {})
      }))
    };
  }

  function fillForm(workflow = null) {
    $('#workflow-form').reset();
    $('#workflow-id').value = workflow?._id || '';
    $('#workflow-dialog-title').textContent = workflow ? 'Edit workflow' : 'New workflow';
    $('#workflow-name').value = workflow?.name || '';
    $('#workflow-description').value = workflow?.description || '';
    $('#workflow-enabled').checked = Boolean(workflow?.enabled);
    $('#trigger-kind').value = workflow?.trigger?.kind || 'resource_event';
    $('#trigger-resource').value = workflow?.trigger?.resourceType || '';
    $('#trigger-event').value = workflow?.trigger?.event || '';
    $('#trigger-field').value = workflow?.trigger?.fieldPath || '';
    $('#trigger-namespace').value = workflow?.trigger?.namespace || '';
    $('#trigger-key').value = workflow?.trigger?.key || '';
    $('#trigger-specifier').value = workflow?.trigger?.specifier || '';
    $('#trigger-every').value = workflow?.trigger?.everyMinutes || '';
    $('#condition-mode').value = workflow?.conditionMode || 'all';
    $('#workflow-conditions').value = JSON.stringify(workflow?.conditions || [], null, 2);
    $('#actions').replaceChildren(...(workflow?.actions || []).map(actionRow));
    if (!(workflow?.actions || []).length) $('#actions').appendChild(actionRow({ type:'current_datetime', config:{} }));
  }

  function renderWorkflows() {
    const root = $('#workflow-list');
    if (!workflows.length) { root.innerHTML = '<div class="empty">No workflows yet. Create one or install a template.</div>'; return; }
    root.innerHTML = workflows.map((w) => `
      <article class="card" data-id="${w._id}">
        <div class="card-main">
          <h3>${escapeHtml(w.name)}</h3><p>${escapeHtml(w.description || 'No description')}</p>
          <div class="pills"><span class="pill ${w.enabled?'live':'off'}">${w.enabled?'Enabled':'Disabled'}</span><span class="pill">${escapeHtml((w.trigger?.kind||'').replaceAll('_',' '))}</span><span class="pill">${escapeHtml(w.trigger?.resourceType||'generic')}</span><span class="pill">${Number(w.runCount||0)} runs</span></div>
        </div>
        <div class="card-actions"><button class="btn" data-edit>Edit</button><button class="btn" data-run>Run now</button><button class="btn danger" data-delete>Delete</button></div>
      </article>`).join('');
    $$('.card', root).forEach((card) => {
      const workflow = workflows.find((w) => w._id === card.dataset.id);
      $('[data-edit]', card).onclick = () => { fillForm(workflow); $('#workflow-dialog').showModal(); };
      $('[data-run]', card).onclick = async () => { await request(`/definitions/${workflow._id}/run`, {method:'POST',body:'{}'}); toast('Workflow queued'); loadRuns(); };
      $('[data-delete]', card).onclick = async () => { if(!confirm(`Delete "${workflow.name}"?`)) return; await request(`/definitions/${workflow._id}`,{method:'DELETE'}); await loadWorkflows(); };
    });
  }

  function renderRuns() {
    const root = $('#run-list');
    if (!runs.length) { root.innerHTML='<div class="empty">No runs yet.</div>'; return; }
    root.innerHTML = `<table><thead><tr><th>Workflow</th><th>Status</th><th>Source</th><th>Object</th><th>Started</th><th>Error</th></tr></thead><tbody>${runs.map((r)=>`
      <tr><td><strong>${escapeHtml(r.workflowName)}</strong><br><small>${escapeHtml(r.runId)}</small></td><td class="status ${escapeHtml(r.status)}">${escapeHtml(r.status)}</td><td>${escapeHtml(r.source)}</td><td>${escapeHtml(r.resourceType)} ${escapeHtml(r.resourceId)}</td><td>${escapeHtml(new Date(r.createdAt).toLocaleString())}</td><td>${escapeHtml(r.error||'')}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderTemplates() {
    const root = $('#template-list');
    root.innerHTML = templates.map((t)=>`<article class="card"><div class="card-main"><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.description)}</p><div class="pills"><span class="pill">${escapeHtml(t.trigger.kind.replaceAll('_',' '))}</span></div></div><button class="btn" data-install="${escapeHtml(t.key)}">Install</button></article>`).join('');
    $$('[data-install]', root).forEach((btn)=>btn.onclick=async()=>{await request(`/templates/${btn.dataset.install}/install`,{method:'POST',body:'{}'});toast('Template installed disabled');await loadWorkflows();});
  }

  function renderIntegrations() {
    $('#credential-list').innerHTML = credentials.length ? credentials.map((x)=>`<div class="row"><span><strong>${escapeHtml(x.name)}</strong><br><small>${escapeHtml(x.type)} · ${escapeHtml(x.hint||'stored')}</small></span><button class="btn danger" data-cred-del="${x._id}">Delete</button></div>`).join('') : '<div class="empty">No credentials.</div>';
    $$('[data-cred-del]').forEach((btn)=>btn.onclick=async()=>{await request(`/credentials/${btn.dataset.credDel}`,{method:'DELETE'});await loadIntegrations();});
    $('#token-list').innerHTML = tokens.length ? tokens.map((x)=>`<div class="row"><span><strong>${escapeHtml(x.name)}</strong><br><small>${escapeHtml(x.prefix)}… ${x.revokedAt?'· revoked':''}</small></span>${x.revokedAt?'':'<button class="btn danger" data-token-del="'+x._id+'">Revoke</button>'}</div>`).join('') : '<div class="empty">No REST tokens.</div>';
    $$('[data-token-del]').forEach((btn)=>btn.onclick=async()=>{await request(`/tokens/${btn.dataset.tokenDel}`,{method:'DELETE'});await loadIntegrations();});
  }

  async function loadHealth(){const d=await request('/health');$('#stat-workflows').textContent=d.workflows;$('#stat-runs').textContent=d.recentRuns;$('#stat-status').textContent=d.ok?'Ready':'Issue';}
  async function loadWorkflows(){workflows=(await request('/definitions')).workflows||[];renderWorkflows();loadHealth().catch(()=>{});}
  async function loadRuns(){runs=(await request('/runs?limit=100')).runs||[];renderRuns();loadHealth().catch(()=>{});}
  async function loadTemplates(){templates=(await request('/templates')).templates||[];renderTemplates();}
  async function loadIntegrations(){const [c,t]=await Promise.all([request('/credentials'),request('/tokens')]);credentials=c.credentials||[];tokens=t.tokens||[];renderIntegrations();}
  async function loadWebhookRegistry(){
    const root=$('#webhook-registry');
    if(!root)return;
    try{
      const d=await request('/shopify/webhooks');
      const rows=d.rows||[], sum=d.summary||{};
      $('#wh-required').textContent=Number(sum.required||0);
      $('#wh-connected').textContent=Number(sum.connected||0);
      $('#wh-receiving').textContent=Number(sum.receiving||0);
      $('#wh-failures').textContent=Number(sum.failures||0);
      const badge=$('#companion-profile-status');
      if(badge){
        badge.textContent=d.migrationProfile==='workflow_companion'?'Mirroring':'Not enabled';
        badge.className=`pill ${d.migrationProfile==='workflow_companion'?'live':'off'}`;
      }
      root.innerHTML=rows.length?`<table><thead><tr><th>Topic</th><th>Shopify</th><th>Last received</th><th>Received</th><th>Runs</th><th>Duplicates</th><th>Errors</th><th>Used by</th></tr></thead><tbody>${rows.map(r=>`
        <tr>
          <td><strong>${escapeHtml(r.topic)}</strong><br><small>${escapeHtml(r.endpoint||'')}</small></td>
          <td><span class="pill ${r.subscriptionStatus==='connected'?'live':'off'}">${escapeHtml(r.subscriptionStatus||'not synced')}</span></td>
          <td>${r.lastReceivedAt?escapeHtml(new Date(r.lastReceivedAt).toLocaleString()):'-'}</td>
          <td>${Number(r.receivedCount||0).toLocaleString()}</td>
          <td>${Number(r.runCount||0).toLocaleString()}</td>
          <td>${Number(r.duplicateCount||0).toLocaleString()}</td>
          <td>${Number(r.failureCount||0).toLocaleString()}${r.lastError?`<br><small>${escapeHtml(r.lastError)}</small>`:''}</td>
          <td>${(r.dependentWorkflowNames||[]).map(escapeHtml).join(', ')||escapeHtml((r.dependencyReasons||[]).join(', '))||'-'}</td>
        </tr>`).join('')}</tbody></table>`:'<div class="empty">No ELEV8 webhook topics are tracked yet.</div>';
    }catch(error){root.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;}
  }

  async function syncWebhookRegistry(){
    const btn=$('#webhook-sync'); if(btn){btn.disabled=true;btn.textContent='Syncing...';}
    try{
      const d=await request('/shopify/webhooks/sync',{method:'POST',body:'{}'});
      toast(`${Number(d.connected||0)}/${Number(d.desired||0)} webhook topics connected`);
      await loadWebhookRegistry();
    }catch(error){alert(error.message);}
    finally{if(btn){btn.disabled=false;btn.textContent='Sync required';}}
  }

  async function adoptCompanionCoverage(){
    const btn=$('#adopt-companion');
    if(!confirm('Mirror Workflow Companion event coverage under ELEV8? This creates ELEV8-owned Shopify webhook subscriptions where your current Shopify scopes allow it. It does not delete or modify Workflow Companion.'))return;
    if(btn){btn.disabled=true;btn.textContent='Mirroring...';}
    try{
      const d=await request('/shopify/webhooks/adopt-companion',{method:'POST',body:'{}'});
      toast(`${Number(d.connected||0)}/${Number(d.desired||0)} companion topics covered by ELEV8`);
      await loadWebhookRegistry();
      await loadReviewPresence();
    }catch(error){alert(error.message);}
    finally{if(btn){btn.disabled=false;btn.textContent='Mirror Workflow Companion coverage';}}
  }

  async function loadReviewPresence(){
    const badge=$('#review-presence-status'), detail=$('#review-presence-detail');
    if(!badge||!detail)return;
    try{
      const d=await request('/shopify/review-presence');
      const identity=d.identity||{}, program=d.standardReviewProgram||{}, local=d.localReviews||{}, native=d.nativeRatingFields||{}, parity=d.automationParity||{};
      const ok=Boolean(identity.ok && program.ready && parity.ready);
      badge.textContent=ok?'Native-ready':'Needs attention';
      badge.className=`pill ${ok?'live':'off'}`;
      detail.innerHTML=`
        <strong>Shopify app:</strong> ${escapeHtml(identity.currentTitle||d.app?.title||'Unknown')} ${identity.ok?'':'- rename to ELEV8 in Shopify Dev Dashboard'}<br>
        <strong>ELEV8 accepted reviews:</strong> ${Number(local.accepted||0).toLocaleString()} across ${Number(local.productsWithAcceptedReviews||0).toLocaleString()} products<br>
        <strong>Shopify standard rating fields:</strong> ${Number(native.populated||0)}/${Number(native.sampled||0)} sampled products populated<br>
        <strong>Shop review syndication:</strong> ${program.ready?'Scope ready':'Shopify approval / write_product_reviews required'}<br>
        <strong>Workflow Companion scope parity:</strong> ${parity.ready?'Ready':`${Number((parity.missingScopes||[]).length)} scope(s) still missing`}
        ${parity.missingScopes?.length?`<br><small>Missing: ${escapeHtml(parity.missingScopes.join(', '))}</small>`:''}`;
    }catch(error){
      badge.textContent='Needs attention'; badge.className='pill off'; detail.textContent=error.message;
    }
  }

  async function loadShopifyStatus(){
    const statusEl=$('#shopify-automation-status'), detail=$('#shopify-automation-detail');
    if(!statusEl||!detail)return;
    try{
      const d=await request('/shopify/status');
      const hooks=d.webhooks||{}, snaps=d.snapshots||{}, events=d.events||{};
      statusEl.textContent=d.ok?'Ready':'Needs setup';
      statusEl.className=`pill ${d.ok?'live':'off'}`;
      const required=(hooks.topics||[]).length, missing=(hooks.results||[]).filter(x=>!x.ok).length;
      detail.innerHTML=`<strong>${required-missing}/${required} required webhook topics connected</strong> · ${Number(snaps.count||0).toLocaleString()} snapshots · ${Number(events.failedLast24h||0)} failed events in 24h${snaps.lastIndexAt?`<br><small>Last index: ${escapeHtml(new Date(snaps.lastIndexAt).toLocaleString())}</small>`:''}`;
    }catch(error){statusEl.textContent='Needs setup';statusEl.className='pill off';detail.textContent=error.message;}
  }

  async function syncShopify(){
    const btn=$('#shopify-sync'); if(btn){btn.disabled=true;btn.textContent='Syncing…';}
    try{const d=await request('/shopify/sync',{method:'POST',body:'{}'});toast(d.ok?'Shopify webhooks connected':'Shopify sync finished with warnings');await loadShopifyStatus();}
    catch(error){alert(error.message);}finally{if(btn){btn.disabled=false;btn.textContent='Sync Shopify webhooks';}}
  }

  async function indexShopify(){
    const btn=$('#shopify-index'); if(btn){btn.disabled=true;btn.textContent='Indexing…';}
    try{const d=await request('/shopify/index',{method:'POST',body:JSON.stringify({maxItems:5000,orderCoverageDays:90})});const total=(d.results||[]).reduce((n,x)=>n+Number(x.indexed||0),0);toast(`Indexed ${total.toLocaleString()} Shopify records`);await loadShopifyStatus();}
    catch(error){alert(error.message);}finally{if(btn){btn.disabled=false;btn.textContent='Index current Shopify data';}}
  }

  $$('.tab').forEach((tab)=>tab.onclick=()=>{$$('.tab').forEach((x)=>x.classList.remove('active'));$$('.panel').forEach((x)=>x.classList.remove('active'));tab.classList.add('active');$(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');if(tab.dataset.tab==='runs')loadRuns();if(tab.dataset.tab==='templates')loadTemplates();if(tab.dataset.tab==='webhooks'){loadWebhookRegistry();loadReviewPresence();}if(tab.dataset.tab==='integrations'){loadIntegrations();loadShopifyStatus();}});
  $('#new-workflow').onclick=()=>{fillForm();$('#workflow-dialog').showModal();};
  $('#add-action').onclick=()=>$('#actions').appendChild(actionRow({type:'http_request',config:{method:'POST',url:'https://example.com'}}));
  $('#refresh-runs').onclick=loadRuns;
  $('#add-credential').onclick=()=>{$('#credential-form').reset();$('#credential-dialog').showModal();};
  $('#add-token').onclick=()=>{$('#token-form').reset();$('#created-token').hidden=true;$('#token-dialog').showModal();};
  if($('#shopify-sync')) $('#shopify-sync').onclick=syncShopify;
  if($('#shopify-index')) $('#shopify-index').onclick=indexShopify;
  if($('#shopify-status-refresh')) $('#shopify-status-refresh').onclick=loadShopifyStatus;
  if($('#webhook-refresh')) $('#webhook-refresh').onclick=()=>{loadWebhookRegistry();loadReviewPresence();};
  if($('#webhook-sync')) $('#webhook-sync').onclick=syncWebhookRegistry;
  if($('#adopt-companion')) $('#adopt-companion').onclick=adoptCompanionCoverage;

  $('#workflow-form').addEventListener('submit',async(e)=>{
    if(e.submitter?.value==='cancel')return;
    e.preventDefault();
    try{
      const body=readForm(), id=$('#workflow-id').value;
      await request(id?`/definitions/${id}`:'/definitions',{method:id?'PUT':'POST',body:JSON.stringify(body)});
      $('#workflow-dialog').close();toast('Workflow saved');await loadWorkflows();
    }catch(error){alert(error.message);}
  });
  $('#credential-form').addEventListener('submit',async(e)=>{
    if(e.submitter?.value==='cancel')return;
    e.preventDefault();
    try{
      await request('/credentials',{method:'POST',body:JSON.stringify({name:$('#credential-name').value,type:$('#credential-type').value,value:parseJson($('#credential-value').value,{})})});
      $('#credential-dialog').close();toast('Credential saved');await loadIntegrations();
    }catch(error){alert(error.message);}
  });
  $('#token-form').addEventListener('submit',async(e)=>{
    if(e.submitter?.value==='cancel')return;
    e.preventDefault();
    try{
      const d=await request('/tokens',{method:'POST',body:JSON.stringify({name:$('#token-name').value})});
      const out=$('#created-token');out.hidden=false;out.textContent=`Copy this now — it is only shown once:\n\n${d.token}`;
      await loadIntegrations();
    }catch(error){alert(error.message);}
  });

  if(!shopDomain){
    $('#stat-status').textContent='Shop missing';
    $('#workflow-list').innerHTML='<div class="empty">Open Automations from the ELEV8 admin so the Shopify shop context is available.</div>';
    return;
  }
  Promise.all([loadWorkflows(),loadHealth()]).catch((error)=>{$('#stat-status').textContent='Needs setup';$('#workflow-list').innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;});
})();
