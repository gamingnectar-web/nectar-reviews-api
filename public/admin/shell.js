(function () {
  const state = {
    shop: new URLSearchParams(window.location.search).get('shop') || localStorage.getItem('nectar.shop') || 'demo-store.myshopify.com',
    modules: [],
    activeModule: null
  };

  const nav = document.querySelector('[data-nav]');
  const content = document.querySelector('[data-content]');
  const title = document.querySelector('[data-page-title]');
  const status = document.querySelector('[data-status]');
  const shopInput = document.querySelector('[data-shop-input]');
  shopInput.value = state.shop;

  function withShop(path) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('shop', state.shop);
    return url.pathname + url.search;
  }

  async function api(path, options = {}) {
    const response = await fetch(withShop(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
    return data;
  }

  window.NectarAdmin = { api, withShop, getShop: () => state.shop };

  function groupModules(modules) {
    return modules.reduce((groups, module) => {
      const group = module.navGroup || 'Modules';
      groups[group] = groups[group] || [];
      groups[group].push(module);
      return groups;
    }, {});
  }

  function renderNav() {
    const enabled = state.modules.filter((module) => module.enabled);
    const groups = groupModules(enabled);
    nav.innerHTML = Object.entries(groups).map(([group, modules]) => `
      <div class="nav-group">${group}</div>
      ${modules.map((module) => `<button class="nav-item ${state.activeModule?.key === module.key ? 'active' : ''}" data-module-key="${module.key}">${module.navLabel || module.name}</button>`).join('')}
    `).join('') || '<p class="muted">No modules enabled.</p>';
  }

  async function loadSettings() {
    const data = await api('/api/core/settings/modules');
    state.modules = data.modules;
    status.textContent = data.source === 'database' ? 'Connected' : 'Demo mode';
    renderNav();
    if (!state.activeModule) {
      state.activeModule = state.modules.find((module) => module.enabled) || null;
    }
  }

  function loadStylesheet(href) {
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (!src) return Promise.resolve();
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function openModule(module) {
    if (!module) {
      title.textContent = 'No modules enabled';
      content.innerHTML = '<section class="panel"><h2>Enable a module</h2><p class="muted">Open Module settings and enable the area you want this merchant to use.</p></section>';
      return;
    }

    state.activeModule = module;
    renderNav();
    title.textContent = module.name;
    loadStylesheet(module.admin.css);
    const html = await fetch(module.admin.html).then((response) => response.text());
    content.innerHTML = html;
    await loadScript(module.admin.js);
    const init = window.NectarModules?.[module.key];
    if (typeof init === 'function') await init(content);
  }

  async function openSettings() {
    state.activeModule = null;
    renderNav();
    title.textContent = 'Module settings';
    const template = document.querySelector('[data-settings-template]');
    content.innerHTML = template.innerHTML;
    const toggles = content.querySelector('[data-module-toggles]');
    toggles.innerHTML = state.modules.map((module) => `
      <article class="toggle-card">
        <div><strong>${module.name}</strong><p>${module.description}</p></div>
        <label class="switch" aria-label="Toggle ${module.name}">
          <input type="checkbox" data-module-toggle="${module.key}" ${module.enabled ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
      </article>
    `).join('');
  }

  nav.addEventListener('click', async (event) => {
    const key = event.target.closest('[data-module-key]')?.dataset.moduleKey;
    if (!key) return;
    await openModule(state.modules.find((module) => module.key === key));
  });

  document.querySelector('[data-open-settings]').addEventListener('click', openSettings);

  document.querySelector('[data-save-shop]').addEventListener('click', async () => {
    state.shop = shopInput.value.trim();
    localStorage.setItem('nectar.shop', state.shop);
    await loadSettings();
    await openModule(state.modules.find((module) => module.enabled));
  });

  content.addEventListener('change', async (event) => {
    const key = event.target.closest('[data-module-toggle]')?.dataset.moduleToggle;
    if (!key) return;
    const modules = { [key]: event.target.checked };
    await api('/api/core/settings/modules', { method: 'PATCH', body: JSON.stringify({ modules }) });
    await loadSettings();
    await openSettings();
  });

  (async function boot() {
    try {
      await loadSettings();
      await openModule(state.activeModule);
    } catch (error) {
      status.textContent = 'Error';
      content.innerHTML = `<section class="panel"><h2>Unable to load admin</h2><p class="muted">${error.message}</p></section>`;
    }
  })();
})();
