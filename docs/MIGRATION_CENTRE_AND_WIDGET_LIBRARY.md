# Migration Centre and Reviews Widget Library

This update adds a safer way to run Nectar alongside an existing reviews app such as Yotpo while migrating a live store.

## Why this exists

A merchant can keep Yotpo installed while Nectar is being tested, but only one app should actively display review widgets, send review-request emails, or output review schema at a time. The Migration Centre gives the merchant a clear coexistence checklist.

## Migration Centre

The new Reviews → Migration Centre screen supports:

- Migration mode on/off
- Current review source platform, such as Yotpo, Shop App export, Judge.me, or generic CSV
- Whether the old platform is still live
- Whether Nectar widgets are live
- Whether Nectar review-request emails are live
- Duplicate schema/widget protection reminder
- Import-only-published preference
- Preserve verified-buyer status when the export provides it
- Source breakdown for imported reviews

Recommended live migration path:

1. Keep Yotpo live and Nectar hidden.
2. Import Yotpo/Shop export CSV into Nectar.
3. Preview Nectar widgets on a duplicate/unpublished Shopify theme.
4. Turn off Yotpo widgets and Yotpo review-request emails.
5. Turn on Nectar widgets and Nectar native review scheduler.
6. Keep Yotpo installed briefly as a fallback, then uninstall when Nectar is confirmed.

## Reviews Widget Library

The new Reviews Widget Library sits before the visual customiser and lets merchants choose which review experiences they want to enable.

Included widgets:

- Reviews Widget
- Star Rating
- Reviews Carousel
- Reviews Tab
- All Reviews SEO Page
- Q&A Widget, marked coming soon

Each widget shows its status, placement, render snippet, and quick actions to enable/disable or edit its design.

## Import source labels

Imported reviews now carry extra source metadata:

- `sourcePlatform`, for example `yotpo`, `shop`, `judgeme`, or `generic`
- `sourceLabel`, for example `Yotpo CSV`
- `externalReviewId`, if the export includes one
- `importBatchId`, generated for each import

Review cards show a source pill so imported reviews can be identified and edited in the Review Manager.

## Shop App note

Shop App review syndication is not treated as a normal public Shopify Admin API pull. Nectar supports importing Shop/Yotpo exports and labelling them, but true Shop App syndication would require Shopify-approved access or partner integration.
