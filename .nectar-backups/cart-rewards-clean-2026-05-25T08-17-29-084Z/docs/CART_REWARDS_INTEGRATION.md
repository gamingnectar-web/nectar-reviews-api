# Cart Rewards integration notes

## Sidebar/product dropdown behaviour

The admin shell remains the same Shopify app. The top-left product dropdown lets the merchant switch between product workspaces.

When `review-widget` is selected:

- existing dashboard/review manager/messaging/import/settings/visual customiser navigation is restored
- cart reward views are hidden

When `Cart Milestone Rewards` is selected:

- the existing review navigation is hidden temporarily
- only Cart Rewards navigation appears
- the main content changes to Cart Milestone Rewards

This avoids mixing Cart Rewards into the review admin tabs.

## Storefront placement

Use the theme app extension block for:

- cart drawer, when the theme exposes an app block/mount point
- cart page
- optional mini cart/progress placements

Do not inject normal Liquid into checkout. Checkout uses the Checkout UI extension.

## Inventory defaults

Default behaviour is strict:

- unavailable reward variants are hidden
- tiers with no visible rewards are hidden
- campaigns with no fulfillable reward are hidden

Merchant overrides are explicit:

- `disable` can show a sold-out card in a disabled state
- `continue_selling` can show the reward even when Shopify says it is sold out
- `backup_only` can act as a replacement reward if the primary gift is unavailable

## Customer data boundary

Cart Rewards should not read customer objects. Keep any future customer-aware reward features outside this module unless the merchant explicitly enables them and scopes are reviewed.

The current data model stores cart token and claim token hash only for reward validation and removal/conversion lifecycle.

## Existing app scopes

The current app may have customer/order scopes for reviews, messaging, or loyalty. Do not add new customer scopes for this Cart Rewards module.

## Checkout limitation

Checkout UI extensions can render the reward selector, but some checkout flows can restrict line changes. The cart drawer and cart page should remain the primary place where shoppers select reward products.

