(() => {
  const DEFAULT_APP_URL = 'https://nectar-reviews-api.onrender.com';

  function getAppUrl(form) {
    return String(form.dataset.appUrl || window.NECTAR_APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  }

  function getShop(form) {
    return form.dataset.shopDomain || window.Shopify?.shop || '';
  }

  function message(form, text, ok = true) {
    const target = form.querySelector('[data-nectar-review-message]');
    if (target) {
      target.textContent = text;
      target.dataset.state = ok ? 'success' : 'error';
    }
  }

  async function submit(form) {
    const payload = Object.fromEntries(new FormData(form).entries());
    const appUrl = getAppUrl(form);
    const shop = getShop(form);
    const endpoint = payload.token ? '/api/reviews/with-token' : '/api/reviews';
    const body = payload.token
      ? { token: payload.token, review: payload }
      : payload;

    const response = await fetch(`${appUrl}${endpoint}?shop=${encodeURIComponent(shop)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Review could not be submitted.');
    return data;
  }

  function init() {
    document.querySelectorAll('[data-nectar-review-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await submit(form);
          form.reset();
          message(form, 'Thank you — your review has been submitted.');
        } catch (error) {
          message(form, error.message, false);
        }
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
