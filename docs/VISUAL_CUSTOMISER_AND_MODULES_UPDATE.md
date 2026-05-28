# Visual Customiser and Messaging Modules Update

This build keeps the restored v25 Reviews/Loyalty logic and advanced Cart Rewards module, then adds a cleaner customer-facing review widget configuration layer.

## What changed

- Visual Customiser now previews the actual customer-facing Customer Reviews section.
- Product widget preview no longer shows the carousel unless the widget layout is explicitly set to `Scrollable carousel`.
- Added widget layout options: clean list, card grid, compact list, and scrollable carousel.
- Added empty-state controls: simple, boxed prompt, or hidden until first review.
- Added header alignment, button style, button radius, card radius, rating summary toggle, and verified-label toggle.
- Storefront `review-widget.js` now consumes these options from saved settings.
- Messaging & Campaigns now has a `Modules` tab for reusable message blocks such as review reassurance, loyalty points, cart rewards nudge, and support-before-review.

## What did not change

- Review moderation logic.
- One-use review links.
- OAuth/admin session logic.
- Loyalty ledger/customer mode logic.
- Cart Rewards engine and routes.
- Shopify iframe fix.
- Liquid app_url schema validation fix.

## Deployment note

If replacing the repository, unzip this package so the root contains `package.json`, `server.js`, `src`, `public`, `Shopify-Liquid`, `extensions`, and `docs` directly. Do not upload the zip folder itself as a nested folder.
