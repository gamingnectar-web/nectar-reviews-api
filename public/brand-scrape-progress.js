(function Elev8BrandScrapeProgress(){
  const $ = (id) => document.getElementById(id);
  const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let pollTimer = null;

  function ensureStyles(){
    if($('elev8-brand-progress-style')) return;
    const s=document.createElement('style');
    s.id='elev8-brand-progress-style';
    s.textContent=`
      .ebp-backdrop{position:fixed;inset:0;background:rgba(15,29,50,.42);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100000;backdrop-filter:blur(4px)}
      .ebp-modal{width:min(620px,96vw);max-height:88vh;background:#fff;border-radius:22px;box-shadow:0 30px 90px rgba(16,29,50,.24);overflow:hidden}
      .ebp-head{padding:22px 22px 16px;border-bottom:1px solid #edf0f4;display:flex;justify-content:space-between;gap:16px}
      .ebp-head h3{margin:0;font-size:20px}.ebp-head p{margin:6px 0 0;color:#667085}
      .ebp-spinner{width:42px;height:42px;border:4px solid #e9edf2;border-top-color:#7158e2;border-radius:50%;animation:ebp-spin .8s linear infinite;flex:none}
      .ebp-spinner.done{border-color:#daf2e3;border-top-color:#167642;animation:none}
      .ebp-track{height:7px;background:#edf1f5;margin:0 22px;border-radius:99px;overflow:hidden}.ebp-fill{height:100%;width:0;background:linear-gradient(90deg,#7158e2,#9e7fff);transition:width .3s ease}
      .ebp-stats{padding:13px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ebp-stat{background:#f7f9fb;border-radius:11px;padding:9px 10px}.ebp-stat small{display:block;color:#7a8392;text-transform:uppercase;font-size:10px;font-weight:800}.ebp-stat strong{font-size:17px}
      .ebp-feed{padding:0 22px 18px;overflow:auto;max-height:360px}.ebp-item{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:11px 0;border-top:1px solid #f0f2f5}
      .ebp-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#f0ebff;color:#7158e2;font-weight:800}.ebp-item.success .ebp-dot{background:#e9f8ef;color:#167642}.ebp-item.error .ebp-dot{background:#fff0ee;color:#a72b20}
      .ebp-main strong{display:block}.ebp-main small{display:block;color:#7a8392;margin-top:3px}
      .ebp-foot{padding:14px 22px;border-top:1px solid #edf0f4;display:flex;justify-content:flex-end}.ebp-close{display:none}
      @keyframes ebp-spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(s);
  }

  async function request(path, options={}){
    const fn=window.adminFetch||window.fetch.bind(window);
    const bases=['/api/admin/brand-directory-v2','/api/admin/product-creation-import/catalogue','/api/admin/product-creation-import'];
    let lastError;
    for(const base of bases){
      const res=await fn(`${base}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
      const data=await res.json().catch(()=>({}));
      if(res.ok)return data;
      lastError=new Error(data.error||data.message||`Request failed (${res.status})`);
      lastError.status=res.status;
      if(res.status!==404)throw lastError;
    }
    throw lastError||new Error('Request failed');
  }

  function openModal(){
    closeModal();
    ensureStyles();
    const el=document.createElement('div');
    el.id='ebp-backdrop';
    el.className='ebp-backdrop';
    el.innerHTML=`<div class="ebp-modal">
      <div class="ebp-head"><div><h3 id="ebp-title">Preparing brand scan</h3><p id="ebp-detail">Creating background task…</p></div><div id="ebp-spinner" class="ebp-spinner"></div></div>
      <div class="ebp-track"><div id="ebp-fill" class="ebp-fill"></div></div>
      <div class="ebp-stats">
        <div class="ebp-stat"><small>Products found</small><strong id="ebp-found">—</strong></div>
        <div class="ebp-stat"><small>Analysed</small><strong id="ebp-processed">—</strong></div>
        <div class="ebp-stat"><small>Product lines</small><strong id="ebp-lines">—</strong></div>
      </div>
      <div id="ebp-feed" class="ebp-feed"></div>
      <div class="ebp-foot"><button id="ebp-close" class="ca-btn ebp-close">Done</button></div>
    </div>`;
    document.body.appendChild(el);
    $('ebp-close')?.addEventListener('click',closeModal);
  }

  function closeModal(){
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null}
    $('ebp-backdrop')?.remove();
  }

  function render(job={}){
    $('ebp-title').textContent=job.headline||'Working…';
    $('ebp-detail').textContent=job.detail||'';
    $('ebp-fill').style.width=`${Math.max(0,Math.min(Number(job.progress||0),100))}%`;
    $('ebp-found').textContent=job.discoveredCount||'—';
    $('ebp-processed').textContent=job.processedCount||'—';
    $('ebp-lines').textContent=job.productLineCount||'—';
    const logs=(job.logs||[]).slice().reverse();
    $('ebp-feed').innerHTML=logs.map(log=>`<div class="ebp-item ${esc(log.status||'info')}">
      <div class="ebp-dot">${log.status==='success'?'✓':log.status==='error'?'!':'•'}</div>
      <div class="ebp-main"><strong>${esc(log.message||'Update')}</strong><small>${esc(log.detail||'')}</small></div>
    </div>`).join('');
    if(['complete','failed'].includes(job.status)){
      $('ebp-spinner').classList.add('done');
      $('ebp-close').style.display='inline-flex';
    }
  }

  async function poll(jobId){
    try{
      const {job}=await request(`/brands/scrape-job/${jobId}`);
      render(job||{});
      if(job?.status==='complete'){
        const status=$('ca-brand-scrape-status');
        if(status)status.textContent=`Saved ${job.result?.brandName||'brand'} as a draft. ${job.result?.discoveredCount||0} products analysed.`;
        document.getElementById('ca-refresh-brands')?.click();
        return;
      }
      if(job?.status==='failed')return;
      pollTimer=setTimeout(()=>poll(jobId),900);
    }catch(error){
      render({status:'failed',headline:'Could not read progress',detail:error.message,logs:[{status:'error',message:'Progress check failed',detail:error.message}]});
    }
  }

  async function start(){
    const url=$('ca-brand-source-url')?.value.trim();
    if(!url)return alert('Paste a brand or collection URL first.');
    const btn=$('ca-scrape-brand');
    if(btn){btn.disabled=true;btn.textContent='Starting…'}
    openModal();
    try{
      const data=await request('/brands/scrape-job',{
        method:'POST',
        body:JSON.stringify({sourceUrl:url,brandName:$('ca-brand-name')?.value.trim()||''})
      });
      render(data.job||{});
      if(!data.job?._id)throw new Error('No progress job ID returned.');
      poll(data.job._id);
    }catch(error){
      render({status:'failed',headline:'Could not start brand scan',detail:error.message,logs:[{status:'error',message:'Brand scan could not start',detail:error.message}]});
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Scrape & create draft'}
    }
  }

  function wire(){
    const btn=$('ca-scrape-brand');
    if(!btn||btn.dataset.progressWired)return;
    btn.dataset.progressWired='1';
    btn.addEventListener('click',(event)=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      start();
    },true);
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(wire,500));
  window.addEventListener('load',()=>setTimeout(wire,700));
  setInterval(wire,1200);
})();