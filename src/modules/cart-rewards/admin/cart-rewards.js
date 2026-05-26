(function () {
  async function api(path, options = {}) { return window.NectarAdmin.api(path, options); }

  function dateLabel(value) {
    return value ? new Date(value).toLocaleDateString() : 'No date';
  }

  function renderCalendar(root, campaigns) {
    const calendar = root.querySelector('[data-cart-calendar]');
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first.getDay(); i += 1) cells.push('<div class="calendar-cell empty"></div>');
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), day);
      const active = campaigns.some((campaign) => {
        const start = campaign.startsAt ? new Date(campaign.startsAt) : null;
        const end = campaign.endsAt ? new Date(campaign.endsAt) : null;
        return (!start || start <= date) && (!end || end >= date);
      });
      cells.push(`<div class="calendar-cell ${active ? 'active' : ''}"><span>${day}</span></div>`);
    }
    calendar.innerHTML = cells.join('');
  }

  async function load(root) {
    const data = await api('/api/cart-rewards/campaigns');
    const campaigns = data.campaigns || [];
    root.querySelector('[data-cart-campaigns]').innerHTML = campaigns.map((campaign) => `
      <article class="list-card"><div><strong>${campaign.name}</strong><p>${dateLabel(campaign.startsAt)} → ${dateLabel(campaign.endsAt)}</p><small>${campaign.status} · ${campaign.appearance?.drawerMode || 'modal'}</small></div></article>
    `).join('') || '<p class="muted">No cart reward campaigns yet.</p>';
    renderCalendar(root, campaigns);
  }

  window.NectarModules = window.NectarModules || {};
  window.NectarModules['cart-rewards'] = async function initCartRewards(root) {
    await load(root);
    root.querySelector('[data-cart-reward-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api('/api/cart-rewards/campaigns', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
      event.currentTarget.reset();
      await load(root);
    });
  };
})();
