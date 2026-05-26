(() => {
  const DEFAULT_APP_URL = 'https://nectar-reviews-api.onrender.com';

  function appUrl(el) {
    return String(el.dataset.appUrl || window.NECTAR_APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  }

  function shopDomain(el) {
    return el.dataset.shopDomain || window.Shopify?.shop || '';
  }

  async function getCart() {
    const response = await fetch('/cart.js', { credentials: 'same-origin' });
    if (!response.ok) return { total_price: 0, items: [] };
    return response.json();
  }

  async function hydrate(el) {
    const shop = shopDomain(el);
    const api = appUrl(el);
    try {
      const [cart, configResponse] = await Promise.all([
        getCart(),
        fetch(`${api}/api/cart-rewards/campaigns?shop=${encodeURIComponent(shop)}`).then((r) => r.json())
      ]);
      const campaign = (configResponse.campaigns || [])[0];
      if (!campaign) {
        el.innerHTML = '<p class="nectar-cart-rewards-empty">No cart reward campaign is active.</p>';
        return;
      }
      const subtotal = Number(cart.total_price || 0) / 100;
      const tiers = campaign.tiers || [];
      const nextTier = tiers.find((tier) => subtotal < Number(tier.threshold || 0));
      const topTier = tiers[tiers.length - 1];
      const target = nextTier ? Number(nextTier.threshold || 0) : Number(topTier?.threshold || subtotal || 1);
      const progress = Math.max(0, Math.min(100, target ? (subtotal / target) * 100 : 0));
      el.innerHTML = `
        <div class="nectar-cart-rewards-card">
          <div class="nectar-cart-rewards-card__header">
            <strong>${escapeHtml(campaign.name || 'Cart rewards')}</strong>
            <span>${nextTier ? `Spend £${Math.max(0, target - subtotal).toFixed(2)} more` : 'Reward unlocked'}</span>
          </div>
          <div class="nectar-cart-rewards-progress"><span style="width:${progress}%"></span></div>
          <div class="nectar-cart-rewards-tiers">${tiers.map((tier) => `<span>£${Number(tier.threshold || 0).toFixed(0)} · ${escapeHtml(tier.rewardLabel || 'Reward')}</span>`).join('')}</div>
        </div>`;
    } catch (error) {
      console.warn('[Nectar] cart rewards failed', error);
      el.innerHTML = '<p class="nectar-error">Cart rewards are temporarily unavailable.</p>';
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function init() {
    document.querySelectorAll('[data-nectar-cart-rewards]').forEach(hydrate);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
