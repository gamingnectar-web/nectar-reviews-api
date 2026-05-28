# Native Review Scheduler Launch Notes

This version makes Shopify Flow optional for review requests.

## Recommended live path

1. Merchant installs the app through Shopify OAuth.
2. Nectar registers an `orders/fulfilled` Shopify webhook.
3. When Shopify sends a fulfilled-order webhook, Nectar creates a private `review_request_jobs` row.
4. The job waits 14 days by default.
5. The scheduler sends the review email from the saved Reviews email provider.
6. The email contains a signed order-review link for `/pages/leave-review`.
7. Completed reviews return to Review Manager and are verified by signed link.

## Why not rely on Shopify Flow?

Flow is useful as a merchant-managed fallback, but it is not required for development or launch. Native scheduling is easier to test in a dev store because the Real-world Test Centre can create a fake order journey without waiting for Shopify Flow to support the development environment.

## Required setup

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `APP_URL`
- `EMAIL_CREDENTIAL_SECRET` or `SHOPIFY_API_SECRET` for signed review links
- MongoDB connection
- Saved Reviews email provider
- Shopify OAuth installed for the shop

## Admin checks

Open **Settings → Real-world Test Centre**.

- `Nectar 14-day review scheduler` should be ready.
- `Email provider` should be ready.
- `Signed review links` should be ready.
- `Shopify OAuth / order webhook` should be ready for live stores.

## Testing

For development:

1. Open **Settings → Real-world Test Centre**.
2. Choose **Reviews request journey**.
3. Enter your test email.
4. Click **Start fake-order journey**.
5. Open the email, submit the review, and confirm the review appears in Review Manager as a test.

For live stores:

1. Register the Shopify webhook from the Test Centre or reinstall through OAuth.
2. Fulfil an order.
3. Confirm a scheduled review job is created.
4. Either wait 14 days or temporarily set delay days to 0 for launch testing.

## Optional Flow fallback

Only use Shopify Flow if the merchant wants to own the wait/action in Shopify Admin. The app now provides a copyable Flow helper prompt, but native scheduling remains the preferred path.
