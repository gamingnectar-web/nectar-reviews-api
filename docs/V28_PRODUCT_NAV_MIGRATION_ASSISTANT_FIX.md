# V28 Product Navigation, Migration Centre and Assistant Fix

This build keeps the V25/V26/V27 working logic and fixes the admin UX problems found after testing.

## Fixed

- Removed the separate Cart Rewards app-product workspace behaviour that hid the normal admin navigation.
- Cart Rewards now renders inside the normal `v-cart-rewards` view and keeps Products + Configuration visible.
- The left **Manage** group now changes by active product:
  - Reviews: Dashboard, Reviews, Widget Library, Migration Centre, Importer, Messaging, Visual Customiser.
  - Loyalty: Overview, Email Builder, Userboard, Points Rules, Tiers, Rewards, Checkout Beta, Settings.
  - Cart Rewards: Dashboard, Campaigns, Builder, Calendar, Templates, Design, Analytics, Settings.
- Products group always remains visible at the bottom.
- Green/orange/no-dot status behaviour remains available:
  - green = live-ready checks have passed;
  - orange = enabled but not fully live;
  - no dot = disabled/not enabled;
  - Beta/Soon pills are retained.
- Review Launch Checklist Go There buttons now scroll/open the relevant area more reliably.
- Webhook registration refreshes the Launch Checklist after it runs.
- Messaging reminder failures now show the underlying reason instead of only a generic toast.
- Migration Centre now has clearer step-by-step guidance and an AI explanation button.
- Added floating Nectar AI helper on every admin page.

## Notes on Launch Checklist

The Reviews Launch Checklist is partly internal and partly Shopify-facing:

- Internal: email provider saved, primary sender, signed-link secret, native scheduler settings.
- Shopify-facing: OAuth token exists and webhook registration endpoint successfully created/found the webhook in Shopify.
- Manual: theme/app-block placement, because Shopify cannot prove that a merchant placed the review block exactly where they intended.

When `Register Shopify fulfilled-order webhook` succeeds, the webhook check is refreshed and can turn green.

## Optional AI

Set these in Render for the floating helper and AI module builder:

```bash
OPENAI_API_KEY=...
OPENAI_MODULE_MODEL=gpt-4.1-mini
OPENAI_ASSISTANT_MODEL=gpt-4.1-mini
```

If no OpenAI key exists, the helper still works with built-in fallback guidance.
