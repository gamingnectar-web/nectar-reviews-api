(() => {
  if (window.__ELEV8_WORKFLOWS_NAV__) return;
  window.__ELEV8_WORKFLOWS_NAV__ = true;

  function shop() {
    const qs = new URLSearchParams(location.search);
    return qs.get('shop') || qs.get('shopDomain') || window.Shopify?.shop || '';
  }
  function install() {
    if (document.querySelector('[data-elev8-workflows-nav]')) return;
    const candidates = [
      '[data-elev8-admin-nav]',
      '.admin-sidebar nav',
      '.admin-nav',
      'aside nav',
      'nav.sidebar',
      '.sidebar'
    ];
    const nav = candidates.map((s) => document.querySelector(s)).find(Boolean);
    if (!nav) return;
    const a = document.createElement('a');
    a.dataset.elev8WorkflowsNav = '1';
    a.href = `/modules/workflows/index.html?shop=${encodeURIComponent(shop())}`;
    a.textContent = 'Automations';
    a.className = 'elev8-workflows-nav-link';
    Object.assign(a.style,{display:'flex',alignItems:'center',gap:'8px',padding:'10px 12px',borderRadius:'9px',textDecoration:'none',fontWeight:'700',color:'inherit'});
    nav.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
})();
