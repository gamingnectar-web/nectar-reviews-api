# Flow Assistant and discount-code clarity

This update adds a safer setup path for real customer journeys.

## Shopify Flow helper prompt

The Real-world Test Centre now includes a copyable prompt that merchants can paste into Shopify Flow, Sidekick, or the Shopify Help Assistant. The app cannot type into Shopify on the merchant's behalf, but it can generate the exact workflow instructions, endpoint, fake order, and recommended Flow steps.

Recommended review-request journey:

1. Trigger: order fulfilled.
2. Condition: customer email exists and the order is not cancelled/refunded.
3. Wait: 14 days.
4. Action: send the Nectar HTML email, or use the advanced HTTP handoff endpoint.
5. Turn the workflow on.
6. Mark Flow as installed in Nectar and run a fake-order test.

## Discount statuses

Discount codes now explain what they are:

- Draft / reserved: tracked in Nectar only. Not redeemable in Shopify checkout.
- Native Shopify code: created in Shopify and can be sent/redeemed.
- Failed: Nectar tried to create a Shopify code but the app probably needs discount scopes/OAuth refresh.

## Emailing discount codes

The discount test form can issue a code and optionally send the discount email. Emails are only sent when the code is a native Shopify code with `issued` status. Draft/reserved or failed codes are not emailed to avoid sending customers unusable codes.
