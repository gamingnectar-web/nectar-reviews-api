(function () {
  'use strict';

  function applyTemplate(template, count, average, showAverage) {
    var output = String(template || '{count} reviews')
      .replace(/\{count\}/gi, String(count))
      .replace(/\{average\}/gi, Number(average || 0).toFixed(1));

    if (count === 1) {
      output = output.replace(/\b1 reviews\b/i, '1 review');
    }

    if (showAverage && output.indexOf(Number(average || 0).toFixed(1)) === -1) {
      output = Number(average || 0).toFixed(1) + '/5 · ' + output;
    }

    return output;
  }

  function escapedSelector(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(String(value || ''));
    }
    return String(value || '').replace(/["\\]/g, '\\$&');
  }

  function findTarget(root) {
    var targetId = root.dataset.targetId;
    var productId = escapedSelector(root.dataset.productId);

    return (targetId && document.getElementById(targetId))
      || document.querySelector('[data-nectar-reviews][data-product-id="' + productId + '"]')
      || document.querySelector('.rev-widget[data-product-id="' + productId + '"]')
      || document.querySelector('.nectar-review-widget');
  }

  function load(root) {
    if (!root || root.dataset.elev8Loaded === 'true') return;
    root.dataset.elev8Loaded = 'true';

    var api = String(root.dataset.apiBase || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
    var shopDomain = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
    var productId = root.dataset.productId;
    var showAverage = root.dataset.showAverage === 'true';
    var showZero = root.dataset.showZero === 'true';
    var template = root.dataset.textTemplate || '{count} reviews';

    if (!shopDomain || !productId) return;

    fetch(
      api + '/reviews/summary?shopDomain=' + encodeURIComponent(shopDomain) + '&itemId=' + encodeURIComponent(productId),
      { cache: 'no-store', credentials: 'omit', headers: { 'Accept': 'application/json' } }
    )
      .then(function (response) {
        if (!response.ok) throw new Error('Review summary unavailable');
        return response.json();
      })
      .then(function (summary) {
        var count = Math.max(0, Number(summary.count || 0));
        var average = Math.max(0, Math.min(5, Number(summary.average || 0)));

        if (!count && !showZero) {
          root.hidden = true;
          return;
        }

        var fill = root.querySelector('[data-elev8-product-review-stars]');
        var copy = root.querySelector('[data-elev8-product-review-copy]');

        if (fill) fill.style.width = ((average / 5) * 100).toFixed(2) + '%';
        if (copy) copy.textContent = applyTemplate(template, count, average, showAverage);

        root.setAttribute('aria-label', average.toFixed(1) + ' out of 5 from ' + (count === 1 ? '1 review' : count + ' reviews') + '. Jump to reviews.');
        root.setAttribute('aria-hidden', 'false');
        root.hidden = false;
      })
      .catch(function () {
        root.hidden = true;
      });

    root.addEventListener('click', function () {
      var target = findTarget(root);
      if (!target) return;

      if (!target.id) {
        target.id = root.dataset.targetId || ('elev8-reviews-' + productId);
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      try {
        window.history.replaceState(null, '', '#' + target.id);
      } catch (_) {}
    });
  }

  function init(scope) {
    (scope || document)
      .querySelectorAll('[data-elev8-product-review-summary]')
      .forEach(load);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})();
