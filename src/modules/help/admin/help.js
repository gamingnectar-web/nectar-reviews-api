(function () {
  async function api(path, options = {}) { return window.NectarAdmin.api(path, options); }

  window.NectarModules = window.NectarModules || {};
  window.NectarModules.help = async function initHelp(root) {
    const [checklist, articles] = await Promise.all([
      api('/api/help/checklist'),
      api('/api/help/articles')
    ]);

    root.querySelector('[data-help-checklist]').innerHTML = (checklist.checklist || []).map((item) => `
      <article class="list-card"><div><strong>${item.done ? '✓' : '○'} ${item.label}</strong><p>${item.key}</p></div></article>
    `).join('');

    root.querySelector('[data-help-articles]').innerHTML = (articles.articles || []).map((article) => `
      <article class="list-card"><div><strong>${article.title}</strong><p>${article.body}</p></div></article>
    `).join('');
  };
})();
