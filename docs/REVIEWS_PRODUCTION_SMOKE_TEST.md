# Reviews Production Smoke Test

This update adds a build-safe Reviews smoke test and makes it part of `npm run deploy:preflight`.

The test deliberately does **not** connect to MongoDB, Shopify or SMTP during deployment. Instead it:

- creates and verifies signed review-request tokens;
- proves tokens are shop/order/product bound;
- checks one-use token and duplicate-review protection remain in the submission path;
- checks test reviews cannot become verified/public reviews;
- checks public review responses remain accepted/non-deleted/non-test only;
- checks Shopify webhook HMAC validation and raw-body ordering;
- checks `orders/fulfilled` and `orders/updated` still feed review scheduling;
- checks the delivery-tag gate and delayed-send states remain wired;
- checks the Reviews scheduler starts from server boot and runs repeatedly;
- checks SMTP sends still fail closed without saved encrypted credentials;
- checks the launch readiness endpoint still covers scheduler, delivery, email, signed links and Shopify OAuth;
- checks the Mongo schemas still contain token-use and review-automation fields.

Run locally with:

```bash
npm run reviews:smoke
```

It also runs automatically through:

```bash
npm run deploy:preflight
```

This is a regression/safety smoke test. A merchant should still perform one real-order proof in the Reviews Portal before switching live customer sends on.
