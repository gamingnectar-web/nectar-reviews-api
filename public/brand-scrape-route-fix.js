(function Elev8BrandScrapeProgressRouteFix(){
  async function api(path,options={}){
    if(typeof window.adminFetch==='function'){
      return window.adminFetch(`/admin/brand-directory-v3${path}`,options);
    }
    const res=await fetch(`/api/admin/brand-directory-v3${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},credentials:'same-origin'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||data.message||`HTTP ${res.status}`);
    return data;
  }

  function patchButton(){
    const btn=document.getElementById('ca-scrape-brand');
    if(!btn||btn.dataset.routeFix)return;
    btn.dataset.routeFix='1';
    btn.addEventListener('click',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const url=document.getElementById('ca-brand-source-url')?.value.trim();
      if(!url)return alert('Paste a brand or collection URL first.');
      btn.disabled=true;const old=btn.textContent;btn.textContent='Starting…';
      try{
        const data=await api('/scrape-job',{method:'POST',body:JSON.stringify({sourceUrl:url,brandName:document.getElementById('ca-brand-name')?.value.trim()||''})});
        const job=data.job||{};
        if(!job._id)throw new Error('No job ID returned.');
        if(window.Elev8BrandProgress?.open)window.Elev8BrandProgress.open(job);
        const poll=async()=>{
          const state=await api(`/scrape-job/${job._id}`);
          if(window.Elev8BrandProgress?.render)window.Elev8BrandProgress.render(state.job||{});
          if(state.job?.status==='complete'){
            await window.Elev8BrandDirectoryV3?.load?.();
            return;
          }
          if(state.job?.status==='failed')return;
          setTimeout(poll,900);
        };
        poll();
      }catch(error){alert(`Could not start brand scan: ${error.message}`)}
      finally{btn.disabled=false;btn.textContent=old}
    },true);
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(patchButton,500));
  window.addEventListener('load',()=>setTimeout(patchButton,700));
  setInterval(patchButton,1200);
})();