# Delivery-gated review requests and support-before-review module

This build keeps Reviews launch-first and adds guardrails for stores that use a tracking/delivery process.

## Review request timing

Native review automation now defaults to a delivery tag gate:

1. Shopify order is fulfilled.
2. Nectar creates a review request job as `awaiting_delivery` if the order does not yet have the configured delivery tag.
3. The tracking/delivery integration adds the configured Shopify order tag, default `delivered`.
4. Shopify sends the `orders/updated` webhook.
5. Nectar starts the review delay from the delivery-tag update time.
6. After the delay, default 14 days, Nectar sends the signed review email.

This avoids asking for product reviews while customers are still annoyed about delivery delays.

## Required Shopify webhooks

The app registers both:

- `orders/fulfilled`
- `orders/updated`

The second webhook is what lets Nectar notice when the delivery tag appears.

## Support before review

The review request email can now include a “Contact customer service” button. Email clients cannot open a JavaScript modal directly, so the button opens the existing review page with `support=1`. The review page then opens the support modal automatically and captures:

- order ID
- customer email
- customer name
- selected products
- subject
- message
- review token

The support request is saved in `support_requests` and, when an email provider is configured, a notification is sent to the store's reply-to/from email.

## Email modules

The Messaging module library now supports hiding preset modules as well as deleting custom modules. Hidden presets can be restored.

## Manual reminders

Manual reminders now include a fallback order-level pseudo product when no product ID exists, so the signed review link has a valid review target.
