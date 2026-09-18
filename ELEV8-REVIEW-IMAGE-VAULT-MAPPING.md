# ELEV8 Review Image Mapping + Vault

This upgrade is built around the current `clean-main` review-image import flow.

## What changes

- Every AI-extracted review can be manually searched against the full Shopify product catalogue.
- Search results show Shopify status, so ACTIVE / DRAFT / ARCHIVED products can still be selected.
- If the old product no longer exists in Shopify, choose **Use Vault / discontinued product**.
- Vault reviews use `/images/elev8-vault-tub.png`, the grey archived supplement tub generated for this workflow.
- Unresolved reviews remain `needs_mapping` in their MongoDB image batch.
- Vault or mapped reviews become ready and can be moved into the normal Manual Add pending-review workflow.
- Manual Add now carries an `archivedProduct` flag.
- The backend assigns a synthetic `vault-...` item id so historical reviews do not need a live Shopify product id.
- Manual review form layout and product-mapping controls are polished.

## Install

```bash
node scripts/install-elev8-review-image-vault-mapping.cjs
node scripts/elev8-review-image-vault-mapping-smoke.cjs
node --check src/routes/manualReviewImageImports.js
node --check src/routes/manualReviews.js
node --check public/manual-review-image-import.js
node --check public/manual-review-import.js
npm run deploy:preflight
```
