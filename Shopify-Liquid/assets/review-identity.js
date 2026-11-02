(function () {
  'use strict';

  function formatCount(value, mode) {
    var count = Math.max(0, Number(value || 0));
    try {
      if (mode === 'compact') {
        return new Intl.NumberFormat('en-GB', {
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(count);
      }
      return new Intl.NumberFormat('en-GB').format(count);
    } catch (_) {
      return String(Math.round(count));
    }
  }

  function applyTemplate(template, data) {
    return String(template || '')
      .replace(/\{count\}/gi, data.count)
      .replace(/\{average\}/gi, data.average)
      .replace(/\{rating\}/gi, data.average);
  }

  function load(root) {
    if (!root || root.dataset.elev8Loaded === '1') return;
    root.dataset.elev8Loaded = '1';

    var apiBase = String(root.dataset.apiBase || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
    var shopDomain = root.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
    var textTemplate = root.dataset.textTemplate || 'Rated {average}/5 from {count} product reviews';
    var secondaryText = root.dataset.secondaryText || '';
    var countFormat = root.dataset.countFormat || 'exact';
    var showStars = root.dataset.showStars !== 'false';
    var showZero = root.dataset.showZero === 'true';

    if (!shopDomain) return;

    fetch(apiBase + '/review-identity-summary?shopDomain=' + encodeURIComponent(shopDomain), {
      method: 'GET',
      credentials: 'omit',
      headers: { 'Accept': 'application/json' }
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Review identity summary unavailable');
        return response.json();
      })
      .then(function (summary) {
        var count = Math.max(0, Number(summary.count || 0));
        var averageNumber = Math.max(0, Math.min(5, Number(summary.average || 0)));
        if (!count && !showZero) return;

        var countText = formatCount(count, countFormat);
        var averageText = averageNumber.toFixed(1);
        var copy = root.querySelector('[data-elev8-review-copy]');
        var secondary = root.querySelector('[data-elev8-review-secondary]');
        var stars = root.querySelector('[data-elev8-review-stars]');
        var fill = root.querySelector('[data-elev8-review-stars-fill]');
        var data = { count: countText, average: averageText };

        if (copy) copy.textContent = applyTemplate(textTemplate, data);
        if (secondary) {
          secondary.textContent = applyTemplate(secondaryText, data);
          secondary.hidden = !secondary.textContent.trim();
        }

        if (stars) {
          stars.hidden = !showStars;
          stars.setAttribute(
            'aria-label',
            'Rated ' + averageText + ' out of 5 from ' + countText + ' product reviews'
          );
        }
        if (fill) {
          fill.style.width = ((averageNumber / 5) * 100).toFixed(2) + '%';
        }

        root.hidden = false;
      })
      .catch(function () {
        root.hidden = true;
      });
  }

  function init(scope) {
    (scope || document)
      .querySelectorAll('[data-elev8-review-identity]')
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
