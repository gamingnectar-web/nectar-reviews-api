# Restore notes

This full repo is based on the uploaded `reviews-platform-v25-loyalty-customer-mode-modules.zip`, not the rough modular scaffold.

Restored from v25:

- Full `public/admin.html` dashboard and navigation
- Full `public/admin.js`
- Review Manager enhancements
- Dashboard analytics enhancements
- Messaging & campaigns builder
- Help drawer
- Loyalty foundation, userboard, customer mode, points rules, tiers, rewards and checkout beta UI
- Existing review API, admin API, public widget API and loyalty API routes
- Existing models and secure review-token logic
- Existing Shopify Liquid review blocks/assets

Small deployment-safe fixes applied:

- Removed `X-Frame-Options: ALLOW-FROM ...` to avoid Shopify Admin iframe refusal; CSP `frame-ancestors` remains.
- Removed `app_url` schema defaults from Liquid block schemas while preserving Liquid runtime fallback to `https://nectar-reviews-api.onrender.com`.
- Added `extensions/review-widget-extension` using the preserved v25 Liquid/assets so Shopify CLI has a theme extension folder.
- Added `render.yaml`.

Intentionally not merged:

- The rough modular admin scaffold that replaced the real Reviews platform UI.
- The basic cart-rewards/discounts mock modules from the later scaffold. They were not present in the uploaded v25 review-platform source and should be rebuilt as a follow-up module after the stable review/loyalty UI is back.
