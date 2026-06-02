# Email layouts, webhook verification, and Shopify page creator fix

This update improves the review email builder and launch checks.

## Email builder

- Adds email layout presets: Classic, Product-first, Clean minimal, and Support-first.
- Adds a global star colour control.
- Adds a default top star section that can be shown/hidden independently of product-row stars.
- Product rows remain customisable for star visibility, star placement, title weight, product ID visibility, image size, and row alignment.
- Saved Primary Reviews templates now include these display settings and the native review scheduler uses them for live emails.
- The test preview now shows a friendly shop name instead of the raw `.myshopify.com` domain where possible.

## Shopify page creation

- Page creation now uses Shopify page SEO fields (`metafields_global_title_tag` and `metafields_global_description_tag`) rather than unsupported page metafield payloads.
- Generated page body HTML is preserved safely instead of being stripped by the generic text cleaner.
- Required scopes remain: `read_content`, `write_content`, and `read_online_store_pages`.

## Manual webhooks

- Manual finalisation no longer makes webhook cards look fully live just because Nectar stored the manual setup.
- A webhook is green only when Shopify verifies it or Nectar has actually received the expected webhook event.
- Webhook details now include manual setup steps and copyable topic/URL/version information.
