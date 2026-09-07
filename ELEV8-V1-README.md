# ELEV8 v1

Adds the ELEV8 brand and a new app landing page with 7/30-day summary tiles for reviews, source mix, imports and cart reward activity.

Cart Rewards changes:
- storefront gets a safe default app URL;
- validated reward claims create a short-lived, one-use Shopify discount code targeted to the reward product/variant;
- storefront applies that code after adding the reward line;
- free and percentage-off rewards are supported;
- fixed-price rewards remain deliberately blocked until a price-aware discount function is added.

Requires Shopify `write_discounts` scope. Theme-extension files still require `shopify app deploy`.
