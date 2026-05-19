{% assign nectar_app_url = block.settings.app_url | default: 'https://nectar-reviews-api.onrender.com' %}
{% assign nectar_shop_domain = shop.permanent_domain | default: shop.domain %}

<div
  class="rev-widget nectar-reviews-widget"
  data-nectar-reviews
  data-id="{{ product.id }}"
  data-product-id="{{ product.id }}"
  data-shop="{{ nectar_shop_domain }}"
  data-shop-domain="{{ nectar_shop_domain }}"
></div>

<script>
  window.NECTAR_SHOP_DOMAIN = window.NECTAR_SHOP_DOMAIN || {{ nectar_shop_domain | json }};
  window.NECTAR_API_BASE = window.NECTAR_API_BASE || {{ nectar_app_url | append: '/api' | json }};
</script>
<script src="{{ nectar_app_url }}/review-widget.js" defer data-api-base="{{ nectar_app_url }}/api" data-shop-domain="{{ nectar_shop_domain }}"></script>

{% schema %}
{
  "name": "Review Widget",
  "target": "section",
  "settings": [
    {
      "type": "text",
      "id": "app_url",
      "label": "Nectar app URL",
      "default": "https://nectar-reviews-api.onrender.com"
    }
  ]
}
{% endschema %}
