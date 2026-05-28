# Real-world Test Centre

This update adds a dedicated Settings button and admin view for safe fake-order testing across Reviews, Loyalty, Discounts and Cart Rewards.

## What it does

- Validates prerequisites before sending anything.
- Shows whether Shopify Flow has been confirmed as installed.
- Checks active email delivery configuration.
- Checks signed review-link support.
- Checks Discounts module/templates before issuing test codes.
- Checks Loyalty programme, points rules and reward setup.
- Checks Cart Rewards module/campaign presence.
- Creates a fake order context inside Nectar only.
- Sends a real customer-style email only when required setup is ready.
- Creates signed review links, tracked campaign events, discount issues and safe loyalty test ledger entries when relevant.
- Saves every validation/run in `e2e_test_runs` for debugging.

## Important behaviour

The fake order is not created in Shopify. It exists only to test Nectar's customer journey logic.

If Shopify Flow is not marked as installed, review journeys are blocked. This is deliberate: email delivery may work, but real customer order/fulfilment automation will not happen until Flow is configured.

Completed review links from this centre use test mode so reviews are not published to the storefront.
