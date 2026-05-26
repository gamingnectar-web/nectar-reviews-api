(function () {
  async function api(path, options = {}) {
    return window.NectarAdmin.api(path, options);
  }

  async function load(root) {
    const [summary, ledger] = await Promise.all([
      api('/api/loyalty/summary'),
      api('/api/loyalty/ledger')
    ]);
    root.querySelector('[data-loyalty-points]').textContent = summary.totalPoints || 0;
    root.querySelector('[data-loyalty-customers]').textContent = summary.customerCount || 0;
    root.querySelector('[data-loyalty-entries]').textContent = summary.entryCount || 0;
    root.querySelector('[data-loyalty-ledger]').innerHTML = (ledger.ledger || []).map((entry) => `
      <article class="list-card"><div><strong>${entry.points} points</strong><p>${entry.reason || 'No reason'}</p><small>${entry.sourceType}</small></div></article>
    `).join('') || '<p class="muted">No loyalty entries yet.</p>';
  }

  window.NectarModules = window.NectarModules || {};
  window.NectarModules.loyalty = async function initLoyalty(root) {
    await load(root);
    root.querySelector('[data-loyalty-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api('/api/loyalty/ledger', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
      event.currentTarget.reset();
      await load(root);
    });
  };
})();
