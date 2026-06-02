# Product card layout designer update

This build adds a more visual product-card workflow inside Messaging & Campaigns → Modules → Product layout.

## Added

- Left / Middle / Right product-card canvas zones.
- Hidden / removed zone for fields the merchant does not want in the email.
- Drag-and-drop between zones.
- Remove/restore controls on each product element.
- Live representative thumbnail while editing.
- Product-card layout template name field.
- Saveable product-card layout templates using the existing email template store with kind `product_card_layout`.
- Saved layout thumbnails with Apply and Delete actions.
- Product-card zones are saved inside full review email templates too.

## Product elements

The designer currently supports:

- Image
- Title
- Product ID
- Stars
- Button

Hidden elements are not rendered in the email product rows.

## Live email rendering

Primary Reviews templates now preserve and render the product-card zone layout in the native review-request email renderer. Older templates without zones still fall back to the previous product-element order settings.
