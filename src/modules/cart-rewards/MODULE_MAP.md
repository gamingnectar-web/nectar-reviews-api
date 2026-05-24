# Cart Rewards module map

| Path | Purpose |
|---|---|
| `models/CartRewardCampaign.js` | Campaign setup, scheduling, rules, inventory behaviour and launch checklist |
| `models/CartRewardTier.js` | Milestone thresholds and reward variant configuration |
| `models/CartRewardDesign.js` | Widget style settings |
| `models/CartRewardClaim.js` | Cart-token based reward claim records, with no customer profile fields |
| `models/CartRewardEvent.js` | Analytics and planner event stream |
| `models/CartRewardTemplate.js` | Merchant/system templates |
| `services/cartRewardEngine.js` | Cart evaluation, reward-mode handling, sold-out hiding and eligibility output |
| `services/shopifyInventory.js` | Live Shopify variant availability adapter |
| `services/cartRewardClaims.js` | Signed claim issuing, confirmation and removal tracking |
| `services/cartRewardPlanner.js` | Calendar scheduling, conflicts and campaign swaps |
| `services/cartRewardTemplates.js` | Template creation/use logic |
| `services/shopifyProductPicker.js` | Admin GraphQL product/variant search adapter |
| `routes/cartRewards.routes.js` | Admin and storefront API routes |
| `routes/cartRewardWebhooks.routes.js` | Optional verified order webhook conversion tracking |
| `jobs/cartRewardScheduler.js` | Activates/ends scheduled campaigns and expires old claim tokens |
| `seed/defaultTemplates.js` | Starter campaign templates |
| `extensions/theme-app-extension` | Cart drawer/cart page app block |
| `extensions/checkout-ui-extension` | Checkout UI extension starter |
| `extensions/cart-reward-discount-function` | Discount Function starter |
