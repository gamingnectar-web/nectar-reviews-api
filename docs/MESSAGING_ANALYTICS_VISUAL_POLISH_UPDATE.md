# Messaging, analytics, provider, and visual customiser polish

This update keeps the v25 review/loyalty logic and advanced cart rewards module intact, then tightens the admin experience.

## Messaging modules

- Modules now stack vertically: create module first, then module library below.
- Custom modules can be removed from the library.
- Module backgrounds and borders accept `none` as well as hex values.
- Module buttons can link to external URLs or internal Shopify paths such as `/pages/contact`, `/collections/all`, or `/account`.

## Review page tester

- Saved template cards keep the expanded details and load button inside the card frame.
- Remove controls are centred.

## Email provider profiles

- Saved provider cards now show clear assign/remove-primary actions for Reviews, Loyalty, Cart Rewards, and General.
- Delete controls are centred.

## Analytics

- Recipient analytics now show sent, opened, clicked/reviewed timing in one row.
- Opened/clicked/reviewed tabs now still show when the email was sent.
- Test email sent events now record subject, template name, layout, module names, and a short HTML hash so merchants can compare layout/module changes over time.

## Visual customiser

- Widget and review card backgrounds can be set to `none`.
- Product card stars now include badge layout, position, padding, and label controls.
- Global carousel wording now uses “navigation arrows” instead of implying regular buttons.
- Global carousel preview now reflects arrows/static-grid/horizontal-display choices more clearly.

## Backend additions

- Campaign events now support optional metadata: `subject`, `templateName`, `layoutName`, `moduleNames`, and `htmlHash`.
- Email provider profiles can be unassigned from a primary purpose without deleting the provider.
