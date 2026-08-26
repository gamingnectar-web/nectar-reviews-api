# Reviews launch fixes — 2026-08-26

This release fixes two launch-stage UI/test regressions without changing the core review scheduler/webhook/email architecture.

## Launch checklist

- Fixes `outstandingLabel`, `outstandingActionable` and `outstanding` being used before definition in `public/reviews-launch-checklist.js`.
- The simple Reviews Portal is now rendered successfully before the technical panels are hidden.
- If simple rendering fails, technical panels are restored and a visible checklist error is shown rather than leaving the page blank.
- Green readiness checks no longer display contradictory “Next step” text for sender, primary provider, signed links, OAuth or native scheduler.

## Proof email / signed test link

- The email builder now defaults to `Hi {{ customerName }}`.
- The backend supports `{{ customerName }}`, `{{ customerFirstName }}` and legacy `{{ order.customer.firstName | default: "there" }}` templates.
- Signed tokens now take precedence over the browser's local `test=1` preview path, so proof links load products from the signed token.
- `order_id`, `orderId` and `order` are accepted consistently.
- A supplied invalid signed token fails closed even in test mode.
- Shopify Liquid and review-widget extension asset copies are kept in sync.

## Smoke coverage

`npm run deploy:preflight` now also guards these regressions. The Reviews smoke suite contains 18 passing checks after this update.
