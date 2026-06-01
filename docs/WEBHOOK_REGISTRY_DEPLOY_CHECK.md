# Webhook Registry Deploy Check

Checked after merging the webhook registry/security update.

## Confirmed

- Node runtime is pinned with `.node-version` and `.nvmrc`.
- Render build command is `npm ci && npm run deploy:preflight`.
- Render start command is `npm start` / `node server.js`.
- Shopify API version is standardised to `2026-04` in `render.yaml`, matching the manual webhook screen and app default.
- `SHOPIFY_SCOPES` example avoids non-existent webhook scopes and includes `read_online_store_pages` so the app can verify /pages/leave-review and /pages/reviews from Shopify Admin when the storefront is password-protected.
- Review webhook routes are mounted before JSON body parsing so HMAC validation can use the raw body.
- Expected review webhooks are:
  - `orders/fulfilled` -> `/api/webhooks/shopify/orders-fulfilled`
  - `orders/updated` -> `/api/webhooks/shopify/orders-updated`
- Reviews Launch Checklist includes a Shopify webhook registry, refresh action and details modal.
- Shop schema persists webhook installation/finalisation metadata.
- Product Creation & Import batch update remains included.

## Validation run

- `npm run deploy:preflight` passed locally with Node 22.
- Relative require verification passed.
- JavaScript syntax checks passed for `server.js`, `src/app.js`, `src`, `public`, Shopify Liquid assets and review-widget extension assets.

## Notes

For app-managed webhooks, keep subscriptions in `shopify.app.toml` and run `shopify app deploy` for production. For page verification, reconnect after adding `read_online_store_pages` so the token includes page-read permission.
