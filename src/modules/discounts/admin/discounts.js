(function () {
  async function api(path, options = {}) { return window.NectarAdmin.api(path, options); }

  async function load(root) {
    const data = await api('/api/discounts/rules');
    root.querySelector('[data-discount-rules]').innerHTML = (data.rules || []).map((rule) => `
      <article class="list-card"><div><strong>${rule.name}</strong><p>${rule.rewardType} · ${rule.value}${rule.rewardType === 'percentage' ? '%' : ''}</p><small>${rule.status}</small></div></article>
    `).join('') || '<p class="muted">No discount rules yet.</p>';
  }

  window.NectarModules = window.NectarModules || {};
  window.NectarModules.discounts = async function initDiscounts(root) {
    await load(root);

    root.querySelector('[data-discount-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api('/api/discounts/rules', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
      event.currentTarget.reset();
      await load(root);
    });

    root.querySelector('[data-product-search]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const q = new FormData(event.currentTarget).get('q') || '';
      try {
        const data = await api(`/api/shopify/products?q=${encodeURIComponent(q)}`);
        root.querySelector('[data-product-results]').innerHTML = (data.products || []).map((product) => `
          <article class="list-card"><div><strong>${product.title}</strong><p>${product.handle}</p><small>${product.status}</small></div></article>
        `).join('') || '<p class="muted">No products found.</p>';
      } catch (error) {
        root.querySelector('[data-product-results]').innerHTML = `<p class="muted">${error.message}</p>`;
      }
    });
  };
})();
