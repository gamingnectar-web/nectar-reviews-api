# ELEV8 Notifications & Tracking

This folds the useful parts of `gamingnectar-web/gamingnectar-tracker` into ELEV8.

Included:
- recent customer orders and tracking in one account page
- Track123 enrichment
- Royal Mail / Evri public tracking links
- opt-in order tracking notifications
- restock subscriptions and alerts
- price-drop subscriptions and alerts
- in-account notification feed/read state
- optional SMTP email delivery using the existing ELEV8 email provider
- admin feature controls and 30-day summary
- Shopify theme app block for a `/pages/notifications` style page

Security improvements over the standalone tracker:
- customer routes no longer trust an arbitrary customer ID supplied by JavaScript
- no blanket public customer mutation API
- Shopify App Proxy HMAC is required
- order/tracking ownership is verified against the signed-in Shopify customer
- asking for a restock alert does NOT silently opt the customer into marketing

The module deploys disabled (`enabled=false`, `pageEnabled=false`). Turn it on from the ELEV8 Notifications admin after the App Proxy and theme block are deployed.

Codespaces:
node scripts/install-elev8-notifications.cjs
node scripts/elev8-notifications-smoke.cjs
npm run deploy:preflight
