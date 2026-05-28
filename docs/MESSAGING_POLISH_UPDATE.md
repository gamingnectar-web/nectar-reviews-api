# Messaging, Modules, Delivery and Tester Polish

This update keeps the restored v25 review/loyalty/cart-rewards logic intact and improves the admin areas called out during testing.

## Messaging & Campaigns

- Email Builder now uses a true 50/50 editor/preview layout on desktop.
- Email Delivery and Settings also use balanced 50/50 grids to avoid overlap and empty space.
- The Modules tab now creates reusable email modules instead of only offering pre-made blocks.
- Saved modules can include:
  - custom module name
  - title
  - description
  - optional button text and URL
  - background colour
  - border colour
  - border thickness
  - radius
  - padding
  - before/after-products placement
- Saved modules appear in the Email Builder section dropdown.

## Review Page Tester

- Saving templates now uses a proper modal instead of a browser prompt.
- Saved template cards now show customer, email, order, mode and product count.
- Templates can be expanded to view the saved products.
- Delete buttons are centered and aligned.
- The product search explainer now explains what the feature is for and how it uses the shop OAuth install.

## Email Delivery

- Added provider profiles so multiple senders can be saved.
- Providers can be assigned as primary for Reviews, Loyalty, Cart Rewards or General messaging.
- The active provider continues to power test sends, preserving the existing send-email behaviour.
- Added backend routes for listing, saving, activating and deleting provider profiles.

## Analytics

- Added a recipient timeline view that deduplicates by campaign, email and order.
- Recipient rows show sent, opened, clicked and reviewed dates in one place.
- Rows that have not opened can trigger a manual reminder.
- Backend reminder endpoint logs the resend as a campaign sent event.

## Settings

- Review link rules now support order-level rules as well as product tag/metafield rules.
- Product and order rules are kept in the same area so conditional review links are easier to manage.
