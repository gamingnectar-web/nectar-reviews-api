# Review widget theme extension

This extension uses the preserved v25 review Liquid and storefront assets. It is intentionally wired to the legacy v25 public API paths used by the restored admin and review widget:

- `/review-widget.js`
- `/api/reviews?itemId=...`
- `/api/reviews/summary?itemId=...`
- `/api/widget/config`
- `/api/global-reviews`

Do not replace these blocks with the rough modular scaffold unless the backend routes are migrated at the same time.
