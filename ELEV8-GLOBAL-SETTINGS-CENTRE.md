# ELEV8 Global Settings & Health

This changes the existing Settings button from a reviews-centric page into a platform-wide Settings & Health centre.

## Tabs
- Overview
- Connections
- Product settings
- Reviews settings

The existing Review settings UI is preserved inside the Reviews settings tab, so existing support/render-name/slider settings are not lost.

## Health checks
Settings & Health reports the configured state of:
- Shopify
- MongoDB
- OpenAI
- Email
- Loyalty DB

It also surfaces product-specific limitations for:
- Reviews
- Product Creation & Import
- Discounts
- Loyalty
- Cart Rewards
- Marketing Intelligence
- Notifications & Tracking
- Referrals

Limitations are based on environment configuration, Shopify scopes and the declared product status. They are intended as explicit configuration warnings rather than pretending every feature is live.

## Install
```bash
node scripts/install-elev8-global-settings-centre.cjs
node scripts/elev8-global-settings-centre-smoke.cjs
node --check src/modules/settings-center/index.js
node --check src/modules/settings-center/settingsCenter.routes.js
node --check public/modules/settings-center/settings-center.js
npm run deploy:preflight
```
