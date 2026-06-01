# Manual webhook and Messaging Builder fixes

This package makes the Reviews launch path manual-first for Shopify webhooks. Automatic registration remains available as a best-effort action, but the recommended path is:

1. Create the Shopify Admin webhooks manually.
2. Click **Finalise manual setup** in Nectar.
3. Send Shopify test notifications or fulfil/update a test order.
4. Nectar records the last received webhook event and shows this in the webhook registry.

Also included:

- Sticky desktop admin sidebar with internal scrolling.
- Review page handle verification moved beside the handle field and fixed to use the secured admin API.
- Email send result panel lives under Email Delivery, not the Email Builder canvas.
- Test email errors now return useful SMTP/provider details instead of only `Something went wrong`.
