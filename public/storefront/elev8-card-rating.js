(function () {
  'use strict';

  if (window.__ELEV8_THEME_CARD_RATINGS_BOOTED__) return;
  window.__ELEV8_THEME_CARD_RATINGS_BOOTED__ = true;

  var scheduled = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char];
    });
  }

  function canonicalProductId(value) {
    var raw = String(value || '');
    var matches = raw.match(/\d{5,}/g) || [];
    return matches.length ? matches[matches.length - 1] : raw;
  }

  function injectStyles() {
    if (document.getElementById('elev8-theme-card-rating-styles')) return;

    var style = document.createElement('style');
    style.id = 'elev8-theme-card-rating-styles';
    style.textContent = [
      '.elev8-theme-card-rating{display:inline-flex;align-items:center;gap:5px;min-height:18px;max-width:100%;text-decoration:none;color:inherit;line-height:1.1;margin-top:6px}',
      '.elev8-theme-card-rating[aria-hidden="true"]{visibility:hidden}',
      '.elev8-theme-card-rating__stars{display:inline-flex;letter-spacing:.04em;white-space:nowrap}',
      '.elev8-theme-card-rating__text{font-size:.86em;font-weight:700;white-space:nowrap}',
      '.elev8-theme-card-rating[data-preset="pill"]{padding:5px 9px;border-radius:999px}',
      '.elev8-theme-card-rating[data-preset="score"]{padding:4px 8px;border-radius:8px}',
      '.elev8-theme-card-rating[data-preset="outline"]{padding:4px 8px;border:1px solid currentColor;border-radius:999px}',
      '.elev8-theme-card-rating:hover .elev8-theme-card-rating__text{text-decoration:underline;text-underline-offset:2px}'
    ].join('');
    document.head.appendChild(style);
  }

  function contextFor(el) {
    if (el.closest('product-recommendations,.product-recommendations,[data-product-recommendations],.related-products,.complementary-products,[data-related-products]')) {
      return 'recommendations';
    }
    return el.dataset.cardContext || 'default';
  }

  function presetFor(card, context) {
    var base = card.displayPreset || 'stars';
    var key = {
      collection: 'collectionPreset',
      search: 'searchPreset',
      recommendations: 'recommendationPreset'
    }[context];

    var selected = key ? card[key] : '';
    return selected && selected !== 'inherit' ? selected : base;
  }

  function starsMarkup(average, starColor) {
    var rating = Math.max(0, Math.min(5, Number(average || 0)));
    var rounded = Math.round(rating);
    var stars = '';
    for (var i = 1; i <= 5; i += 1) {
      stars += i <= rounded ? '★' : '☆';
    }
    return '<span class="elev8-theme-card-rating__stars" aria-hidden="true" style="color:' + esc(starColor) + '">' + stars + '</span>';
  }

  function render(el, summary, card) {
    var count = Math.max(0, Number(summary && summary.count || 0));
    var average = Math.max(0, Math.min(5, Number(summary && summary.average || 0)));
    var context = contextFor(el);
    var preset = presetFor(card || {}, context);
    var showCount = card && card.showCount === false ? false : true;
    var starColor = card && (card.badgeStarColor || card.starColor) || '#f5b301';
    var textColor = card && card.badgeTextColor || 'inherit';
    var background = card && card.badgeBackground || 'transparent';
    var starSize = Number(card && card.starSize || 14);
    var radius = Number(card && card.badgeRadius != null ? card.badgeRadius : 999);

    el.dataset.preset = preset;
    el.style.fontSize = starSize + 'px';
    el.style.color = textColor;

    if (preset === 'pill' || preset === 'score') {
      el.style.background = String(background).toLowerCase() === 'none' ? 'transparent' : background;
      el.style.borderRadius = (preset === 'score' ? Math.min(radius, 10) : radius) + 'px';
    } else {
      el.style.background = 'transparent';
    }

    var countText = count === 1 ? '1 review' : count + ' reviews';
    var ratingText = average.toFixed(1);

    if (preset === 'minimal') {
      el.innerHTML = '<span aria-hidden="true" style="color:' + esc(starColor) + '">★</span><span class="elev8-theme-card-rating__text">' + esc(ratingText) + (showCount ? ' (' + esc(count) + ')' : '') + '</span>';
    } else if (preset === 'score') {
      el.innerHTML = '<strong class="elev8-theme-card-rating__text">' + esc(ratingText) + '</strong><span aria-hidden="true" style="color:' + esc(starColor) + '">★</span>' + (showCount ? '<span class="elev8-theme-card-rating__text">(' + esc(count) + ')</span>' : '');
    } else if (preset === 'outline' || preset === 'pill') {
      el.innerHTML = starsMarkup(average, starColor) + (showCount ? '<span class="elev8-theme-card-rating__text">' + esc(countText) + '</span>' : '');
    } else {
      el.innerHTML = starsMarkup(average, starColor) + (showCount ? '<span class="elev8-theme-card-rating__text">' + esc(count) + '</span>' : '');
    }

    el.setAttribute('aria-label', ratingText + ' out of 5 from ' + countText);
    el.setAttribute('aria-hidden', 'false');
    el.style.visibility = 'visible';
    el.dataset.elev8Loaded = 'true';
    delete el.dataset.elev8Loading;
  }

  function loadGroup(nodes) {
    if (!nodes.length) return;

    var first = nodes[0];
    var api = String(first.dataset.apiBase || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
    var shopDomain = first.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
    var ids = Array.from(new Set(nodes.map(function (el) {
      return canonicalProductId(el.dataset.productId);
    }).filter(Boolean)));

    if (!shopDomain || !ids.length) return;

    Promise.all([
      fetch(
        api + '/reviews/card-summaries?shopDomain=' + encodeURIComponent(shopDomain) + '&productIds=' + encodeURIComponent(ids.join(',')),
        { cache: 'no-store', credentials: 'omit', headers: { 'Accept': 'application/json' } }
      ).then(function (response) {
        return response.ok ? response.json() : { summaries: {} };
      }).catch(function () {
        return { summaries: {} };
      }),
      fetch(
        api + '/widget/config?shopDomain=' + encodeURIComponent(shopDomain),
        { cache: 'no-store', credentials: 'omit', headers: { 'Accept': 'application/json' } }
      ).then(function (response) {
        return response.ok ? response.json() : {};
      }).catch(function () {
        return {};
      })
    ]).then(function (results) {
      var summaries = results[0] && results[0].summaries || {};
      var card = results[1] && results[1].cardStyles || {};

      nodes.forEach(function (el) {
        var id = canonicalProductId(el.dataset.productId);
        render(el, summaries[id] || { count: 0, average: 0 }, card);
      });
    }).catch(function () {
      nodes.forEach(function (el) {
        el.style.display = 'none';
        el.dataset.elev8Loaded = 'error';
        delete el.dataset.elev8Loading;
      });
    });
  }

  function scan() {
    scheduled = false;
    injectStyles();

    var nodes = Array.from(document.querySelectorAll('[data-elev8-theme-card-rating]')).filter(function (el) {
      return el.dataset.elev8Loaded !== 'true' && el.dataset.elev8Loading !== 'true';
    });

    if (!nodes.length) return;

    var groups = new Map();
    nodes.forEach(function (el) {
      el.dataset.elev8Loading = 'true';
      var key = [
        String(el.dataset.apiBase || ''),
        String(el.dataset.shopDomain || '')
      ].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });

    groups.forEach(function (group) {
      loadGroup(group);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(scan, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('shopify:section:load', schedule);
})();
