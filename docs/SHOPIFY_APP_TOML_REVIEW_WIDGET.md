# Shopify app TOML for Nectar Reviews

Use this shape for the Shopify app configuration that owns the review-widget app. Production config changes require `shopify app deploy`.

Important notes:

- Keep webhook API version aligned with the backend `SHOPIFY_API_VERSION` currently used by Render. This package uses `2026-04`.
- Do not add `read_webhooks` or `write_webhooks`; they are not valid Shopify access scopes.
- Add `read_online_store_pages` so Nectar can verify whether `/pages/leave-review` and `/pages/reviews` exist from the Admin API.

```toml
client_id = "9b0bf096b37faf6dc0b19037b2d9d62a"
name = "review-widget"
application_url = "https://nectar-reviews-api.onrender.com/admin"
embedded = true

[build]
automatically_update_urls_on_dev = true

[webhooks]
api_version = "2026-04"

  [[webhooks.subscriptions]]
  topics = [ "app/uninstalled" ]
  uri = "/webhooks/app/uninstalled"

  [[webhooks.subscriptions]]
  topics = [ "app/scopes_update" ]
  uri = "/webhooks/app/scopes_update"

  [[webhooks.subscriptions]]
  topics = [ "orders/updated" ]
  uri = "/api/webhooks/shopify/orders-updated"

  [[webhooks.subscriptions]]
  topics = [ "orders/fulfilled" ]
  uri = "/api/webhooks/shopify/orders-fulfilled"

[access_scopes]
scopes = "write_products,write_metaobjects,write_metaobject_definitions,write_discounts,write_price_rules,write_customers,read_orders,read_products,read_inventory,write_inventory,read_online_store_pages"

[auth]
redirect_urls = [
  "https://nectar-reviews-api.onrender.com/auth/callback",
  "https://nectar-reviews-api.onrender.com/auth/shopify/callback",
  "https://nectar-reviews-api.onrender.com/api/auth/callback"
]
```
