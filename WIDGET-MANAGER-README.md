# Universal Review Widget Manager

This overlay fixes the Reviews Widget Library so every toggleable widget is visible and has a valid Update action.

## All Reviews SEO Page
The SEO page gets a dedicated editor with:
- enable/disable
- page handle
- review limit
- page title
- intro copy
- search placeholder
- approved/pending review counts
- live Shopify page status
- create/verify `/pages/reviews`
- storefront preview

The current backend widget key `seo_reviews_page` is canonical. The old `seo_page` key remains supported as an alias so saved settings do not disappear.

## Install
Run `node scripts/install-universal-widget-manager.js` after copying this overlay into the repo.
Then run `node scripts/widget-manager-smoke-test.js`.
