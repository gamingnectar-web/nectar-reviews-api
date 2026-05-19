{% assign nectar_app_url = block.settings.app_url | default: 'https://nectar-reviews-api.onrender.com' %}
{% assign nectar_shop_domain = shop.permanent_domain | default: shop.domain %}

<span
  class="nectar-star-badge"
  data-nectar-card-stars
  data-product-id="{{ product.id }}"
  data-shop-domain="{{ nectar_shop_domain }}"
  data-api-base="{{ nectar_app_url }}/api"
  data-star-color="{{ block.settings.star_color }}"
  style="display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:6px 10px;border-radius:999px;background:{{ block.settings.background }};color:{{ block.settings.text_color }};font-weight:700;font-size:{{ block.settings.font_size }}px;line-height:1;"
></span>
<script>
(function(){
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  function escapeHtml(value){ return String(value || '').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]; }); }
  ready(function(){
    document.querySelectorAll('.nectar-star-badge[data-nectar-card-stars]').forEach(function(el){
      if (el.dataset.loaded === 'true') return;
      el.dataset.loaded = 'true';
      var api = (el.dataset.apiBase || 'https://nectar-reviews-api.onrender.com/api').replace(/\/$/, '');
      var shopDomain = el.dataset.shopDomain || (window.Shopify && window.Shopify.shop) || window.location.hostname;
      var productId = el.dataset.productId;
      var starColor = el.dataset.starColor || '#ffc700';
      if (!shopDomain || !productId) return;
      fetch(api + '/reviews/summary?shopDomain=' + encodeURIComponent(shopDomain) + '&itemId=' + encodeURIComponent(productId))
        .then(function(res){ return res.ok ? res.json() : null; })
        .then(function(json){
          if (!json || !json.count) { el.style.display = 'none'; return; }
          el.innerHTML = '<span aria-hidden="true" style="color:' + escapeHtml(starColor) + ';font-size:1.05em;line-height:1;">★</span><strong>' + Number(json.average || 0).toFixed(1) + '</strong><span>(' + escapeHtml(json.count) + ')</span>';
        })
        .catch(function(){ el.style.display = 'none'; });
    });
  });
})();
</script>

{% schema %}
{
  "name": "Star Rating Badge",
  "target": "section",
  "settings": [
    { "type": "text", "id": "app_url", "label": "Nectar app URL", "default": "https://nectar-reviews-api.onrender.com" },
    { "type": "color", "id": "background", "label": "Background", "default": "#111827" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#ffffff" },
    { "type": "color", "id": "star_color", "label": "Star colour", "default": "#ffc700" },
    { "type": "range", "id": "font_size", "min": 10, "max": 22, "step": 1, "unit": "px", "label": "Font size", "default": 13 }
  ]
}
{% endschema %}
