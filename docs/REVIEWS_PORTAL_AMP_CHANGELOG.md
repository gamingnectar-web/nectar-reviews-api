# Reviews Portal AMP update

This update simplifies the Reviews Launch screen and adds safe proof-email controls for real order jobs.

## What changed

- Renamed the launch area to **Reviews Portal** in the admin UI.
- Added a simple top-level status panel for:
  - Reviews email sender
  - Shopify order/webhook trigger
  - 14-day delay timer
  - Signed review links
- Hid technical webhook/storefront diagnostics behind a **Show technical setup** toggle by default.
- Upgraded recent review request jobs into clearer journey cards:
  - Order seen
  - Wait for delivery
  - 14-day timer
  - Email sent
- Added **Send proof to shop email** per order job.
- Added **Send shop proof email** at the top of the Reviews Portal.

## Safe proof-email behaviour

Proof emails never send to the customer shown on the order row. The recipient is locked server-side to the saved shop email from Reviews email settings:

1. Reply-to email
2. From email
3. SMTP username
4. Support email fallback

The proof job is marked as a test and uses a cloned proof order ID, so it does not disturb the original customer job or publish a customer review.

## Backend routes added

- `POST /api/admin/review-automation/jobs/:jobId/send-proof`
- `POST /api/admin/review-automation/send-proof-latest`

