# Email product display and Shopify page creation update

This package adds configurable product-row styling to the review email builder and a manual-first page creation flow for missing review pages.

## Product row display controls

Messaging & Campaigns → Email Builder now includes Product row display controls for:

- showing or hiding product stars
- star placement above the button, between the title and button, or under the title
- product title font weight
- showing or hiding Product ID
- product image size
- product row alignment

These settings are saved into the Primary Reviews email template and are also used by the live native review scheduler.

## Module button linking

The custom email module builder now supports:

- external URLs
- internal Shopify paths
- searching Shopify pages to select a default page
- a Review page support modal option, which uses the review landing page with support/contact mode

## Shopify page creation

When `/pages/leave-review` or `/pages/reviews` is missing, the app can create a Shopify Page from the admin UI.

The REST Page resource requires content/page access. Add these scopes to the Shopify app config and Render `SHOPIFY_SCOPES`, then run `shopify app deploy` and reconnect the app:

```txt
read_content,write_content,read_online_store_pages
```

The page creator uses `OPENAI_API_KEY` to generate cleaner SEO content when available and falls back to a safe static page if OpenAI is not configured.
