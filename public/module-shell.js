(function(){
  document.addEventListener('click', function(e){
    const btn=e.target.closest('[data-tab]'); if(!btn) return;
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    const tab=document.getElementById('tab-'+btn.dataset.tab); if(tab) tab.classList.add('active');
  });
})();
