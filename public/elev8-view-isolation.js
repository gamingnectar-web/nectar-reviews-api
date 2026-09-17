(function Elev8ViewIsolation(){
  if(window.__ELEV8_VIEW_ISOLATION__)return;window.__ELEV8_VIEW_ISOLATION__=true;
  let current='';

  function isolate(id){
    if(!id)return;
    current=id;
    document.querySelectorAll('.main > section[id^="v-"], .main > .view').forEach(node=>{
      const active=node.id===id;
      node.classList.toggle('active',active);
      if(node.id&&node.id.startsWith('v-'))node.style.display=active?'block':'none';
    });
  }

  function install(){
    if(typeof window.tab!=='function'||window.tab.__e8Isolated)return;
    const original=window.tab;
    const wrapped=function(id){
      isolate(id);
      const result=original.apply(this,arguments);
      requestAnimationFrame(()=>isolate(id));
      return result;
    };
    wrapped.__e8Isolated=true;
    window.tab=wrapped;

    document.querySelectorAll('.sidebar .tab-btn').forEach(btn=>{
      if(btn.dataset.viewIsolation)return;
      btn.dataset.viewIsolation='1';
      const onclick=btn.getAttribute('onclick')||'';
      const match=onclick.match(/window\.tab\(['"]([^'"]+)['"]\)/);
      if(match)btn.addEventListener('click',()=>setTimeout(()=>isolate(match[1]),0),true);
    });
  }

  const observer=new MutationObserver(()=>{
    if(document.body.classList.contains('elev8-home-open'))return;
    if(current){
      const visible=[...document.querySelectorAll('.main > section[id^="v-"], .main > .view')].filter(n=>n.id!==current&&(n.classList.contains('active')||getComputedStyle(n).display!=='none'));
      if(visible.length)requestAnimationFrame(()=>isolate(current));
    }
  });
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(install,250);
    const main=document.querySelector('.main');if(main)observer.observe(main,{subtree:true,attributes:true,attributeFilter:['class','style']});
  });
  window.addEventListener('load',()=>setTimeout(install,400));
  setInterval(install,1200);
})();