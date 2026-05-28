# Discounts and Loyalty Update

This build adds a folderised Discounts module and tightens Loyalty/admin behaviour without replacing the restored v25 Reviews platform.

## Discounts module

New module files:

- `src/modules/discounts/discounts.models.js`
- `src/modules/discounts/discounts.service.js`
- `src/modules/discounts/discounts.routes.js`
- `src/modules/discounts/index.js`

Mounted admin namespace:

- `GET /api/admin/discounts/config`
- `PATCH /api/admin/discounts/config`
- `POST /api/admin/discounts/issue`
- `GET /api/admin/discounts/issues`
- `GET /api/admin/discounts/render-names`

The module supports reusable discount templates for reviews, loyalty, cart rewards and referrals. Templates can be draft/reservation only or native Shopify code issuing. Loyalty native code issuing now routes through this shared module.

## Loyalty improvements

- Singular/plural point names.
- Emoji or image URL point icon.
- Purchase points rule mode: fixed per order or points per currency spend.
- Cleaner checkout beta wording and aligned fields.
- Module library changed to a stacked, one-module-at-a-time editor.
- Loyalty settings link back to global config and the Discounts engine.

## Reviews visual customiser

- Product card stars now have review-widget-independent layout options.
- New positions include above/below/inline title and overlapping product image corners.
- Product card star Liquid blocks consume saved admin card style settings.

## Global settings

- App Settings now exposes widget render names/selectors and API names for manual Liquid installation.
