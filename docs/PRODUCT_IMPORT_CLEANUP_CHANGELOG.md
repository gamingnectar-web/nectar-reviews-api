# Product Import cleanup changelog

## Added

- Runtime injection for Product Import cleanup assets.
- URL scan state monitor.
- Batch workspace status monitor.
- Cleaner workflow strip for URL and Batch Import.
- SKU prefix settings persisted in Mongo settings.
- Default first-two-vendor-letter SKU prefix logic.
- Custom SKU prefix option for other merchants/businesses.
- Smart metafield checks panel.
- Advanced/rare metafield visual grouping.

## Changed

- Conditional rules schema now accepts the action types the service already cleaned for:
  - `recommend_tag`
  - `set_theme_template`
  - `add_collection`

This prevents settings saves from being rejected when those rule types are used.

## Notes

This is intentionally not a rewrite of the importer. It layers improvements on top of the current Product Creation & Import implementation to reduce risk.
