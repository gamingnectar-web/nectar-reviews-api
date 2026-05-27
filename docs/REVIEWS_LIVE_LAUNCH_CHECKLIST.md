# Reviews live launch checklist

This build is intended to let Reviews go live before Discounts, Loyalty, Cart Rewards and Referrals are finished.

## Recommended live path

1. Shopify order is fulfilled.
2. Shopify sends Nectar an `orders/fulfilled` webhook.
3. Nectar creates a `review_request_jobs` row.
4. Nectar waits the configured delay, normally 14 days.
5. Nectar sends the review email from the saved Reviews email provider.
6. Customer opens a signed order-review link.
7. Review lands in Review Manager for approval.

Shopify Flow is optional. It is not required for the recommended launch path.

## Must pass before using this on a live store

- Reviews email provider saved and marked Primary: Reviews.
- `EMAIL_CREDENTIAL_SECRET` or `SHOPIFY_API_SECRET` is set so links can be signed.
- Shopify OAuth is connected for the live store.
- Fulfilled-order webhook is registered.
- Native review scheduler is enabled and set to 14 days.
- Customer Reviews and Product Card Stars blocks/snippets are installed on the live theme.
- Fake-order test sends an email and the submitted review appears in Review Manager.

## Render scheduler reliability

The app has an internal 10-minute scheduler. For extra reliability, add a Render Cron Job or other scheduler to call:

```txt
GET https://YOUR-APP-URL/api/tasks/review-requests/run?secret=YOUR_TASK_RUNNER_SECRET
```

Set `TASK_RUNNER_SECRET` in Render before using that endpoint.

## Basic Shopify plan

Reviews do not need Shopify Functions, checkout extensions, discount functions, or Shopify Plus. The discount module should remain off until native Shopify discount-code creation is tested successfully.
