(() => {
  async function loadNectarDrops(el) {
    try {
      const response = await fetch('/api/loyalty/balance' + window.location.search, { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load rewards.');
      const account = data.account || {};
      const rules = data.redeemRules || [];
      el.innerHTML = `
        <div class="nectar-drops-widget" style="border:1px solid #e2e8f0;border-radius:16px;padding:16px;background:#fff">
          <h3>${escapeHtml(data.pointsIcon || '🍯')} ${escapeHtml(data.pointsName || 'Nectar Drops')}</h3>
          <p>You have <strong>${Number(account.approvedPoints || 0)}</strong> approved Drops.</p>
          <p><small>${Number(account.pendingPoints || 0)} pending Drops</small></p>
          ${rules.length ? `<label>Redeem option<select data-nectar-redeem-rule>${rules.map((rule) => `<option value="${escapeHtml(rule.id)}">${escapeHtml(rule.name)} — ${Number(rule.pointsCost)} Drops</option>`).join('')}</select></label><button type="button" data-nectar-redeem>Redeem Drops</button>` : '<p><small>No redemption options are active yet.</small></p>'}
          <p><small>${escapeHtml(account.customerRef || '')}</small></p>
          <div data-nectar-message></div>
        </div>`;
      const btn = el.querySelector('[data-nectar-redeem]');
      if (btn) btn.addEventListener('click', async () => redeem(el));
    } catch (error) {
      el.innerHTML = '<p>Log in to view your Nectar Drops.</p>';
    }
  }

  async function redeem(el) {
    const ruleId = el.querySelector('[data-nectar-redeem-rule]')?.value;
    const message = el.querySelector('[data-nectar-message]');
    try {
      const response = await fetch('/api/loyalty/redeem' + window.location.search, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not redeem Drops.');
      message.innerHTML = `<p><strong>Your code:</strong> <code>${escapeHtml(data.discountCode)}</code></p><p><small>Copy it now. For security, the app stores only a hash and preview.</small></p>`;
    } catch (error) {
      message.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  document.querySelectorAll('[data-nectar-drops-widget]').forEach(loadNectarDrops);
})();
