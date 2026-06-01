# Webhook Registry Deploy Check

Checked after merging the webhook registry/security update.

## Confirmed

- Node runtime is pinned with `.node-version` and `.nvmrc`.
- Render build command is `npm ci && npm run deploy:preflight`.
- Render start command is `npm start` / `node server.js`.
- Shopify API version is standardised to `2026-04` in `render.yaml`, matching the manual webhook screen and app default.
- `SHOPIFY_SCOPES` example includes `read_webhooks` and `write_webhooks`.
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

If automatic webhook registration is required, the Shopify app must be reconnected after adding `read_webhooks,write_webhooks` to `SHOPIFY_SCOPES`; Shopify does not grant new scopes to an old OAuth token automatically.
