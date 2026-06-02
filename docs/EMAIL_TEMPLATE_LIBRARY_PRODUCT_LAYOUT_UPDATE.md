# Email template library and product-card layout update

This update makes the Messaging & Campaigns email builder easier to use and more powerful.

## Added

- Dedicated **Templates** tab.
- Saved templates can be selected and rendered full-width underneath the list.
- Builder still has quick save buttons, but the template library is now the place to review saved designs.
- More premade email layouts:
  - Classic review request
  - Product-first layout
  - Clean minimal
  - Support-first
  - Premium card
  - Mobile compact
  - Editorial story
- Layout gallery cards in the builder so merchants can choose a starting format visually.
- Product-card layout editor under **Modules → Product layout**.
- Drag-to-reorder product-card elements:
  - Image
  - Title
  - Product ID
  - Stars
  - Button
- Product card controls remain specific to the product-card area only.
- Intro line and body text now have independent alignment controls.
- Review font overrides in Settings:
  - Add Google Fonts stylesheet URL.
  - Add font-family name.
  - Saved per shop in Settings and used in the font-family dropdown.
  - Saved into templates so live emails can use the selected family.

## Notes

The product-card drag layout is email-client-safe. It renders using table-friendly HTML rather than arbitrary absolute positioning, so it works more reliably across desktop and mobile inboxes.
