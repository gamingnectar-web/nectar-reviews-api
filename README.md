# Nectar Reviews API

Secure foundation build for the existing Nectar Reviews app. This revision deliberately preserves the existing review manager/product-widget/messaging behaviour and only hardens the logic, API boundaries, and structure.

## What changed

- Keeps the same admin dashboard structure/layout style and restores the original admin review line-bar display.
- Moves backend code out of one large `server.js` into `src/` modules.
- Adds admin-route protection for `/api/admin/*`, `/api/reviews/import`, and `/api/reviews/:id` updates.
- Adds Shopify session token verification support.
- Adds a temporary `ADMIN_SHARED_SECRET` fallback for local/dev while embedded App Bridge auth is tested.
- Adds basic security headers, input validation, scoped CORS, rate limiting, and safer error responses.
- Adds future product-line tabs for Discounts, Loyalty, and Referrals as inactive placeholders.
- Restores the full product-page review widget experience: rating snapshot, customer consensus bars, review cards, and write-review modal.
- Restores the Messaging & Campaigns Flow builder, review page tester, SMTP settings, campaign analytics, code copy, and test email tools.

## Deploy

1. Replace the repo files with this package.
2. Keep your existing Render environment variables and add:

```bash
EMAIL_CREDENTIAL_SECRET=<long random string>
ADMIN_SHARED_SECRET=<long random string, for local/dev only>
ALLOW_UNAUTHENTICATED_ADMIN=false
APP_URL=https://nectar-reviews-api.onrender.com
```

3. Run:

```bash
npm install
npm start
```

## Admin security modes

Preferred mode:

- Embedded Shopify Admin uses App Bridge to request an ID token.
- Frontend sends `Authorization: Bearer <token>`.
- Backend verifies the token using `SHOPIFY_API_SECRET` and derives `shopDomain` from the token.

Temporary dev mode:

- Set `ADMIN_SHARED_SECRET` in Render.
- Visit `/admin?shop=your-store.myshopify.com&admin_secret=<secret>` once.
- The browser stores the secret in session storage and sends it as `X-Nectar-Admin-Secret`.

Emergency local-only mode:

- `ALLOW_UNAUTHENTICATED_ADMIN=true`
- Do not use this in production.
